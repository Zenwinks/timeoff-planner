// Le serveur de l'app : la PWA et son API JSON, derrière un portier.
//
// Refus par défaut :
// - toute route demande une session, sauf celles marquées `public` (la
//   connexion et /healthz) : une nouvelle route est protégée sans rien faire ;
// - une requête qui écrit (POST, PUT, PATCH, DELETE) doit venir d'une page de
//   l'app : son en-tête Origin doit être celui de PUBLIC_URL ;
// - chaque route lit et écrit les données du compte de la session, et de lui
//   seul (server/store.js).

import { createAuth, createGoogleOidc } from './auth.js'
import { HttpError, readJson, sendJson, sendNoContent } from './http.js'
import { createStatic } from './static.js'
import { createStore } from './store.js'
import { entriesInput, entryIdsInput, isUuid, settingsInput, yearlyRttInput, yearlyRttPatchInput } from './validation.js'

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export function createApp({ config, db, oidc = createGoogleOidc(config) }) {
  const store = createStore(db)
  const auth = createAuth({ config, store, oidc })
  const serveStatic = createStatic(config.staticDir)

  const idParam = params => {
    if (!isUuid(params.id)) throw new HttpError(404, 'Introuvable.')
    return params.id
  }

  const routes = [
    // ── Publiques ──────────────────────────────────────────────────────────
    { method: 'GET', path: '/healthz', public: true, handler: ({ res }) => {
      // Répond « ok » si le serveur tourne ET si la base répond.
      let ok = false
      try {
        ok = db.prepare('select 1').pluck().get() === 1
      } catch (error) {
        console.error('[healthz] la base ne répond pas :', error.message)
      }
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(ok ? 'ok' : 'base indisponible')
    } },
    { method: 'GET', path: '/auth/google', public: true, handler: ({ req, res }) => auth.startLogin(req, res) },
    { method: 'GET', path: '/auth/callback', public: true, handler: ({ req, res }) => auth.finishLogin(req, res) },
    // Publique pour qu'une session déjà expirée puisse quand même effacer son cookie.
    { method: 'POST', path: '/auth/logout', public: true, handler: ({ req, res }) => auth.logout(req, res) },

    // ── Le compte ──────────────────────────────────────────────────────────
    { method: 'GET', path: '/api/me', handler: ({ res, user }) =>
      sendJson(res, 200, { id: user.id, email: user.email, created_at: user.created_at }) },
    { method: 'DELETE', path: '/api/account', handler: ({ res, user }) => {
      store.deleteAccount(user.id)
      auth.clearSession(res)
      console.log(`[compte] ${user.id} supprimé, avec toutes ses données`)
      sendNoContent(res)
    } },

    // ── Paramètres (user_settings) ─────────────────────────────────────────
    { method: 'GET', path: '/api/settings', handler: ({ res, user }) =>
      sendJson(res, 200, store.getSettings(user.id)) },
    { method: 'PUT', path: '/api/settings', handler: async ({ req, res, user }) =>
      sendJson(res, 200, store.putSettings(user.id, settingsInput(await readJson(req)))) },

    // ── RTT par année (yearly_rtt) ─────────────────────────────────────────
    { method: 'GET', path: '/api/yearly-rtt', handler: ({ res, user }) =>
      sendJson(res, 200, store.listYearlyRtt(user.id)) },
    { method: 'POST', path: '/api/yearly-rtt', handler: async ({ req, res, user }) =>
      sendJson(res, 201, store.addYearlyRtt(user.id, yearlyRttInput(await readJson(req)))) },
    { method: 'PATCH', path: '/api/yearly-rtt/:id', handler: async ({ req, res, user, params }) =>
      sendJson(res, 200, store.updateYearlyRtt(user.id, idParam(params), yearlyRttPatchInput(await readJson(req)))) },
    { method: 'DELETE', path: '/api/yearly-rtt/:id', handler: ({ res, user, params }) => {
      store.deleteYearlyRtt(user.id, idParam(params))
      sendNoContent(res)
    } },

    // ── Congés et RTT posés (time_off_entries) ─────────────────────────────
    { method: 'GET', path: '/api/entries', handler: ({ res, user }) =>
      sendJson(res, 200, store.listEntries(user.id)) },
    { method: 'POST', path: '/api/entries', handler: async ({ req, res, user }) =>
      sendJson(res, 201, store.addEntries(user.id, entriesInput(await readJson(req)))) },
    { method: 'DELETE', path: '/api/entries', handler: async ({ req, res, user }) => {
      store.deleteEntries(user.id, entryIdsInput(await readJson(req)))
      sendNoContent(res)
    } },
  ].map(route => ({
    ...route,
    pattern: new RegExp(`^${route.path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
  }))

  function securityHeaders(res) {
    res.setHeader('Content-Security-Policy', CSP)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  }

  async function handle(req, res) {
    securityHeaders(res)
    try {
      const { pathname } = new URL(req.url, 'http://localhost')

      if (WRITES.has(req.method) && req.headers.origin !== config.origin) {
        throw new HttpError(403, 'Requête refusée : elle ne vient pas d\'une page de l\'app.')
      }

      const matching = routes.filter(r => r.pattern.test(pathname))
      if (matching.length > 0) {
        const route = matching.find(r => r.method === req.method || (req.method === 'HEAD' && r.method === 'GET'))
        if (!route) {
          res.setHeader('Allow', matching.map(r => r.method).join(', '))
          throw new HttpError(405, 'Méthode non autorisée.')
        }
        const session = route.public ? null : auth.currentSession(req, res)
        if (!route.public && !session) throw new HttpError(401, 'Connexion requise.')
        const params = route.pattern.exec(pathname).groups ?? {}
        return await route.handler({ req, res, params, user: session?.user })
      }

      if (/^\/(api|auth)(\/|$)/.test(pathname)) throw new HttpError(404, 'Introuvable.')
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.')
      return serveStatic(req, res, pathname)
    } catch (error) {
      if (res.headersSent) return res.destroy()
      if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message })
      console.error(error)
      sendJson(res, 500, { error: 'Erreur interne du serveur.' })
    }
  }

  return { handle, store, routes }
}
