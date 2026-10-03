// La refonte, rejouée dans le navigateur : les deux soldes, le statut en un
// geste, les congés d'un seul tenant, les mois passés repliés, le formulaire et
// ce qu'il annonce, le thème. Le jeu de démonstration, un lundi 5 octobre 2026.

import { choice, chip, openChip, openDashboard, openNewForm, pickPeriod, sheet } from './app.js'
import { entriesOf, expect, test } from './fixtures.js'

const yearEndCard = page => page.locator('.summary-card').filter({ hasText: 'Fin 2026' })

test('le solde confirmé ignore brouillons et demandes, et le choix reste', async ({ page, account }) => {
  await openDashboard(page)
  // Au 31 décembre : 8 jours de CP sont encore en attente (4 demandés, 4 en brouillon).
  await expect(yearEndCard(page).locator('.balance.cp')).toContainText('4,05')
  await page.getByRole('group', { name: 'Soldes affichés' }).getByRole('button', { name: 'Confirmé' }).click()
  await expect(yearEndCard(page).locator('.balance.cp')).toContainText('12,05')
  await expect(page.getByText(/Seuls les congés acceptés ou imposés sont décomptés/)).toBeVisible()

  await page.reload()
  await expect(yearEndCard(page).locator('.balance.cp')).toContainText('12,05')
})

test('en vue Confirmé, ce que le solde ignore passe en gris, dans la liste comme dans le calendrier', async ({ page, account }) => {
  await openDashboard(page)
  await expect(page.locator('.uncounted')).toHaveCount(0)
  await page.getByRole('group', { name: 'Soldes affichés' }).getByRole('button', { name: 'Confirmé' }).click()
  await expect(page.getByText('Les brouillons et les demandes, en gris, ne le sont pas')).toBeVisible()
  await expect(chip(page, 'RTT le 30 octobre, demandé, 1 jour, hors du solde confirmé')).toHaveClass(/uncounted/)
  await expect(chip(page, 'CP du 28 au 31 décembre, brouillon, 4 jours, hors du solde confirmé')).toHaveClass(/uncounted/)

  await page.getByRole('group', { name: 'Affichage' }).getByRole('button', { name: 'Calendrier' }).click()
  const year = page.locator('.year')
  await expect(year.getByRole('button', { name: 'Vendredi 30 octobre : RTT, demandé, hors du solde confirmé' })).toHaveClass(/uncounted/)
  await expect(year.getByRole('button', { name: 'Vendredi 18 septembre : RTT, accepté' })).not.toHaveClass(/uncounted/)

  await page.getByRole('group', { name: 'Soldes affichés' }).getByRole('button', { name: 'Prévisionnel' }).click()
  await expect(page.locator('.uncounted')).toHaveCount(0)
})

test('le statut d’un congé change en un geste', async ({ page, account }) => {
  await openDashboard(page)
  await openChip(page, 'RTT le 30 octobre')
  await choice(page, 'Statut', 'Accepté').click()
  await expect(page.getByRole('status')).toContainText('RTT le 30 octobre : accepté.')
  await expect(choice(page, 'Statut', 'Accepté')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await entriesOf(page)).find(e => e.date === '2026-10-30').status).toBe('accepte')
  await page.keyboard.press('Escape')
  await expect(chip(page, 'RTT le 30 octobre, accepté')).toBeVisible()
})

test('un congé à cheval sur deux mois s’ouvre en entier', async ({ page, account }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: /Afficher les 9 mois passés/ }).click()
  await openChip(page, 'CP du 3 au 14 août')
  await expect(sheet(page).getByRole('heading', { name: 'CP du 27 juillet au 14 août' })).toBeVisible()
  await expect(sheet(page).getByText('15 jours ouvrés')).toBeVisible()
})

test('les mois passés sont repliés, le mois en cours vient en tête', async ({ page, account }) => {
  await openDashboard(page)
  const names = page.locator('.month h3')
  await expect(names.first()).toHaveText('Octobre 2026')
  await expect(page.locator('.month.current')).toContainText('Ce mois-ci')
  await page.getByRole('button', { name: /Afficher les 9 mois passés/ }).click()
  await expect(names.first()).toHaveText('Janvier 2026')
  await page.getByRole('button', { name: /Masquer les 9 mois passés/ }).click()
  await expect(names.first()).toHaveText('Octobre 2026')
})

test('la légende reste à l’écran en défilant : le statut survolé reste en avant', async ({ page, account, isMobile }) => {
  test.skip(isMobile, 'pas de survol au doigt : un toucher fixe le statut')
  await openDashboard(page)
  await page.getByRole('button', { name: /Afficher les 9 mois passés/ }).click()
  const accepted = page.getByRole('group', { name: 'Mettre un statut en avant' }).getByRole('button', { name: 'Accepté' })
  await accepted.hover()
  await expect(page.locator('.chip.dimmed').first()).toBeVisible()

  // La molette, la souris toujours posée sur « Accepté ».
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.waitForTimeout(500)
  await expect(accepted).toBeInViewport()
  expect(await page.locator('.chip.dimmed').count()).toBeGreaterThan(0)
})

test('le résumé annonce le prochain congé', async ({ page, account }) => {
  await openDashboard(page)
  const next = page.locator('.summary-card').filter({ hasText: 'Prochain congé' })
  await expect(next).toContainText('Dans 25 jours')
  await expect(next).toContainText('RTT le 30 octobre')
  await next.getByRole('button').click()
  await expect(sheet(page).getByRole('heading', { name: 'RTT le 30 octobre' })).toBeVisible()
})

test('le formulaire montre l’effet sur le solde, et les alertes', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  await pickPeriod(page, '2026-10-19', '2026-10-23')
  await expect(sheet(page).getByText('Du 19 au 23 octobre')).toBeVisible()
  await expect(sheet(page).getByText('5 jours ouvrés')).toBeVisible()
  // « 4,05 → -0,95 » à l'écran ; « 4,05 puis -0,95 » pour les lecteurs d'écran.
  await expect(sheet(page).locator('.preview')).toContainText(/4,05.*[-−]0,95/)
  await expect(sheet(page).getByRole('alert').first()).toContainText('CP en négatif')
  await expect(sheet(page).getByRole('button', { name: 'Poser 5 jours quand même' })).toBeEnabled()
})

test('une période déjà posée en entier ne se pose pas deux fois', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  await pickPeriod(page, '2026-10-30', '2026-10-30')
  await expect(sheet(page).getByText('1 jour déjà posé dans la période reste tel quel.')).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: /^Poser/ })).toBeDisabled()
})

test('Échap ferme un panneau', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toBeHidden()
})

test('« Poser un congé » : dans la barre du haut sur ordinateur, à portée de pouce sur mobile', async ({ page, account, isMobile }) => {
  await openDashboard(page)
  const fab = page.locator('.fab')
  const wide = page.locator('.new-wide')
  if (isMobile) {
    await expect(fab).toBeVisible()
    await expect(wide).toBeHidden()
  } else {
    await expect(wide).toBeVisible()
    await expect(fab).toBeHidden()
  }
})

test.describe('le thème', () => {
  test.use({ colorScheme: 'light' })

  const background = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  test('suit le système, et se choisit dans les Paramètres', async ({ page, account }) => {
    await openDashboard(page)
    expect(await background(page)).toBe('rgb(244, 245, 250)')

    await page.goto('/settings')
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Sombre' }).click()
    expect(await background(page)).toBe('rgb(13, 14, 24)')

    // Rechargée, la page s'affiche directement dans le thème choisi.
    await page.reload()
    expect(await background(page)).toBe('rgb(13, 14, 24)')
    await page.getByRole('group', { name: 'Thème' }).getByRole('button', { name: 'Système' }).click()
    expect(await background(page)).toBe('rgb(244, 245, 250)')
  })
})
