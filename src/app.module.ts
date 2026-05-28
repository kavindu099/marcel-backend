import { join } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { ServeStaticModule } from '@nestjs/serve-static'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ProductsModule } from './products/products.module'
import { CartModule } from './cart/cart.module'
import { ChatModule } from './chat/chat.module'
import { TryonModule } from './tryon/tryon.module'
import { UploadModule } from './upload/upload.module'
import { ShopifyModule } from './shopify/shopify.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/aura-shop'),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/public',
      serveStaticOptions: { index: false },
    }),
    AuthModule,
    UsersModule,
    ProductsModule,
    CartModule,
    ChatModule,
    TryonModule,
    UploadModule,
    ShopifyModule,
  ],
})
export class AppModule {}
