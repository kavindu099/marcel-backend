import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura')
  const col = mongoose.connection.collection('products')

  // 1. Recategorize T-Shirt Dress → Tops
  const r1 = await col.updateOne(
    { name: 'All-Over Print Cotton T-Shirt Dress' },
    {
      $set: {
        category: 'Tops',
        gradient: 'from-sky-100 via-blue-50 to-sky-200',
        occasion: ['casual', 'everyday', 'brunch'],
        description: 'A relaxed all-over print cotton tee that doubles as a casual mini dress. Perfect for everyday wear, weekend brunch, or a laid-back day out — pair with sneakers or sandals for an effortless look.',
        tags: ['t-shirt', 'tops', 'casual', 'cotton', 'everyday', 'printed'],
      },
    },
  )
  console.log('T-Shirt Dress → Tops:', r1.modifiedCount ? 'done' : 'not found')

  // 2. Update Corset / Skirt / Suit products — proper formal/wedding occasions & rich descriptions
  const formalUpdates = [
    {
      name: 'Corset Leather With Skirt',
      description: 'A bold structured corset paired with a sleek leather skirt — an instantly glamorous look built for formal events, cocktail parties, and upscale evenings. The fitted silhouette hugs your curves and commands attention at weddings, galas, or any black-tie occasion.',
      occasion: ['formal', 'party', 'wedding', 'evening', 'cocktail'],
      tags: ['corset', 'leather', 'skirt', 'dresses', 'formal', 'wedding', 'evening', 'party', 'cocktail'],
    },
    {
      name: 'Corset With Black Skirt',
      description: 'A timeless corset-and-skirt set in classic black — effortlessly sophisticated for weddings, formal dinners, and evening events. The structured corset top creates a defined waist while the flowing skirt adds drama and movement.',
      occasion: ['formal', 'party', 'wedding', 'evening', 'cocktail'],
      tags: ['corset', 'black', 'skirt', 'dresses', 'formal', 'wedding', 'evening', 'party', 'cocktail'],
    },
    {
      name: 'Marni Red & Black Suit',
      description: 'A striking red and black suit ensemble that makes a statement at weddings, galas, and formal occasions. Designed for the woman who wants to be remembered — wear it to a wedding reception, a gala, or a special evening event.',
      occasion: ['formal', 'wedding', 'evening', 'gala', 'party'],
      tags: ['suit', 'red', 'black', 'dresses', 'formal', 'wedding', 'gala', 'evening', 'party'],
    },
    {
      name: 'Black Women\'s Gown',
      description: 'An elegant floor-length black gown that is the ultimate choice for black-tie weddings, galas, formal dinners, and evening events. The classic silhouette and rich fabric make it a versatile investment piece for any formal wardrobe.',
      occasion: ['formal', 'wedding', 'evening', 'gala', 'black-tie'],
      tags: ['gown', 'black', 'dresses', 'formal', 'wedding', 'gala', 'evening', 'black-tie'],
    },
  ]

  for (const update of formalUpdates) {
    const r = await col.updateOne(
      { name: update.name },
      { $set: { description: update.description, occasion: update.occasion, tags: update.tags } },
    )
    console.log(`${update.name}: ${r.modifiedCount ? 'updated' : 'not found'}`)
  }

  await mongoose.disconnect()
}

run().catch(console.error)
