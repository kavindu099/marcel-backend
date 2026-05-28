import { Injectable } from '@nestjs/common'
import { ChatProduct } from './types'

interface Intent {
  category?: string
  colour?: string
  occasion?: string
  budget?: number
  size?: string
  searchTerms?: string
}

const KNOWN_COLOURS = new Set([
  'black','white','red','blue','green','yellow','pink','purple','orange',
  'brown','grey','gray','navy','beige','cream','gold','silver','turquoise',
  'coral','teal','lilac','maroon','olive','khaki','rose','mint','lavender',
])

// Admin API — requires OAuth access token with read_products scope.
// Uses X-Shopify-Access-Token header.
const ADMIN_PRODUCTS_GQL = `
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          productType
          tags
          status
          priceRange {
            minVariantPrice { amount currencyCode }
          }
          variants(first: 20) {
            edges {
              node {
                id
                availableForSale
                price
                compareAtPrice
                selectedOptions { name value }
              }
            }
          }
          images(first: 1) {
            edges {
              node { url altText }
            }
          }
        }
      }
    }
  }
`

const ADMIN_SHOP_GQL = `{ shop { name } }`

@Injectable()
export class ShopifyProductsService {

  async fetchStoreInfo(shopDomain: string, adminToken: string): Promise<{ shopName: string; productTypes: string[] }> {
    try {
      const resp = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': adminToken,
        },
        body: JSON.stringify({ query: ADMIN_SHOP_GQL }),
      })
      if (!resp.ok) return { shopName: shopDomain, productTypes: [] }
      const json = await resp.json() as { data?: { shop?: { name?: string } } }
      const shopName = json.data?.shop?.name ?? shopDomain
      return { shopName, productTypes: [] }
    } catch {
      return { shopName: shopDomain, productTypes: [] }
    }
  }

  async search(shopDomain: string, adminToken: string, intent: Intent): Promise<ChatProduct[]> {
    const queriesToTry = this.buildQueryFallbacks(intent)
    let products: ChatProduct[] = []

    for (const q of queriesToTry) {
      products = await this.runQuery(shopDomain, adminToken, q)
      if (products.length > 0) break
      console.log(`[ShopifyProducts] Query returned 0: "${q}" — trying next fallback`)
    }

    if (intent.budget) {
      const maxBudget = intent.budget
      products = products.filter(p => p.price <= maxBudget)
    }

    if (intent.size) {
      const targetSize = intent.size.toLowerCase()
      products = products.filter(p =>
        p.sizes.length === 0 || p.sizes.some(s => s.toLowerCase() === targetSize)
      )
    }

    return products.slice(0, 12)
  }

  private buildQueryFallbacks(intent: Intent): string[] {
    const queries: string[] = []
    const modifiers: string[] = []
    if (intent.colour) modifiers.push(`tag:${intent.colour}`)
    if (intent.occasion) modifiers.push(`tag:${intent.occasion}`)

    if (intent.searchTerms) {
      const raw = intent.searchTerms
      const dehyphenated = raw.replaceAll('-', ' ').replaceAll(/\s+/g, ' ').trim()

      // 1a. De-hyphenated bare terms
      queries.push(dehyphenated)
      if (modifiers.length > 0) queries.push([dehyphenated, ...modifiers].join(' '))

      // 1b. title: prefix for key words (single word or multi)
      const keyWords = dehyphenated
        .split(/\s+/)
        .filter(w => w.length > 2 && !/^\d+$/.test(w))
        .slice(0, 5)
      if (keyWords.length >= 1) {
        queries.push(keyWords.map(w => `title:${w}`).join(' '))
      }

      // 1c. Original raw terms
      if (raw !== dehyphenated) queries.push(raw)
    }

    // Category-based keyword fallback
    if (intent.category) {
      const kwMap: Record<string, string[]> = {
        "Dresses":      ['dress', 'maxi', 'midi', 'gown'],
        "Women's Tops": ['top', 'blouse', 'crop', 'tank'],
        "Unisex Tops":  ['shirt', 'hoodie', 'polo', 'tee'],
        "Men's Tops":   ['jersey', 'polo'],
        "Bottoms":      ['pants', 'leggings', 'skirt', 'shorts'],
        "Outerwear":    ['jacket', 'coat', 'hoodie', 'puffer'],
        "Accessories":  ['hat', 'cap', 'beanie', 'scarf'],
        "Handbags":     ['bag', 'handbag', 'purse', 'tote'],
        "Sandals":      ['shoes', 'sandals', 'heels', 'slipper'],
        "Earrings":     ['earrings', 'jewelry', 'jewellery'],
      }
      const kws = kwMap[intent.category]
      if (kws) queries.push([...kws, ...modifiers].join(' '))
    }

    if (modifiers.length > 0) queries.push(modifiers.join(' '))

    // Final fallback: all products (including draft — some stores publish products without setting active status)
    queries.push('')

    return queries
  }

  private async runQuery(shopDomain: string, adminToken: string, query: string): Promise<ChatProduct[]> {
    console.log(`[ShopifyProducts] runQuery shop=${shopDomain} tokenLen=${adminToken?.length ?? 0} query="${query}"`)

    let resp: Response
    try {
      resp = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': adminToken,
        },
        body: JSON.stringify({ query: ADMIN_PRODUCTS_GQL, variables: { query, first: 50 } }),
      })
    } catch (err) {
      console.error('[ShopifyProducts] Fetch error:', err)
      return []
    }

    console.log(`[ShopifyProducts] HTTP ${resp.status} for query "${query}"`)

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[ShopifyProducts] API error ${resp.status}: ${body.slice(0, 300)}`)
      return []
    }

    const rawText = await resp.text()
    const json = JSON.parse(rawText) as {
      data?: { products?: { edges?: { node: unknown }[] } }
      errors?: { message: string }[]
    }

    if (json.errors?.length) {
      console.error('[ShopifyProducts] GraphQL errors:', JSON.stringify(json.errors))
      return []
    }

    const edges = json?.data?.products?.edges ?? []
    console.log(`[ShopifyProducts] Query "${query}" → ${edges.length} results`)
    return edges.map(e => this.mapProduct(e.node as Record<string, unknown>))
  }

  private mapProduct(node: Record<string, unknown>): ChatProduct {
    const variantEdges = ((node.variants as Record<string, unknown>)?.edges ?? []) as { node: Record<string, unknown> }[]
    const variants = variantEdges.map(e => e.node)

    const sizes = [...new Set(
      variants.flatMap(v =>
        ((v.selectedOptions ?? []) as { name: string; value: string }[])
          .filter(o => o.name.toLowerCase() === 'size')
          .map(o => o.value)
      )
    )]

    const colours = [...new Set(
      variants.flatMap(v =>
        ((v.selectedOptions ?? []) as { name: string; value: string }[])
          .filter(o => ['color', 'colour'].includes(o.name.toLowerCase()))
          .map(o => o.value)
      )
    )]

    const tagColours = ((node.tags ?? []) as string[]).filter(t =>
      KNOWN_COLOURS.has(t.toLowerCase())
    )

    // Admin API: price and compareAtPrice are plain decimal strings on variants
    const firstAvailable = variants.find(v => v.availableForSale) ?? null
    const firstVariant = firstAvailable ?? variants[0] ?? {}

    const priceRange = node.priceRange as { minVariantPrice?: { amount?: string } } | null
    const variantPrice = firstVariant.price as string | null
    const price = Number.parseFloat(variantPrice ?? priceRange?.minVariantPrice?.amount ?? '0')
    const compareAtAmount = firstVariant.compareAtPrice as string | null
    const compareAt = Number.parseFloat(compareAtAmount ?? '0')
    const hasSale = compareAt > 0 && compareAt > price

    const variantGid = firstAvailable ? ((firstAvailable.id as string | null) ?? '') : ''
    const variantId = variantGid.includes('/')
      ? variantGid.split('/').pop()
      : variantGid

    const inStock = (node.status as string | null) === 'ACTIVE' && firstAvailable !== null

    return {
      _id: (node.id as string | null) ?? '',
      name: (node.title as string | null) ?? '',
      category: (node.productType as string | null) || 'General',
      price: hasSale ? compareAt : price,
      salePrice: hasSale ? price : undefined,
      colours: colours.length > 0 ? colours : tagColours,
      sizes,
      images: (((node.images as Record<string, unknown> | null)?.edges as { node: { url: string } }[] | null) ?? []).map(e => e.node.url),
      inStock,
      handle: (node.handle as string | null) ?? '',
      variantId: (variantId && inStock) ? variantId : undefined,
    }
  }
}
