import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Application installable sur le téléphone (« Ajouter à l'écran d'accueil »).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo_AP2A.jpeg'],
      manifest: {
        name: 'AP2A — Actions et suivi',
        short_name: 'AP2A',
        description: "Cibles, actions et suivi de l'impact de l'association AP2A",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#059669',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
