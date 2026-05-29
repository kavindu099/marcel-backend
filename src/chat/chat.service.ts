import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { ProductsService } from '../products/products.service'
import { ProductDocument } from '../products/schemas/product.schema'
import { ShopService } from '../shopify/shop.service'
import { ShopifyProductsService } from '../shopify/shopify-products.service'
import { ChatProduct } from '../shopify/types'

interface HistoryMessage { role: 'user' | 'assistant'; content: string }
interface Intent {
  category?: string
  colour?: string
  occasion?: string
  budget?: number
  size?: string
  isFollowUp?: boolean
  forMen?: boolean
  searchTerms?: string          // exact product the user named — searched directly
  searchAlternatives?: string[] // product types that could solve a described problem/need
  skipFinalFallback?: boolean
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

@Injectable()
export class ChatService {
  private readonly claude: Anthropic

  constructor(
    private readonly productsService: ProductsService,
    private readonly shopService: ShopService,
    private readonly shopifyProductsService: ShopifyProductsService,
  ) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(
    message: string,
    history: HistoryMessage[],
    image?: string,
    mediaType?: string,
    shopDomain?: string,
  ): Promise<{ message: string; products: ChatProduct[] }> {
    const [intent, imageGender] = await Promise.all([
      this.extractIntent(message, history),
      image ? this.detectGenderFromImage(image, mediaType ?? 'image/jpeg') : Promise.resolve('unknown' as const),
    ])

    const isSelfMale = intent.forMen
      || imageGender === 'male'
      || this.isMaleShopper(message, history)

    console.log(`[Chat] shopDomain="${shopDomain ?? ''}" intent=${JSON.stringify(intent)}`)

    const MEN_ONLY_CATEGORIES = new Set(["Unisex Tops", "Men's Tops"])
    let products: ChatProduct[]
    let storeContext = ''

    if (shopDomain) {
      // Fetch products and store context in parallel — context read is usually just a DB lookup.
      ;[products, storeContext] = await Promise.all([
        this.fetchShopifyProducts(shopDomain, intent, isSelfMale),
        this.getStoreContext(shopDomain),
      ])
    } else {
      products = await this.fetchLocalProducts(intent, isSelfMale)
    }

    // Men-only filter only applies to local MongoDB products — Shopify products are already
    // scoped by the search query and carry raw productType values, not our internal labels.
    if (isSelfMale && !shopDomain) {
      products = products.filter(p => MEN_ONLY_CATEGORIES.has(p.category))
    }

    console.log(`[Chat] products found: ${products.length} — ${products.slice(0, 3).map(p => p.name).join(', ')}`)
    const reply = await this.generateReply(message, history, products, storeContext, image, mediaType)
    return { message: reply, products: this.reorderByMention(products, reply) }
  }

  // Builds a one-line description of the store from cached product types.
  // Falls back to refreshing from Shopify if the cache is stale (> 24 h).
  private async getStoreContext(shopDomain: string): Promise<string> {
    try {
      const shop = await this.shopService.findByDomain(shopDomain)
      if (!shop) return ''

      const msInDay = 24 * 60 * 60 * 1000
      const stale = !shop.contextFetchedAt ||
        (Date.now() - new Date(shop.contextFetchedAt).getTime() > msInDay)

      let shopName = shop.shopName ?? shopDomain
      let productTypes = shop.productTypes ?? []

      if (stale) {
        const info = await this.shopifyProductsService.fetchStoreInfo(shopDomain, shop.accessToken)
        shopName = info.shopName
        productTypes = info.productTypes
        this.shopService.updateContext(shopDomain, shopName, productTypes).catch(() => {})
      }

      if (productTypes.length === 0) return shopName !== shopDomain ? `Store name: ${shopName}.` : ''
      return `This store (${shopName}) sells: ${productTypes.slice(0, 20).join(', ')}.`
    } catch {
      return ''
    }
  }

  // --- Product source: Shopify store ---

  private async fetchShopifyProducts(shopDomain: string, intent: Intent, isSelfMale: boolean): Promise<ChatProduct[]> {
    const shop = await this.shopService.findByDomain(shopDomain)
    if (!shop) {
      console.warn(`[ChatService] Unknown shop: ${shopDomain}. Has it completed OAuth install?`)
      return []
    }

    if (isSelfMale) {
      return this.shopifyProductsService.search(shopDomain, shop.accessToken, {
        ...intent,
        category: "Unisex Tops",
      })
    }

    // Problem/need-based query: search each alternative in parallel and merge.
    if (intent.searchAlternatives?.length) {
      const searches = intent.searchAlternatives.map(term =>
        this.shopifyProductsService.search(shopDomain, shop.accessToken, {
          ...intent,
          searchTerms: term,
          searchAlternatives: undefined,
          skipFinalFallback: true,
        })
      )
      const results = await Promise.all(searches)
      return this.dedupe(results.flat()).slice(0, 12)
    }

    // Specific product or category search.
    if (intent.category || intent.searchTerms) {
      return this.shopifyProductsService.search(shopDomain, shop.accessToken, intent)
    }

    // General browsing: fetch a diverse mix so the assistant has rich context.
    const [general, handbags, sandals] = await Promise.all([
      this.shopifyProductsService.search(shopDomain, shop.accessToken, intent),
      this.shopifyProductsService.search(shopDomain, shop.accessToken, { ...intent, category: "Handbags" }),
      this.shopifyProductsService.search(shopDomain, shop.accessToken, { ...intent, category: "Sandals" }),
    ])
    return this.dedupe([...general, ...handbags, ...sandals])
  }

  // --- Product source: local MongoDB ---

  private async fetchLocalProducts(intent: Intent, isSelfMale: boolean): Promise<ChatProduct[]> {
    let docs: ProductDocument[]

    if (isSelfMale) {
      docs = await this.productsService.search({ ...intent, category: "Unisex Tops" })
    } else if (intent.searchAlternatives?.length) {
      const base = { category: intent.category, colour: intent.colour, occasion: intent.occasion, budget: intent.budget, size: intent.size }
      const searches = intent.searchAlternatives.map(() => this.productsService.search(base))
      const results = await Promise.all(searches)
      docs = this.dedupeLocal(results.flat())
    } else if (intent.category) {
      docs = await this.productsService.search(intent)
    } else {
      const [general, handbags, sandals] = await Promise.all([
        this.productsService.search(intent),
        this.productsService.search({ ...intent, category: "Handbags" }),
        this.productsService.search({ ...intent, category: "Sandals" }),
      ])
      docs = this.dedupeLocal([...general, ...handbags, ...sandals])
    }

    return docs.map(p => ({
      _id: String(p._id),
      name: p.name,
      category: p.category,
      price: p.price,
      salePrice: p.salePrice,
      colours: p.colours,
      sizes: p.sizes,
      images: p.images,
      inStock: true,
      slug: p.slug,
    }))
  }

  // --- Helpers ---

  private dedupe(products: ChatProduct[]): ChatProduct[] {
    const seen = new Set<string>()
    return products.filter(p => {
      if (seen.has(p._id)) return false
      seen.add(p._id)
      return true
    })
  }

  private dedupeLocal(docs: ProductDocument[]): ProductDocument[] {
    const seen = new Set<string>()
    return docs.filter(p => {
      const id = String(p._id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  private reorderByMention(products: ChatProduct[], reply: string): ChatProduct[] {
    const lower = reply.toLowerCase()
    const withIdx = products.map(p => ({ product: p, idx: lower.indexOf(p.name.toLowerCase()) }))
    const mentioned = withIdx.filter(x => x.idx >= 0).sort((a, b) => a.idx - b.idx)
    const rest = withIdx.filter(x => x.idx < 0)
    return [...mentioned.map(x => x.product), ...rest.map(x => x.product)]
  }

  private async detectGenderFromImage(image: string, mediaType: string): Promise<'male' | 'female' | 'unknown'> {
    try {
      const res = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as ImageMediaType, data: image } },
            { type: 'text', text: 'Is the main person in this photo male or female? Reply with exactly one word: male, female, or unknown.' },
          ],
        }],
      }, { timeout: 10_000 })
      const text = res.content[0].type === 'text' ? res.content[0].text.trim().toLowerCase() : 'unknown'
      if (text === 'male') return 'male'
      if (text === 'female') return 'female'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private isMaleShopper(message: string, history: HistoryMessage[]): boolean {
    const giftSignals = /\b(for|gift|girlfriend|wife|sister|mother|mom|daughter|her|she|woman|girl)\b/i
    if (giftSignals.test(message)) return false
    const combined = [message, ...history.slice(-4).map(m => m.content)].join(' ')
    const malePatterns = /\b(i'?m|i am|as)\s+a\s+(\d+[\s-]year[\s-]old\s+)?(man|guy|male|boy|men)\b/i
    return malePatterns.test(combined)
  }

  private async extractIntent(message: string, history: HistoryMessage[]): Promise<Intent> {
    const context = history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')
    const userContent = context
      ? `Previous conversation:\n${context}\n\nCurrent message: ${message}`
      : message

    const res = await this.claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `You are a shopping intent extraction engine for an online store that may sell any type of product.
The customer may write in any language. Understand their message regardless of language.

Extract shopping intent and return ONLY valid JSON with these optional fields:
- searchTerms: string (when the customer names or asks for a SPECIFIC product — use their exact words)
- searchAlternatives: string[] (when the customer describes a PROBLEM, GOAL, or OCCASION without naming a product — generate 3-5 product types that could help them, ordered by relevance)
- colour: string (e.g. "red", "black", "blue")
- occasion: string (e.g. "wedding", "gym", "work", "casual")
- budget: number (max price in USD)
- size: string (e.g. "M", "L", "XL", "28")
- isFollowUp: true (if the message refers to a previously discussed product without naming a new one)
- forMen: true (ONLY when a man is explicitly shopping FOR HIMSELF — not as a gift for someone else)

CRITICAL RULES:
- Use searchTerms when customer names a specific product: "lifting mask", "compression shorts", "collagen cream"
- Use searchAlternatives when customer describes a need/problem/goal/occasion without naming a product
- Never set BOTH searchTerms and searchAlternatives — pick one
- Never leave both empty when there is product intent

Examples:
- "do you have lifting mask" → { "searchTerms": "lifting mask" }
- "show me red dresses under $50" → { "searchTerms": "red dress", "colour": "red", "budget": 50 }
- "my skin is dry and I need hydration" → { "searchAlternatives": ["moisturizer", "hydrating serum", "toner", "hyaluronic acid", "face cream"] }
- "I have a job interview tomorrow" → { "searchAlternatives": ["blazer", "formal shirt", "formal dress", "dress pants", "suit"] }
- "I want to look good at a party" → { "searchAlternatives": ["party dress", "cocktail dress", "heels", "earrings", "perfume"] }
- "something for my workout" → { "searchAlternatives": ["gym wear", "sports bra", "leggings", "protein", "water bottle"], "occasion": "gym" }
- "I have wrinkles and want to look younger" → { "searchAlternatives": ["retinol", "anti-aging serum", "collagen cream", "lifting mask", "eye cream"] }
- "hi" / "thanks" → {}

Return {} ONLY when there is clearly no product-related intent (pure greetings, thank-you, off-topic chat).`,
      messages: [{ role: 'user', content: userContent }],
    }, { timeout: 20_000 })

    try {
      const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
      const cleaned = text.replaceAll(/```json\n?|\n?```/g, '').trim()
      return JSON.parse(cleaned) as Intent
    } catch {
      return {}
    }
  }

  private async generateReply(
    message: string,
    history: HistoryMessage[],
    products: ChatProduct[],
    storeContext: string,
    image?: string,
    mediaType?: string,
  ): Promise<string> {
    // Build product context with stock status clearly labelled.
    const productLines = products
      .map(p => {
        const stockNote = p.inStock === false ? ' [OUT OF STOCK]' : ''
        const priceStr = p.salePrice != null
          ? `$${p.salePrice} (was $${p.price})`
          : `$${p.price}`
        const colourStr = p.colours.length > 0 ? ` — colours: ${p.colours.join(', ')}` : ''
        const sizeStr = p.sizes.length > 0 ? ` — sizes: ${p.sizes.join(', ')}` : ''
        return `- ${p.name} [${p.category}]${stockNote} (${priceStr})${colourStr}${sizeStr}`
      })
      .join('\n')

    const productContext = products.length > 0
      ? `\n\n[CATALOGUE MATCHES]\n${productLines}`
      : '\n\n[CATALOGUE MATCHES]\nNone — no products in our catalogue matched this request.'

    const priorMessages = history.slice(-6)
    const firstUserIdx = priorMessages.findIndex(m => m.role === 'user')
    const trimmedHistory = firstUserIdx === -1 ? [] : priorMessages.slice(firstUserIdx)

    const safeMediaType = (mediaType ?? 'image/jpeg') as ImageMediaType

    const userContent = image
      ? [
          { type: 'image' as const, source: { type: 'base64' as const, media_type: safeMediaType, data: image } },
          { type: 'text' as const, text: message + productContext },
        ]
      : message + productContext

    // Inject live store identity so the assistant adapts to any store type automatically.
    const storeLine = storeContext ? `\n${storeContext}` : ''

    const systemPrompt = image
      ? `You are an AI shopping assistant.${storeLine}
Detect the language of the customer's message and always reply in that same language.
Adapt your knowledge and terminology to this store's products — a wine store gets wine expertise, a clothing store gets fashion expertise, etc.

Analyse the photo and recommend relevant products from [CATALOGUE MATCHES]:
- If it shows a person, consider their style, build, and colouring when recommending products.
- If it shows a product the customer wants to match or compare, recommend the closest options from [CATALOGUE MATCHES].
- Out-of-stock products marked [OUT OF STOCK]: still mention them but note they're out of stock, then suggest the nearest in-stock alternative.
- Base recommendations ONLY on products listed in [CATALOGUE MATCHES]. Name each by its exact name.
- Keep to 3–5 sentences. Never use emojis. Be warm and encouraging.`
      : `You are an AI shopping assistant.${storeLine}
Detect the customer's language and always reply in that same language. Never switch mid-conversation.
Adapt your knowledge and terminology to this store's products automatically — wine store: use wine expertise; clothing: fashion expertise; beauty: skincare knowledge; and so on.

[CATALOGUE MATCHES] in each message shows products from this store that may match the customer's request or solve their stated problem.

═══ RESPONSE RULES ═══
1. NO emojis. Ever.
2. Be warm and conversational — 2–4 sentences for simple replies. Brief bullet points are fine for listing multiple products.
3. Recommend ONLY products listed in [CATALOGUE MATCHES]. Name each by its exact name.
4. When the customer described a PROBLEM or NEED (not a specific product):
   — Act as a knowledgeable consultant. Explain HOW each product addresses their specific problem.
   — Example: if they said "my skin is dry", say "The [Product] contains hyaluronic acid which deeply hydrates..."
   — Connect the product's features directly to the customer's stated concern.
5. Out-of-stock products (marked [OUT OF STOCK]):
   — Acknowledge: "The [Product] is currently out of stock at $X."
   — Suggest the closest in-stock alternative from [CATALOGUE MATCHES].
   — If no alternative exists, invite them to check back or browse at our full catalogue.
6. If [CATALOGUE MATCHES] says "None":
   — Be honest: this store doesn't appear to carry something that fits right now.
   — Do NOT invent reasons like "out of stock" or "not available."
   — Invite them to browse the full collection at our full catalogue.
7. Never speculate about products, stock, or pricing beyond [CATALOGUE MATCHES].
8. After each recommendation, ask one natural follow-up question to refine further.
9. If the customer has asked the same thing 2+ times without success, offer to connect them with the store team.`

    const res = await this.claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: image ? 600 : 500,
      system: systemPrompt,
      messages: [
        ...trimmedHistory,
        { role: 'user', content: userContent },
      ],
    }, { timeout: 20_000 })

    return res.content[0].type === 'text'
      ? res.content[0].text
      : "I couldn't process that request. Could you try rephrasing?"
  }
}
