export interface ChatProduct {
  _id: string
  name: string
  category: string
  price: number
  salePrice?: number
  colours: string[]
  sizes: string[]
  images: string[]
  inStock?: boolean     // false = out of stock but still shown as reference
  slug?: string         // local MongoDB product slug
  handle?: string       // Shopify product handle (for /products/{handle} URL)
  variantId?: string    // Shopify variant ID for Add-to-Cart (only set when in stock)
}
