import { IsString, IsNumber, IsArray, IsOptional, IsBoolean, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateProductDto {
  @ApiProperty() @IsString() name: string
  @ApiProperty() @IsString() slug: string
  @ApiProperty() @IsString() category: string
  @ApiProperty() @IsString() description: string
  @ApiProperty() @IsNumber() @Min(0) price: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) salePrice?: number
  @ApiProperty() @IsArray() @IsString({ each: true }) colours: string[]
  @ApiProperty() @IsArray() @IsString({ each: true }) sizes: string[]
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) occasion?: string[]
  @ApiProperty() @IsNumber() @Min(0) stock: number
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) images?: string[]
  @ApiPropertyOptional() @IsOptional() @IsString() gradient?: string
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isNew?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isSale?: boolean
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[]
}

export class ProductQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string
  @ApiPropertyOptional() @IsOptional() @IsString() colour?: string
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string
  @ApiPropertyOptional() @IsOptional() @IsString() occasion?: string
  @ApiPropertyOptional() @IsOptional() @IsNumber() minPrice?: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxPrice?: number
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string
  @ApiPropertyOptional() @IsOptional() filter?: 'new' | 'sale'
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) limit?: number
}
