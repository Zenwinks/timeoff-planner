// Un compte de démonstration fictif, avec une année de congés réaliste : pour
// les tests dans le navigateur (e2e/) et pour voir l'app en local sans données
// réelles (scripts/seed-demo.mjs). Aucune personne réelle derrière.

import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { getWorkingDaysInRange } from '../../src/composables/useBalance.js'
import { setSolidarite } from '../../src/holidays.js'

export const DEMO_SETTINGS = {
  start_year: 2026,
  initial_conges: 11.59,
  initial_rtt: 0.32,
  conges_increment_per_month: 25 / 12,
  journee_solidarite: 'lundi_pentecote',
}

export const DEMO_YEARLY_RTT = [[2026, 10], [2027, 9]]

// Vacances d'hiver, ponts, demi-journées, un arrêt maladie, été, Noël : tous les
// types et statuts.
export const DEMO_PERIODS = [
  ['2026-02-16', '2026-02-20', 'conge', 'accepte', 1],
  ['2026-03-06', '2026-03-06', 'rtt', 'accepte', 1],
  ['2026-03-13', '2026-03-13', 'conge', 'accepte', 0.5],
  ['2026-04-07', '2026-04-10', 'conge', 'accepte', 1],
  ['2026-05-15', '2026-05-15', 'rtt', 'impose', 1],
  // Un arrêt maladie : ni CP ni RTT, et pas de demande à suivre.
  ['2026-06-08', '2026-06-10', 'maladie', 'accepte', 1],
  ['2026-07-27', '2026-08-14', 'conge', 'accepte', 1],
  ['2026-09-18', '2026-09-18', 'rtt', 'accepte', 1],
  ['2026-10-30', '2026-10-30', 'rtt', 'demande', 1],
  // Une demi-journée l'après-midi ; celle du 13 mars n'a pas de moment précisé,
  // comme toutes celles posées avant octobre 2026.
  ['2026-11-13', '2026-11-13', 'rtt', 'brouillon', 0.5, 'apres-midi'],
  ['2026-12-21', '2026-12-24', 'conge', 'demande', 1],
  ['2026-12-28', '2026-12-31', 'conge', 'brouillon', 1],
  ['2027-02-15', '2027-02-19', 'conge', 'brouillon', 1],
]

/**
 * Crée un compte fictif et ses données dans la base `db` (better-sqlite3, déjà
 * migrée). `withData: false` : un compte neuf, sans paramètres ni congés.
 */
export function createDemoAccount(db, { email = 'camille.martin@example.test', sub = `demo-${randomUUID()}`, withData = true } = {}) {
  const now = new Date().toISOString()
  const userId = randomUUID()
  db.transaction(() => {
    db.prepare('insert into users (id, google_sub, email, created_at, last_login_at) values (?, ?, ?, ?, ?)')
      .run(userId, sub, email, now, now)
    if (!withData) return
    const s = DEMO_SETTINGS
    db.prepare(`insert into user_settings (id, user_id, start_year, initial_conges, initial_rtt, conges_increment_per_month, created_at, updated_at, journee_solidarite)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), userId, s.start_year, s.initial_conges, s.initial_rtt, s.conges_increment_per_month, now, now, s.journee_solidarite)
    for (const [year, count] of DEMO_YEARLY_RTT) {
      db.prepare('insert into yearly_rtt (id, user_id, year, rtt_count, created_at) values (?, ?, ?, ?, ?)').run(randomUUID(), userId, year, count, now)
    }
    // Les jours ouvrés dépendent de la journée de solidarité du compte.
    setSolidarite(s.journee_solidarite)
    const insert = db.prepare(`insert into time_off_entries (id, user_id, date, type, status, created_at, updated_at, duration, half_day)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const [from, to, type, status, duration, halfDay = null] of DEMO_PERIODS) {
      for (const date of getWorkingDaysInRange(new Date(`${from}T00:00`), new Date(`${to}T00:00`))) {
        insert.run(randomUUID(), userId, date, type, status, now, now, duration, halfDay)
      }
    }
    setSolidarite(null)
  })()
  return userId
}

/** Ouvre une session pour ce compte, comme le ferait la connexion Google. Renvoie le jeton du cookie. */
export function openDemoSession(db, sessionSecret, userId, days = 30) {
  const token = randomBytes(32).toString('base64url')
  const id = createHmac('sha256', sessionSecret).update(`session:${token}`).digest('base64url')
  db.prepare('insert into sessions (id, user_id, created_at, expires_at) values (?, ?, ?, ?)')
    .run(id, userId, new Date().toISOString(), new Date(Date.now() + days * 864e5).toISOString())
  return token
}
