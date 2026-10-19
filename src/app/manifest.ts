
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIS TERPADU | Sistem Informasi Sekolah',
    short_name: 'SIS TERPADU',
    description: 'Sistem informasi manajemen sekolah terpadu modern berbasis standar Dapodik.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1120',
    theme_color: '#4361ee',
    orientation: 'portrait',
    scope: '/',
    icons: [
      {
        src: '/icon-logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
    ],
  }
}
