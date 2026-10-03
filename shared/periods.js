// Les jours posés regroupés en congés d'un seul tenant : des jours ouvrés qui se
// suivent, de même type, statut et durée. Une demi-journée reste seule. Partagé
// par la PWA (les puces, le détail d'un congé) et le serveur (l'agenda).

export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isNextWorkingDay(dateStrA, dateStrB, isHoliday) {
  const next = new Date(dateStrA + 'T00:00')
  next.setDate(next.getDate() + 1)
  while (next.getDay() === 0 || next.getDay() === 6 || isHoliday(formatDate(next))) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime() === new Date(dateStrB + 'T00:00').getTime()
}

/** `isHoliday` : le test des fériés du compte (holidayChecker). */
export function groupPeriods(entries, isHoliday) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const groups = []
  let current = null

  for (const entry of sorted) {
    if (current && entry.type === current.type && entry.status === current.status && entry.duration === current.duration
      && entry.duration !== 0.5 && isNextWorkingDay(current.endDate, entry.date, isHoliday)) {
      current.entries.push(entry)
      current.endDate = entry.date
      current.endDay = new Date(entry.date + 'T00:00').getDate()
    } else {
      current = {
        type: entry.type,
        status: entry.status,
        duration: entry.duration,
        // Le moment d'une demi-journée : 'matin', 'apres-midi', ou null si non précisé.
        halfDay: entry.half_day ?? null,
        startDate: entry.date,
        endDate: entry.date,
        startDay: new Date(entry.date + 'T00:00').getDate(),
        endDay: new Date(entry.date + 'T00:00').getDate(),
        entries: [entry],
      }
      groups.push(current)
    }
  }

  return groups
}
