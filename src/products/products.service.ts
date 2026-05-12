import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Product, ProductDocument } from './schemas/product.schema'
import { CreateProductDto, ProductQueryDto } from './dto/product.dto'

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private productModel: Model<ProductDocument>) {}

  async findAll(query: ProductQueryDto): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {}

    if (query.category) filter.category = { $regex: query.category, $options: 'i' }
    if (query.colour) filter.colours = { $elemMatch: { $regex: query.colour, $options: 'i' } }
    if (query.size) filter.sizes = query.size
    if (query.occasion) filter.occasion = { $elemMatch: { $regex: query.occasion, $options: 'i' } }
    if (query.filter === 'new') filter.isNew = true
    if (query.filter === 'sale') filter.isSale = true

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.price = {}
      if (query.minPrice !== undefined) (filter.price as Record<string, number>).$gte = query.minPrice
      if (query.maxPrice !== undefined) (filter.price as Record<string, number>).$lte = query.maxPrice
    }

    if (query.q) {
      return this.productModel.find({ $text: { $search: query.q }, ...filter }).limit(query.limit ?? 20)
    }

    return this.productModel.find(filter).limit(query.limit ?? 200)
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id)
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async findBySlug(slug: string): Promise<ProductDocument> {
    const product = await this.productModel.findOne({ slug })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async create(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create(dto)
  }

  async search(intent: {
    category?: string
    colour?: string
    occasion?: string
    budget?: number
    size?: string
  }): Promise<ProductDocument[]> {
    const filter: Record<string, unknown> = {}

    if (intent.category) filter.category = { $regex: intent.category, $options: 'i' }
    if (intent.colour) filter.colours = { $elemMatch: { $regex: intent.colour, $options: 'i' } }
    if (intent.occasion) filter.occasion = { $elemMatch: { $regex: intent.occasion, $options: 'i' } }
    if (intent.size) filter.sizes = intent.size
    if (intent.budget) filter.price = { $lte: intent.budget }

    filter.stock = { $gt: 0 }

    return this.productModel.find(filter).limit(10).sort({ rating: -1 })
  }
}
