// Les fixtures des tests dans le navigateur.
//
// `account` : un compte fictif neuf, avec le jeu de démonstration
// (scripts/lib/demo.mjs), déjà connecté dans le navigateur du test. Chaque test
// a le sien : aucun ne voit ce que les autres écrivent.
//
// Le navigateur vit le lundi 5 octobre 2026 : le mois courant, l'horizon du
// récap et le calendrier ne dépendent pas du jour où l'on lance les tests.

import { test as base, expect } from '@playwright/test'
import Database from 'better-sqlite3'
import { createDemoAccount, openDemoSession } from '../scripts/lib/demo.mjs'
import { BASE_URL, DB_PATH, SESSION_SECRET } from './env.js'

export const TODAY = new Date('2026-10-05T10:00:00+02:00')

export const test = base.extend({
  account: async ({ context, page }, use) => {
    const db = new Database(DB_PATH)
    db.pragma('busy_timeout = 5000')
    const id = createDemoAccount(db)
    const token = openDemoSession(db, SESSION_SECRET, id)
    db.close()
    await context.addCookies([{ name: 'timeoff_session', value: token, url: BASE_URL }])
    await page.clock.setFixedTime(TODAY)
    await use({ id })
  },
})

/** Les jours posés du compte, lus par l'API avec la session du navigateur. */
export async function entriesOf(page) {
  const res = await page.request.get('/api/entries')
  expect(res.ok()).toBe(true)
  return res.json()
}

export { expect }
