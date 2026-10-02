// Point d'entrée : ouvre la base, applique les migrations en attente, puis sert
// l'app. Un déploiement qui apporte une migration n'a rien d'autre à faire.

import { createServer } from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { migrate, openDb } from './db.js'

const config = loadConfig()
const db = openDb(config.databasePath)
for (const name of migrate(db, config.migrationsDir)) console.log(`[base] migration appliquée : ${name}`)

const app = createApp({ config, db })
if (config.loginProblem) console.warn(`[connexion] fermée : ${config.loginProblem}`)

const purge = () => {
  const purged = app.store.purgeExpiredSessions()
  if (purged) console.log(`[sessions] ${purged} session(s) expirée(s) effacée(s)`)
}
purge()
setInterval(purge, 6 * 60 * 60 * 1000).unref()

const server = createServer(app.handle)
server.listen(config.port, config.host, () => {
  console.log(`timeoff-planner sur ${config.origin} (port ${config.port}, base ${config.databasePath})`)
})

// Coolify arrête l'ancien conteneur par SIGTERM à chaque déploiement : on finit
// les requêtes en cours et on ferme la base proprement.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
    server.closeIdleConnections()
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
