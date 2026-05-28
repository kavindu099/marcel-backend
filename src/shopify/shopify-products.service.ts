import { Injectable } from '@nestjs/common'
import { ChatProduct } from './types'

interface Intent {
  category?: string
  colour?: string
  occasion?: string
  budget?: number
  size?: string
  searchTerms?: string  // specific product name/model the user mentioned
}

// Maps internal category labels to Shopify product_type / tag filters.
const CATEGORY_QUERIES: Record<string, string> = {
  "Dresses":       '(product_type:Dress OR product_type:Dresses OR tag:dress OR tag:dresses)',
  "Women's Tops":  '(product_type:Top OR product_type:Blouse OR product_type:Shirt OR tag:womens-top)',
  "Unisex Tops":   '(product_type:T-Shirt OR product_type:Hoodie OR product_type:Tee OR product_type:Polo OR tag:unisex OR tag:t-shirt OR tag:hoodie)',
  "Men's Tops":    '(product_type:Jersey OR product_type:"Sports Jersey" OR tag:mens-top)',
  "Bottoms":       '(product_type:Pants OR product_type:Skirt OR product_type:Leggings OR product_type:Shorts OR product_type:"Compression Shorts" OR tag:bottom OR tag:pants OR tag:shorts)',
  "Outerwear":     '(product_type:Jacket OR product_type:Coat OR product_type:Outerwear OR tag:outerwear OR tag:jacket)',
  "Accessories":   '(product_type:Accessories OR product_type:Hat OR product_type:Scarf OR tag:accessory OR tag:accessories)',
  "Handbags":      '(product_type:Bag OR product_type:Handbag OR product_type:Purse OR tag:handbag OR tag:bag)',
  "Sandals":       '(product_type:Shoes OR product_type:Sandals OR product_type:Footwear OR tag:shoes OR tag:sandals)',
  "Earrings":      '(product_type:Jewelry OR product_type:Earrings OR product_type:Jewellery OR tag:earrings OR tag:jewelry)',
}

// Bare keywords searched across title, product_type, tags, and vendor — fallback when type/tag filters return nothing.
const KEYWORD_FALLBACKS: Record<string, string[]> = {
  "Dresses":       ['dress', 'maxi', 'midi', 'gown', 'frock'],
  "Women's Tops":  ['top', 'blouse', 'crop', 'tank'],
  "Unisex Tops":   ['shirt', 'hoodie', 'polo', 'tee', 'sweatshirt'],
  "Men's Tops":    ['jersey', 'polo'],
  "Bottoms":       ['pants', 'leggings', 'skirt', 'shorts', 'jogger', 'compression'],
  "Outerwear":     ['jacket', 'coat', 'hoodie', 'puffer'],
  "Accessories":   ['hat', 'cap', 'beanie', 'scarf'],
  "Handbags":      ['bag', 'handbag', 'purse', 'tote'],
  "Sandals":       ['shoes', 'sandals', 'heels', 'slipper'],
  "Earrings":      ['earrings', 'jewelry', 'jewellery'],
}

const KNOWN_COLOURS = new Set([
  'black','white','red','blue','green','yellow','pink','purple','orange',
  'brown','grey','gray','navy','beige','cream','gold','silver','turquoise',
  'coral','teal','lilac','maroon','olive','khaki','rose','mint','lavender',
])

// Includes product-level availableForSale so we can detect sold-out products.
const SHOPIFY_PRODUCTS_GQL = `
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          productType
          tags
          availableForSale
          priceRangeV2 {
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

const STORE_INFO_GQL = `{
  shop { name }
  productTypes(first: 100) { edges { node } }
}`

@Injectable()
export class ShopifyProductsService {
  // Fetches the store's display name and the full list of product types it uses.
  // Called once at install and refreshed daily to build the dynamic system prompt.
  async fetchStoreInfo(shopDomain: string, accessToken: string): Promise<{ shopName: string; productTypes: string[] }> {
    try {
      const resp = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ query: STORE_INFO_GQL }),
      })
      if (!resp.ok) return { shopName: shopDomain, productTypes: [] }

      const json = await resp.json() as {
        data?: {
          shop?: { name?: string }
          productTypes?: { edges?: { node: string }[] }
        }
      }
      const shopName = (json.data?.shop?.name) ?? shopDomain
      const productTypes = (json.data?.productTypes?.edges ?? [])
        .map(e => e.node)
        .filter(t => t.length > 0)

      return { shopName, productTypes }
    } catch {
      return { shopName: shopDomain, productTypes: [] }
    }
  }

  async search(shopDomain: string, accessToken: string, intent: Intent): Promise<ChatProduct[]> {
    const queriesToTry = this.buildQueryFallbacks(intent)
    let products: ChatProduct[] = []

    for (const q of queriesToTry) {
      products = await this.runQuery(shopDomain, accessToken, q)
      if (products.length > 0) break
      console.log(`[ShopifyProducts] Query returned 0: "${q}" — trying next fallback`)
    }

    // Budget filter (applied after fetching so out-of-stock products at right price still appear)
    if (intent.budget) {
      const maxBudget = intent.budget
      products = products.filter(p => p.price <= maxBudget)
    }

    // Size filter — skip if product has no size options (it fits any size)
    if (intent.size) {
      const targetSize = intent.size.toLowerCase()
      products = products.filter(p =>
        p.sizes.length === 0 || p.sizes.some(s => s.toLowerCase() === targetSize)
      )
    }

    return products.slice(0, 12)
  }

  // Returns queries to try in priority order — stops at first that yields results.
  private buildQueryFallbacks(intent: Intent): string[] {
    const queries: string[] = []
    const modifiers: string[] = []
    if (intent.colour) modifiers.push(`tag:"${intent.colour}"`)
    if (intent.occasion) modifiers.push(`tag:"${intent.occasion}"`)

    // 1. Direct product name/model search — three strategies in order:
    if (intent.searchTerms) {
      const raw = intent.searchTerms

      // 1a. De-hyphenated bare terms — Shopify treats leading hyphens as NOT operators, so
      //     "V-Line" in the middle of a query can misfire. Replacing hyphens with spaces is safer.
      const dehyphenated = raw.replaceAll('-', ' ').replaceAll(/\s+/g, ' ').trim()
      queries.push(dehyphenated)
      if (modifiers.length > 0) {
        queries.push([dehyphenated, ...modifiers].join(' AND '))
      }

      // 1b. title: prefix for each key word — searches specifically in product title, most precise.
      const keyWords = dehyphenated
        .split(/\s+/)
        .filter(w => w.length > 2 && !/^\d+$/.test(w))  // skip pure numbers and tiny words
        .slice(0, 5)
      if (keyWords.length >= 2) {
        queries.push(keyWords.map(w => `title:${w}`).join(' '))
      }

      // 1c. Original raw terms as last attempt (in case Shopify handles hyphens correctly)
      if (raw !== dehyphenated) queries.push(raw)
    }

    // 2. Category product_type / tag filter
    if (intent.category && CATEGORY_QUERIES[intent.category]) {
      queries.push(['status:active', CATEGORY_QUERIES[intent.category], ...modifiers].join(' AND '))
    }

    // 3. Category keyword search (bare terms, broader match)
    if (intent.category && KEYWORD_FALLBACKS[intent.category]) {
      const kwStr = KEYWORD_FALLBACKS[intent.category].join(' OR ')
      queries.push(['status:active', `(${kwStr})`, ...modifiers].join(' AND '))
    }

    // 4. Colour / occasion only, no category restriction
    if (modifiers.length > 0) {
      queries.push(['status:active', ...modifiers].join(' AND '))
    }

    // 5. All active products — always returns something so the chatbot has context
    queries.push('status:active')

    return queries
  }

  private async runQuery(shopDomain: string, accessToken: string, query: string): Promise<ChatProduct[]> {
    console.log(`[ShopifyProducts] runQuery shop=${shopDomain} tokenLen=${accessToken?.length ?? 0} query="${query}"`)
    let resp: Response
    try {
      resp = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: SHOPIFY_PRODUCTS_GQL, variables: { query, first: 50 } }),
      })
    } catch (err) {
      console.error('[ShopifyProducts] Fetch error:', err)
      return []
    }

    console.log(`[ShopifyProducts] HTTP ${resp.status} for query "${query}"`)

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`[ShopifyProducts] API error ${resp.status}: ${body.slice(0, 500)}`)
      return []
    }

    const rawText = await resp.text()
    console.log(`[ShopifyProducts] Raw response (first 300): ${rawText.slice(0, 300)}`)

    let json: { data?: { products?: { edges?: { node: unknown }[] } }; errors?: { message: string }[] }
    try {
      json = JSON.parse(rawText) as typeof json
    } catch (e) {
      console.error('[ShopifyProducts] JSON parse error:', e)
      return []
    }

    if (json.errors?.length) {
      console.error('[ShopifyProducts] GraphQL errors for query "%s":', query, JSON.stringify(json.errors))
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

    // Use the first available (in-stock) variant for pricing and cart; fall back to first variant for price display.
    const firstAvailable = variants.find(v => v.availableForSale) ?? null
    const firstVariant = firstAvailable ?? variants[0] ?? {}

    const priceRange = node.priceRangeV2 as { minVariantPrice?: { amount?: string } } | null
    const price = Number.parseFloat((firstVariant.price as string | null) ?? priceRange?.minVariantPrice?.amount ?? '0')
    const compareAt = Number.parseFloat((firstVariant.compareAtPrice as string | null) ?? '0')
    const hasSale = compareAt > 0 && compareAt > price

    // Only supply a variantId when the variant is actually in stock — prevents "Add to cart" on sold-out items.
    const variantGid = firstAvailable ? ((firstAvailable.id as string | null) ?? '') : ''
    const variantId = variantGid.includes('/')
      ? variantGid.split('/').pop()
      : variantGid

    const inStock = (node.availableForSale as boolean | null) ?? (firstAvailable !== null)

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
