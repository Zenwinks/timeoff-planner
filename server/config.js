// La configuration du serveur, lue une fois dans l'environnement. Les secrets
// (client Google, secret de session) se saisissent dans Coolify, jamais dans le
// dépôt ; en local, dans .env (voir .env.example).

import { fileURLToPath } from 'node:url'

const DEV_PREFIX = 'dev-seulement'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const publicUrl = new URL(env.PUBLIC_URL || 'http://localhost:3000')
  const local = LOCAL_HOSTS.has(publicUrl.hostname)

  const config = {
    production,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    databasePath: env.DATABASE_PATH || '.data/timeoff.sqlite',
    staticDir: env.STATIC_DIR || fileURLToPath(new URL('../dist', import.meta.url)),
    migrationsDir: fileURLToPath(new URL('./migrations', import.meta.url)),
    // L'adresse publique de l'app : elle donne l'adresse de retour de Google et
    // l'origine qu'une requête qui écrit doit porter.
    origin: publicUrl.origin,
    redirectUri: `${publicUrl.origin}/auth/callback`,
    // Secure dès que l'app est en HTTPS, c'est-à-dire partout sauf en local.
    secureCookies: publicUrl.protocol === 'https:',
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    sessionSecret: env.SESSION_SECRET || '',
  }
  config.loginProblem = loginProblem(config, { local, publicUrlSet: !!env.PUBLIC_URL })
  return config
}

/** Pourquoi la connexion est fermée, ou null si elle est ouverte. */
function loginProblem(c, { local, publicUrlSet }) {
  if (c.production && !publicUrlSet) return 'PUBLIC_URL manque'
  if (c.production && c.origin.startsWith('http:') && !local) return 'PUBLIC_URL doit être en https'
  if (!c.googleClientId || !c.googleClientSecret) return 'GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET manque'
  if (!c.sessionSecret) return 'SESSION_SECRET manque'
  if (c.sessionSecret.length < 32) return 'SESSION_SECRET doit faire 32 caractères au moins'
  if (c.production && !local && c.sessionSecret.startsWith(DEV_PREFIX)) return 'SESSION_SECRET a gardé sa valeur de développement'
  return null
}
