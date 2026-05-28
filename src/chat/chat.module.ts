import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ProductsModule } from '../products/products.module'
import { ShopifyModule } from '../shopify/shopify.module'

@Module({
  imports: [ProductsModule, ShopifyModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
