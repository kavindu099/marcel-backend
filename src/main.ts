import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Shopify redirects to the app URL after install — send the merchant to their admin apps page.
  const express = app.getHttpAdapter().getInstance() as { get: (path: string, handler: (req: Record<string, unknown>, res: { redirect: (url: string) => void; json: (data: unknown) => void }) => void) => void }
  express.get('/', (req, res) => {
    const shop = (req.query as Record<string, string>).shop
    if (shop) return res.redirect(`https://${shop}/admin/apps`)
    res.json({ ok: true, service: 'Marcel AI Shopping Assistant' })
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const allowed = process.env.FRONTEND_URL ?? 'http://localhost:3000'
      if (
        !origin ||
        origin === allowed ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com$/.test(origin) ||
        /^https?:\/\/[a-zA-Z0-9-]+\.shopifypreview\.com$/.test(origin) ||
        /^https?:\/\/[a-zA-Z0-9-]+\.myshopify\.com\.test$/.test(origin)
      ) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })

  app.setGlobalPrefix('api')

  const config = new DocumentBuilder()
    .setTitle('AURA Shopping API')
    .setDescription('AI-powered shopping assistant backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))

  await app.listen(process.env.PORT ?? 4000)
  console.log(`API running → http://localhost:${process.env.PORT ?? 4000}/api`)
  console.log(`Swagger docs → http://localhost:${process.env.PORT ?? 4000}/api/docs`)
}

bootstrap()
