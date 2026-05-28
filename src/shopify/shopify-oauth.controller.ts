import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ShopifyOAuthService } from './shopify-oauth.service'
import { ShopService } from './shop.service'
import { ShopifyProductsService } from './shopify-products.service'

const PING_GQL = `{ shop { name } products(first: 3, query: "status:active") { edges { node { id title } } } }`

@ApiTags('Shopify')
@Controller('shopify')
export class ShopifyOAuthController {
  constructor(
    private readonly oauthService: ShopifyOAuthService,
    private readonly shopService: ShopService,
    private readonly shopifyProductsService: ShopifyProductsService,
  ) {}

  // Manually register a shop with a custom app token — bypasses OAuth for dev/testing.
  // POST /api/shopify/register  { secret, shop, accessToken }
  @Post('register')
  @ApiOperation({ summary: 'Manually register a shop access token' })
  async register(@Body() body: { secret?: string; shop?: string; accessToken?: string }, @Res() res: Response) {
    const expectedSecret = process.env.SHOPIFY_REGISTER_SECRET
    if (!expectedSecret || body.secret !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid secret' })
    }
    if (!body.shop || !body.accessToken) {
      return res.status(400).json({ error: 'shop and accessToken are required' })
    }
    await this.shopService.upsert(body.shop, body.accessToken)
    console.log(`[ShopifyOAuth] Manually registered shop: ${body.shop}`)
    return res.json({ ok: true, shop: body.shop })
  }

  // Diagnostic endpoint — visit /api/shopify/ping?shop=xxx.myshopify.com in a browser.
  @Get('ping')
  @ApiOperation({ summary: 'Test Shopify connection for a shop' })
  async ping(@Query('shop') shop: string, @Res() res: Response) {
    if (!shop) return res.status(400).json({ error: 'Missing ?shop= param' })

    const shopDoc = await this.shopService.findByDomain(shop)
    if (!shopDoc) {
      return res.json({
        shop,
        inMongo: false,
        error: 'Shop not found in MongoDB — OAuth install not completed or wrong domain.',
      })
    }

    const token = shopDoc.accessToken
    const result: Record<string, unknown> = {
      shop,
      inMongo: true,
      tokenLength: token?.length ?? 0,
      shopName: shopDoc.shopName,
      productTypes: shopDoc.productTypes,
    }

    try {
      const resp = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: PING_GQL }),
      })
      const text = await resp.text()
      result.httpStatus = resp.status
      result.rawResponse = text.slice(0, 1000)
      try { result.parsed = JSON.parse(text) } catch { result.parseError = true }
    } catch (err) {
      result.fetchError = String(err)
    }

    return res.json(result)
  }

  // Step 1: Merchant visits this URL to begin installation.
  // Example: https://your-api.com/api/shopify/install?shop=mystore.myshopify.com
  @Get('install')
  @ApiOperation({ summary: 'Begin Shopify OAuth install flow' })
  install(@Query('shop') shop: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.exec(shop ?? '')) {
      return res.status(400).send('Invalid shop domain. Must be a *.myshopify.com address.')
    }
    const authUrl = this.oauthService.generateAuthUrl(shop)
    console.log('[ShopifyOAuth] install redirect URL:', authUrl)
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
