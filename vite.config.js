import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // L'app enregistre elle-même le service worker (src/main.js), et se
      // recharge quand une nouvelle version prend la main. injectRegister
      // reste à 'auto' : c'est lui qui fait passer la nouvelle version tout de
      // suite (skipWaiting, clientsClaim). À false, elle attendrait pour
      // toujours ; et le module importé suffit à ce qu'aucun script ne soit ajouté.
      registerType: 'autoUpdate',
      manifest: {
        name: 'TimeOff Planner',
        short_name: 'TimeOff',
        description: 'Gérez vos congés et RTT simplement',
        theme_color: '#0f0f1e',
        background_color: '#0f0f1e',
        display: 'standalone',
        // Des PNG, tirés du SVG par scripts/generate-icons.mjs : Android les
        // demande pour l'installation, et la version « maskable » garde son
        // dessin à l'abri de la découpe en cercle.
        icons: [
          { src: '/pwa-192x192.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // La connexion et l'API sont au serveur : le service worker ne doit
        // pas y répondre index.html à sa place.
        navigateFallbackDenylist: [/^\/auth\//, /^\/api\//, /^\/calendar\//, /^\/healthz$/],
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
