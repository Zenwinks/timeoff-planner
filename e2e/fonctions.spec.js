// Les fonctions ajoutées après la refonte : la demi-journée du matin ou de
// l'après-midi, la vue calendrier de l'année, l'export vers l'agenda. Le jeu de
// démonstration, un lundi 5 octobre 2026.

import { choice, chip, openDashboard, openNewForm, pickPeriod, sheet } from './app.js'
import { entriesOf, expect, test } from './fixtures.js'

async function showYear(page) {
  await page.getByRole('group', { name: 'Affichage' }).getByRole('button', { name: 'Calendrier' }).click()
  await expect(page.locator('.year')).toBeVisible()
}

const day = (page, name) => page.locator('.year').getByRole('button', { name })

test('une demi-journée se pose le matin ou l’après-midi', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  await pickPeriod(page, '2026-10-19', '2026-10-19')
  await choice(page, 'Durée', 'Demi-journée').click()
  await expect(choice(page, 'Moment', 'Matin')).toHaveAttribute('aria-pressed', 'true')
  await choice(page, 'Moment', 'Après-midi').click()
  await sheet(page).getByRole('button', { name: /^Poser la demi-journée/ }).click()

  await expect.poll(async () => {
    const entry = (await entriesOf(page)).find(e => e.date === '2026-10-19')
    return entry && [entry.duration, entry.half_day]
  }).toEqual([0.5, 'apres-midi'])
  await expect(chip(page, 'CP le 19 octobre, brouillon, une demi-journée, l’après-midi')).toBeVisible()
})

test('une demi-journée d’avant octobre 2026 reste sans moment', async ({ page, account }) => {
  await openDashboard(page)
  const march = chip(page, 'CP le 13 mars, accepté, une demi-journée$')
  await expect(march).toBeVisible()
  await expect(march).toHaveText(/^CP\s*½j\s*le 13$/)
})

test('l’année en calendrier : un jour posé ouvre son congé, un jour libre en pose un', async ({ page, account }) => {
  await openDashboard(page)
  await showYear(page)
  await expect(day(page, 'Vendredi 30 octobre : RTT, demandé')).toBeVisible()
  await expect(day(page, 'Vendredi 13 novembre : RTT, brouillon, l’après-midi')).toBeVisible()
  await expect(page.locator('.year [aria-current="date"]')).toHaveCount(1)
  await expect(day(page, 'Lundi 5 octobre : libre. Poser un congé')).toHaveAttribute('aria-current', 'date')

  await day(page, 'Vendredi 30 octobre : RTT, demandé').click()
  await expect(sheet(page).getByRole('heading', { name: 'RTT le 30 octobre' })).toBeVisible()
  await page.keyboard.press('Escape')

  await day(page, 'Lundi 19 octobre : libre. Poser un congé').click()
  await expect(sheet(page).getByRole('heading', { name: 'Poser un congé' })).toBeVisible()
  await expect(sheet(page).getByText('Le 19 octobre')).toBeVisible()
})

test('l’année en calendrier : d’une année à l’autre, et le choix reste', async ({ page, account }) => {
  await openDashboard(page)
  await showYear(page)
  await expect(page.getByRole('button', { name: 'Année précédente' })).toBeDisabled()
  await page.getByRole('button', { name: 'Année suivante' }).click()
  await expect(page.locator('.year-label')).toHaveText('2027')
  await expect(day(page, 'Lundi 15 février : CP, brouillon')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('group', { name: 'Affichage' }).getByRole('button', { name: 'Calendrier' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.year')).toBeVisible()
})

test('la légende met en avant un statut dans le calendrier aussi', async ({ page, account }) => {
  await openDashboard(page)
  await showYear(page)
  await page.getByRole('group', { name: 'Mettre un statut en avant' }).getByRole('button', { name: 'Accepté' }).click()
  await expect(page.locator('.day.taken.dimmed').first()).toBeVisible()
  await expect(day(page, 'Vendredi 18 septembre : RTT, accepté')).not.toHaveClass(/dimmed/)
})

test('sur mobile, le calendrier de l’année tient dans l’écran', async ({ page, account, isMobile }) => {
  test.skip(!isMobile, 'mise en page du mobile')
  await openDashboard(page)
  await showYear(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
})

test('l’agenda : le fichier, et le lien d’abonnement qu’on peut désactiver', async ({ page, account }) => {
  await page.goto('/settings')
  const file = await page.request.get('/api/calendar.ics')
  expect(file.headers()['content-type']).toMatch(/^text\/calendar/)
  await expect(page.getByRole('link', { name: 'Télécharger le fichier .ics' })).toHaveAttribute('href', '/api/calendar.ics')

  await page.getByRole('button', { name: 'Créer le lien d’abonnement' }).click()
  const url = await page.getByLabel('Lien d’abonnement', { exact: true }).inputValue()
  expect(url).toMatch(/\/calendar\/[A-Za-z0-9_-]{43}\.ics$/)
  const feed = await page.request.get(new URL(url).pathname)
  expect(feed.status()).toBe(200)
  expect(await feed.text()).toContain('DTSTART;VALUE=DATE:20261221')

  await page.getByRole('button', { name: 'Désactiver le lien' }).click()
  await expect(page.getByRole('status')).toContainText('Lien d’agenda désactivé.')
  expect((await page.request.get(new URL(url).pathname)).status()).toBe(404)
})
