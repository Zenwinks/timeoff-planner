// Les icônes PNG de l'app, tirées de public/pwa-192x192.svg : celles d'Android
// et des navigateurs (192, 512, « maskable »), et celle de l'écran d'accueil de
// l'iPhone (180 px), qui ne prend pas les SVG. Les PNG sont versionnés : à
// relancer seulement quand l'icône change.
//
//   node scripts/generate-icons.mjs
//
// Le rendu passe par le navigateur des tests (Edge, ou PW_CHANNEL=chrome).

import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync('public/pwa-192x192.svg', 'utf8')
const background = '#0f0f1e'
const icons = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  // Android découpe une icône « maskable » en cercle ou en carré arrondi : le
  // dessin tient dans les 80 % du centre, sur un fond qui va jusqu'au bord.
  { file: 'public/icons/icon-maskable-512.png', size: 512, inset: 0.1, background },
  // iOS arrondit lui-même les coins, et remplirait de noir la transparence.
  { file: 'public/apple-touch-icon.png', size: 180, background },
]

mkdirSync('public/icons', { recursive: true })
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' })
const page = await browser.newPage()
for (const { file, size, inset = 0, background: fill = 'transparent' } of icons) {
  const inner = Math.round(size * (1 - 2 * inset))
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0;background:${fill}">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      ${svg.replace('<svg ', `<svg style="width:${inner}px;height:${inner}px" `)}
    </div></body>`)
  await page.screenshot({ path: file, omitBackground: fill === 'transparent' })
  console.log(`${file} (${size} px)`)
}
await browser.close()
