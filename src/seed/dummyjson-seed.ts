import mongoose from 'mongoose'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'

dotenv.config()

const DUMMYJSON = 'https://dummyjson.com'

interface DJProduct {
  id: number
  title: string
  description: string
  category: string
  price: number
  thumbnail: string
  images: string[]
  rating: number
  stock: number
  tags: string[]
  brand?: string
}

interface DJResponse {
  products: DJProduct[]
}

const CATEGORY_SOURCES = [
  { slug: 'womens-dresses',   mapped: 'Dresses' },
  { slug: 'womens-tops',      mapped: 'Tops' },
  { slug: 'womens-bags',      mapped: 'Accessories' },
  { slug: 'womens-shoes',     mapped: 'Accessories' },
  { slug: 'womens-jewellery', mapped: 'Accessories' },
]

const GRADIENT: Record<string, string> = {
  Dresses:     'from-pink-100 via-rose-50 to-pink-200',
  Tops:        'from-sky-100 via-blue-50 to-sky-200',
  Bottoms:     'from-indigo-100 via-slate-50 to-indigo-200',
  Outerwear:   'from-stone-200 via-gray-100 to-stone-300',
  Accessories: 'from-amber-100 via-yellow-50 to-amber-200',
}

const SIZES_BY_CATEGORY: Record<string, string[]> = {
  Dresses:     ['XS', 'S', 'M', 'L', 'XL'],
  Tops:        ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  Bottoms:     ['XS', 'S', 'M', 'L', 'XL'],
  Outerwear:   ['S', 'M', 'L', 'XL', 'XXL'],
  Accessories: ['Free Size'],
}

// Colours we infer from product title when DummyJSON doesn't give colour data
const COLOUR_HINTS: [RegExp, string][] = [
  [/black/i, 'Black'], [/white/i, 'White'], [/red/i, 'Red'],
  [/blue/i, 'Blue'], [/green/i, 'Green'], [/pink/i, 'Pink'],
  [/purple/i, 'Purple'], [/yellow/i, 'Yellow'], [/orange/i, 'Orange'],
  [/brown/i, 'Brown'], [/grey|gray/i, 'Grey'], [/gold/i, 'Gold'],
  [/silver/i, 'Silver'], [/beige|nude|cream/i, 'Beige'],
  [/navy/i, 'Navy'], [/floral/i, 'Multi'], [/printed/i, 'Multi'],
]

function inferColours(name: string): string[] {
  const found = COLOUR_HINTS.filter(([re]) => re.test(name)).map(([, c]) => c)
  return found.length > 0 ? found : ['Multi']
}

const slug = (s: string, id: number) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '') + `-dj${id}`

async function generateDescription(
  claude: Anthropic,
  name: string,
  category: string,
  djDescription: string,
  colours: string[],
): Promise<{ description: string; occasions: string[] }> {
  const res = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: `You are a fashion copywriter for AURA, an online women's boutique.
Write a 2-sentence product description that:
1. Describes the garment's style, fit, and key design details
2. Tells the customer EXACTLY when and where to wear it (specific occasions, seasons, activities)
Use sensory and aspirational language. Be specific — not generic.

Also list 2–4 occasions from: casual, party, formal, work, date night, evening, wedding, beach, everyday, brunch, holiday

Return ONLY valid JSON: { "description": "...", "occasions": [...] }`,
    messages: [{
      role: 'user',
      content: `Name: ${name}\nCategory: ${category}\nColours: ${colours.join(', ')}\nOriginal description: ${djDescription}`,
    }],
  }, { timeout: 15_000 })

  try {
    const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
    const cleaned = text.replaceAll(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(cleaned) as { description: string; occasions: string[] }
  } catch {
    return {
      description: djDescription,
      occasions: category === 'Dresses' ? ['casual', 'party'] : ['casual', 'everyday'],
    }
  }
}

async function main() {
  const mongoUri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura'
  await mongoose.connect(mongoUri)
  const col = mongoose.connection.collection('products')
  const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log('Fetching DummyJSON women\'s categories...\n')

  const docs: object[] = []

  for (const { slug: catSlug, mapped } of CATEGORY_SOURCES) {
    const res = await fetch(`${DUMMYJSON}/products/category/${catSlug}?limit=100`)
    const data = await res.json() as DJResponse
    const items = data.products ?? []

    console.log(`  ${catSlug}: ${items.length} products`)

    for (const item of items) {
      const colours = inferColours(item.title)
      const images = item.images.length > 0 ? item.images.slice(0, 3) : [item.thumbnail]

      process.stdout.write(`    Generating description for "${item.title}"...`)

      const { description, occasions } = await generateDescription(
        claude, item.title, mapped, item.description, colours,
      )

      console.log(' done')

      const isSale = Math.random() > 0.7
      const isNew  = Math.random() > 0.55

      docs.push({
        name:        item.title,
        slug:        slug(item.title, item.id),
        category:    mapped,
        description,
        price:       Math.round(item.price * 100) / 100,
        salePrice:   isSale ? Math.round(item.price * 0.8 * 100) / 100 : undefined,
        colours,
        sizes:       SIZES_BY_CATEGORY[mapped] ?? ['S', 'M', 'L'],
        occasion:    occasions,
        stock:       item.stock > 0 ? item.stock : Math.floor(Math.random() * 50) + 10,
        images,
        gradient:    GRADIENT[mapped],
        isNew,
        isSale,
        tags:        [mapped.toLowerCase(), ...(item.tags ?? []), ...colours.map(c => c.toLowerCase())],
        rating:      Math.round(item.rating * 10) / 10,
        reviewCount: Math.floor(Math.random() * 150) + 10,
      })
    }
  }

  console.log(`\nInserting ${docs.length} products...`)
  await col.insertMany(docs)

  console.log(`\nDone. Breakdown:`)
  const breakdown: Record<string, number> = {}
  docs.forEach(d => {
    const cat = (d as { category: string }).category
    breakdown[cat] = (breakdown[cat] ?? 0) + 1
  })
  Object.entries(breakdown).forEach(([cat, n]) => console.log(`  ${cat.padEnd(14)} ${n}`))

  await mongoose.disconnect()
}

main().catch(console.error)
