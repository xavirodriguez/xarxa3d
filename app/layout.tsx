import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'

const _plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const _plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'] })

export const metadata: Metadata = {
  title: 'Xarxa 3D · Red de transporte multimodal de Barcelona',
  description:
    'Visualización 3D, routing multimodal (Dijkstra / A*) y simulación de vehículos sobre un modelo de dominio de transporte desacoplado.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#E1E4E8',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background">
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
