// Le serveur des tests dans le navigateur : la vraie app (server/app.js) et la
// PWA construite (dist/), sur une base neuve à chaque lancement. Les comptes y
// sont créés par les tests eux-mêmes (e2e/fixtures.js).

import { rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { migrate, openDb } from '../server/db.js'
import { BASE_URL, DB_PATH, PORT, SESSION_SECRET } from './env.js'

for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) rmSync(f, { force: true })

const config = loadConfig({
  PUBLIC_URL: BASE_URL,
  DATABASE_PATH: DB_PATH,
  SESSION_SECRET,
  GOOGLE_CLIENT_ID: 'tests-e2e',
  GOOGLE_CLIENT_SECRET: 'tests-e2e',
})
const db = openDb(DB_PATH)
migrate(db, config.migrationsDir)
createServer(createApp({ config, db }).handle).listen(PORT, '127.0.0.1')
