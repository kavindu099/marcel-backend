import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ShopDocument = Shop & Document

@Schema({ timestamps: true })
export class Shop {
  @Prop({ required: true, unique: true })
  shopDomain!: string

  @Prop({ required: true })
  accessToken!: string

  @Prop()
  installedAt!: Date

  // Store identity — fetched from Shopify at install and refreshed daily.
  @Prop()
  shopName?: string

  @Prop({ type: [String], default: [] })
  productTypes?: string[]

  @Prop()
  contextFetchedAt?: Date
}

export const ShopSchema = SchemaFactory.createForClass(Shop)
