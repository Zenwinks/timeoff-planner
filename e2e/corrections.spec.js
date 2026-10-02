// Les bugs relevés à l'audit du 2026-10-03, rejoués dans le navigateur : chacun
// échouait avant sa correction. Le compte de chaque test est le jeu de
// démonstration (scripts/lib/demo.mjs), un lundi 5 octobre 2026.

import { test, expect, entriesOf } from './fixtures.js'

const july = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']

async function openDashboard(page) {
  await page.goto('/')
  await expect(page.locator('.recap-table')).toBeVisible()
}

/** Choisit une période dans le calendrier, sur le mois affiché (octobre 2026). */
async function pickPeriod(page, from, to) {
  await page.getByPlaceholder('Sélectionner les dates').click()
  const day = d => page.locator('.dp__menu .dp__calendar_item .dp__cell_inner:not(.dp__cell_offset)').getByText(String(d), { exact: true }).first()
  await day(from).click()
  await day(to).click()
}

test('une demi-journée étendue à plusieurs jours redevient des journées entières', async ({ page, account }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: '+ Poser un congé' }).click()
  await pickPeriod(page, 19, 19)
  await page.getByLabel('Durée', { exact: true }).selectOption({ label: 'Demi-journée' })
  await pickPeriod(page, 19, 21)
  await expect(page.getByLabel('Durée', { exact: true })).toBeHidden()

  const posted = page.waitForResponse(r => r.url().endsWith('/api/entries') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Valider' }).click()
  expect((await posted).ok()).toBe(true)
  const days = (await entriesOf(page)).filter(e => e.date >= '2026-10-19' && e.date <= '2026-10-21')
  expect(days.map(e => e.duration)).toEqual([1, 1, 1])
})

test('fermer une modification laisse le formulaire vierge', async ({ page, account }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: /Modifier.*27 au 31 juillet/ }).click()
  await expect(page.getByRole('heading', { name: 'Modifier un congé' })).toBeVisible()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()

  await page.getByRole('button', { name: '+ Poser un congé' }).click()
  await expect(page.getByRole('heading', { name: 'Poser un congé' })).toBeVisible()
  await expect(page.getByPlaceholder('Sélectionner les dates')).toHaveValue('')
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('conge')
  await expect(page.getByLabel('Statut', { exact: true })).toHaveValue('brouillon')
})

test('la légende filtre dès le premier toucher ou clic', async ({ page, account, isMobile }) => {
  await openDashboard(page)
  const accepted = page.getByRole('button', { name: 'Accepté' })
  const press = () => (isMobile ? accepted.tap() : accepted.click())

  await press()
  await expect(accepted).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.entry-chip.dimmed').first()).toBeVisible()

  await press()
  await expect(accepted).toHaveAttribute('aria-pressed', 'false')
  // À la souris, le survol garde un aperçu tant qu'elle reste sur le statut.
  if (!isMobile) await page.mouse.move(0, 0)
  await expect(page.locator('.entry-chip.dimmed')).toHaveCount(0)
})

test('sur ordinateur, la colonne Détail s’aligne sur les autres', async ({ page, account, isMobile }) => {
  test.skip(isMobile, 'mise en page de l’ordinateur')
  await openDashboard(page)
  const rows = await page.locator('.recap-table tbody tr:not(.rtt-warn-row)').evaluateAll(trs => trs.map(tr => {
    const [first, last] = [tr.cells[0], tr.cells[tr.cells.length - 1]].map(c => c.getBoundingClientRect())
    return { top: Math.round(first.top - last.top), height: Math.round(first.height - last.height) }
  }))
  expect(rows.length).toBeGreaterThan(20)
  for (const row of rows) expect(row).toEqual({ top: 0, height: 0 })
})

test('sur mobile, rien ne déborde et chaque congé reste à portée', async ({ page, account, isMobile }) => {
  test.skip(!isMobile, 'mise en page du mobile')
  await openDashboard(page)
  const overflow = await page.evaluate(() => {
    const wrapper = document.querySelector('.table-wrapper')
    return { page: document.documentElement.scrollWidth - innerWidth, table: wrapper.scrollWidth - wrapper.clientWidth }
  })
  expect(overflow).toEqual({ page: 0, table: 0 })

  const remove = page.getByRole('button', { name: /Supprimer.*27 au 31 juillet/ })
  await remove.scrollIntoViewIfNeeded()
  const box = await remove.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
})

test('les boutons et les champs ont la police du texte', async ({ page, account }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: '+ Poser un congé' }).click()
  const fonts = await page.evaluate(() => {
    const font = el => getComputedStyle(el).fontFamily
    return { body: font(document.body), button: font(document.querySelector('.btn-add')), select: font(document.querySelector('.form-card select')) }
  })
  expect(fonts.button).toBe(fonts.body)
  expect(fonts.select).toBe(fonts.body)
})

test('la page est en français, nombres compris', async ({ page, account }) => {
  await openDashboard(page)
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  const table = page.locator('.recap-table')
  await expect(table).toContainText('13,67')
  await expect(table).not.toContainText('13.67')
})

test('si le serveur ne répond pas, l’app le dit et propose de réessayer', async ({ page, account }) => {
  await page.route('**/api/settings', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur interne du serveur."}' }))
  await page.goto('/')
  await expect(page.getByText('Impossible de charger vos congés')).toBeVisible()

  await page.unroute('**/api/settings')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.locator('.recap-table')).toBeVisible()
})

test('un congé supprimé se récupère avec « Annuler »', async ({ page, account }) => {
  await openDashboard(page)
  const before = await entriesOf(page)
  await page.getByRole('button', { name: /Supprimer.*27 au 31 juillet/ }).click()
  await expect(page.getByRole('button', { name: /Supprimer.*27 au 31 juillet/ })).toHaveCount(0)
  await expect.poll(async () => (await entriesOf(page)).length).toBe(before.length - july.length)

  await page.getByRole('status').getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('button', { name: /Supprimer.*27 au 31 juillet/ })).toBeVisible()
  const after = await entriesOf(page)
  expect(after.length).toBe(before.length)
  expect(after.filter(e => july.includes(e.date)).map(({ type, status, duration }) => ({ type, status, duration })))
    .toEqual(july.map(() => ({ type: 'conge', status: 'accepte', duration: 1 })))
})

test('modifier un congé ne le perd pas quand l’enregistrement échoue', async ({ page, account }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: /Modifier.*27 au 31 juillet/ }).click()
  await page.getByLabel('Statut', { exact: true }).selectOption('demande')

  await page.route('**/api/entries/replace', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Erreur interne du serveur."}' }))
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByText(/Enregistrement impossible/)).toBeVisible()
  const kept = (await entriesOf(page)).filter(e => july.includes(e.date))
  expect(kept.map(e => e.status)).toEqual(july.map(() => 'accepte'))

  await page.unroute('**/api/entries/replace')
  await page.getByRole('button', { name: 'OK' }).click()
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect.poll(async () => (await entriesOf(page)).filter(e => july.includes(e.date)).map(e => e.status))
    .toEqual(july.map(() => 'demande'))
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
  await expect(page.locator('.recap-table')).toBeVisible()
  expect(await read()).toEqual(original)

  await page.goto('/settings')
  await page.getByLabel('RTT 2026', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Retirer 2027' }).click()
  await page.getByLabel('Nouvelle année', { exact: true }).fill('2028')
  await page.getByLabel('RTT de la nouvelle année', { exact: true }).fill('8')
  await page.getByRole('button', { name: '+ Ajouter' }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('.recap-table')).toBeVisible()
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
