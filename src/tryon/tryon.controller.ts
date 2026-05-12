import { Controller, Post, Get, Body, Param } from '@nestjs/common'
import { IsString, IsNotEmpty } from 'class-validator'
import { TryonService } from './tryon.service'
import { TryonDto } from './dto/tryon.dto'

class ValidateImageDto {
  @IsString() @IsNotEmpty() personImage: string
}

@Controller('tryon')
export class TryonController {
  constructor(private readonly tryonService: TryonService) {}

  /** Validate a person photo before any try-on credits are spent */
  @Post('validate')
  validateImage(@Body() body: ValidateImageDto) {
    return this.tryonService.validateImage(body.personImage)
  }

  @Post()
  start(@Body() dto: TryonDto) {
    return this.tryonService.start(dto.personImage, dto.garmentImageUrl, dto.productName, dto.category)
  }

  @Get('status/:id')
  getStatus(@Param('id') id: string) {
    return this.tryonService.getStatus(id)
  }
}
