// L'accès à la base. Il remplace la RLS de Supabase : chaque fonction qui touche
// aux données d'un compte prend son identifiant en premier argument, et chaque
// requête le filtre (`where user_id = ?`). Une ligne d'un autre compte est
// introuvable, exactement comme si elle n'existait pas.
//
// Les lignes sortent au format que renvoyait Supabase : mêmes colonnes,
// nombres en nombres, dates en 'AAAA-MM-JJ'.
//
// Les transactions qui écrivent prennent le verrou d'écriture dès le début
// (`.immediate()`, BEGIN IMMEDIATE) : une transaction différée qui lit avant
// d'écrire échoue aussitôt (SQLITE_BUSY) si une autre connexion a écrit entre
// les deux, sans attendre busy_timeout. Le serveur écrit seul en production,
// mais un script ou les tests peuvent ouvrir la base en même temps.

import { randomUUID } from 'node:crypto'
import { HttpError } from './http.js'

const now = () => new Date().toISOString()

function isUniqueViolation(error) {
  return error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
}

export function createStore(db) {
  const sql = {
    userBySub: db.prepare('select * from users where google_sub = ?'),
    userById: db.prepare('select id, email, created_at, last_login_at from users where id = ?'),
    insertUser: db.prepare(`insert into users (id, google_sub, email, created_at, last_login_at)
      values (@id, @google_sub, @email, @created_at, @last_login_at)`),
    touchUser: db.prepare('update users set email = ?, last_login_at = ? where id = ?'),
    deleteUser: db.prepare('delete from users where id = ?'),

    insertSession: db.prepare('insert into sessions (id, user_id, created_at, expires_at) values (?, ?, ?, ?)'),
    sessionById: db.prepare('select * from sessions where id = ? and expires_at > ?'),
    extendSession: db.prepare('update sessions set expires_at = ? where id = ?'),
    deleteSession: db.prepare('delete from sessions where id = ?'),
    purgeSessions: db.prepare('delete from sessions where expires_at <= ?'),

    settings: db.prepare('select * from user_settings where user_id = ?'),
    upsertSettings: db.prepare(`insert into user_settings
        (id, user_id, start_year, initial_conges, initial_rtt, conges_increment_per_month, created_at, updated_at, journee_solidarite)
      values (@id, @user_id, @start_year, @initial_conges, @initial_rtt, @conges_increment_per_month, @now, @now, @journee_solidarite)
      on conflict (user_id) do update set
        start_year = excluded.start_year,
        initial_conges = excluded.initial_conges,
        initial_rtt = excluded.initial_rtt,
        conges_increment_per_month = excluded.conges_increment_per_month,
        journee_solidarite = excluded.journee_solidarite,
        updated_at = excluded.updated_at`),

    yearlyRtt: db.prepare('select * from yearly_rtt where user_id = ? order by year'),
    yearlyRttById: db.prepare('select * from yearly_rtt where user_id = ? and id = ?'),
    insertYearlyRtt: db.prepare('insert into yearly_rtt (id, user_id, year, rtt_count, created_at) values (?, ?, ?, ?, ?)'),
    upsertYearlyRtt: db.prepare(`insert into yearly_rtt (id, user_id, year, rtt_count, created_at) values (?, ?, ?, ?, ?)
      on conflict (user_id, year) do update set rtt_count = excluded.rtt_count`),
    deleteOtherYearlyRtt: db.prepare('delete from yearly_rtt where user_id = ? and year not in (select value from json_each(?))'),
    updateYearlyRtt: db.prepare('update yearly_rtt set rtt_count = ? where user_id = ? and id = ?'),
    deleteYearlyRtt: db.prepare('delete from yearly_rtt where user_id = ? and id = ?'),

    calendarFeed: db.prepare('select created_at from calendar_feeds where user_id = ?'),
    upsertCalendarFeed: db.prepare(`insert into calendar_feeds (user_id, token_hash, created_at) values (?, ?, ?)
      on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = excluded.created_at`),
    deleteCalendarFeed: db.prepare('delete from calendar_feeds where user_id = ?'),
    calendarFeedOwner: db.prepare('select user_id from calendar_feeds where token_hash = ?').pluck(),

    entries: db.prepare('select * from time_off_entries where user_id = ? order by date'),
    insertEntry: db.prepare(`insert into time_off_entries (id, user_id, date, type, status, created_at, updated_at, duration, half_day)
      values (@id, @user_id, @date, @type, @status, @now, @now, @duration, @half_day)`),
    entryById: db.prepare('select * from time_off_entries where user_id = ? and id = ?'),
    countOwnEntries: db.prepare('select count(*) from time_off_entries where user_id = ? and id in (select value from json_each(?))').pluck(),
    setOwnEntriesStatus: db.prepare('update time_off_entries set status = ?, updated_at = ? where user_id = ? and id in (select value from json_each(?))'),
    ownEntries: db.prepare('select * from time_off_entries where user_id = ? and id in (select value from json_each(?)) order by date'),
    deleteOwnEntries: db.prepare('delete from time_off_entries where user_id = ? and id in (select value from json_each(?))'),
  }

  return {
    // ── Comptes ────────────────────────────────────────────────────────────
    /** Le compte de cet identifiant Google, créé à sa première connexion. */
    loginWithGoogle({ sub, email }) {
      return db.transaction(() => {
        const at = now()
        const existing = sql.userBySub.get(sub)
        if (existing) {
          sql.touchUser.run(email, at, existing.id)
          return { user: sql.userById.get(existing.id), created: false }
        }
        const id = randomUUID()
        sql.insertUser.run({ id, google_sub: sub, email, created_at: at, last_login_at: at })
        return { user: sql.userById.get(id), created: true }
      }).immediate()
    },

    getUser(userId) {
      return sql.userById.get(userId) ?? null
    },

    /** Supprime le compte et, en cascade, ses paramètres, RTT, congés et sessions. */
    deleteAccount(userId) {
      return sql.deleteUser.run(userId).changes === 1
    },

    // ── Sessions (par empreinte du jeton) ──────────────────────────────────
    createSession(sessionId, userId, expiresAt) {
      sql.insertSession.run(sessionId, userId, now(), expiresAt)
    },
    /** La session si elle existe et n'a pas expiré. */
    getSession(sessionId) {
      return sql.sessionById.get(sessionId, now()) ?? null
    },
    extendSession(sessionId, expiresAt) {
      sql.extendSession.run(expiresAt, sessionId)
    },
    deleteSession(sessionId) {
      sql.deleteSession.run(sessionId)
    },
    purgeExpiredSessions() {
      return sql.purgeSessions.run(now()).changes
    },

    // ── Le lien d'agenda (par l'empreinte de son jeton) ────────────────────
    getCalendarFeed(userId) {
      return sql.calendarFeed.get(userId) ?? null
    },
    /** Crée le lien du compte, ou le remplace : l'ancien ne mène alors plus nulle part. */
    setCalendarFeed(userId, tokenHash) {
      const at = now()
      sql.upsertCalendarFeed.run(userId, tokenHash, at)
      return { created_at: at }
    },
    deleteCalendarFeed(userId) {
      sql.deleteCalendarFeed.run(userId)
    },
    /** Le compte d'un lien d'agenda, ou null. */
    calendarFeedOwner(tokenHash) {
      return sql.calendarFeedOwner.get(tokenHash) ?? null
    },

    // ── Paramètres ─────────────────────────────────────────────────────────
    getSettings(userId) {
      return sql.settings.get(userId) ?? null
    },
    /**
     * Crée ou remplace les paramètres du compte et, si `yearlyRtt` est donnée,
     * sa liste de RTT par année : tout ou rien. Une année gardée garde sa ligne.
     */
    putSettings(userId, settings, yearlyRtt) {
      return db.transaction(() => {
        const at = now()
        sql.upsertSettings.run({ ...settings, id: randomUUID(), user_id: userId, now: at })
        if (yearlyRtt) {
          for (const { year, rtt_count } of yearlyRtt) sql.upsertYearlyRtt.run(randomUUID(), userId, year, rtt_count, at)
          sql.deleteOtherYearlyRtt.run(userId, JSON.stringify(yearlyRtt.map(r => r.year)))
        }
        return sql.settings.get(userId)
      }).immediate()
    },

    // ── RTT par année ──────────────────────────────────────────────────────
    listYearlyRtt(userId) {
      return sql.yearlyRtt.all(userId)
    },
    addYearlyRtt(userId, { year, rtt_count }) {
      const id = randomUUID()
      try {
        sql.insertYearlyRtt.run(id, userId, year, rtt_count, now())
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(409, `L'année ${year} est déjà configurée.`)
        throw error
      }
      return sql.yearlyRttById.get(userId, id)
    },
    updateYearlyRtt(userId, id, { rtt_count }) {
      if (sql.updateYearlyRtt.run(rtt_count, userId, id).changes === 0) throw new HttpError(404, 'Année introuvable.')
      return sql.yearlyRttById.get(userId, id)
    },
    deleteYearlyRtt(userId, id) {
      if (sql.deleteYearlyRtt.run(userId, id).changes === 0) throw new HttpError(404, 'Année introuvable.')
    },

    // ── Congés et RTT posés ────────────────────────────────────────────────
    listEntries(userId) {
      return sql.entries.all(userId)
    },
    /** Pose des jours, tous ou aucun (une date déjà prise annule l'ensemble). */
    addEntries(userId, entries) {
      return db.transaction(() => insertEntries(userId, entries)).immediate()
    },
    /**
     * Retire des jours, tous ou aucun : si un seul identifiant n'est pas à ce
     * compte (ou n'existe pas), rien n'est supprimé.
     */
    deleteEntries(userId, ids) {
      db.transaction(() => removeEntries(userId, ids)).immediate()
    },
    /**
     * Change le statut de jours posés (« Demandé » devenu « Accepté »…), tous
     * ou aucun : un seul identifiant étranger au compte, et rien ne change.
     */
    setEntriesStatus(userId, ids, status) {
      return db.transaction(() => {
        const unique = JSON.stringify([...new Set(ids)])
        if (sql.countOwnEntries.get(userId, unique) !== new Set(ids).size) throw new HttpError(404, 'Jour introuvable.')
        sql.setOwnEntriesStatus.run(status, now(), userId, unique)
        return sql.ownEntries.all(userId, unique)
      }).immediate()
    },
    /**
     * Modifie un congé : retire ses anciens jours et pose les nouveaux, d'un
     * seul coup. Au moindre refus (jour d'un autre compte, date déjà prise),
     * rien ne change : le congé n'est jamais perdu en route.
     */
    replaceEntries(userId, ids, entries) {
      return db.transaction(() => {
        removeEntries(userId, ids)
        return insertEntries(userId, entries)
      }).immediate()
    },
  }

  function insertEntries(userId, entries) {
    const at = now()
    const ids = entries.map(entry => {
      const id = randomUUID()
      try {
        sql.insertEntry.run({ ...entry, id, user_id: userId, now: at })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(409, `Le ${entry.date} est déjà posé.`)
        throw error
      }
      return id
    })
    return ids.map(id => sql.entryById.get(userId, id))
  }

  function removeEntries(userId, ids) {
    const unique = JSON.stringify([...new Set(ids)])
    if (sql.countOwnEntries.get(userId, unique) !== new Set(ids).size) throw new HttpError(404, 'Jour introuvable.')
    sql.deleteOwnEntries.run(userId, unique)
  }
}
