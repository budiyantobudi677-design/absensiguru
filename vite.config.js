import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 10000000 // 10MB
      },
      manifest: {
        name: 'GammaraApp (Sistem Manajemen Sekolah Terpadu)',
        short_name: 'GammaraApp',
        description: 'GammaraApp - Sistem Manajemen Sekolah Terpadu: Sekolah Tertata, Pembelajaran Berkualitas',
        theme_color: '#4F46E5',
        background_color: '#F8FAFC',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192 512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
