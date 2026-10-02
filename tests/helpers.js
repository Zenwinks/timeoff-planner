// Un serveur de test : la vraie app, une base SQLite en mémoire et un faux
// Google. La connexion passe par le vrai parcours /auth/google puis
// /auth/callback (state, cookie de connexion, session) ; seul l'échange du code
// avec Google est simulé.

import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { migrate, openDb } from '../server/db.js'

export const ORIGIN = 'https://timeoff.test'

/** Un faux dist/ : de quoi vérifier les règles de cache et le repli sur index.html. */
function fakeDist() {
  const dir = mkdtempSync(join(tmpdir(), 'timeoff-dist-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>TimeOff Planner</title>')
  writeFileSync(join(dir, 'sw.js'), '// sw')
  writeFileSync(join(dir, 'registerSW.js'), '// register')
  writeFileSync(join(dir, 'manifest.webmanifest'), '{}')
  writeFileSync(join(dir, 'pwa-192x192.svg'), '<svg/>')
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)')
  return dir
}

function fakeGoogle() {
  const codes = new Map()
  return {
    async authorizationUrl({ state }) {
      return `https://accounts.google.test/o/oauth2/auth?state=${state}`
    },
    async exchange(callbackUrl) {
      const claims = codes.get(callbackUrl.searchParams.get('code'))
      if (!claims) throw new Error('code inconnu')
      return claims
    },
    /** Google qui authentifie quelqu'un : le code qu'il renverrait à l'app. */
    issueCode(claims) {
      const code = randomUUID()
      codes.set(code, claims)
      return code
    },
  }
}

export async function startTestServer(env = {}) {
  const config = loadConfig({
    PUBLIC_URL: ORIGIN,
    GOOGLE_CLIENT_ID: 'client-de-test',
    GOOGLE_CLIENT_SECRET: 'secret-de-test',
    SESSION_SECRET: 'secret-de-session-de-test-assez-long',
    STATIC_DIR: fakeDist(),
    ...env,
  })
  const db = openDb(':memory:')
  migrate(db, config.migrationsDir)
  const google = fakeGoogle()
  const app = createApp({ config, db, oidc: google })
  const server = createServer(app.handle)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`

  /** Une requête vers l'app, depuis une de ses pages (Origin) sauf avis contraire. */
  async function request(method, path, { cookie, body, origin = ORIGIN, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = undefined
    }
    return { status: res.status, headers: res.headers, cookies: res.headers.getSetCookie(), text, json }
  }

  /** Le parcours de connexion complet ; renvoie l'en-tête Cookie de la session. */
  async function login({ sub, email = `${sub}@example.test` }) {
    const start = await request('GET', '/auth/google', { origin: null })
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const loginCookie = start.cookies[0].split(';')[0]
    const code = google.issueCode({ sub, email })
    const back = await request('GET', `/auth/callback?code=${code}&state=${state}`, { origin: null, cookie: loginCookie })
    const session = back.cookies.find(c => c.includes('timeoff_session=') && !c.includes('Max-Age=0'))
    if (back.status !== 302 || back.headers.get('location') !== '/' || !session) {
      throw new Error(`connexion ratée : ${back.status} ${back.headers.get('location')}`)
    }
    return session.split(';')[0]
  }

  return {
    app, db, google, request, login, config,
    close: () => new Promise(resolve => {
      server.close(() => { db.close(); resolve() })
      server.closeAllConnections()
    }),
  }
}
