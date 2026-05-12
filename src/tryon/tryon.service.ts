import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'

type FashnStatus = 'starting' | 'processing' | 'completed' | 'failed'

interface FashnRunResponse   { id: string; error?: string }
interface FashnStatusResponse {
  id: string; status: FashnStatus
  output: string[] | null; error: string | null
}

export interface ValidationResult { valid: boolean; reason: string }

const CATEGORY_MAP: Record<string, string> = {
  Tops:      'tops',
  Bottoms:   'bottoms',
  Dresses:   'one-pieces',
  Outerwear: 'tops',
}

@Injectable()
export class TryonService {
  private readonly baseUrl = 'https://api.fashn.ai/v1'
  private readonly claude   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  private get fashnToken(): string {
    const t = process.env.FASHN_API_KEY
    if (!t) throw new HttpException('FASHN_API_KEY is not configured', HttpStatus.SERVICE_UNAVAILABLE)
    return t
  }

  // ── Image validation ─────────────────────────────────────────────────────

  async validateImage(base64: string): Promise<ValidationResult> {
    try {
      const res = await this.claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            {
              type: 'text',
              text: `Analyse this image for a virtual clothing try-on system.
Return ONLY valid JSON: { "valid": boolean, "reason": string }

valid = true ONLY when ALL of these hold:
1. A real human person is clearly visible
2. At least the torso is visible (not just a face or head)
3. Image is adequately lit and reasonably sharp
4. No explicit or inappropriate content

valid = false if:
- No person visible (document, food, landscape, animal, object, meme, screenshot)
- Only a face or head crop — body must be visible
- Cartoon, sketch, illustration, CGI character, or avatar
- Severely blurry, extremely dark, or distorted beyond recognition
- Explicit or inappropriate content

reason: one short phrase — e.g. "OK", "No person detected", "Face only — full body required", "Cartoon or illustration", "Image too dark or blurry"`,
            },
          ],
        }],
      }, { timeout: 15_000 })

      const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
      const cleaned = text.replaceAll(/```json\n?|\n?```/g, '').trim()
      return JSON.parse(cleaned) as ValidationResult
    } catch {
      // Fail open — don't block legitimate users on API errors
      return { valid: true, reason: 'OK' }
    }
  }

  // ── Try-on generation ────────────────────────────────────────────────────

  async start(
    personImage: string,
    garmentImageUrl: string,
    productName: string,
    category: string,
  ): Promise<{ id: string }> {
    // Validate person image before spending Fashn.ai credits
    const check = await this.validateImage(personImage)
    if (!check.valid) {
      throw new HttpException(
        `Photo rejected: ${check.reason}. Please upload a clear full-body photo of a person.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }

    const res = await fetch(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.fashnToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image:        `data:image/jpeg;base64,${personImage}`,
          garment_image:      garmentImageUrl,
          category:           CATEGORY_MAP[category] ?? 'tops',
          garment_photo_type: 'auto',
          mode:               'quality',
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new HttpException(`Fashn.ai error: ${err}`, HttpStatus.BAD_GATEWAY)
    }

    const data = await res.json() as FashnRunResponse
    if (!data.id) throw new HttpException('Fashn.ai did not return a job ID', HttpStatus.BAD_GATEWAY)
    return { id: data.id }
  }

  async getStatus(id: string): Promise<{ status: string; imageUrl?: string; error?: string }> {
    const res = await fetch(`${this.baseUrl}/status/${id}`, {
      headers: { Authorization: `Bearer ${this.fashnToken}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new HttpException(`Fashn.ai error: ${err}`, HttpStatus.BAD_GATEWAY)
    }

    const data = await res.json() as FashnStatusResponse
    return {
      status:   data.status,
      imageUrl: data.output?.[0] ?? undefined,
      error:    data.error ?? undefined,
    }
  }
}
