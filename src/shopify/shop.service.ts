import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Shop, ShopDocument } from './schemas/shop.schema'

@Injectable()
export class ShopService {
  constructor(@InjectModel(Shop.name) private shopModel: Model<ShopDocument>) {}

  async findByDomain(shopDomain: string): Promise<ShopDocument | null> {
    return this.shopModel.findOne({ shopDomain })
  }

  async upsert(shopDomain: string, accessToken: string): Promise<ShopDocument> {
    return this.shopModel.findOneAndUpdate(
      { shopDomain },
      { accessToken, installedAt: new Date() },
      { upsert: true, returnDocument: 'after' },
    )
  }

  async updateContext(shopDomain: string, shopName: string, productTypes: string[]): Promise<void> {
    await this.shopModel.updateOne(
      { shopDomain },
      { shopName, productTypes, contextFetchedAt: new Date() },
    )
  }
}
