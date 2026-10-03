// Point d'entrée : ouvre la base, applique les migrations en attente, puis sert
// l'app. Un déploiement qui apporte une migration n'a rien d'autre à faire.

import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { migrate, openDb, pruneBackups } from './db.js'

const config = loadConfig()
const db = openDb(config.databasePath)

// Les copies d'avant migration, à côté de la base (sur le volume /data en
// production), gardées 30 jours.
const backupDir = join(dirname(resolve(config.databasePath)), 'sauvegardes')
const { applied, backup } = migrate(db, config.migrationsDir, { backupDir })
if (backup) console.log(`[base] copie de la base avant migration : ${backup}`)
for (const name of applied) console.log(`[base] migration appliquée : ${name}`)
for (const name of pruneBackups(backupDir)) console.log(`[base] copie de plus de 30 jours effacée : ${name}`)

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
