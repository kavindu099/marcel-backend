import { NestFactory } from '@nestjs/core'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule } from '@nestjs/config'
import { InjectModel, getModelToken } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Product, ProductSchema, ProductDocument } from '../products/schemas/product.schema'
import { SEED_PRODUCTS } from './seed.data'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura-shop'),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
})
class SeedModule {}

async function seed() {
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: false })

  const productModel = app.get<Model<ProductDocument>>(getModelToken(Product.name))

  console.log('🌱  Starting seed...')

  // Clear existing products
  const deleted = await productModel.deleteMany({})
  console.log(`🗑️   Cleared ${deleted.deletedCount} existing products`)

  // Insert seed products
  const inserted = await productModel.insertMany(SEED_PRODUCTS)
  console.log(`✅  Inserted ${inserted.length} products`)

  // Print a summary
  const categories = [...new Set(SEED_PRODUCTS.map(p => p.category))]
  console.log(`\n📦  Categories seeded:`)
  for (const cat of categories) {
    const count = SEED_PRODUCTS.filter(p => p.category === cat).length
    console.log(`    ${cat.padEnd(16)} ${count} products`)
  }

  const sale = SEED_PRODUCTS.filter(p => p.isSale).length
  const newIn = SEED_PRODUCTS.filter(p => p.isNew).length
  console.log(`\n🏷️   On sale: ${sale}  |  New in: ${newIn}`)
  console.log(`\n🎉  Seed complete — ${inserted.length} products ready in MongoDB`)

  await app.close()
  process.exit(0)
}

seed().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
