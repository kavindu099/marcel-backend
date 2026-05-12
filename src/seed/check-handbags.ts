import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')
  const bags = await col.find({ category: 'Handbags' }).toArray()
  console.log('Handbag count:', bags.length)
  bags.forEach(b => console.log(' -', b.name, '| stock:', b.stock, '| category:', b.category))
  await mongoose.disconnect()
}
run().catch(console.error)
