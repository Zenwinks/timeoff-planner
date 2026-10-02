// Les tests dans le navigateur (e2e/), sur ordinateur et sur mobile.
//
//   npm run test:e2e
//
// Ils pilotent le navigateur Edge déjà installé (PW_CHANNEL=chrome pour Chrome) :
// rien à télécharger. La PWA doit être construite : test:e2e le fait d'abord.

import { defineConfig } from '@playwright/test'
import { BASE_URL } from './e2e/env.js'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    channel: process.env.PW_CHANNEL || 'msedge',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Le service worker servirait une ancienne version en cache.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ordinateur', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: false,
  },
})
