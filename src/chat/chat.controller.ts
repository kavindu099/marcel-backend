import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger'
import { IsString, IsArray, IsOptional } from 'class-validator'
import { ChatService } from './chat.service'

class ChatMessageDto {
  @IsString() role: 'user' | 'assistant'
  @IsString() content: string
}

class ChatRequestDto {
  @IsString() message: string
  @IsOptional() @IsArray() history?: ChatMessageDto[]
  @IsOptional() @IsString() image?: string
  @IsOptional() @IsString() mediaType?: string
  // When provided, the backend fetches products from this Shopify store instead of local MongoDB.
  @IsOptional() @IsString() shopDomain?: string
}

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message to the AI shopping assistant' })
  @ApiBody({ type: ChatRequestDto })
  async chat(@Body() body: ChatRequestDto) {
    try {
      return await this.chatService.chat(body.message, body.history ?? [], body.image, body.mediaType, body.shopDomain)
    } catch (err) {
      console.error('[ChatController] Error:', err)
      throw err
    }
  }
}
