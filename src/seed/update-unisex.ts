import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

const UNISEX_TOPS = [
  'Unisex Short Sleeve Tee | Printstar 00085-CVT',
  'Unisex Long Sleeve T-Shirt | Printstar 00102-CVL',
  'Unisex Basic Hoodie | Printstar 00216-MLH',
  'Unisex Premium Polo Shirt | Port Authority K500',
  'Unisex Performance Crew Neck T-Shirt | A4 N3142',
  'Unisex CVC T-shirt | Next Level 6210',
  'Unisex Oversized Tie-Dye T-Shirt | Shaka Wear SHHTDS',
  'Unisex Basic Softstyle T-Shirt | Gildan 64000',
  'Unisex Adidas Premium Polo Shirt | GQ3114',
  'Unisex Fine Jersey Tee | LAT Apparel 6901',
  'Unisex Ringer T-Shirt | Next Level 3604',
]

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  const result = await col.updateMany(
    { name: { $in: UNISEX_TOPS } },
    {
      $set: {
        category: 'Unisex Tops',
        gradient: 'from-teal-100 via-cyan-50 to-teal-200',
      },
      $addToSet: { tags: { $each: ['unisex', 'mens', 'unisex tops'] } },
    },
  )

  console.log(`Matched: ${result.matchedCount} | Modified: ${result.modifiedCount}`)

  // Verify
  const check = await col.find({ category: 'Unisex Tops' }).toArray()
  console.log('\nUnisex Tops in DB:')
  check.forEach(p => console.log(' -', p.name))

  await mongoose.disconnect()
}

run().catch(console.error)
