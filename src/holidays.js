// Les jours fériés pour la PWA : ceux du socle commun (shared/holidays.js),
// selon la journée de solidarité du compte connecté, fixée au chargement de ses
// paramètres (setSolidarite).

import { getFrenchHolidaysMap, HOLIDAY_KEYS, holidayChecker, holidaysOf } from '../shared/holidays.js'

export { getFrenchHolidaysMap, HOLIDAY_KEYS }

// Journée de solidarité exclue (clé du jour férié travaillé)
let solidariteKey = null
let checker = holidayChecker(null)

export function setSolidarite(key) {
  solidariteKey = key || null
  checker = holidayChecker(solidariteKey)
}

/** Les jours fériés de ces années, avec leur nom : les repères du calendrier. */
export function holidaysBetween(fromYear, toYear) {
  return holidaysOf(fromYear, toYear, solidariteKey)
}

export function isHoliday(dateStr) {
  return checker(dateStr)
}

export function isHolidayDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return isHoliday(`${y}-${m}-${d}`)
}
