import type { Metadata, Viewport } from 'next'
import '@/app/globals.css'

export const metadata: Metadata = { title: 'Việt An Pickup', description: 'Book pickup và nhận hàng kho' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  )
}
