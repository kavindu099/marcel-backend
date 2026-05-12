import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Cart, CartDocument } from './schemas/cart.schema'
import { ProductsService } from '../products/products.service'
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto'

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<CartDocument>,
    private productsService: ProductsService,
  ) {}

  async getCart(userId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({ userId: new Types.ObjectId(userId) })
    if (!cart) cart = await this.cartModel.create({ userId: new Types.ObjectId(userId), items: [] })
    return cart
  }

  async addItem(userId: string, dto: AddToCartDto): Promise<CartDocument> {
    const product = await this.productsService.findOne(dto.productId)
    const cart = await this.getCart(userId)

    const existing = cart.items.find(
      i => i.productId.toString() === dto.productId && i.size === dto.size && i.colour === dto.colour
    )

    if (existing) {
      existing.quantity += dto.quantity
    } else {
      cart.items.push({
        productId: new Types.ObjectId(dto.productId),
        name: product.name,
        price: product.salePrice ?? product.price,
        size: dto.size,
        colour: dto.colour,
        quantity: dto.quantity,
        imageUrl: product.images?.[0] ?? '',
      })
    }

    return cart.save()
  }

  async updateItem(userId: string, dto: UpdateCartItemDto): Promise<CartDocument> {
    const cart = await this.getCart(userId)

    if (dto.quantity === 0) {
      cart.items = cart.items.filter(
        i => !(i.productId.toString() === dto.productId && i.size === dto.size)
      ) as typeof cart.items
    } else {
      const item = cart.items.find(
        i => i.productId.toString() === dto.productId && i.size === dto.size
      )
      if (!item) throw new NotFoundException('Item not in cart')
      item.quantity = dto.quantity
    }

    return cart.save()
  }

  async removeItem(userId: string, productId: string, size: string): Promise<CartDocument> {
    const cart = await this.getCart(userId)
    cart.items = cart.items.filter(
      i => !(i.productId.toString() === productId && i.size === size)
    ) as typeof cart.items
    return cart.save()
  }

  async clearCart(userId: string): Promise<CartDocument> {
    const cart = await this.getCart(userId)
    cart.items = [] as typeof cart.items
    return cart.save()
  }

  getTotal(cart: CartDocument): number {
    return cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}
