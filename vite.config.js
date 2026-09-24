import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 10000000 // 10MB
      },
      manifest: {
        name: 'Absensi Guru',
        short_name: 'Absensi',
        description: 'Aplikasi Presensi Guru',
        theme_color: '#4F46E5',
        background_color: '#F8FAFC',
        display: 'standalone',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
