// Le cloisonnement entre comptes, qui remplace la RLS de Supabase. L'inscription
// est libre : n'importe qui peut avoir un compte, donc chaque tentative d'un
// compte sur les données d'un autre doit échouer, et ne rien changer.

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startTestServer } from './helpers.js'

const ALICE_SETTINGS = { start_year: 2026, initial_conges: 11.59, initial_rtt: 0.32, conges_increment_per_month: 2.08, journee_solidarite: 'lundi_pentecote' }
const BOB_SETTINGS = { start_year: 2026, initial_conges: 5, initial_rtt: 0, conges_increment_per_month: 2.08, journee_solidarite: null }

describe('cloisonnement entre comptes', () => {
  let t, alice, bob
  let aliceEntries, aliceRtt, bobEntries

  /** L'état complet des données d'Alice, lu avec sa propre session. */
  const aliceData = async () => ({
    settings: (await t.request('GET', '/api/settings', { cookie: alice })).json,
    rtt: (await t.request('GET', '/api/yearly-rtt', { cookie: alice })).json,
    entries: (await t.request('GET', '/api/entries', { cookie: alice })).json,
  })

  before(async () => {
    t = await startTestServer()
    alice = await t.login({ sub: 'google-alice' })
    bob = await t.login({ sub: 'google-bob' })

    await t.request('PUT', '/api/settings', { cookie: alice, body: ALICE_SETTINGS })
    aliceRtt = [
      (await t.request('POST', '/api/yearly-rtt', { cookie: alice, body: { year: 2026, rtt_count: 10 } })).json,
      (await t.request('POST', '/api/yearly-rtt', { cookie: alice, body: { year: 2027, rtt_count: 9 } })).json,
    ]
    aliceEntries = (await t.request('POST', '/api/entries', { cookie: alice, body: { entries: [
      { date: '2026-03-02', type: 'conge', status: 'accepte', duration: 1 },
      { date: '2026-03-03', type: 'conge', status: 'accepte', duration: 1 },
      { date: '2026-05-15', type: 'rtt', status: 'demande', duration: 0.5 },
    ] } })).json

    await t.request('PUT', '/api/settings', { cookie: bob, body: BOB_SETTINGS })
    bobEntries = (await t.request('POST', '/api/entries', { cookie: bob, body: { entries: [
      { date: '2026-04-06', type: 'rtt', status: 'brouillon', duration: 1 },
    ] } })).json
  })
  after(() => t.close())

  test('le jeu de départ est bien en place', async () => {
    const data = await aliceData()
    assert.equal(data.entries.length, 3)
    assert.equal(data.rtt.length, 2)
    assert.equal(data.settings.initial_conges, 11.59)
    assert.equal(bobEntries.length, 1)
  })

  test('chaque compte ne lit que ses propres données', async () => {
    const settings = (await t.request('GET', '/api/settings', { cookie: bob })).json
    assert.equal(settings.initial_conges, BOB_SETTINGS.initial_conges)

    const entries = (await t.request('GET', '/api/entries', { cookie: bob })).json
    assert.deepEqual(entries.map(e => e.id), bobEntries.map(e => e.id))

    const rtt = (await t.request('GET', '/api/yearly-rtt', { cookie: bob })).json
    assert.deepEqual(rtt, [])
  })

  test('modifier les RTT d\'un autre compte échoue, sans rien changer', async () => {
    const before = await aliceData()
    const res = await t.request('PATCH', `/api/yearly-rtt/${aliceRtt[0].id}`, { cookie: bob, body: { rtt_count: 99 } })
    assert.equal(res.status, 404)
    assert.deepEqual(await aliceData(), before)
  })

  test('supprimer les RTT d\'un autre compte échoue, sans rien changer', async () => {
    const before = await aliceData()
    const res = await t.request('DELETE', `/api/yearly-rtt/${aliceRtt[1].id}`, { cookie: bob })
    assert.equal(res.status, 404)
    assert.deepEqual(await aliceData(), before)
  })

  test('supprimer les jours d\'un autre compte échoue, sans rien changer', async () => {
    const before = await aliceData()
    const res = await t.request('DELETE', '/api/entries', { cookie: bob, body: { ids: [aliceEntries[0].id] } })
    assert.equal(res.status, 404)
    assert.deepEqual(await aliceData(), before)
  })

  test('mêler un jour d\'un autre compte aux siens fait tout échouer : rien n\'est supprimé', async () => {
    const before = await aliceData()
    const res = await t.request('DELETE', '/api/entries', { cookie: bob, body: { ids: [bobEntries[0].id, aliceEntries[1].id] } })
    assert.equal(res.status, 404)
    assert.deepEqual(await aliceData(), before)
    const bobs = (await t.request('GET', '/api/entries', { cookie: bob })).json
    assert.equal(bobs.length, 1, 'le jour de Bob est toujours là')
  })

  test('écrire au nom d\'un autre compte (user_id dans le corps) est refusé', async () => {
    const before = await aliceData()
    const aliceId = before.settings.user_id

    const entry = await t.request('POST', '/api/entries', { cookie: bob, body: { entries: [
      { user_id: aliceId, date: '2026-06-01', type: 'conge', status: 'accepte', duration: 1 },
    ] } })
    assert.equal(entry.status, 400)

    const rtt = await t.request('POST', '/api/yearly-rtt', { cookie: bob, body: { user_id: aliceId, year: 2028, rtt_count: 9 } })
    assert.equal(rtt.status, 400)

    const settings = await t.request('PUT', '/api/settings', { cookie: bob, body: { ...BOB_SETTINGS, user_id: aliceId } })
    assert.equal(settings.status, 400)

    assert.deepEqual(await aliceData(), before)
  })

  test('les écritures d\'un compte n\'atteignent jamais un autre', async () => {
    const before = await aliceData()
    // Même date qu'un jour d'Alice : permis, chaque compte a son calendrier.
    const res = await t.request('POST', '/api/entries', { cookie: bob, body: { entries: [
      { date: '2026-03-02', type: 'rtt', status: 'brouillon', duration: 1 },
    ] } })
    assert.equal(res.status, 201)
    assert.equal(res.json[0].user_id, (await t.request('GET', '/api/me', { cookie: bob })).json.id)
    await t.request('PUT', '/api/settings', { cookie: bob, body: { ...BOB_SETTINGS, initial_conges: 42 } })
    await t.request('POST', '/api/yearly-rtt', { cookie: bob, body: { year: 2026, rtt_count: 3 } })
    assert.deepEqual(await aliceData(), before)
  })

  test('une session ne s\'invente pas : jeton inconnu ou empreinte volée en base', async () => {
    const stored = t.db.prepare('select id from sessions').pluck().all()
    for (const token of ['nimportequoi', ...stored]) {
      const res = await t.request('GET', '/api/entries', { cookie: `__Host-timeoff_session=${token}` })
      assert.equal(res.status, 401, `jeton ${token.slice(0, 8)}… refusé`)
    }
  })

  test('sans session, toute route protégée répond 401', async () => {
    for (const route of t.app.routes.filter(r => !r.public)) {
      const path = route.path.replace(':id', aliceRtt[0].id)
      const res = await t.request(route.method, path, { body: route.method === 'GET' ? undefined : {} })
      assert.equal(res.status, 401, `${route.method} ${route.path}`)
    }
  })

  test('modifier un congé avec les jours d’un autre compte échoue, sans rien changer', async () => {
    const before = await aliceData()
    const res = await t.request('POST', '/api/entries/replace', { cookie: bob, body: {
      ids: [aliceEntries[0].id],
      entries: [{ date: '2026-06-01', type: 'conge', status: 'accepte', duration: 1 }],
    } })
    assert.equal(res.status, 404)
    assert.deepEqual(await aliceData(), before)
    const bobs = (await t.request('GET', '/api/entries', { cookie: bob })).json
    assert.ok(!bobs.some(e => e.date === '2026-06-01'), 'rien n’a été posé pour Bob non plus')
  })

  test('changer le statut des jours d’un autre compte échoue, sans rien changer', async () => {
    const before = await aliceData()
    const alone = await t.request('PATCH', '/api/entries', { cookie: bob, body: { ids: [aliceEntries[0].id], status: 'brouillon' } })
    assert.equal(alone.status, 404)
    const mixed = await t.request('PATCH', '/api/entries', { cookie: bob, body: { ids: [bobEntries[0].id, aliceEntries[1].id], status: 'impose' } })
    assert.equal(mixed.status, 404)
    assert.deepEqual(await aliceData(), before)
    const bobs = (await t.request('GET', '/api/entries', { cookie: bob })).json
    assert.equal(bobs.find(e => e.id === bobEntries[0].id).status, 'brouillon', 'le jour de Bob n’a pas bougé non plus')
  })

  test('remplacer ses RTT par année ne touche pas à ceux d’un autre compte', async () => {
    const before = await aliceData()
    const res = await t.request('PUT', '/api/settings', { cookie: bob, body: { ...BOB_SETTINGS, yearly_rtt: [{ year: 2030, rtt_count: 4 }] } })
    assert.equal(res.status, 200)
    assert.deepEqual(await aliceData(), before)
    const bobs = (await t.request('GET', '/api/yearly-rtt', { cookie: bob })).json
    assert.deepEqual(bobs.map(r => [r.year, r.rtt_count]), [[2030, 4]])
  })

  test('supprimer son compte efface toutes ses données, et rien de celles des autres', async () => {
    const before = await aliceData()
    const bobId = (await t.request('GET', '/api/me', { cookie: bob })).json.id

    const res = await t.request('DELETE', '/api/account', { cookie: bob })
    assert.equal(res.status, 204)
    assert.ok(res.cookies.some(c => c.startsWith('__Host-timeoff_session=;') && c.includes('Max-Age=0')), 'cookie effacé')

    for (const table of ['users', 'sessions', 'user_settings', 'yearly_rtt', 'time_off_entries']) {
      const column = table === 'users' ? 'id' : 'user_id'
      assert.equal(t.db.prepare(`select count(*) from ${table} where ${column} = ?`).pluck().get(bobId), 0, `${table} vidée de Bob`)
    }
    assert.equal((await t.request('GET', '/api/me', { cookie: bob })).status, 401, 'sa session ne sert plus')
    assert.deepEqual(await aliceData(), before)
  })
})
