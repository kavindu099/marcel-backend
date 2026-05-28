import { Controller, Get, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ShopifyOAuthService } from './shopify-oauth.service'
import { ShopService } from './shop.service'
import { ShopifyProductsService } from './shopify-products.service'

@ApiTags('Shopify')
@Controller('shopify')
export class ShopifyOAuthController {
  constructor(
    private readonly oauthService: ShopifyOAuthService,
    private readonly shopService: ShopService,
    private readonly shopifyProductsService: ShopifyProductsService,
  ) {}

  // Step 1: Merchant visits this URL to begin installation.
  // Example: https://your-api.com/api/shopify/install?shop=mystore.myshopify.com
  @Get('install')
  @ApiOperation({ summary: 'Begin Shopify OAuth install flow' })
  install(@Query('shop') shop: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.exec(shop ?? '')) {
      return res.status(400).send('Invalid shop domain. Must be a *.myshopify.com address.')
    }
    const authUrl = this.oauthService.generateAuthUrl(shop)
    return res.redirect(authUrl)
  }

  // Step 2: Shopify redirects here after merchant approves the app.
  @Get('callback')
  @ApiOperation({ summary: 'Handle Shopify OAuth callback' })
  async callback(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const { shop, code } = query

    if (!shop || !code) {
      return res.status(400).send('Missing shop or code parameter.')
    }

    if (!this.oauthService.verifyHmac(query)) {
      return res.status(401).send('HMAC validation failed — request may be forged.')
    }

    try {
      const accessToken = await this.oauthService.exchangeCodeForToken(shop, code)
      await this.shopService.upsert(shop, accessToken)

      // Fetch store name + product types in the background — non-critical, so we don't await.
      this.shopifyProductsService.fetchStoreInfo(shop, accessToken)
        .then(info => this.shopService.updateContext(shop, info.shopName, info.productTypes))
        .catch(err => console.warn('[ShopifyOAuth] Could not fetch store context:', err))

      const successUrl = process.env.SHOPIFY_INSTALL_SUCCESS_URL ?? `https://${shop}/admin/apps`
      return res.redirect(successUrl)
    } catch (err) {
      console.error('[ShopifyOAuth] Callback error:', err)
      return res.status(500).send('App installation failed. Please try again.')
    }
  }
}
