import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

const UPDATES: { names: string[]; category: string; tags: string[] }[] = [
  {
    names: ['Black & Brown Slipper', 'Calvin Klein Heel Shoes', 'Golden Shoes Woman', 'Pampi Shoes', 'Red Shoes'],
    category: 'Sandals',
    tags: ['sandals', 'shoes', 'footwear', 'accessories'],
  },
  {
    names: ['Blue Women\'s Handbag', 'Heshe Women\'s Leather Bag', 'Prada Women Bag', 'White Faux Leather Backpack', 'Women Handbag Black'],
    category: 'Handbags',
    tags: ['handbag', 'bag', 'purse', 'accessories'],
  },
  {
    names: ['Green Crystal Earring', 'Green Oval Earring', 'Tropical Earring'],
    category: 'Earrings',
    tags: ['earrings', 'jewellery', 'jewelry', 'accessories'],
  },
]

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  for (const { names, category, tags } of UPDATES) {
    const result = await col.updateMany(
      { name: { $in: names } },
      { $set: { category, gradient: 'from-amber-100 via-yellow-50 to-amber-200' }, $addToSet: { tags: { $each: tags } } },
    )
    console.log(`${category.padEnd(10)} — matched: ${result.matchedCount}, modified: ${result.modifiedCount}`)
  }

  await mongoose.disconnect()
}

run().catch(console.error)
