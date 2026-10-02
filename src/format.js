// Les nombres et les dates tels que les lit un utilisateur français.

import { monthNames } from './constants.js'

const days = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Un nombre de jours : « 23,99 », « 0,5 », « -1 ». */
export function formatDays(value) {
  return days.format(value)
}

function dayOfMonth(date) {
  return date.getDate() === 1 ? '1er' : String(date.getDate())
}

/**
 * Une période, pour une phrase : « le 6 mars », « du 27 au 31 juillet »,
 * « du 28 décembre au 1er janvier ». Dates au format AAAA-MM-JJ.
 */
export function formatPeriod(startDate, endDate) {
  const start = new Date(`${startDate}T00:00`)
  const end = new Date(`${endDate}T00:00`)
  const month = date => monthNames[date.getMonth()].toLowerCase()
  if (startDate === endDate) return `le ${dayOfMonth(start)} ${month(start)}`
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `du ${dayOfMonth(start)} au ${dayOfMonth(end)} ${month(end)}`
  }
  return `du ${dayOfMonth(start)} ${month(start)} au ${dayOfMonth(end)} ${month(end)}`
}
