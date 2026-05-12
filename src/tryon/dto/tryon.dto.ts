import { IsString, IsNotEmpty } from 'class-validator'

export class TryonDto {
  @IsString()
  @IsNotEmpty()
  personImage: string

  @IsString()
  @IsNotEmpty()
  garmentImageUrl: string

  @IsString()
  @IsNotEmpty()
  productName: string

  @IsString()
  @IsNotEmpty()
  category: string
}
