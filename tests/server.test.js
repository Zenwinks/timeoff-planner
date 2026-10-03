// Le serveur hors cloisonnement : connexion Google, session, portier Origin,
// /healthz, fichiers de la PWA et validation des entrées.

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startTestServer } from './helpers.js'

const THIRTY_DAYS = 30 * 24 * 60 * 60

describe('connexion avec Google', () => {
  let t
  before(async () => { t = await startTestServer() })
  after(() => t.close())

  test('le départ vers Google pose un cookie de connexion signé, de quelques minutes', async () => {
    const res = await t.request('GET', '/auth/google', { origin: null })
    assert.equal(res.status, 302)
    const location = new URL(res.headers.get('location'))
    assert.ok(location.searchParams.get('state').length >= 43)
    const [cookie] = res.cookies
    assert.match(cookie, /^__Host-timeoff_login=[^;]+\.[^;]+;/)
    assert.match(cookie, /Max-Age=600/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /Secure/)
    assert.match(cookie, /SameSite=Lax/)
  })

  test('la session : cookie HttpOnly, Secure, SameSite=Lax, 30 jours', async () => {
    const start = await t.request('GET', '/auth/google', { origin: null })
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const code = t.google.issueCode({ sub: 'google-cookie', email: 'cookie@example.test' })
    const back = await t.request('GET', `/auth/callback?code=${code}&state=${state}`, { origin: null, cookie: start.cookies[0].split(';')[0] })
    const session = back.cookies.find(c => c.startsWith('__Host-timeoff_session='))
    assert.match(session, /Path=\//)
    assert.match(session, new RegExp(`Max-Age=${THIRTY_DAYS}`))
    assert.match(session, /HttpOnly/)
    assert.match(session, /Secure/)
    assert.match(session, /SameSite=Lax/)
    assert.ok(back.cookies.some(c => c.startsWith('__Host-timeoff_login=;') && c.includes('Max-Age=0')), 'cookie de connexion effacé')
  })

  test('un state différent est refusé, sans session', async () => {
    const start = await t.request('GET', '/auth/google', { origin: null })
    const code = t.google.issueCode({ sub: 'google-state', email: 'state@example.test' })
    const back = await t.request('GET', `/auth/callback?code=${code}&state=autre`, { origin: null, cookie: start.cookies[0].split(';')[0] })
    assert.equal(back.headers.get('location'), '/login?erreur=echec')
    assert.ok(!back.cookies.some(c => c.startsWith('__Host-timeoff_session=') && !c.includes('Max-Age=0')))
  })

  test('un retour sans cookie de connexion, ou avec un cookie retouché, est refusé', async () => {
    const start = await t.request('GET', '/auth/google', { origin: null })
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const code = t.google.issueCode({ sub: 'google-cookie-retouche', email: 'x@example.test' })

    const sans = await t.request('GET', `/auth/callback?code=${code}&state=${state}`, { origin: null })
    assert.equal(sans.headers.get('location'), '/login?erreur=echec')

    const [name, value] = start.cookies[0].split(';')[0].split('=')
    const [payload] = value.split('.')
    const forged = `${name}=${payload}.${'A'.repeat(43)}`
    const retouche = await t.request('GET', `/auth/callback?code=${code}&state=${state}`, { origin: null, cookie: forged })
    assert.equal(retouche.headers.get('location'), '/login?erreur=echec')
  })

  test('une connexion annulée chez Google revient à la page de connexion', async () => {
    const res = await t.request('GET', '/auth/callback?error=access_denied', { origin: null })
    assert.equal(res.headers.get('location'), '/login?erreur=annulee')
  })

  test('un compte repris de Supabase se retrouve par son sub Google, avec son UUID', async () => {
    const uuid = '3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f'
    t.db.prepare('insert into users (id, google_sub, email, created_at) values (?, ?, ?, ?)')
      .run(uuid, '109876543210', 'ancienne@example.test', '2026-03-09T20:00:00.000000+00:00')
    const cookie = await t.login({ sub: '109876543210', email: 'nouvelle@example.test' })
    const me = (await t.request('GET', '/api/me', { cookie })).json
    assert.equal(me.id, uuid)
    assert.equal(me.email, 'nouvelle@example.test', 'l\'adresse suit celle de Google')
    assert.equal(t.db.prepare('select count(*) from users where google_sub = ?').pluck().get('109876543210'), 1)
  })

  test('un sub inconnu crée un compte, une seule fois', async () => {
    const first = await t.login({ sub: 'google-nouveau' })
    const second = await t.login({ sub: 'google-nouveau' })
    const a = (await t.request('GET', '/api/me', { cookie: first })).json
    const b = (await t.request('GET', '/api/me', { cookie: second })).json
    assert.equal(a.id, b.id)
    assert.match(a.id, /^[0-9a-f-]{36}$/)
  })

  test('la session se prolonge à l\'usage', async () => {
    const cookie = await t.login({ sub: 'google-prolonge' })
    const token = cookie.split('=')[1]
    // Une session qui a servi pour la dernière fois il y a deux jours.
    t.db.prepare('update sessions set expires_at = ?').run(new Date(Date.now() + 28 * 864e5).toISOString())
    const res = await t.request('GET', '/api/me', { cookie })
    assert.equal(res.status, 200)
    assert.ok(res.cookies.some(c => c.startsWith(`__Host-timeoff_session=${token};`) && c.includes(`Max-Age=${THIRTY_DAYS}`)))
    const expiresAt = Date.parse(t.db.prepare('select max(expires_at) from sessions').pluck().get())
    assert.ok(expiresAt > Date.now() + 29.9 * 864e5)
  })

  test('une session expirée ne sert plus', async () => {
    const cookie = await t.login({ sub: 'google-expire' })
    const me = (await t.request('GET', '/api/me', { cookie })).json
    t.db.prepare('update sessions set expires_at = ? where user_id = ?').run(new Date(Date.now() - 1000).toISOString(), me.id)
    assert.equal((await t.request('GET', '/api/me', { cookie })).status, 401)
  })

  test('la déconnexion ferme la session de l\'appareil', async () => {
    const cookie = await t.login({ sub: 'google-sortie' })
    const res = await t.request('POST', '/auth/logout', { cookie })
    assert.equal(res.status, 204)
    assert.ok(res.cookies.some(c => c.startsWith('__Host-timeoff_session=;') && c.includes('Max-Age=0')))
    assert.equal((await t.request('GET', '/api/me', { cookie })).status, 401)
  })
})

describe('connexion fermée faute de configuration', () => {
  for (const [what, env] of [
    ['sans client Google', { GOOGLE_CLIENT_SECRET: '' }],
    ['avec un secret de session trop court', { SESSION_SECRET: 'court' }],
    ['avec le secret de développement en production', { NODE_ENV: 'production', SESSION_SECRET: 'dev-seulement-et-assez-long-pour-passer' }],
    ['en http en production', { NODE_ENV: 'production', PUBLIC_URL: 'http://timeoff.test' }],
    ['sans PUBLIC_URL en production', { NODE_ENV: 'production', PUBLIC_URL: '' }],
  ]) {
    test(what, async () => {
      const t = await startTestServer(env)
      try {
        assert.ok(t.config.loginProblem)
        const res = await t.request('GET', '/auth/google', { origin: null })
        assert.equal(res.headers.get('location'), '/login?erreur=fermee')
        assert.equal((await t.request('GET', '/healthz')).text, 'ok', 'le reste tourne')
      } finally {
        await t.close()
      }
    })
  }
})

describe('le portier et les fichiers', () => {
  let t, cookie
  before(async () => {
    t = await startTestServer()
    cookie = await t.login({ sub: 'google-portier' })
  })
  after(() => t.close())

  test('/healthz répond ok sans session, et teste la base', async () => {
    const res = await t.request('GET', '/healthz', { origin: null })
    assert.equal(res.status, 200)
    assert.equal(res.text, 'ok')
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  test('une écriture sans Origin, ou d\'une autre origine, est refusée', async () => {
    const body = { start_year: 2026, initial_conges: 25, initial_rtt: 0, conges_increment_per_month: 2.08, journee_solidarite: null }
    assert.equal((await t.request('PUT', '/api/settings', { cookie, body, origin: null })).status, 403)
    assert.equal((await t.request('PUT', '/api/settings', { cookie, body, origin: 'https://evil.test' })).status, 403)
    assert.equal((await t.request('POST', '/auth/logout', { cookie, origin: 'https://evil.test' })).status, 403)
    assert.equal((await t.request('GET', '/api/settings', { cookie })).json, null, 'rien n\'a été écrit')
    assert.equal((await t.request('PUT', '/api/settings', { cookie, body })).status, 200)
  })

  test('les entrées invalides sont refusées', async () => {
    const day = { date: '2026-03-02', type: 'conge', status: 'accepte', duration: 1 }
    for (const entry of [
      { ...day, date: '2026-02-30' },
      { ...day, date: '02/03/2026' },
      { ...day, type: 'maladie' },
      { ...day, status: 'not_requested' },
      { ...day, duration: 2 },
      { ...day, duration: '1' },
      { date: day.date, type: day.type, status: day.status },
    ]) {
      const res = await t.request('POST', '/api/entries', { cookie, body: { entries: [entry] } })
      assert.equal(res.status, 400, JSON.stringify(entry))
    }
    assert.equal((await t.request('POST', '/api/entries', { cookie, body: { entries: [] } })).status, 400)
    assert.equal((await t.request('PATCH', '/api/yearly-rtt/pas-un-uuid', { cookie, body: { rtt_count: 1 } })).status, 404)
    const notJson = await t.request('PUT', '/api/settings', { cookie, body: {}, headers: { 'Content-Type': 'text/plain' } })
    assert.equal(notJson.status, 415)
  })

  test('poser deux fois la même date échoue, et rien n\'est posé', async () => {
    const day = { date: '2026-09-07', type: 'conge', status: 'accepte', duration: 1 }
    assert.equal((await t.request('POST', '/api/entries', { cookie, body: { entries: [day] } })).status, 201)
    const res = await t.request('POST', '/api/entries', { cookie, body: { entries: [{ ...day, date: '2026-09-08' }, day] } })
    assert.equal(res.status, 409)
    const dates = (await t.request('GET', '/api/entries', { cookie })).json.map(e => e.date)
    assert.deepEqual(dates, ['2026-09-07'])
  })

  test('les lignes ont le format que renvoyait Supabase', async () => {
    const [entry] = (await t.request('GET', '/api/entries', { cookie })).json
    assert.deepEqual(Object.keys(entry), ['id', 'user_id', 'date', 'type', 'status', 'created_at', 'updated_at', 'duration'])
    assert.equal(typeof entry.duration, 'number')
    const half = (await t.request('POST', '/api/entries', { cookie, body: { entries: [{ date: '2026-09-09', type: 'rtt', status: 'brouillon', duration: 0.5 }] } })).json[0]
    assert.equal(half.duration, 0.5)
    const rtt = (await t.request('POST', '/api/yearly-rtt', { cookie, body: { year: 2026, rtt_count: 10 } })).json
    assert.deepEqual(Object.keys(rtt), ['id', 'user_id', 'year', 'rtt_count', 'created_at'])
    assert.equal((await t.request('POST', '/api/yearly-rtt', { cookie, body: { year: 2026, rtt_count: 9 } })).status, 409)
  })

  test('règles de cache de la PWA', async () => {
    for (const path of ['/', '/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest']) {
      const res = await t.request('GET', path, { origin: null })
      assert.equal(res.status, 200, path)
      assert.equal(res.headers.get('cache-control'), 'no-cache', path)
    }
    const asset = await t.request('GET', '/assets/index-abc123.js', { origin: null })
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.match(asset.headers.get('content-type'), /^text\/javascript/)
    const manifest = await t.request('GET', '/manifest.webmanifest', { origin: null })
    assert.match(manifest.headers.get('content-type'), /^application\/manifest\+json/)
  })

  test('les routes de l\'app renvoient vers index.html ; un fichier absent, 404', async () => {
    for (const path of ['/settings', '/login', '/confidentialite']) {
      const res = await t.request('GET', path, { origin: null })
      assert.equal(res.status, 200, path)
      assert.match(res.text, /TimeOff Planner/)
      assert.equal(res.headers.get('cache-control'), 'no-cache')
    }
    assert.equal((await t.request('GET', '/assets/absent.js', { origin: null })).status, 404)
    assert.equal((await t.request('GET', '/api/absente', { cookie })).status, 404)
    assert.equal((await t.request('GET', '/auth/absente', { origin: null })).status, 404)
  })

  test('un ETag inchangé donne 304', async () => {
    const first = await t.request('GET', '/sw.js', { origin: null })
    const again = await t.request('GET', '/sw.js', { origin: null, headers: { 'If-None-Match': first.headers.get('etag') } })
    assert.equal(again.status, 304)
  })

  test('pas de sortie du dossier de la PWA', async () => {
    for (const path of ['/..%2fpackage.json', '/%2e%2e/%2e%2e/package.json', '/assets/..%2f..%2fpackage.json']) {
      const res = await t.request('GET', path, { origin: null })
      assert.ok([400, 404].includes(res.status), `${path} → ${res.status}`)
    }
  })

  test('modifier un congé est tout ou rien', async () => {
    const day = { type: 'conge', status: 'accepte', duration: 1 }
    const dates = async () => (await t.request('GET', '/api/entries', { cookie })).json
      .filter(e => e.date.startsWith('2026-11')).map(e => `${e.date} ${e.status}`)
    const [first] = (await t.request('POST', '/api/entries', { cookie, body: { entries: [{ ...day, date: '2026-11-02' }] } })).json
    await t.request('POST', '/api/entries', { cookie, body: { entries: [{ ...day, date: '2026-11-04' }] } })

    // Un des nouveaux jours est déjà posé : refus, et l'ancien jour reste.
    const clash = await t.request('POST', '/api/entries/replace', { cookie, body: {
      ids: [first.id], entries: [{ ...day, date: '2026-11-03' }, { ...day, date: '2026-11-04' }],
    } })
    assert.equal(clash.status, 409)
    assert.deepEqual(await dates(), ['2026-11-02 accepte', '2026-11-04 accepte'])

    const ok = await t.request('POST', '/api/entries/replace', { cookie, body: {
      ids: [first.id], entries: [{ ...day, date: '2026-11-02', status: 'demande' }, { ...day, date: '2026-11-03', status: 'demande' }],
    } })
    assert.equal(ok.status, 200)
    assert.deepEqual(await dates(), ['2026-11-02 demande', '2026-11-03 demande', '2026-11-04 accepte'])
  })

  test('changer le statut d’un congé, tous ses jours d’un coup', async () => {
    const days = ['2026-12-07', '2026-12-08'].map(date => ({ date, type: 'rtt', status: 'demande', duration: 1 }))
    const posted = (await t.request('POST', '/api/entries', { cookie, body: { entries: days } })).json
    const res = await t.request('PATCH', '/api/entries', { cookie, body: { ids: posted.map(e => e.id), status: 'accepte' } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.json.map(e => [e.date, e.status]), [['2026-12-07', 'accepte'], ['2026-12-08', 'accepte']])
    assert.equal((await t.request('PATCH', '/api/entries', { cookie, body: { ids: posted.map(e => e.id), status: 'valide' } })).status, 400)
  })

  test('les paramètres enregistrent la liste des RTT par année d’un seul coup', async () => {
    const settings = { start_year: 2026, initial_conges: 25, initial_rtt: 0, conges_increment_per_month: 2.08, journee_solidarite: null }
    const rtt = async () => (await t.request('GET', '/api/yearly-rtt', { cookie })).json.map(r => [r.year, r.rtt_count])
    const put = body => t.request('PUT', '/api/settings', { cookie, body })

    assert.equal((await put({ ...settings, yearly_rtt: [{ year: 2026, rtt_count: 10 }, { year: 2027, rtt_count: 9 }] })).status, 200)
    assert.deepEqual(await rtt(), [[2026, 10], [2027, 9]])
    const kept = (await t.request('GET', '/api/yearly-rtt', { cookie })).json[0].id

    await put({ ...settings, yearly_rtt: [{ year: 2026, rtt_count: 12 }, { year: 2028, rtt_count: 8 }] })
    assert.deepEqual(await rtt(), [[2026, 12], [2028, 8]])
    assert.equal((await t.request('GET', '/api/yearly-rtt', { cookie })).json[0].id, kept, 'une année gardée garde sa ligne')

    // Sans yearly_rtt, la liste ne bouge pas.
    await put(settings)
    assert.deepEqual(await rtt(), [[2026, 12], [2028, 8]])

    // Une année en double : refus, et rien ne change, paramètres compris.
    const duplicate = await put({ ...settings, initial_conges: 1, yearly_rtt: [{ year: 2026, rtt_count: 1 }, { year: 2026, rtt_count: 2 }] })
    assert.equal(duplicate.status, 400)
    assert.deepEqual(await rtt(), [[2026, 12], [2028, 8]])
    assert.equal((await t.request('GET', '/api/settings', { cookie })).json.initial_conges, 25)
  })

  test('en-têtes de sécurité', async () => {
    const res = await t.request('GET', '/', { origin: null })
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.match(res.headers.get('strict-transport-security'), /max-age=/)
  })
})
