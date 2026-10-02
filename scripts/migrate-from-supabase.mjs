// La migration de Supabase vers SQLite. Elle lit une sauvegarde faite par
// backup-supabase.mjs et produit la base du serveur. Elle ne parle jamais à
// Supabase : elle ne lit que des fichiers.
//
//   node scripts/migrate-from-supabase.mjs --backup <dossier> --dry-run
//   node scripts/migrate-from-supabase.mjs --backup <dossier> --out <fichier.sqlite> [--replace]
//
// Rejouable : la base se construit dans un fichier temporaire, se contrôle, et
// ne prend la place de --out qu'une fois les contrôles passés. Elle échoue au
// moindre écart avec la référence de la sauvegarde (reference.json) :
// - même nombre de lignes par table, et autant de comptes ;
// - chaque ligne relue par le serveur égale à celle exportée de Supabase ;
// - mêmes soldes par compte, mois par mois, calculés par useBalance.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { migrate } from '../server/db.js'
import { readCopyTable } from './lib/pg-copy.mjs'
import { readTables } from './lib/reference.mjs'
import { verifiedSummary, verifyAgainstBackup } from './lib/verify.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(repoRoot, 'server', 'migrations')

const { values: args } = parseArgs({
  options: {
    'backup': { type: 'string' },
    'out': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'replace': { type: 'boolean', default: false },
  },
})

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

if (!args.backup) fail('Indique la sauvegarde : --backup <dossier>.')
if (!args['dry-run'] && !args.out) fail('Indique la base à produire (--out <fichier.sqlite>), ou --dry-run.')
const backup = resolve(args.backup)

// ── 1. La sauvegarde est intacte ─────────────────────────────────────────────
const sums = readFileSync(join(backup, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split(/\s+/))
const corrupted = sums.filter(([hash, file]) => createHash('sha256').update(readFileSync(join(backup, file))).digest('hex') !== hash)
if (corrupted.length) fail(`Sauvegarde altérée : ${corrupted.map(([, f]) => f).join(', ')}`)
console.log(`▸ Sauvegarde ${backup}\n  ${sums.length} fichiers, empreintes vérifiées`)

const reference = JSON.parse(readFileSync(join(backup, 'reference.json'), 'utf8'))
const exported = readTables(backup)

// ── 2. Lecture du dump et conversion ─────────────────────────────────────────
const sql = readFileSync(join(backup, 'supabase.sql'), 'utf8')
const source = {
  users: readCopyTable(sql, 'auth.users'),
  identities: readCopyTable(sql, 'auth.identities'),
  settings: readCopyTable(sql, 'public.user_settings'),
  yearlyRtt: readCopyTable(sql, 'public.yearly_rtt'),
  entries: readCopyTable(sql, 'public.time_off_entries'),
}

/** '2026-03-09 20:47:55.123456+00' → '2026-03-09T20:47:55.123456+00:00', sans rien perdre. */
function timestamp(text, where) {
  if (text === null) return null
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)([+-]\d{2})(?::(\d{2}))?$/.exec(text)
  if (!m) fail(`${where} : horodatage illisible « ${text} »`)
  return `${m[1]}T${m[2]}${m[3]}:${m[4] ?? '00'}`
}

/** Un numeric de Postgres en nombre JavaScript, à condition qu'il le soit exactement. */
function decimal(text, where) {
  const value = Number(text)
  const canonical = s => s.replace(/^(-?\d+)\.(\d*?)0*$/, (_, i, f) => f ? `${i}.${f}` : i).replace(/^-0$/, '0')
  if (!/^-?\d+(\.\d+)?$/.test(text) || canonical(text) !== canonical(String(value))) {
    fail(`${where} : « ${text} » ne tient pas exactement dans un nombre`)
  }
  return value
}

function integer(text, where) {
  const value = Number(text)
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(value)) fail(`${where} : « ${text} » n'est pas un entier`)
  return value
}

const google = source.identities.filter(i => i.provider === 'google')
const users = source.users.map(u => {
  const ids = google.filter(i => i.user_id === u.id)
  if (ids.length !== 1) fail(`Compte ${u.id} : ${ids.length} identité(s) Google, une seule attendue`)
  const [identity] = ids
  if (JSON.parse(identity.identity_data).sub !== identity.provider_id) fail(`Compte ${u.id} : sub et provider_id diffèrent`)
  if (!u.email) fail(`Compte ${u.id} : sans adresse e-mail`)
  return {
    id: u.id,
    google_sub: identity.provider_id,
    email: u.email,
    created_at: timestamp(u.created_at, `auth.users ${u.id}`),
    last_login_at: timestamp(u.last_sign_in_at, `auth.users ${u.id}`),
  }
})
const settings = source.settings.map(s => ({
  id: s.id,
  user_id: s.user_id,
  start_year: integer(s.start_year, `user_settings ${s.id}`),
  initial_conges: decimal(s.initial_conges, `user_settings ${s.id}`),
  initial_rtt: decimal(s.initial_rtt, `user_settings ${s.id}`),
  conges_increment_per_month: decimal(s.conges_increment_per_month, `user_settings ${s.id}`),
  created_at: timestamp(s.created_at, `user_settings ${s.id}`),
  updated_at: timestamp(s.updated_at, `user_settings ${s.id}`),
  journee_solidarite: s.journee_solidarite,
}))
const yearlyRtt = source.yearlyRtt.map(r => ({
  id: r.id,
  user_id: r.user_id,
  year: integer(r.year, `yearly_rtt ${r.id}`),
  rtt_count: decimal(r.rtt_count, `yearly_rtt ${r.id}`),
  created_at: timestamp(r.created_at, `yearly_rtt ${r.id}`),
}))
const entries = source.entries.map(e => ({
  id: e.id,
  user_id: e.user_id,
  date: e.date,
  type: e.type,
  status: e.status,
  created_at: timestamp(e.created_at, `time_off_entries ${e.id}`),
  updated_at: timestamp(e.updated_at, `time_off_entries ${e.id}`),
  duration: decimal(e.duration, `time_off_entries ${e.id}`),
}))

const counts = {
  'auth.users': users.length,
  'public.user_settings': settings.length,
  'public.yearly_rtt': yearlyRtt.length,
  'public.time_off_entries': entries.length,
}
console.log('\n▸ Lignes lues dans le dump (attendues d\'après la référence)')
for (const [table, n] of Object.entries(counts)) {
  const expected = reference.tables[table].rows
  console.log(`  ${table.padEnd(26)} ${String(n).padStart(5)}  (${expected})${n === expected ? '' : '  ✗ ÉCART'}`)
}
if (Object.entries(counts).some(([t, n]) => n !== reference.tables[t].rows)) fail('Le dump ne contient pas autant de lignes que la référence.')

if (args['dry-run']) {
  console.log('\n✓ À blanc : rien n\'a été écrit.')
  process.exit(0)
}

// ── 3. La base, dans un fichier temporaire ───────────────────────────────────
const out = resolve(args.out)
const rel = relative(repoRoot, out)
const inRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
if (inRepo && !rel.startsWith('.data')) fail(`${out} est dans le dépôt : la base contient des données personnelles. Range-la hors du dépôt, ou dans .data/.`)
if (existsSync(out) && !args.replace) fail(`${out} existe déjà : ajoute --replace pour le remplacer.`)
const tmp = `${out}.tmp-${process.pid}`
const cleanup = () => { for (const f of [tmp, `${tmp}-journal`]) rmSync(f, { force: true }) }

const problems = []
try {
  mkdirSync(dirname(out), { recursive: true })
  const db = new Database(tmp)
  // Un seul fichier, sans journal WAL à côté : prêt à être déposé tel quel.
  db.pragma('journal_mode = DELETE')
  db.pragma('foreign_keys = ON')
  migrate(db, migrationsDir)
  db.transaction(() => {
    const insert = (table, rows) => {
      if (!rows.length) return
      const columns = Object.keys(rows[0])
      const stmt = db.prepare(`insert into ${table} (${columns.join(', ')}) values (${columns.map(c => `@${c}`).join(', ')})`)
      for (const row of rows) stmt.run(row)
    }
    insert('users', users)
    insert('user_settings', settings)
    insert('yearly_rtt', yearlyRtt)
    insert('time_off_entries', entries)
  })()
  db.close()

  // ── 4. Contrôles, sur la base relue comme le serveur la lira ───────────────
  const check = new Database(tmp, { readonly: true })
  problems.push(...verifyAgainstBackup(check, reference, exported))
  check.close()
} catch (error) {
  cleanup()
  throw error
}

console.log('\n▸ Contrôles de la base produite')
if (problems.length) {
  cleanup()
  console.log(problems.map(p => `  ✗ ${p}`).join('\n'))
  fail(`${problems.length} écart(s) avec la sauvegarde : aucune base n'a été produite.`)
}
console.log(verifiedSummary(reference))

if (args.replace) rmSync(out, { force: true })
renameSync(tmp, out)
const hash = createHash('sha256').update(readFileSync(out)).digest('hex')
console.log(`\n✓ Base produite : ${out}\n  sha256 ${hash}`)
