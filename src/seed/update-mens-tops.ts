import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  const result = await col.updateMany(
    { name: { $in: ['All-Over Print Boxy Football Jersey', 'All-Over Print American Football Jersey'] } },
    {
      $set: { category: "Men's Tops", gradient: 'from-slate-100 via-gray-50 to-slate-200' },
      $addToSet: { tags: { $each: ['mens', "men's tops", 'sports', 'jersey'] } },
    },
  )
  console.log(`Matched: ${result.matchedCount} | Modified: ${result.modifiedCount}`)
  await mongoose.disconnect()
}
run().catch(console.error)
