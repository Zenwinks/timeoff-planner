// Contrôle une base SQLite déjà produite contre la sauvegarde dont elle vient :
// les mêmes contrôles que la migration. Pour le fichier déposé sur le serveur,
// avant que quiconque y écrive. Lecture seule.
//
//   node scripts/verify-sqlite.mjs --backup <dossier> --db <fichier.sqlite>

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import Database from 'better-sqlite3'
import { readTables } from './lib/reference.mjs'
import { verifiedSummary, verifyAgainstBackup } from './lib/verify.mjs'

const { values: args } = parseArgs({ options: { backup: { type: 'string' }, db: { type: 'string' } } })
if (!args.backup || !args.db) {
  console.error('Usage : node scripts/verify-sqlite.mjs --backup <dossier> --db <fichier.sqlite>')
  process.exit(1)
}

const backup = resolve(args.backup)
const reference = JSON.parse(readFileSync(join(backup, 'reference.json'), 'utf8'))
const db = new Database(resolve(args.db), { readonly: true, fileMustExist: true })
const problems = verifyAgainstBackup(db, reference, readTables(backup))
db.close()

console.log(`▸ ${resolve(args.db)}\n  contre la sauvegarde ${backup}`)
if (problems.length) {
  console.log(problems.map(p => `  ✗ ${p}`).join('\n'))
  console.error(`\n✗ ${problems.length} écart(s).`)
  process.exit(1)
}
console.log(`${verifiedSummary(reference)}\n\n✓ Base identique à la sauvegarde.`)
