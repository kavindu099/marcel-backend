import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  // Rename all "Tops" → "Women's Tops"
  const result = await col.updateMany(
    { category: 'Tops' },
    {
      $set: { category: "Women's Tops" },
      $addToSet: { tags: { $each: ['womens', "women's tops"] } },
    },
  )
  console.log(`Tops → Women's Tops: matched ${result.matchedCount}, modified ${result.modifiedCount}`)

  // Verify counts
  const wt = await col.countDocuments({ category: "Women's Tops" })
  const ut = await col.countDocuments({ category: 'Unisex Tops' })
  console.log(`\nWomen's Tops: ${wt}`)
  console.log(`Unisex Tops:  ${ut}`)

  await mongoose.disconnect()
}

run().catch(console.error)
