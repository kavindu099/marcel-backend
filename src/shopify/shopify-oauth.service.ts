import { Injectable } from '@nestjs/common'
import * as crypto from 'crypto'

@Injectable()
export class ShopifyOAuthService {
  private get apiKey() { return process.env.SHOPIFY_API_KEY ?? '' }
  private get apiSecret() { return process.env.SHOPIFY_API_SECRET ?? '' }
  private get scopes() { return process.env.SHOPIFY_SCOPES ?? 'read_products' }
  private get redirectUri() { return `${process.env.SHOPIFY_APP_URL}/api/shopify/callback` }

  generateAuthUrl(shop: string): string {
    const nonce = crypto.randomBytes(16).toString('hex')
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: this.scopes,
      redirect_uri: this.redirectUri,
      state: nonce,
    })
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`
  }

  async exchangeCodeForToken(shop: string, code: string): Promise<string> {
    const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code,
      }),
    })

    if (!resp.ok) {
      throw new Error(`Shopify token exchange failed: ${resp.status} ${await resp.text()}`)
    }

    const json = await resp.json() as { access_token: string }
    return json.access_token
  }

  // Validates Shopify's HMAC signature on OAuth callbacks to prevent spoofing.
  verifyHmac(query: Record<string, string>): boolean {
    const { hmac, signature: _sig, ...rest } = query
    if (!hmac || !this.apiSecret) return false

    const message = Object.keys(rest)
      .sort()
      .map(k => `${k}=${rest[k]}`)
      .join('&')

    const digest = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex')

    try {
      return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'))
    } catch {
      return false
    }
  }
}
