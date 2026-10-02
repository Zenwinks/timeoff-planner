// Le contrôle d'une base SQLite contre une sauvegarde de Supabase : celui que
// fait la migration sur la base qu'elle produit, et verify-sqlite.mjs sur une
// base déjà déposée. La base est lue comme le serveur la lit (server/store.js).

import { isDeepStrictEqual } from 'node:util'
import { createStore } from '../../server/store.js'
import { balanceDate, computeBalances, diffBalances } from './reference.mjs'

const TABLES = [
  ['auth.users', 'users'],
  ['public.user_settings', 'user_settings'],
  ['public.yearly_rtt', 'yearly_rtt'],
  ['public.time_off_entries', 'time_off_entries'],
]

/**
 * Les écarts entre la base `db` (better-sqlite3) et la sauvegarde : sa
 * référence (reference.json) et ses exports (readTables). Vide : identiques.
 */
export function verifyAgainstBackup(db, reference, exported) {
  const problems = []
  if (db.pragma('integrity_check', { simple: true }) !== 'ok') problems.push('integrity_check ne répond pas ok')
  if (db.pragma('foreign_key_check').length) problems.push('foreign_key_check signale des lignes orphelines')

  for (const [table, sqlite] of TABLES) {
    const n = db.prepare(`select count(*) from ${sqlite}`).pluck().get()
    if (n !== reference.tables[table].rows) problems.push(`${sqlite} : ${n} lignes, ${reference.tables[table].rows} attendues`)
  }
  if (exported.users.length !== reference.accounts) problems.push(`${exported.users.length} comptes exportés, ${reference.accounts} attendus`)

  // Chaque ligne, telle que l'API la servira, égale à celle exportée de Supabase.
  const store = createStore(db)
  const served = { settings: [], yearlyRtt: [], entries: [] }
  for (const u of exported.users) {
    const user = db.prepare('select * from users where id = ?').get(u.id)
    const identity = exported.identities.find(i => i.user_id === u.id && i.provider === 'google')
    if (!user || user.email !== u.email || user.google_sub !== identity?.provider_id) {
      problems.push(`compte ${u.id} : absent, ou différent de auth.users / auth.identities`)
    }
    const s = store.getSettings(u.id)
    if (s) served.settings.push(s)
    served.yearlyRtt.push(...store.listYearlyRtt(u.id))
    served.entries.push(...store.listEntries(u.id))
  }
  for (const [name, rows, source] of [
    ['user_settings', served.settings, exported.settings],
    ['yearly_rtt', served.yearlyRtt, exported.yearlyRtt],
    ['time_off_entries', served.entries, exported.entries],
  ]) {
    const expected = new Map(source.map(r => [r.id, r]))
    if (rows.length !== expected.size) problems.push(`${name} : ${rows.length} lignes servies, ${expected.size} exportées`)
    for (const row of rows) {
      if (!isDeepStrictEqual({ ...row }, expected.get(row.id))) {
        problems.push(`${name} ${row.id} : ${JSON.stringify(row)} ≠ ${JSON.stringify(expected.get(row.id) ?? null)}`)
      }
    }
  }

  // Les soldes, mois par mois, calculés par useBalance sur ce que l'API servira.
  const balances = computeBalances({ userIds: exported.users.map(u => u.id), ...served }, balanceDate(reference.balance_date))
  problems.push(...diffBalances(reference.balances, balances))
  return problems
}

/** Le résumé des contrôles passés, pour le terminal. */
export function verifiedSummary(reference) {
  const months = Object.values(reference.balances).reduce((n, b) => n + b.recap.length, 0)
  return [
    '  intégrité SQLite et clés étrangères : ok',
    '  nombres de lignes et de comptes : identiques à la référence',
    '  chaque ligne relue par le serveur : identique à l\'export de Supabase',
    `  soldes de ${reference.accounts} comptes, ${months} mois en tout : identiques (calculés au ${reference.balance_date})`,
  ].join('\n')
}
