import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { CreateProductDto, ProductQueryDto } from './dto/product.dto'

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with optional filters' })
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query)
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a single product by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a product (admin)' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto)
  }
}
