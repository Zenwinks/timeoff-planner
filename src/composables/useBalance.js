import { computed } from 'vue'
import { isHoliday } from '../holidays'
import { monthNames } from '../constants'

export function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getWorkingDaysInRange(startDate, endDate) {
  const days = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    const dow = current.getDay()
    const dateStr = formatDate(current)
    if (dow !== 0 && dow !== 6 && !isHoliday(dateStr)) {
      days.push(dateStr)
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}

function isNextWorkingDay(dateStrA, dateStrB) {
  const a = new Date(dateStrA + 'T00:00')
  const b = new Date(dateStrB + 'T00:00')
  const next = new Date(a)
  next.setDate(next.getDate() + 1)
  while (next.getDay() === 0 || next.getDay() === 6 || isHoliday(formatDate(next))) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime() === b.getTime()
}

export function groupEntries(monthEntries) {
  if (monthEntries.length === 0) return []

  const sorted = [...monthEntries].sort((a, b) => a.date.localeCompare(b.date))
  const groups = []
  let currentGroup = null

  for (const entry of sorted) {
    if (currentGroup && entry.type === currentGroup.type && entry.status === currentGroup.status && entry.duration === currentGroup.duration && isNextWorkingDay(currentGroup.endDate, entry.date)) {
      currentGroup.entries.push(entry)
      currentGroup.endDate = entry.date
      currentGroup.endDay = new Date(entry.date + 'T00:00').getDate()
    } else {
      currentGroup = {
        type: entry.type,
        status: entry.status,
        duration: entry.duration,
        startDate: entry.date,
        endDate: entry.date,
        startDay: new Date(entry.date + 'T00:00').getDate(),
        endDay: new Date(entry.date + 'T00:00').getDate(),
        entries: [entry],
      }
      groups.push(currentGroup)
    }
  }

  return groups
}

function computeBalances(settings, yearlyRtt, entries) {
  const s = settings
  const startYear = Number(s.start_year)
  const startAbs = startYear * 12
  const now = new Date()
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  const endAbs = Math.max(startAbs + 23, nowAbs + 12)

  let cpBalance = Number(s.initial_conges) || 0
  let rttBalance = Number(s.initial_rtt) || 0
  const cpIncrement = Number(s.conges_increment_per_month) || 0
  const rows = []

  for (let abs = startAbs; abs <= endAbs; abs++) {
    const year = Math.floor(abs / 12)
    const month = abs % 12

    cpBalance += cpIncrement

    if (month === 0) {
      const rttForYear = yearlyRtt.find(r => Number(r.year) === year)
      if (rttForYear) {
        rttBalance += Number(rttForYear.rtt_count) || 0
      }
    }

    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    const monthEntries = entries.filter(e => e.date.startsWith(monthStr))
    const cpUsed = monthEntries.filter(e => e.type === 'conge').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)
    const rttUsed = monthEntries.filter(e => e.type === 'rtt').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)

    cpBalance -= cpUsed
    rttBalance -= rttUsed

    rows.push({ year, month, cpBalance, rttBalance, cpUsed, rttUsed, monthEntries })
  }

  return rows
}

export function useBalance(settings, yearlyRtt, allEntries) {
  const monthlyRecap = computed(() => {
    if (!settings.value) return []

    const balances = computeBalances(settings.value, yearlyRtt.value, allEntries.value)
    const now = new Date()

    return balances.map(row => {
      const isCurrent = row.year === now.getFullYear() && row.month === now.getMonth()
      const entryGroups = groupEntries(row.monthEntries)

      return {
        label: `${monthNames[row.month]} ${row.year}`,
        year: row.year,
        month: row.month + 1,
        total: Math.round((row.cpBalance + row.rttBalance) * 100) / 100,
        cp: Math.round(row.cpBalance * 100) / 100,
        cpUsed: row.cpUsed,
        rtt: Math.round(row.rttBalance * 100) / 100,
        rttUsed: row.rttUsed,
        isCurrent,
        groups: entryGroups,
      }
    })
  })

  function checkNegativeBalance(formDateRange, formType, formDuration, formStatus) {
    if (!formDateRange || !settings.value) return []

    const range = formDateRange
    const startDate = Array.isArray(range) ? range[0] : range
    const endDate = Array.isArray(range) ? range[1] : range
    const workingDays = getWorkingDaysInRange(startDate, endDate)
    const duration = Number(formDuration)
    const type = formType

    const existingDates = new Set(allEntries.value.map(e => e.date))
    const newDays = workingDays.filter(d => !existingDates.has(d))
    if (newDays.length === 0) return []

    const simEntries = [
      ...allEntries.value,
      ...newDays.map(date => ({ date, type, duration, status: formStatus })),
    ]

    const balances = computeBalances(settings.value, yearlyRtt.value, simEntries)
    const warnings = []

    for (const row of balances) {
      const label = `${monthNames[row.month]} ${row.year}`
      if (row.cpBalance < 0) warnings.push(`CP en négatif sur ${label} (${Math.round(row.cpBalance * 100) / 100})`)
      if (row.rttBalance < 0) warnings.push(`RTT en négatif sur ${label} (${Math.round(row.rttBalance * 100) / 100})`)
    }

    return warnings
  }

  return { monthlyRecap, checkNegativeBalance }
}
