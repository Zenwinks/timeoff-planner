// Le lot du contrat : les arrêts maladie, les RTT au fil des mois ou sans RTT,
// le forfait jours et ses RTT calculés. Le jeu de démonstration (contrat
// horaire, 10 RTT en 2026), un lundi 5 octobre 2026.

import { choice, chip, openChip, openDashboard, openNewForm, pickPeriod, sheet } from './app.js'
import { entriesOf, expect, test } from './fixtures.js'

const card = (page, title) => page.locator('.summary-card').filter({ hasText: title })
const group = (page, name) => page.getByRole('group', { name, exact: true })

async function openSettings(page) {
  await page.goto('/settings')
  await expect(page.locator('.settings-form')).toBeVisible()
}

async function saveSettings(page) {
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.month-list')).toBeVisible()
}

test('un arrêt maladie se pose sans statut ni durée, et ne touche à aucun solde', async ({ page, account }) => {
  await openDashboard(page)
  await expect(card(page, 'Fin 2026').locator('.balance.cp')).toContainText('4,05')
  await openNewForm(page)
  await pickPeriod(page, '2026-10-12', '2026-10-14')
  await choice(page, 'Type', 'Arrêt maladie').click()
  await expect(sheet(page).getByRole('group', { name: 'Statut' })).toHaveCount(0)
  await expect(sheet(page).getByText(/Solde prévisionnel/)).toHaveCount(0)
  await sheet(page).getByRole('button', { name: /^Poser 3 jours/ }).click()

  await expect(chip(page, 'Arrêt maladie du 12 au 14 octobre, 3 jours')).toHaveText(/^3j\s*Maladie\s*du 12 au 14$/)
  await expect(card(page, 'Fin 2026').locator('.balance.cp')).toContainText('4,05')
  await expect.poll(async () => (await entriesOf(page)).filter(e => e.type === 'maladie' && e.date.startsWith('2026-10')).map(e => [e.status, e.duration]))
    .toEqual([['accepte', 1], ['accepte', 1], ['accepte', 1]])
})

test('l’arrêt maladie de juin : sa puce, son détail sans statut, sa case dans le calendrier', async ({ page, account }) => {
  await openDashboard(page)
  await openChip(page, 'Arrêt maladie du 8 au 10 juin')
  await expect(sheet(page).getByRole('heading', { name: 'Arrêt maladie du 8 au 10 juin' })).toBeVisible()
  await expect(sheet(page).getByRole('group', { name: 'Statut' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await group(page, 'Affichage').getByRole('button', { name: 'Calendrier' }).click()
  await expect(page.locator('.year').getByRole('button', { name: 'Lundi 8 juin : arrêt maladie' })).toBeVisible()
})

test('les RTT au fil des mois : un douzième chaque mois, le même total en décembre', async ({ page, account }) => {
  await openDashboard(page)
  await expect(card(page, 'Ce mois-ci').locator('.balance.rtt')).toContainText('6,32')
  await openSettings(page)
  const monthly = group(page, 'Acquisition des RTT').getByRole('button', { name: 'Au fil des mois' })
  await monthly.click()
  await expect(monthly).toHaveAttribute('aria-pressed', 'true')
  await saveSettings(page)
  // Fin octobre : 0,32 reportés + dix douzièmes de 10, moins 4 RTT posés.
  await expect(card(page, 'Ce mois-ci').locator('.balance.rtt')).toContainText('4,65')
  await expect(card(page, 'Fin 2026').locator('.balance.rtt')).toContainText('5,82')
})

test('sans RTT, l’app ne montre que les CP', async ({ page, account }) => {
  await openSettings(page)
  await group(page, 'Acquisition des RTT').getByRole('button', { name: 'Pas de RTT' }).click()
  await expect(page.getByLabel('RTT 2026', { exact: true })).toHaveCount(0)
  await saveSettings(page)
  await expect(page.locator('.summary-card .balance.rtt')).toHaveCount(0)
  await expect(page.locator('.month .balance.rtt')).toHaveCount(0)
  await openNewForm(page)
  await expect(choice(page, 'Type', 'RTT')).toHaveCount(0)
  await expect(choice(page, 'Type', 'Arrêt maladie')).toBeVisible()
})

test('revenu à l’horaire, on garde les RTT du forfait, et l’ajout propose l’année d’après', async ({ page, account }) => {
  await openSettings(page)
  await group(page, 'Type de contrat').getByRole('button', { name: 'Forfait jours' }).click()
  await saveSettings(page)
  await openSettings(page)
  await group(page, 'Type de contrat').getByRole('button', { name: 'Horaire' }).click()
  await expect(page.getByLabel('RTT 2026', { exact: true })).toHaveValue('10')
  await expect(page.getByLabel('RTT 2027', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('Nouvelle année', { exact: true })).toHaveValue('2028')
  await expect(page.getByText('Cette année est déjà configurée')).toHaveCount(0)
})

test('au forfait jours, les RTT se calculent, et la journée de solidarité peut être retirée des RTT', async ({ page, account }) => {
  await openSettings(page)
  await group(page, 'Type de contrat').getByRole('button', { name: 'Forfait jours' }).click()
  await expect(page.getByLabel('Jours à travailler par an')).toHaveValue('218')
  // 2026, le lundi de Pentecôte travaillé : 253 jours ouvrés − 25 CP − 218.
  await expect(page.getByLabel('RTT 2026', { exact: true })).toHaveValue('10')
  await expect(page.getByText('253 jours ouvrés − 25 CP − 218')).toBeVisible()
  await expect(page.getByText('2028 s’ajoutera d’elle-même en janvier 2027.')).toBeVisible()
  await group(page, 'La journée de solidarité').getByRole('button', { name: 'Retirée des RTT' }).click()
  await expect(page.getByLabel('RTT 2026', { exact: true })).toHaveValue('9')

  // Une année corrigée à la main, puis ramenée au calcul.
  await page.getByLabel('RTT 2026', { exact: true }).fill('8')
  await expect(page.getByText('Corrigé · calcul : 9')).toBeVisible()
  await page.getByRole('button', { name: 'Revenir au calcul pour 2026' }).click()
  await expect(page.getByLabel('RTT 2026', { exact: true })).toHaveValue('9')
  await saveSettings(page)

  // 0,32 reportés + 9 RTT − 4,5 posés en 2026.
  await expect(card(page, 'Fin 2026').locator('.balance.rtt')).toContainText('4,82')
  const forfait = card(page, 'Forfait 2026')
  await expect(forfait).toContainText('pour un forfait de 218 jours')
  await expect(forfait).toContainText('252 jours ouvrés − 32,5 CP − 4,5 RTT − 3 jours d’arrêt = 212')
  await expect(forfait).not.toContainText('de trop')

  // Au confirmé, brouillons et demandes restent des jours travaillés : 221,5 pour 218.
  await group(page, 'Soldes affichés').getByRole('button', { name: 'Confirmé' }).click()
  await expect(forfait).toContainText('3,5 jours de trop : à poser avant le 31 décembre')

  // Retiré des RTT, le lundi de Pentecôte est chômé.
  await group(page, 'Affichage').getByRole('button', { name: 'Calendrier' }).click()
  await expect(page.locator('.year [title="Férié : Lundi de Pentecôte"]')).toHaveCount(1)
})
