// Ce que partagent la configuration Playwright, le serveur de test et les
// fixtures : le port, la base (refaite à chaque lancement) et le secret de session.

import { fileURLToPath } from 'node:url'

export const PORT = 3210
export const BASE_URL = `http://localhost:${PORT}`
export const DB_PATH = fileURLToPath(new URL('../.data/e2e.sqlite', import.meta.url))
export const SESSION_SECRET = 'dev-seulement-secret-des-tests-e2e-assez-long'
