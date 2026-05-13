import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { ProductsService } from '../products/products.service'
import { ProductDocument } from '../products/schemas/product.schema'

interface HistoryMessage { role: 'user' | 'assistant'; content: string }
interface Intent {
  category?: string
  colour?: string
  occasion?: string
  budget?: number
  size?: string
  isFollowUp?: boolean
  outOfScope?: boolean
  forMen?: boolean
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

@Injectable()
export class ChatService {
  private readonly claude: Anthropic

  constructor(private readonly productsService: ProductsService) {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async chat(
    message: string,
    history: HistoryMessage[],
    image?: string,
    mediaType?: string,
  ): Promise<{ message: string; products: ProductDocument[] }> {
    const intent = await this.extractIntent(message, history)
    const MEN_ONLY_CATEGORIES = new Set(["Unisex Tops", "Men's Tops"])
    let products: ProductDocument[]
    if (intent.outOfScope) {
      products = []
    } else if (intent.forMen) {
      // Man shopping for himself — only search gender-appropriate categories
      products = await this.productsService.search({ ...intent, category: "Unisex Tops" })
    } else if (image && !intent.category) {
      // Photo submitted with no specific category — ensure unisex items are always
      // in catalogue matches so Claude has gender-appropriate options for men
      const [general, unisex] = await Promise.all([
        this.productsService.search(intent),
        this.productsService.search({ ...intent, category: "Unisex Tops" }),
      ])
      const seen = new Set<string>()
      products = [...general, ...unisex].filter(p => {
        const id = String(p._id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    } else {
      products = await this.productsService.search(intent)
    }
    // Final safety filter: never return women-only items to a man shopping for himself
    if (intent.forMen) {
      products = products.filter(p => MEN_ONLY_CATEGORIES.has(p.category as string))
    }
    const reply = await this.generateReply(message, history, products, image, mediaType)
    return { message: reply, products: this.reorderByMention(products, reply) }
  }

  private reorderByMention(products: ProductDocument[], reply: string): ProductDocument[] {
    const lower = reply.toLowerCase()
    const mentioned = products
      .map(p => ({ product: p, idx: lower.indexOf(p.name.toLowerCase()) }))
      .filter(x => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)
      .map(x => x.product)
    // Only show products Claude explicitly named — avoids surfacing irrelevant
    // items (e.g. women's products when Claude correctly redirected a male user)
    return mentioned.length > 0 ? mentioned : products
  }

  private async extractIntent(message: string, history: HistoryMessage[]): Promise<Intent> {
    const context = history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')
    const userContent = context
      ? `Previous conversation:\n${context}\n\nCurrent message: ${message}`
      : message

    const res = await this.claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are an intent extraction engine for a women's fashion boutique called AURA.
The customer may write in any language. Understand their message regardless of language.

Extract shopping intent and return ONLY valid JSON with these optional fields:
- category: one of "Dresses" | "Women's Tops" | "Unisex Tops" | "Men's Tops" | "Bottoms" | "Outerwear" | "Accessories" | "Sandals" | "Handbags" | "Earrings"
- colour: string
- occasion: string (e.g. wedding, casual, formal, work, party, beach)
- budget: number (max price in USD)
- size: string (XS/S/M/L/XL/XXL or numeric like 28)
- isFollowUp: true (if this references a previous message)
- outOfScope: true (if the request is for something we don't sell — children's clothing, swimwear, suits, formal menswear, underwear)
- forMen: true (ONLY when a man is explicitly shopping FOR HIMSELF — not for a gift)

CRITICAL: Always extract the category of the item being REQUESTED, NOT the item being referenced or already chosen.
Example: "I like this dress, recommend a matching handbag" → category: "Handbags" (not "Dresses")
Example: "I picked the corset, what shoes go with it?" → category: "Sandals" (not "Dresses")
The referenced item is context only — the requested item determines the category.

IMPORTANT — MEN SHOPPING RULES:
- If a man is shopping FOR HIMSELF: set forMen: true AND category: "Unisex Tops". Never set Handbags, Sandals, Earrings, Women's Tops, or Dresses for a man shopping for himself.
- If shopping as a GIFT for a woman: any category is allowed. Do NOT set forMen.
- Gift shopping for men is NOT outOfScope — recommend Unisex Tops.
- T-shirts, hoodies, sweatshirts are always "Unisex Tops", never "Women's Tops".
- Requests that include a budget — always try to find matching products.

Map similar items to our categories regardless of language: e.g. "robe/vestido/فستان/드레스" → Dresses, "blouse/crop top/tank/racerback" → Women's Tops, "jupe/falda/تنورة/치마" → Bottoms, "manteau/abrigo/معطف/코트" → Outerwear, "shoes/heels/slippers/sandals/footwear" → Sandals, "bag/purse/handbag/backpack/tote" → Handbags, "earrings/jewellery/jewelry" → Earrings.
Use "Unisex Tops" when the customer is a man shopping for himself, or asks for t-shirts, hoodies, polo shirts, or crew necks.
Use "Men's Tops" only for sports jerseys or football jerseys.
Use "Women's Tops" for women asking for tops, blouses, crop tops, tank tops, or racerback tops.
Return {} if no shopping intent found.`,
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
    products: ProductDocument[],
    image?: string,
    mediaType?: string,
  ): Promise<string> {
    const productLines = products
      .map(p => `- ${p.name} [${p.category}] ($${p.salePrice ?? p.price}) — colours: ${p.colours.join(', ')} — sizes: ${p.sizes.join(', ')}`)
      .join('\n')
    const productContext = products.length > 0
      ? `\n\n[CATALOGUE MATCHES]\n${productLines}`
      : '\n\n[CATALOGUE MATCHES]\nNone — no products in our catalogue matched this request.'

    const priorMessages = history.slice(-6)
    const firstUserIdx = priorMessages.findIndex(m => m.role === 'user')
    const trimmedHistory = firstUserIdx >= 0 ? priorMessages.slice(firstUserIdx) : []

    const safeMediaType = (mediaType ?? 'image/jpeg') as ImageMediaType

    const userContent = image
      ? [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: safeMediaType, data: image },
          },
          { type: 'text' as const, text: message + productContext },
        ]
      : message + productContext

    const systemPrompt = image
      ? `You are AURA, a personal stylist for a modern fashion boutique. The customer has shared a photo for style analysis.
Detect the language of the customer's message and always reply in that same language.
We stock women's fashion AND unisex items including t-shirts, hoodies, leggings, tote bags, caps and more — suitable for any gender.

IF THE PHOTO SHOWS A MAN:
- Analyse his style, colouring, and build, then recommend items from our Unisex Tops or Men's Tops range only.
- HARD RULE: Only recommend products whose category is "Unisex Tops" or "Men's Tops" from [CATALOGUE MATCHES].
- NEVER recommend Handbags, Sandals, Earrings, Women's Tops, or Dresses to a man — skip those products entirely even if they appear in [CATALOGUE MATCHES].
- If no Unisex Tops or Men's Tops appear in [CATALOGUE MATCHES], tell him we carry great unisex t-shirts and hoodies and invite him to browse that section.

IF THE PHOTO SHOWS A WOMAN:
- Note her colouring and proportions, identify her style aesthetic, give warm specific feedback, and explain why the recommended products suit her look.

Base recommendations only on products listed in [CATALOGUE MATCHES]. Keep to 3–5 sentences. Never use emojis. Be encouraging and inclusive.`
      : `You are AURA, a shopping assistant for an upscale women's fashion boutique.
Detect the language of the customer's message and always reply in that same language. Never switch languages mid-conversation.


═══ WHAT WE STOCK ═══
Fashion for women and unisex styles:
• Dresses — wrap, maxi, midi, mini, bodycon, shirt dresses
• Women's Tops — crop tops, tank tops, racerback tops, long sleeves, sports bras, blouses, turtlenecks (women only)
• Unisex Tops — t-shirts, hoodies, polo shirts, crew necks (suitable for all genders, including men)
• Men's Tops — sports jerseys, football jerseys (men only)
• Bottoms — leggings, joggers, skirts, biker shorts, sweatpants
• Outerwear — hoodies, zip-ups, sweatshirts, puffer jackets, windbreakers, fleece
• Accessories — beanies, caps, scarves (Printful unisex)
• Handbags — handbags, leather bags, backpacks, purses
• Sandals — heels, slippers, flats, pumps, open-toe shoes
• Earrings — crystal earrings, oval earrings, statement earrings

NOTE: Many of our tops, hoodies, and accessories are unisex and make excellent gifts for men too.
WE DO NOT STOCK: children's clothing, swimwear, underwear, formal suits, tailored menswear.

═══ STORE CONTACT ═══
Phone / WhatsApp: +1 (555) 000-0000
Email: hello@aura-boutique.com
In-store: Mon–Sat 10:00–19:00, Sun 11:00–17:00

═══ RESPONSE RULES — follow exactly ═══
1. NO emojis. Ever.
2. 2–3 sentences maximum.
3. Base your answer ONLY on the [CATALOGUE MATCHES] section. Never mention products that aren't listed there.
4. If [CATALOGUE MATCHES] says "None":
   — Honestly say we don't carry that specific item right now.
   — Suggest the closest category we DO carry and invite them to browse it.
   — End with: "You can also browse our full collection at /products — you may find something you love."
   — Do NOT make up reasons like "out of stock" or "not available right now".
   — If the customer has asked the same type of question 2+ times without success, also offer the store contact details so a stylist can help personally.
5. If a man is shopping FOR HIMSELF:
   — Only recommend from Unisex Tops (t-shirts, hoodies, polo shirts).
   — Never recommend Handbags, Sandals, Earrings, Women's Tops, or Dresses to a man for himself.
   — If [CATALOGUE MATCHES] contains women's items only, say we have unisex tops that may suit him and point to that category.
6. If the customer is shopping as a GIFT for a woman (boyfriend buying for girlfriend, etc.):
   — Any category is appropriate. Recommend from whatever matches her style/occasion.
7. If the customer asks for something truly outside our catalogue (e.g. children's clothing, swimwear, formal suits):
   — Politely explain we don't carry that specific item.
   — Suggest the closest category we do carry.
8. Never speculate about stock, pricing, or availability beyond what is in [CATALOGUE MATCHES].
9. When providing contact details, always include the phone number, email address, and opening hours together.`

    const res = await this.claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: image ? 600 : 400,
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
