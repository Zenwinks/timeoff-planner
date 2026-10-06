// L'affichage retravaillé : des puces qui disent la durée, le type puis les
// dates, l'année en cours en entier, la version en pied de page. Le jeu de
// démonstration, un lundi 5 octobre 2026.

import { readFileSync } from 'node:fs'
import { chip, openDashboard } from './app.js'
import { expect, test } from './fixtures.js'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('une puce dit la durée, le type, puis les dates en toutes lettres', async ({ page, account }) => {
  await openDashboard(page)
  await expect(chip(page, 'RTT le 30 octobre, demandé')).toHaveText(/^1j\s*RTT\s*le 30$/)
  await expect(chip(page, 'RTT le 13 novembre, brouillon')).toHaveText(/^½j\s*RTT\s*le 13 après-midi$/)
  await expect(chip(page, 'CP du 21 au 24 décembre, demandé')).toHaveText(/^4j\s*CP\s*du 21 au 24$/)
  await expect(chip(page, 'CP du 3 au 14 août, accepté')).toHaveText(/^10j\s*CP\s*du 3 au 14$/)
})

test('l’année en cours s’affiche en entier, les autres années se déplient', async ({ page, account }) => {
  await openDashboard(page)
  const names = page.locator('.month h3')
  await expect(names).toHaveCount(12)
  await expect(names.first()).toHaveText('Janvier 2026')
  await expect(names.last()).toHaveText('Décembre 2026')
  await expect(page.locator('.month.current')).toContainText('Octobre 2026')

  await page.getByRole('button', { name: 'Afficher 2027' }).click()
  await expect(names).toHaveCount(24)
  await expect(names.last()).toHaveText('Décembre 2027')
  await page.getByRole('button', { name: 'Masquer 2027' }).click()
  await expect(names).toHaveCount(12)
})

test('le numéro de version, en pied de page', async ({ page, account }) => {
  await openDashboard(page)
  await expect(page.locator('.app-footer')).toHaveText(`TimeOff Planner · version ${version}`)
  await page.goto('/settings')
  await expect(page.locator('.app-footer')).toHaveText(`TimeOff Planner · version ${version}`)
})
