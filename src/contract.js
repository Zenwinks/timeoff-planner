// Le contrat d'un compte, et ce qu'il change aux RTT et aux jours travaillés.
//
// Contrat horaire : les RTT de chaque année se saisissent dans les Paramètres,
// ou il n'y en a pas. Forfait jours : les RTT se déduisent des jours à
// travailler, et l'app compte les jours travaillés de l'année pour prévenir
// d'un dépassement. Des fonctions pures : tests/contract.test.js les vérifie.

import { holidayChecker, workedSolidarityDay } from '../shared/holidays.js'
import { formatDate } from '../shared/periods.js'

export const isForfait = settings => settings?.contrat === 'forfait_jours' && Number(settings?.forfait_jours) > 0

/** Le compte a-t-il des RTT ? Toujours au forfait ; au contrat horaire, sauf « pas de RTT ». */
export const hasRtt = settings => isForfait(settings) || (!!settings && settings.rtt_mode !== 'aucun')

/** Les jours ouvrés d'une année : du lundi au vendredi, sans les fériés chômés. */
export function workingDaysOf(year, isHoliday) {
  const days = []
  for (const d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const date = formatDate(d)
    if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(date)) days.push(date)
  }
  return days
}

/** Les CP d'une année pleine : douze mois d'acquisition, arrondis au jour (12 × 2,08 → 25). */
export const cpPerYear = settings => Math.round(12 * (Number(settings.conges_increment_per_month) || 0))

/**
 * Les RTT d'une année au forfait : ses jours ouvrés, moins les CP, moins les
 * jours à travailler. En 2026, avec 25 CP et un forfait de 218 jours :
 * 253 − 25 − 218 = 10 si le lundi de Pentecôte est travaillé ; 9 s'il est
 * retiré des RTT, puisqu'il reste alors chômé (252 jours ouvrés).
 */
export function forfaitRtt(settings, year) {
  const working = workingDaysOf(year, holidayChecker(workedSolidarityDay(settings))).length
  const cp = cpPerYear(settings)
  const forfait = Number(settings.forfait_jours)
  return { year, working, cp, forfait, rtt: Math.max(0, working - cp - forfait) }
}

/** Les années que couvrent les soldes : de l'année de départ à l'an prochain. */
export function balanceYears(settings, now = new Date()) {
  const from = Number(settings.start_year)
  const to = Math.max(from + 1, now.getFullYear() + 1)
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * Les RTT de chaque année que comptent les soldes. Contrat horaire : ceux
 * saisis, ou aucun sans RTT. Forfait : ceux qu'il donne, sauf une année
 * corrigée à la main (une ligne de `yearlyRtt`).
 */
export function effectiveYearlyRtt(settings, yearlyRtt, now = new Date()) {
  if (!settings || !hasRtt(settings)) return []
  if (!isForfait(settings)) return yearlyRtt
  return balanceYears(settings, now).map(year => {
    const set = yearlyRtt.find(r => Number(r.year) === year)
    return { year, rtt_count: set ? Number(set.rtt_count) : forfaitRtt(settings, year).rtt }
  })
}

/**
 * Au forfait, les jours travaillés d'une année : ses jours ouvrés, moins les
 * jours posés (CP, RTT, arrêts maladie). Ceux de `entries` seulement : au
 * solde confirmé, l'appelant ne garde que les jours acquis. `today`
 * (AAAA-MM-JJ) : le compte à ce jour, à comparer à celui d'un outil RH.
 */
export function workedDays(settings, entries, year, today) {
  const working = workingDaysOf(year, holidayChecker(workedSolidarityDay(settings)))
  const isWorking = new Set(working)
  const off = { conge: 0, rtt: 0, maladie: 0 }
  let offToDate = 0
  for (const e of entries) {
    if (!isWorking.has(e.date)) continue
    const days = Number(e.duration) || 1
    off[e.type] += days
    if (e.date <= today) offToDate += days
  }
  const worked = working.length - off.conge - off.rtt - off.maladie
  const forfait = Number(settings.forfait_jours)
  return {
    year,
    forfait,
    working: working.length,
    cp: off.conge,
    rtt: off.rtt,
    sick: off.maladie,
    worked,
    workedToDate: working.filter(d => d <= today).length - offToDate,
    // Les jours à poser d'ici le 31 décembre pour ne pas dépasser le forfait.
    over: Math.max(0, worked - forfait),
  }
}
