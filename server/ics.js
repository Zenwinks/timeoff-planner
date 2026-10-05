// Les congés d'un compte au format iCalendar (RFC 5545), pour son agenda
// (Google, Outlook, Apple…) : un événement par congé d'un seul tenant, sur des
// journées entières. Brouillons et demandes y sont provisoires (TENTATIVE), les
// congés acceptés ou imposés confirmés (CONFIRMED). Un arrêt maladie, donnée de
// santé, n'y est qu'une « Absence » : le lien peut être partagé.

import { holidayChecker } from '../shared/holidays.js'
import { formatDate, groupPeriods } from '../shared/periods.js'

const TYPES = { conge: 'CP', rtt: 'RTT', maladie: 'Absence' }
const TYPE_NAMES = { conge: 'Congés payés', rtt: 'RTT', maladie: 'Absence' }
const STATUSES = { brouillon: 'brouillon', demande: 'demandé', accepte: 'accepté', impose: 'imposé' }
const HALVES = { matin: 'matin', 'apres-midi': 'après-midi' }

const icsDate = iso => iso.replaceAll('-', '')

function dayAfter(iso) {
  const date = new Date(`${iso}T00:00`)
  date.setDate(date.getDate() + 1)
  return formatDate(date)
}

/** 2026-10-03T02:04:05.678Z → 20261003T020405Z */
const utcStamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Un texte iCalendar : antislash, point-virgule, virgule et retour à la ligne échappés. */
function text(value) {
  return value.replace(/[\\;,]/g, c => `\\${c}`).replace(/\n/g, '\\n')
}

/**
 * Une ligne de 75 octets au plus, la suite sur des lignes qui commencent par
 * une espace (comptée dans les 75). En octets UTF-8 : un « é » en fait deux, et
 * n'est jamais coupé en deux.
 */
export function fold(line) {
  const parts = []
  let current = ''
  for (const char of line) {
    const limit = parts.length ? 74 : 75
    if (Buffer.byteLength(current + char) > limit) {
      parts.push(current)
      current = char
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part, i) => (i ? ` ${part}` : part)).join('\r\n')
}

/**
 * Le calendrier d'un compte. `solidarityKey` : sa journée de solidarité, qui
 * compte pour savoir quels jours ouvrés se suivent. `host` : le domaine de
 * l'app, pour des identifiants d'événements uniques.
 */
export function buildCalendar({ entries, solidarityKey = null, host, now = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimeOff Planner//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Congés et RTT',
    'X-WR-TIMEZONE:Europe/Paris',
    // Un abonnement se relit toutes les six heures, si l'agenda suit l'indication.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]
  for (const period of groupPeriods(entries, holidayChecker(solidarityKey))) {
    const days = period.entries.reduce((n, e) => n + (Number(e.duration) || 1), 0)
    const half = period.duration === 0.5 ? ` · ${HALVES[period.halfDay] ?? 'demi-journée'}` : ''
    const length = period.duration === 0.5 ? 'une demi-journée' : `${days} jour${days > 1 ? 's' : ''} ouvré${days > 1 ? 's' : ''}`
    // Un arrêt maladie n'a pas de statut à suivre.
    const status = period.type === 'maladie' ? null : STATUSES[period.status]
    lines.push(
      'BEGIN:VEVENT',
      `UID:${period.entries[0].id}@${host}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(period.startDate)}`,
      `DTEND;VALUE=DATE:${icsDate(dayAfter(period.endDate))}`,
      `SUMMARY:${text(`${TYPES[period.type]}${half}${status ? ` (${status})` : ''}`)}`,
      `DESCRIPTION:${text(`${TYPE_NAMES[period.type]}, ${length}${status ? `, ${status}` : ''}. Depuis TimeOff Planner.`)}`,
      `CATEGORIES:${text(TYPE_NAMES[period.type])}`,
      `STATUS:${period.status === 'accepte' || period.status === 'impose' ? 'CONFIRMED' : 'TENTATIVE'}`,
      // Un congé ne bloque pas l'agenda pour les autres : c'est une information.
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
