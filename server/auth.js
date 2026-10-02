// La connexion : « Se connecter avec Google » en OpenID Connect (flux avec
// code, state, nonce et PKCE), puis une session de 30 jours, prolongée à
// l'usage, dans un cookie HttpOnly, Secure, SameSite=Lax.
//
// Inscription libre : un compte Google inconnu crée un compte à sa première
// connexion. Les comptes repris de Supabase se retrouvent par leur `sub`.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import * as openid from 'openid-client'
import { appendCookie, parseCookies, redirect, sendNoContent, serializeCookie } from './http.js'

const DAY = 24 * 60 * 60 * 1000
const SESSION_MS = 30 * DAY
// La session se prolonge à l'usage, mais au plus une fois par heure : pas une
// écriture en base à chaque requête.
const RENEW_EVERY_MS = 60 * 60 * 1000
// Le temps de passer par l'écran de Google.
const LOGIN_MS = 10 * 60 * 1000

/** Google, découvert à la première connexion puis gardé en mémoire. */
export function createGoogleOidc(config) {
  let configuration
  const discover = () => {
    configuration ??= openid.discovery(new URL('https://accounts.google.com'), config.googleClientId, config.googleClientSecret)
      .catch(error => {
        configuration = undefined
        throw error
      })
    return configuration
  }
  return {
    async authorizationUrl({ state, nonce, codeVerifier }) {
      return openid.buildAuthorizationUrl(await discover(), {
        redirect_uri: config.redirectUri,
        // openid et email seulement : avec ces accès, Google laisse entrer tout
        // compte même quand le client est en « Testing », sans liste de comptes
        // de test. Un accès de plus (Agenda…) réserverait la connexion à ces
        // comptes, jusqu'à publication et vérification de l'app par Google.
        scope: 'openid email',
        state,
        nonce,
        code_challenge: await openid.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).href
    },
    /** Échange le code contre les jetons ; openid-client vérifie state, nonce et jeton d'identité. */
    async exchange(callbackUrl, { state, nonce, codeVerifier }) {
      const tokens = await openid.authorizationCodeGrant(await discover(), callbackUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      })
      return tokens.claims()
    },
  }
}

export function createAuth({ config, store, oidc }) {
  const secure = config.secureCookies
  // __Host- : le navigateur refuse ce cookie s'il n'est pas Secure, sur /, sans domaine.
  const sessionCookie = secure ? '__Host-timeoff_session' : 'timeoff_session'
  const loginCookie = secure ? '__Host-timeoff_login' : 'timeoff_login'
  const sign = value => createHmac('sha256', config.sessionSecret).update(value).digest('base64url')
  const random = () => randomBytes(32).toString('base64url')
  // La base ne garde que l'empreinte du jeton : un vol de la base ne donne
  // aucune session. Changer SESSION_SECRET déconnecte tout le monde.
  const sessionId = token => sign(`session:${token}`)
  const clearCookie = (res, name) => appendCookie(res, serializeCookie(name, '', { maxAge: 0, secure }))

  function openSession(res, userId) {
    const token = random()
    store.createSession(sessionId(token), userId, new Date(Date.now() + SESSION_MS).toISOString())
    appendCookie(res, serializeCookie(sessionCookie, token, { maxAge: SESSION_MS / 1000, secure }))
  }

  /** Le contenu du cookie de connexion en cours, s'il est intact et pas expiré. */
  function pendingLogin(req) {
    const value = parseCookies(req.headers.cookie)[loginCookie] ?? ''
    const [payload, signature] = value.split('.')
    if (!payload || !signature) return null
    const expected = Buffer.from(sign(`login:${payload}`))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
      const login = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      return login.expiresAt > Date.now() ? login : null
    } catch {
      return null
    }
  }

  function failLogin(res, reason, detail) {
    if (detail) console.warn(`[connexion] refusée : ${detail}`)
    redirect(res, `/login?erreur=${reason}`)
  }

  return {
    /**
     * Le compte de la session, ou null. Prolonge la session (base et cookie)
     * quand elle a servi plus d'une heure après sa dernière prolongation.
     */
    currentSession(req, res) {
      if (config.loginProblem) return null
      const token = parseCookies(req.headers.cookie)[sessionCookie]
      if (!token || token.length > 100) return null
      const id = sessionId(token)
      const session = store.getSession(id)
      const user = session && store.getUser(session.user_id)
      if (!user) return null
      if (Date.parse(session.expires_at) - Date.now() < SESSION_MS - RENEW_EVERY_MS) {
        store.extendSession(id, new Date(Date.now() + SESSION_MS).toISOString())
        appendCookie(res, serializeCookie(sessionCookie, token, { maxAge: SESSION_MS / 1000, secure }))
      }
      return { id, user }
    },

    /** GET /auth/google : part chez Google, avec de quoi vérifier son retour. */
    async startLogin(req, res) {
      if (config.loginProblem) return failLogin(res, 'fermee', config.loginProblem)
      const login = { state: random(), nonce: random(), codeVerifier: random(), expiresAt: Date.now() + LOGIN_MS }
      let url
      try {
        url = await oidc.authorizationUrl(login)
      } catch (error) {
        return failLogin(res, 'echec', `Google injoignable (${error.message})`)
      }
      const payload = Buffer.from(JSON.stringify(login)).toString('base64url')
      appendCookie(res, serializeCookie(loginCookie, `${payload}.${sign(`login:${payload}`)}`, { maxAge: LOGIN_MS / 1000, secure }))
      redirect(res, url)
    },

    /** GET /auth/callback : le retour de Google. */
    async finishLogin(req, res) {
      clearCookie(res, loginCookie)
      if (config.loginProblem) return failLogin(res, 'fermee', config.loginProblem)
      const url = new URL(req.url, config.origin)
      if (url.searchParams.get('error') === 'access_denied') return failLogin(res, 'annulee')
      const login = pendingLogin(req)
      if (!login || url.searchParams.get('state') !== login.state) {
        return failLogin(res, 'echec', 'retour de Google sans connexion en cours (state absent, expiré ou différent)')
      }
      let claims
      try {
        claims = await oidc.exchange(url, login)
      } catch (error) {
        return failLogin(res, 'echec', `échange du code refusé (${error.message})`)
      }
      if (typeof claims?.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') {
        return failLogin(res, 'echec', 'jeton d\'identité sans sub ou sans e-mail')
      }
      const { user, created } = store.loginWithGoogle({ sub: claims.sub, email: claims.email })
      openSession(res, user.id)
      console.log(`[connexion] compte ${user.id}${created ? ' créé' : ''}`)
      redirect(res, '/')
    },

    /** POST /auth/logout : ferme la session de cet appareil. */
    logout(req, res) {
      const token = parseCookies(req.headers.cookie)[sessionCookie]
      if (token && !config.loginProblem) store.deleteSession(sessionId(token))
      clearCookie(res, sessionCookie)
      sendNoContent(res)
    },

    clearSession(res) {
      clearCookie(res, sessionCookie)
    },
  }
}
