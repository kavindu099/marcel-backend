import { IsString, IsNumber, IsMongoId, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class AddToCartDto {
  @ApiProperty() @IsMongoId() productId: string
  @ApiProperty() @IsString() size: string
  @ApiProperty() @IsString() colour: string
  @ApiProperty() @IsNumber() @Min(1) quantity: number
}

export class UpdateCartItemDto {
  @ApiProperty() @IsMongoId() productId: string
  @ApiProperty() @IsString() size: string
  @ApiProperty() @IsNumber() @Min(0) quantity: number
}
