import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CartService } from './cart.service'
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto'

// TODO: add JWT guard — @UseGuards(JwtAuthGuard) — once auth is wired up
@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get cart for a user' })
  async getCart(@Param('userId') userId: string) {
    const cart = await this.cartService.getCart(userId)
    return { items: cart.items, total: this.cartService.getTotal(cart) }
  }

  @Post(':userId/add')
  @ApiOperation({ summary: 'Add item to cart' })
  async addItem(@Param('userId') userId: string, @Body() dto: AddToCartDto) {
    const cart = await this.cartService.addItem(userId, dto)
    return { items: cart.items, total: this.cartService.getTotal(cart) }
  }

  @Patch(':userId/update')
  @ApiOperation({ summary: 'Update item quantity' })
  async updateItem(@Param('userId') userId: string, @Body() dto: UpdateCartItemDto) {
    const cart = await this.cartService.updateItem(userId, dto)
    return { items: cart.items, total: this.cartService.getTotal(cart) }
  }

  @Delete(':userId/remove')
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeItem(
    @Param('userId') userId: string,
    @Query('productId') productId: string,
    @Query('size') size: string,
  ) {
    const cart = await this.cartService.removeItem(userId, productId, size)
    return { items: cart.items, total: this.cartService.getTotal(cart) }
  }

  @Delete(':userId/clear')
  @ApiOperation({ summary: 'Clear entire cart' })
  async clearCart(@Param('userId') userId: string) {
    const cart = await this.cartService.clearCart(userId)
    return { items: cart.items, total: 0 }
  }
}
