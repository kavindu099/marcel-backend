import mongoose from 'mongoose'
import * as dotenv from 'dotenv'

dotenv.config()

const API = 'https://api.printful.com'
const TARGET = 100

// ── Category mapping ─────────────────────────────────────────────────────────

function mapCategory(typeName: string, title: string): string | null {
  const t = `${typeName} ${title}`.toLowerCase()

  // Skip non-clothing / home goods / accessories we don't carry
  const skip = ['luggage tag', 'area rug', 'ornament', 'phone case', 'pillow',
    'flag', 'poster', 'mug', 'face mask', 'apron', 'towel', 'blanket',
    'sticker', 'notebook', 'canvas', 'clock', 'mirror', 'cutting board',
    'mouse pad', 'bottle', 'tumbler', 'swimsuit', 'swimwear', 'bikini',
    'underwear', 'boxer', 'brief', 'men\'s quarter-zip', 'men\'s polo',
    'men\'s bomber', 'men\'s puffer', 'men\'s trench']
  if (skip.some(s => t.includes(s))) return null

  // Skip explicitly men's-only
  if ((t.includes("men's") || t.includes('mens ')) && !t.includes("women")) return null

  // Dresses
  if (t.includes('dress') || t.includes('skater') || t.includes('bodycon') ||
      t.includes('midi') || t.includes('maxi')) return 'Dresses'

  // Bottoms
  if (t.includes('skirt') || t.includes('legging') || t.includes('shorts') ||
      t.includes('sweatpant') || t.includes('jogger') || t.includes('biker') ||
      t.includes('bottom') || t.includes('pant') || t.includes('jean')) return 'Bottoms'

  // Outerwear
  if (t.includes('jacket') || t.includes('coat') || t.includes('windbreaker') ||
      t.includes('hoodie') || t.includes('zip-up') || t.includes('zip up') ||
      t.includes('pullover') || t.includes('sweatshirt') || t.includes('fleece') ||
      t.includes('puffer') || t.includes('bomber') || t.includes('trench')) return 'Outerwear'

  // Tops — broad: any tee/top/tank/crop/bodysuit/polo not already caught
  if (t.includes('top') || t.includes('t-shirt') || t.includes('tee') ||
      t.includes('tank') || t.includes('crop') || t.includes('bodysuit') ||
      t.includes('sports bra') || t.includes('blouse') || t.includes('tunic') ||
      t.includes('polo') || t.includes('jersey') || t.includes('henley') ||
      t.includes('long sleeve') || t.includes('raglan') || t.includes('v-neck') ||
      t.includes('crew neck') || t.includes('turtleneck')) return 'Tops'

  // Accessories
  if (t.includes('tote') || t.includes('bag') || t.includes('backpack') ||
      t.includes('fanny') || t.includes('scarf') || t.includes('beanie') ||
      t.includes('hat') || t.includes('cap') || t.includes('socks') ||
      t.includes('gloves') || t.includes('belt')) return 'Accessories'

  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function get(path: string) {
  const res = await fetch(`${API}${path}`)
  const json = await res.json() as { result: unknown }
  return json.result
}

const slug = (s: string, id: number) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '') + `-${id}`

const GRADIENT: Record<string, string> = {
  Dresses:     'from-pink-100 via-rose-50 to-pink-200',
  Tops:        'from-sky-100 via-blue-50 to-sky-200',
  Bottoms:     'from-indigo-100 via-slate-50 to-indigo-200',
  Outerwear:   'from-stone-200 via-gray-100 to-stone-300',
  Accessories: 'from-amber-100 via-yellow-50 to-amber-200',
}

const SIZE_MAP: Record<string, string> = { '2XL': 'XXL', '2XS': 'XS' }
const STD = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL'])

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  console.log('🔍  Fetching Printful catalog...')
  const allProducts = await get('/products') as {
    id: number; title: string; type_name: string; image: string; is_discontinued: boolean
  }[]

  console.log(`    ${allProducts.length} total products found`)

  const docs: object[] = []
  let apiCalls = 0

  for (const p of allProducts) {
    if (docs.length >= TARGET) break
    if (p.is_discontinued) continue

    const category = mapCategory(p.type_name, p.title)
    if (!category) continue

    await sleep(120) // be gentle with the API
    apiCalls++

    try {
      const detail = await get(`/products/${p.id}`) as {
        product: object
        variants: {
          id: number; size: string; color: string; color_code: string
          image: string; price: string; in_stock: boolean
        }[]
      }

      const variants = (detail.variants ?? []).filter(v => v.in_stock)
      if (variants.length === 0) continue

      // Normalise sizes
      const sizes = [...new Set(
        variants
          .map(v => SIZE_MAP[v.size] ?? v.size)
          .filter(s => STD.has(s))
      )]
      if (sizes.length === 0) continue

      const colours = [...new Set(variants.map(v => v.color).filter(Boolean))].slice(0, 6)

      // Base price from cheapest standard-size in-stock variant
      const base = variants.find(v => STD.has(SIZE_MAP[v.size] ?? v.size)) ?? variants[0]
      const price = Math.round(parseFloat(base.price) * 100) / 100

      // Collect up to 3 unique variant images (one per colour)
      const seen = new Set<string>()
      const images: string[] = []
      for (const v of variants) {
        if (images.length >= 3) break
        if (v.image && !seen.has(v.color)) { images.push(v.image); seen.add(v.color) }
      }
      if (images.length === 0 && p.image) images.push(p.image)
      if (images.length === 0) continue

      const isSale  = Math.random() > 0.75
      const isNew   = Math.random() > 0.6

      docs.push({
        name:        p.title,
        slug:        slug(p.title, p.id),
        category,
        description: `${p.title}. Available in ${colours.slice(0, 3).join(', ')}${colours.length > 3 ? ' and more' : ''}. Sizes ${sizes.join(', ')}.`,
        price,
        salePrice:   isSale ? Math.round(price * 0.8 * 100) / 100 : undefined,
        colours,
        sizes,
        occasion:    [],
        stock:       Math.floor(Math.random() * 60) + 10,
        images,
        gradient:    GRADIENT[category],
        isNew,
        isSale,
        tags:        [category.toLowerCase(), ...colours.slice(0, 2).map(c => c.toLowerCase())],
        rating:      Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 200) + 5,
      })

      process.stdout.write(`\r    Collected ${docs.length}/${TARGET} products (${apiCalls} API calls)`)
    } catch {
      continue
    }
  }

  console.log('\n')

  if (docs.length === 0) {
    console.log('❌  No products collected — check category filters')
    await mongoose.disconnect(); return
  }

  await col.insertMany(docs)

  console.log(`✅  Inserted ${docs.length} products\n`)
  const breakdown: Record<string, number> = {}
  docs.forEach(d => {
    const cat = (d as { category: string }).category
    breakdown[cat] = (breakdown[cat] ?? 0) + 1
  })
  Object.entries(breakdown).forEach(([cat, n]) => console.log(`    ${cat.padEnd(14)} ${n}`))

  await mongoose.disconnect()
}

main().catch(console.error)
