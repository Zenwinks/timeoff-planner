import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TimeOff Planner',
        short_name: 'TimeOff',
        description: 'Gérez vos congés et RTT simplement',
        theme_color: '#0f0f1e',
        background_color: '#0f0f1e',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/pwa-192x192.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: '/pwa-192x192.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // La connexion et l'API sont au serveur : le service worker ne doit
        // pas y répondre index.html à sa place.
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//, /^\/healthz$/],
      },
    }),
  ],
  // En développement, Vite sert la PWA et passe le reste au serveur Node
  // (npm run dev:server), avec PUBLIC_URL=http://localhost:5173.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
})
