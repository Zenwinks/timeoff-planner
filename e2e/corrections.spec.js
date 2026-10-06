// Les bugs relevés à l'audit du 2026-10-03, rejoués dans le navigateur, sur
// l'interface d'aujourd'hui : chacun échouait avant sa correction. Le compte de
// chaque test est le jeu de démonstration (scripts/lib/demo.mjs), un lundi
// 5 octobre 2026.

import { choice, chip, openChip, openDashboard, openNewForm, pickPeriod, sheet } from './app.js'
import { entriesOf, expect, test } from './fixtures.js'

const christmas = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24']

test('une demi-journée étendue à plusieurs jours redevient des journées entières', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  await pickPeriod(page, '2026-10-19', '2026-10-19')
  await choice(page, 'Durée', 'Demi-journée').click()
  await pickPeriod(page, '2026-10-19', '2026-10-21')
  await expect(sheet(page).getByRole('group', { name: 'Durée' })).toBeHidden()

  const posted = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST')
  await sheet(page).getByRole('button', { name: /^Poser 3 jours/ }).click()
  expect((await posted).ok()).toBe(true)
  const days = (await entriesOf(page)).filter(e => e.date >= '2026-10-19' && e.date <= '2026-10-21')
  expect(days.map(e => e.duration)).toEqual([1, 1, 1])
})

test('fermer une modification laisse le formulaire vierge', async ({ page, account }) => {
  await openDashboard(page)
  await openChip(page, 'CP du 21 au 24 décembre')
  await sheet(page).getByRole('button', { name: 'Modifier' }).click()
  await expect(sheet(page).getByRole('heading', { name: 'Modifier un congé' })).toBeVisible()
  await expect(sheet(page).getByText('Du 21 au 24 décembre')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toBeHidden()

  await openNewForm(page)
  await expect(sheet(page).getByText(/Choisissez un jour/)).toBeVisible()
  await expect(choice(page, 'Type', 'Congés payés')).toHaveAttribute('aria-pressed', 'true')
  await expect(choice(page, 'Statut', 'Brouillon')).toHaveAttribute('aria-pressed', 'true')
})

test('la légende filtre dès le premier toucher ou clic', async ({ page, account, isMobile }) => {
  await openDashboard(page)
  const accepted = page.getByRole('group', { name: 'Mettre un statut en avant' }).getByRole('button', { name: 'Accepté' })
  const press = () => (isMobile ? accepted.tap() : accepted.click())

  await press()
  await expect(accepted).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.chip.dimmed').first()).toBeVisible()

  await press()
  await expect(accepted).toHaveAttribute('aria-pressed', 'false')
  // À la souris, le survol garde un aperçu tant qu'elle reste sur le statut.
  if (!isMobile) await page.mouse.move(0, 0)
  await expect(page.locator('.chip.dimmed')).toHaveCount(0)
})

test('sur ordinateur, chaque mois tient sur une ligne alignée', async ({ page, account, isMobile }) => {
  test.skip(isMobile, 'mise en page de l’ordinateur')
  await openDashboard(page)
  const rows = await page.locator('.month').evaluateAll(months => months.map(li => {
    const middle = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }
    const name = middle(li.querySelector('h3'))
    return [...li.querySelectorAll('.balance dd')].map(dd => Math.round(Math.abs(middle(dd) - name)))
  }))
  expect(rows.length).toBeGreaterThan(10)
  for (const gaps of rows) for (const gap of gaps) expect(gap).toBeLessThanOrEqual(2)
})

test('sur mobile, rien ne déborde et chaque congé reste à portée', async ({ page, account, isMobile }) => {
  test.skip(!isMobile, 'mise en page du mobile')
  await openDashboard(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)

  const christmasChip = chip(page, 'CP du 21 au 24 décembre')
  await christmasChip.scrollIntoViewIfNeeded()
  const box = await christmasChip.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})

test('les boutons et les champs ont la police du texte', async ({ page, account }) => {
  await openDashboard(page)
  await openNewForm(page)
  const fonts = await page.evaluate(() => {
    const font = el => getComputedStyle(el).fontFamily
    return {
      body: font(document.body),
      button: font(document.querySelector('dialog[open] .btn-primary')),
      choice: font(document.querySelector('dialog[open] .segmented button')),
    }
  })
  expect(fonts.button).toBe(fonts.body)
  expect(fonts.choice).toBe(fonts.body)
})

test('la page est en français, nombres compris', async ({ page, account }) => {
  await openDashboard(page)
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  const october = page.locator('.month.current')
  await expect(october).toContainText('7,92')
  await expect(october).not.toContainText('7.92')
})

test('si le serveur ne répond pas, l’app le dit et propose de réessayer', async ({ page, account }) => {
  await page.route('**/api/settings', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur interne du serveur."}' }))
  await page.goto('/')
  await expect(page.getByText('Impossible de charger vos congés')).toBeVisible()

  await page.unroute('**/api/settings')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.locator('.month-list')).toBeVisible()
})

test('un congé supprimé se récupère avec « Annuler »', async ({ page, account }) => {
  await openDashboard(page)
  const before = await entriesOf(page)
  await openChip(page, 'CP du 21 au 24 décembre')
  await sheet(page).getByRole('button', { name: 'Supprimer' }).click()
  await expect(chip(page, 'CP du 21 au 24 décembre')).toHaveCount(0)
  await expect.poll(async () => (await entriesOf(page)).length).toBe(before.length - christmas.length)

  await page.getByRole('status').getByRole('button', { name: 'Annuler' }).click()
  await expect(chip(page, 'CP du 21 au 24 décembre')).toBeVisible()
  const after = await entriesOf(page)
  expect(after.length).toBe(before.length)
  expect(after.filter(e => christmas.includes(e.date)).map(({ type, status, duration }) => ({ type, status, duration })))
    .toEqual(christmas.map(() => ({ type: 'conge', status: 'demande', duration: 1 })))
})

test('modifier un congé ne le perd pas quand l’enregistrement échoue', async ({ page, account }) => {
  await openDashboard(page)
  await openChip(page, 'CP du 21 au 24 décembre')
  await sheet(page).getByRole('button', { name: 'Modifier' }).click()
  await choice(page, 'Statut', 'Accepté').click()

  await page.route('**/api/entries/replace', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur interne du serveur."}' }))
  await sheet(page).getByRole('button', { name: /^Enregistrer/ }).click()
  await expect(sheet(page).getByText(/Enregistrement impossible/)).toBeVisible()
  const kept = (await entriesOf(page)).filter(e => christmas.includes(e.date))
  expect(kept.map(e => e.status)).toEqual(christmas.map(() => 'demande'))

  await page.unroute('**/api/entries/replace')
  await sheet(page).getByRole('button', { name: /^Enregistrer/ }).click()
  await expect.poll(async () => (await entriesOf(page)).filter(e => christmas.includes(e.date)).map(e => e.status))
    .toEqual(christmas.map(() => 'accepte'))
})

test('paramètres : « Annuler » n’enregistre rien, « Enregistrer » enregistre tout', async ({ page, account }) => {
  const read = async () => ({
    initial: (await (await page.request.get('/api/settings')).json()).initial_conges,
    rtt: (await (await page.request.get('/api/yearly-rtt')).json()).map(r => [r.year, r.rtt_count]),
  })
  const original = await read()

  await page.goto('/settings')
  await page.getByLabel('Congés initiaux', { exact: true }).fill('20')
  await page.getByLabel('RTT 2026', { exact: true }).fill('12')
  await page.getByRole('link', { name: 'Annuler' }).click()
  await expect(page.locator('.month-list')).toBeVisible()
  expect(await read()).toEqual(original)

  await page.goto('/settings')
  await page.getByLabel('RTT 2026', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Retirer 2027' }).click()
  await page.getByLabel('Nouvelle année', { exact: true }).fill('2028')
  await page.getByLabel('RTT de la nouvelle année', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.month-list')).toBeVisible()
  expect(await read()).toEqual({ initial: original.initial, rtt: [[2026, 12], [2028, 8]] })
})

test('les icônes de l’app sont des PNG, iPhone compris', async ({ page, isMobile }) => {
  test.skip(isMobile, 'une fois suffit')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  const png = manifest.icons.filter(i => i.type === 'image/png')
  expect(png.map(i => `${i.sizes} ${i.purpose ?? 'any'}`).sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])
  for (const src of [...png.map(i => i.src), '/apple-touch-icon.png']) {
    const res = await page.request.get(src)
    expect(res.status(), src).toBe(200)
    expect(res.headers()['content-type'], src).toBe('image/png')
  }
  await page.goto('/login')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
})
