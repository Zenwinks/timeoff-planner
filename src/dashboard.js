// Ce que montre le tableau de bord, tiré des soldes de useBalance : les mois
// avec leurs deux soldes, les congés d'un seul tenant, le prochain congé, les
// jours en attente. Des fonctions pures : tests/dashboard.test.js les vérifie.

import { CONFIRMED_STATUSES } from './constants.js'
import { formatDate, groupEntries } from './composables/useBalance.js'

const monthIndex = (year, month) => year * 12 + month

/**
 * Les mois du récap, chacun avec ses deux soldes : `forecast` (prévisionnel,
 * tous les jours posés décomptés) et `confirmed` (acceptés et imposés
 * seulement). Les deux récaps couvrent les mêmes mois, dans le même ordre.
 */
export function mergeRecaps(forecast, confirmed, now = new Date()) {
  const current = monthIndex(now.getFullYear(), now.getMonth() + 1)
  return forecast.map((row, i) => ({
    key: `${row.year}-${row.month}`,
    label: row.label,
    year: row.year,
    month: row.month,
    isCurrent: row.isCurrent,
    isPast: monthIndex(row.year, row.month) < current,
    groups: row.groups,
    forecast: balances(row),
    confirmed: balances(confirmed[i]),
  }))
}

function balances(row) {
  return { cp: row.cp, rtt: row.rtt, total: row.total, rttDecemberWarning: row.rttDecemberWarning }
}

/**
 * Les congés d'un seul tenant : des jours ouvrés qui se suivent, de même type,
 * statut et durée, d'un mois sur l'autre. Une puce du récap n'en montre que la
 * part d'un mois ; la période entière est ce qu'on modifie ou supprime.
 */
export function periodsOf(entries) {
  return groupEntries(entries).map(period => ({ ...period, days: period.entries.reduce((n, e) => n + (Number(e.duration) || 1), 0) }))
}

/** La période qui contient ce jour posé (son identifiant). */
export function periodOf(periods, entryId) {
  return periods.find(p => p.entries.some(e => e.id === entryId)) ?? null
}

/** Le congé en cours, ou sinon le prochain. `today` : AAAA-MM-JJ. */
export function nextPeriod(periods, today) {
  return periods
    .filter(p => p.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
}

/** Les jours en attente d'ici la fin du récap : brouillons et demandes, à partir d'aujourd'hui. */
export function pendingDays(entries, today) {
  return entries
    .filter(e => !CONFIRMED_STATUSES.has(e.status) && e.date >= today)
    .reduce((n, e) => n + (Number(e.duration) || 1), 0)
}

/** « aujourd'hui », « demain », « dans 12 jours », « en cours ». */
export function whenLabel(period, today) {
  if (period.startDate <= today) return 'en cours'
  const days = Math.round((new Date(`${period.startDate}T00:00`) - new Date(`${today}T00:00`)) / 864e5)
  return days === 1 ? 'demain' : `dans ${days} jours`
}

/**
 * Le mois en cours et la prochaine fin d'année : décembre de cette année, ou
 * de l'an prochain quand on est déjà en décembre.
 */
export function summaryMonths(months, now = new Date()) {
  const current = months.find(m => m.isCurrent) ?? null
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const yearEnd = months.find(m => m.year === year && m.month === 12) ?? null
  return { current, yearEnd }
}

export function today(now = new Date()) {
  return formatDate(now)
}
