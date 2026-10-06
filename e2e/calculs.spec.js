// Les calculs confrontés à une vraie fiche de paie : les CP acquis par
// douzièmes, les RTT posés d'avance au fil des mois, les soldes de départ avec
// toutes leurs décimales. Le jeu de démonstration (contrat horaire, 10 RTT en
// 2026), un lundi 5 octobre 2026.

import { choice, pickPeriod, sheet } from './app.js'
import { expect, test } from './fixtures.js'

const card = (page, title) => page.locator('.summary-card').filter({ hasText: title })
const group = (page, name) => page.getByRole('group', { name, exact: true })
const field = (page, label) => page.getByLabel(label, { exact: true })

async function openSettings(page) {
  await page.goto('/settings')
  await expect(page.locator('.settings-form')).toBeVisible()
}

async function saveSettings(page) {
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.month-list')).toBeVisible()
}

test('les CP se saisissent à l’année, et s’acquièrent par douzièmes', async ({ page, account }) => {
  await openSettings(page)
  await expect(field(page, 'CP par an')).toHaveValue('25')
  await field(page, 'CP par an').fill('27')
  await saveSettings(page)
  // Deux jours de plus sur l'année, un douzième chaque mois : 4,09 + 2 au 31 décembre.
  await expect(card(page, 'Fin 2026').locator('.balance.cp')).toContainText('6,09')
  await openSettings(page)
  await expect(field(page, 'CP par an')).toHaveValue('27')
})

test('un solde de départ garde toutes ses décimales', async ({ page, account }) => {
  await openSettings(page)
  await field(page, 'Congés initiaux').fill('11.5833')
  await saveSettings(page)
  expect((await (await page.request.get('/api/settings')).json()).initial_conges).toBe(11.5833)
})

test('au fil des mois, des RTT posés d’avance passent sous -1 sans bloquer', async ({ page, account }) => {
  await openSettings(page)
  await group(page, 'Acquisition des RTT').getByRole('button', { name: 'Au fil des mois' }).click()
  await saveSettings(page)

  await group(page, 'Affichage').getByRole('button', { name: 'Calendrier' }).click()
  await page.locator('.year').getByRole('button', { name: 'Lundi 5 janvier : libre. Poser un congé' }).click()
  await choice(page, 'Type', 'RTT').click()
  await pickPeriod(page, '2026-01-05', '2026-01-07')
  await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  await sheet(page).getByRole('button', { name: 'Poser 3 jours', exact: true }).click()

  // Fin janvier : 0,32 reportés + 10 / 12, moins ces trois RTT. L'année finit à 5,82 − 3.
  await group(page, 'Affichage').getByRole('button', { name: 'Liste' }).click()
  await expect(page.locator('.month', { hasText: 'Janvier 2026' }).locator('.balance.rtt')).toContainText('-1,85')
  await expect(card(page, 'Fin 2026').locator('.balance.rtt')).toContainText('2,82')
})
