// La validation de ce que l'app envoie. Un champ inconnu est refusé, `user_id`
// compris : le compte est toujours celui de la session, jamais celui du corps.

import { HttpError } from './http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DAYS = 400

const bad = message => new HttpError(400, message)

export const isUuid = value => typeof value === 'string' && UUID.test(value)

function fields(value, keys, what, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(`${what} : un objet est attendu.`)
  const unknown = Object.keys(value).find(k => !keys.includes(k) && !optional.includes(k))
  if (unknown) throw bad(`${what} : champ inconnu « ${unknown} ».`)
  const missing = keys.find(k => !(k in value))
  if (missing) throw bad(`${what} : le champ « ${missing} » manque.`)
  return value
}

function number(value, name, { min, max, integer = false }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min || value > max) {
    throw bad(`« ${name} » doit être un nombre${integer ? ' entier' : ''} entre ${min} et ${max}.`)
  }
  return value
}

function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) throw bad(`« ${name} » doit valoir ${allowed.join(', ')}.`)
  return value
}

/** Une vraie date du calendrier, au format AAAA-MM-JJ. */
function day(value, name) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
  if (!date || date.toISOString().slice(0, 10) !== value) throw bad(`« ${name} » doit être une date AAAA-MM-JJ.`)
  return value
}

/**
 * Les paramètres, et en option la liste complète des RTT par année
 * (`yearly_rtt`) : elle remplace alors celle du compte, d'un seul coup.
 */
export function settingsInput(body) {
  const s = fields(body, ['start_year', 'initial_conges', 'initial_rtt', 'conges_increment_per_month', 'journee_solidarite'], 'Paramètres', ['yearly_rtt'])
  if (s.journee_solidarite !== null && !(typeof s.journee_solidarite === 'string' && /^[a-z0-9_]{1,40}$/.test(s.journee_solidarite))) {
    throw bad('« journee_solidarite » doit être un jour férié, ou null.')
  }
  let yearlyRtt
  if ('yearly_rtt' in s) {
    if (!Array.isArray(s.yearly_rtt) || s.yearly_rtt.length > 100) throw bad('« yearly_rtt » doit lister au plus 100 années.')
    yearlyRtt = s.yearly_rtt.map(yearlyRttInput)
    if (new Set(yearlyRtt.map(r => r.year)).size !== yearlyRtt.length) throw bad('« yearly_rtt » : chaque année une seule fois.')
  }
  return {
    settings: {
      start_year: number(s.start_year, 'start_year', { min: 2000, max: 2100, integer: true }),
      initial_conges: number(s.initial_conges, 'initial_conges', { min: -1000, max: 1000 }),
      initial_rtt: number(s.initial_rtt, 'initial_rtt', { min: -1000, max: 1000 }),
      conges_increment_per_month: number(s.conges_increment_per_month, 'conges_increment_per_month', { min: -1000, max: 1000 }),
      journee_solidarite: s.journee_solidarite,
    },
    yearlyRtt,
  }
}

export function yearlyRttInput(body) {
  const r = fields(body, ['year', 'rtt_count'], 'RTT de l\'année')
  return {
    year: number(r.year, 'year', { min: 2000, max: 2100, integer: true }),
    rtt_count: number(r.rtt_count, 'rtt_count', { min: -1000, max: 1000 }),
  }
}

export function yearlyRttPatchInput(body) {
  const r = fields(body, ['rtt_count'], 'RTT de l\'année')
  return { rtt_count: number(r.rtt_count, 'rtt_count', { min: -1000, max: 1000 }) }
}

export function entriesInput(body) {
  const { entries } = fields(body, ['entries'], 'Jours posés')
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_DAYS) {
    throw bad(`« entries » doit lister de 1 à ${MAX_DAYS} jours.`)
  }
  return entries.map(entry => {
    const e = fields(entry, ['date', 'type', 'status', 'duration'], 'Jour posé')
    return {
      date: day(e.date, 'date'),
      type: oneOf(e.type, 'type', ['conge', 'rtt']),
      status: oneOf(e.status, 'status', ['brouillon', 'demande', 'accepte', 'impose']),
      duration: number(e.duration, 'duration', { min: 0.5, max: 1 }),
    }
  })
}

function entryIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DAYS || !ids.every(isUuid)) {
    throw bad(`« ids » doit lister de 1 à ${MAX_DAYS} identifiants.`)
  }
  return ids
}

export function entryIdsInput(body) {
  return entryIds(fields(body, ['ids'], 'Jours à retirer').ids)
}

/** Un congé modifié : les jours qu'il avait (`ids`), et ceux qu'il a maintenant (`entries`). */
export function entriesReplaceInput(body) {
  const { ids, entries } = fields(body, ['ids', 'entries'], 'Congé modifié')
  return { ids: entryIds(ids), entries: entriesInput({ entries }) }
}
