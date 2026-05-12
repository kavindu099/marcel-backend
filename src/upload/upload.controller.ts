import { Controller, Post, Body, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

interface UploadBody { base64: string; filename?: string }

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  @Post('image')
  @ApiOperation({ summary: 'Save a base64 image to public/uploads and return its URL' })
  uploadImage(@Body() body: UploadBody): { url: string } {
    if (!body.base64) throw new BadRequestException('base64 field is required')

    const match = body.base64.match(/^data:(image\/\w+);base64,(.+)$/)
    let ext = 'jpg'
    let data = body.base64

    if (match) {
      ext = match[1].split('/')[1]
      data = match[2]
    }

    const filename = body.filename
      ? `${body.filename.replace(/[^a-z0-9-_]/gi, '-').toLowerCase()}.${ext}`
      : `${randomUUID()}.${ext}`

    const dest = join(__dirname, '..', '..', '..', 'public', 'uploads', filename)
    writeFileSync(dest, Buffer.from(data, 'base64'))

    return { url: `/public/uploads/${filename}` }
  }
}
