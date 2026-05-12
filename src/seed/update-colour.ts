import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  const result = await col.updateOne(
    { name: 'Corset Leather With Skirt' },
    { $set: { colours: ['Red'] } },
  )
  console.log('Matched:', result.matchedCount, '| Modified:', result.modifiedCount)

  const p = await col.findOne({ name: 'Corset Leather With Skirt' })
  console.log('colours now:', JSON.stringify(p?.colours))

  await mongoose.disconnect()
}

run().catch(console.error)
