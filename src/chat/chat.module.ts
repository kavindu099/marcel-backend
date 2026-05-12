import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { ProductsModule } from '../products/products.module'

@Module({
  imports: [ProductsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
