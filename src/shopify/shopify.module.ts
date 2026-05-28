import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Shop, ShopSchema } from './schemas/shop.schema'
import { ShopService } from './shop.service'
import { ShopifyOAuthController } from './shopify-oauth.controller'
import { ShopifyOAuthService } from './shopify-oauth.service'
import { ShopifyProductsService } from './shopify-products.service'

@Module({
  imports: [MongooseModule.forFeature([{ name: Shop.name, schema: ShopSchema }])],
  controllers: [ShopifyOAuthController],
  providers: [ShopService, ShopifyOAuthService, ShopifyProductsService],
  exports: [ShopService, ShopifyProductsService],
})
export class ShopifyModule {}
