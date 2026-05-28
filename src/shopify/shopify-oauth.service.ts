import { Injectable } from '@nestjs/common'
import * as crypto from 'node:crypto'

@Injectable()
export class ShopifyOAuthService {
  private get apiKey() { return process.env.SHOPIFY_API_KEY ?? '' }
  private get apiSecret() { return process.env.SHOPIFY_API_SECRET ?? '' }
  private get scopes() { return process.env.SHOPIFY_SCOPES || 'read_products,write_script_tags' }
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

  async registerScriptTag(shop: string, accessToken: string): Promise<void> {
    const widgetUrl = `${process.env.SHOPIFY_APP_URL}/widget/chat-widget.js`

    // Check if already registered to avoid duplicates
    const listResp = await fetch(`https://${shop}/admin/api/2025-01/script_tags.json?src=${encodeURIComponent(widgetUrl)}`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })
    if (listResp.ok) {
      const list = await listResp.json() as { script_tags: unknown[] }
      if (list.script_tags.length > 0) return
    }

    await fetch(`https://${shop}/admin/api/2025-01/script_tags.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ script_tag: { event: 'onload', src: widgetUrl } }),
    })
  }

  // Validates Shopify's HMAC signature on OAuth callbacks to prevent spoofing.
  verifyHmac(query: Record<string, string>): boolean {
    const { hmac, signature: _sig, ...rest } = query
    if (!hmac || !this.apiSecret) return false

    const message = Object.keys(rest)
      .sort((a, b) => a.localeCompare(b))
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
