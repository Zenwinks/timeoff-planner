// Une base de démonstration pour voir l'app en local, sans données réelles :
// un compte fictif (scripts/lib/demo.mjs) et une session ouverte pour lui.
//
//   node scripts/seed-demo.mjs                 # crée .data/demo.sqlite
//   DATABASE_PATH=.data/demo.sqlite npm run dev:server
//
// Puis, sur la page de l'app, dans la console du navigateur, la ligne que le
// script affiche : elle pose le cookie de session du compte fictif.

import { rmSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { loadConfig } from '../server/config.js'
import { migrate, openDb } from '../server/db.js'
import { createDemoAccount, openDemoSession } from './lib/demo.mjs'

const { values: args } = parseArgs({ options: { db: { type: 'string', default: '.data/demo.sqlite' } } })
const config = loadConfig()
if (!config.sessionSecret) {
  console.error('SESSION_SECRET manque : copie .env.example en .env, ou lance avec --env-file=.env.')
  process.exit(1)
}

for (const f of [args.db, `${args.db}-wal`, `${args.db}-shm`]) rmSync(f, { force: true })
const db = openDb(args.db)
migrate(db, config.migrationsDir)
const token = openDemoSession(db, config.sessionSecret, createDemoAccount(db))
db.close()

const cookie = config.secureCookies ? '__Host-timeoff_session' : 'timeoff_session'
if (config.loginProblem) {
  console.warn(`Attention, ${config.loginProblem} : le serveur refusera cette session tant que la connexion est fermée. Des valeurs quelconques suffisent pour la démonstration.`)
}
console.log(`Base de démonstration : ${args.db}`)
console.log(`Dans la console du navigateur, sur ${config.origin} :`)
console.log(`  document.cookie = "${cookie}=${token}; path=/"`)
