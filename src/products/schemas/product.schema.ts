import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ProductDocument = Product & Document

@Schema({ timestamps: true, suppressReservedKeysWarning: true })
export class Product {
  @Prop({ required: true })
  name: string

  @Prop({ required: true, unique: true })
  slug: string

  @Prop({ required: true })
  category: string

  @Prop({ required: true })
  description: string

  @Prop({ required: true })
  price: number

  @Prop()
  salePrice?: number

  @Prop({ type: [String], required: true })
  colours: string[]

  @Prop({ type: [String], required: true })
  sizes: string[]

  @Prop({ type: [String], default: [] })
  occasion: string[]

  @Prop({ required: true, default: 0 })
  stock: number

  @Prop({ type: [String], default: [] })
  images: string[]

  @Prop({ default: '' })
  gradient: string

  @Prop({ default: false })
  isNew: boolean

  @Prop({ default: false })
  isSale: boolean

  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({ default: 0 })
  rating: number

  @Prop({ default: 0 })
  reviewCount: number

  // Garment-level sizing chart: size → { chest, waist, hip, length } in cm
  @Prop({ type: Object, default: undefined })
  sizingChart?: Record<string, { chest: number; waist: number; hip: number; length: number }>
}

export const ProductSchema = SchemaFactory.createForClass(Product)

// Text search index on name, description, tags, category, occasion
ProductSchema.index({ name: 'text', description: 'text', tags: 'text', category: 'text', occasion: 'text' })
