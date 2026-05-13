import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  // 1. Rename "Tops" → "Women's Tops"
  const r1 = await col.updateMany(
    { category: 'Tops' },
    { $set: { category: "Women's Tops" }, $addToSet: { tags: { $each: ['womens', "women's tops"] } } },
  )
  console.log(`Tops → Women's Tops: ${r1.modifiedCount} updated`)

  // 2. Print final category breakdown
  const categories = await col.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray()

  console.log('\nFinal category breakdown:')
  categories.forEach(c => console.log(`  ${String(c._id).padEnd(18)} ${c.count}`))

  await mongoose.disconnect()
}

run().catch(console.error)
