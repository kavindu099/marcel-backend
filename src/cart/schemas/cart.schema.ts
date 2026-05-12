import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type CartDocument = Cart & Document

@Schema({ _id: false })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId

  @Prop({ required: true })
  name: string

  @Prop({ required: true })
  price: number

  @Prop({ required: true })
  size: string

  @Prop({ required: true })
  colour: string

  @Prop({ required: true, min: 1 })
  quantity: number

  @Prop({ default: '' })
  imageUrl: string
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem)

@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[]
}

export const CartSchema = SchemaFactory.createForClass(Cart)
