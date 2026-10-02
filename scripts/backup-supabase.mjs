// Sauvegarde complète de la base Supabase de timeoff-planner. Ne fait que lire :
// pg_dump et l'instantané travaillent en transaction de lecture seule.
//
//   node scripts/backup-supabase.mjs \
//     --out  F:/sauvegardes/timeoff-planner/supabase-AAAA-MM-JJ \
//     --copy D:/sauvegardes/timeoff-planner
//
// La chaîne de connexion « Session pooler » se lit dans un fichier hors du dépôt
// (--url-file, par défaut ~/.secrets/timeoff-planner/supabase-pooler.url). Elle
// n'est jamais affichée : Docker la reçoit par variable d'environnement, et tout
// ce que les outils écrivent passe par un masque.
//
// Le dossier produit contient des données personnelles : il se range hors du
// dépôt, et le script refuse un dossier qui s'y trouve. On y trouve :
//   supabase.dump      pg_dump au format custom, schémas public et auth
//   supabase.sql       le même en SQL lisible, tiré du .dump (même état)
//   supabase.toc.txt   la table des matières du dump
//   snapshot.json      lignes et empreinte md5 de chaque table de public et auth
//   tables/            les tables de l'app et les comptes, en JSON et CSV
//   reference.json     la référence de contrôle : nombres, et soldes par compte
//   reference.txt      la même, sans donnée personnelle
//   restore-check.log  la restauration de contrôle dans un Postgres jetable
//   SHA256SUMS         l'empreinte de chaque fichier, vérifiée sur la copie

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { anonymousSummary, balanceDate, computeBalances, diffBalances, readTables } from './lib/reference.mjs'

// Le client doit être au moins aussi récent que le serveur (Postgres 17 chez Supabase).
const IMAGE = 'postgres:17'
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlDir = join(repoRoot, 'scripts', 'supabase')

const { values: args } = parseArgs({
  options: {
    'out': { type: 'string' },
    'copy': { type: 'string' },
    'url-file': { type: 'string', default: join(homedir(), '.secrets', 'timeoff-planner', 'supabase-pooler.url') },
  },
})

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function step(message) {
  console.log(`\n▸ ${message}`)
}

/** Une sauvegarde ne se range jamais dans le dépôt, ni ne remplace une autre. */
function assertNewDirOutsideRepo(dir) {
  const rel = relative(repoRoot, dir)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail(`${dir} est dans le dépôt : une sauvegarde contient des données personnelles, elle se range ailleurs.`)
  }
  if (existsSync(dir) && readdirSync(dir).length > 0) fail(`${dir} existe déjà et n'est pas vide : choisis un dossier neuf.`)
}

if (!args.out) fail('Indique le dossier de sauvegarde : --out <dossier>.')
const out = resolve(args.out)
assertNewDirOutsideRepo(out)
const copyDir = args.copy ? join(resolve(args.copy), basename(out)) : null
if (copyDir) assertNewDirOutsideRepo(copyDir)

if (!existsSync(args['url-file'])) fail(`Chaîne de connexion introuvable : ${args['url-file']}`)
const url = readFileSync(args['url-file'], 'utf8').trim()
let password = ''
try {
  password = new URL(url).password
} catch {
  fail('La chaîne de connexion n\'est pas une URL postgresql:// lisible.')
}
const secrets = [url, password, decodeURIComponent(password)].filter(s => s.length >= 4)

/** Retire la chaîne de connexion et le mot de passe de tout texte affiché ou écrit. */
function mask(text) {
  let masked = String(text ?? '')
  for (const s of secrets) masked = masked.split(s).join('<masqué>')
  return masked.replace(/postgres(?:ql)?:\/\/\S+/g, '<url masquée>')
}

/** Lance docker. PGURL n'atteint un conteneur que s'il le demande (-e PGURL). */
function docker(dockerArgs, { allowFail = false } = {}) {
  const r = spawnSync('docker', dockerArgs, { env: { ...process.env, PGURL: url }, encoding: 'utf8', maxBuffer: 1 << 28 })
  if (r.error) fail(`docker introuvable ou arrêté : ${r.error.message}`)
  const result = { status: r.status, stdout: mask(r.stdout), stderr: mask(r.stderr) }
  if (r.status !== 0 && !allowFail) fail(`docker ${dockerArgs[0]} a échoué (code ${r.status}) :\n${result.stderr || result.stdout}`)
  return result
}

const mount = (source, target, readonly = false) =>
  `--mount=type=bind,source=${source},target=${target}${readonly ? ',readonly' : ''}`

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** La date du jour, heure locale, au format AAAA-MM-JJ. */
function localDay(date) {
  const p = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? listFiles(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`])
}

// ── 1. Instantané, exports lisibles et dump, sur le même état ────────────────
// Une session ouvre une transaction et exporte son instantané ; l'instantané
// lisible et pg_dump le reprennent, puis elle referme. Sans ça, une session
// renouvelée entre les deux (auth.refresh_tokens) suffit à les faire diverger.
step(`Instantané et pg_dump des schémas public et auth (lecture seule) → ${out}`)
mkdirSync(join(out, 'tables'), { recursive: true })
docker(['run', '--rm', '-e', 'PGURL', mount(out, '/out'), mount(sqlDir, '/sql', true), IMAGE, 'sh', '-c', `
  set -e
  mkfifo /tmp/hold
  psql "$PGURL" -X -q -At -v ON_ERROR_STOP=1 < /tmp/hold > /tmp/snapshot-id &
  holder=$!
  exec 3> /tmp/hold
  echo "begin isolation level repeatable read read only; select pg_export_snapshot();" >&3
  i=0; until [ -s /tmp/snapshot-id ]; do i=$((i + 1)); [ $i -le 150 ] || exit 1; sleep 0.2; done
  snapshot=$(head -n 1 /tmp/snapshot-id)
  psql "$PGURL" -X -q -v snapshot="$snapshot" -f /sql/snapshot.sql
  pg_dump "$PGURL" --snapshot="$snapshot" --format=custom --schema=public --schema=auth --file=/out/supabase.dump
  echo "commit;" >&3
  exec 3>&-
  wait $holder
  pg_restore --file=/out/supabase.sql /out/supabase.dump
  pg_restore --list /out/supabase.dump > /out/supabase.toc.txt
`])
const snapshot = JSON.parse(readFileSync(join(out, 'snapshot.json'), 'utf8'))
console.log(`  ${Object.keys(snapshot.tables).length} tables, serveur ${snapshot.server_version}, état du ${snapshot.taken_at}`)
console.log(`  ${readFileSync(join(out, 'supabase.toc.txt'), 'utf8').split('\n').filter(l => / TABLE DATA /.test(l)).length} tables de données dans le dump`)

// ── 2. La référence de contrôle ──────────────────────────────────────────────
step('Référence de contrôle : nombres, et soldes calculés par useBalance')
const tables = readTables(out)
const day = localDay(new Date(snapshot.taken_at))
const userIds = tables.users.map(u => u.id)
const reference = {
  taken_at: snapshot.taken_at,
  balance_date: day,
  server_version: snapshot.server_version,
  tables: snapshot.tables,
  accounts: userIds.length,
  balances: computeBalances({ userIds, ...tables }, balanceDate(day)),
}
writeFileSync(join(out, 'reference.json'), `${JSON.stringify(reference, null, 2)}\n`)
const summary = anonymousSummary(reference, tables.users)
writeFileSync(join(out, 'reference.txt'), `${summary}\n`)

// ── 3. Restauration de contrôle dans un Postgres jetable ─────────────────────
step('Restauration de contrôle dans un Postgres jetable (Docker, en mémoire)')
const container = `timeoff-restore-check-${process.pid}`
const scratch = mkdtempSync(join(tmpdir(), 'timeoff-restore-'))
mkdirSync(join(scratch, 'tables'))
const problems = []
const log = []
try {
  docker(['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=restore-check',
    '--tmpfs', '/var/lib/postgresql/data',
    mount(out, '/backup', true), mount(sqlDir, '/sql', true), mount(scratch, '/out'), IMAGE])
  // En TCP : pendant son initialisation, le serveur n'écoute que sur sa socket.
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    ready = docker(['exec', container, 'pg_isready', '-q', '-h', '127.0.0.1', '-U', 'postgres'], { allowFail: true }).status === 0
    if (!ready) sleep(1000)
  }
  if (!ready) fail('Le Postgres jetable n\'a pas démarré.')

  // Le dump recrée lui-même le schéma public. Sans propriétaires ni droits :
  // les rôles de Supabase n'existent pas ici.
  docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-c', 'drop schema public cascade'])
  const restore = docker(['exec', container, 'pg_restore', '-U', 'postgres', '-d', 'postgres',
    '--no-owner', '--no-privileges', '/backup/supabase.dump'], { allowFail: true })
  log.push(`pg_restore --no-owner --no-privileges : code ${restore.status}`, restore.stderr.trim() || '(aucun message)')
  if (restore.status !== 0) problems.push('pg_restore a signalé des erreurs (ci-dessus)')

  docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-f', '/sql/snapshot.sql'])
  const restored = JSON.parse(readFileSync(join(scratch, 'snapshot.json'), 'utf8'))

  const names = new Set([...Object.keys(snapshot.tables), ...Object.keys(restored.tables)])
  for (const name of [...names].sort()) {
    const expected = snapshot.tables[name], actual = restored.tables[name]
    if (!isDeepStrictEqual(expected, actual)) problems.push(`${name} : attendu ${JSON.stringify(expected)}, restauré ${JSON.stringify(actual)}`)
  }
  const restoredTables = readTables(scratch)
  problems.push(...diffBalances(reference.balances,
    computeBalances({ userIds: restoredTables.users.map(u => u.id), ...restoredTables }, balanceDate(day))))

  log.push('', `Tables comparées (lignes et md5) : ${names.size}`, `Soldes comparés : ${userIds.length} comptes`)
  log.push(problems.length ? `ÉCARTS :\n${problems.join('\n')}` : 'Aucun écart : la sauvegarde se restaure à l\'identique.')
} finally {
  docker(['stop', container], { allowFail: true })
  rmSync(scratch, { recursive: true, force: true })
}
writeFileSync(join(out, 'restore-check.log'), `${log.join('\n')}\n`)
console.log(log.map(l => `  ${l.replaceAll('\n', '\n  ')}`).join('\n'))
if (problems.length) fail('La restauration ne redonne pas la référence : cette sauvegarde n\'est pas fiable.')

// ── 4. Empreintes et seconde copie ───────────────────────────────────────────
step('Empreintes SHA-256')
const files = listFiles(out).filter(f => f !== 'SHA256SUMS').sort()
const sums = files.map(f => [sha256(join(out, f)), f])
writeFileSync(join(out, 'SHA256SUMS'), sums.map(([h, f]) => `${h}  ${f}`).join('\n') + '\n')
console.log(`  ${files.length} fichiers`)

if (copyDir) {
  step(`Seconde copie → ${copyDir}`)
  cpSync(out, copyDir, { recursive: true })
  const bad = sums.filter(([h, f]) => sha256(join(copyDir, f)) !== h)
  if (bad.length) fail(`Copie corrompue : ${bad.map(([, f]) => f).join(', ')}`)
  console.log(`  ${sums.length} fichiers copiés, empreintes identiques`)
}

console.log(`\n${summary}\n\n✓ Sauvegarde complète et vérifiée.`)
