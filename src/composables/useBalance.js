import { computed } from 'vue'
import { isHoliday } from '../holidays.js'
import { formatDate, groupPeriods } from '../../shared/periods.js'
import { CONFIRMED_STATUSES, monthNames } from '../constants.js'
import { effectiveYearlyRtt } from '../contract.js'
import { formatDays } from '../format.js'

export { formatDate }

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

// Les jours posés d'un mois, ou de toute la période, en congés d'un seul tenant.
export function groupEntries(entries) {
  return groupPeriods(entries, isHoliday)
}

// Un solde ramené au milliardième : douze douzièmes de RTT ne font pas toujours
// un entier exact en virgule flottante, et le report de janvier en dépend.
const settle = value => Math.round(value * 1e9) / 1e9

/**
 * Un solde de CP lu sur une fiche de paie, arrondi au centième : 5,58 pour
 * 5,5833. Quand l'année compte un nombre entier de CP, acquis par douzièmes, et
 * qu'ils se posent par demi-journées, tout solde est un nombre de douzièmes : on
 * retrouve le vrai. Une valeur qui n'est pas l'arrondi d'un douzième reste telle
 * quelle.
 */
export function fromPayslip(balance, perMonth) {
  const perYear = perMonth * 12
  if (perYear <= 0 || Math.abs(perYear - Math.round(perYear)) > 1e-9) return balance
  const twelfths = Math.round(balance * 12) / 12
  return Math.abs(twelfths - balance) < 0.004 ? twelfths : balance
}

function computeBalances(settings, yearlyRtt, entries, now = new Date()) {
  const s = settings
  const startYear = Number(s.start_year)
  const startAbs = startYear * 12
  const nowAbs = now.getFullYear() * 12 + now.getMonth()
  // Jusqu'en décembre : chaque année va à son terme, et ses RTT se jugent au 31.
  const endAbs = Math.floor(Math.max(startAbs + 23, nowAbs + 12) / 12) * 12 + 11

  const cpIncrement = Number(s.conges_increment_per_month) || 0
  let cpBalance = fromPayslip(Number(s.initial_conges) || 0, cpIncrement)
  let rttBalance = Number(s.initial_rtt) || 0
  // Les RTT de l'année : d'un coup en janvier, ou un douzième chaque mois.
  const monthlyRtt = s.rtt_mode === 'mensuel'
  const rows = []

  for (let abs = startAbs; abs <= endAbs; abs++) {
    const year = Math.floor(abs / 12)
    const month = abs % 12
    const rttForYear = Number(yearlyRtt.find(r => Number(r.year) === year)?.rtt_count) || 0

    cpBalance += cpIncrement

    if (month === 0) {
      // Transition décembre → janvier : ne reporter que les décimales, pas le négatif
      const carried = settle(rttBalance)
      rttBalance = carried >= 0 ? settle(carried % 1) : 0
      if (!monthlyRtt) rttBalance += rttForYear
    }
    if (monthlyRtt) rttBalance += rttForYear / 12

    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    const monthEntries = entries.filter(e => e.date.startsWith(monthStr))
    const cpUsed = monthEntries.filter(e => e.type === 'conge').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)
    const rttUsed = monthEntries.filter(e => e.type === 'rtt').reduce((sum, e) => sum + (Number(e.duration) || 1), 0)

    cpBalance -= cpUsed
    rttBalance -= rttUsed

    const rttDecemberWarning = month === 11 && rttBalance >= 1
    rows.push({ year, month, cpBalance, rttBalance, cpUsed, rttUsed, monthEntries, rttDecemberWarning })
  }

  return rows
}

// Le récap mensuel du tableau de bord. `now` fixe le mois courant et l'horizon :
// la sauvegarde et la migration le passent pour comparer les soldes à date égale.
export function buildMonthlyRecap(settings, yearlyRtt, entries, now = new Date()) {
  return computeBalances(settings, yearlyRtt, entries, now).map(row => {
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
      rttDecemberWarning: row.rttDecemberWarning,
    }
  })
}

export function useBalance(settings, yearlyRtt, allEntries) {
  // Les RTT de chaque année que comptent les soldes : ceux saisis, ceux que
  // donne le forfait jours, ou aucun (src/contract.js).
  const rtt = computed(() => effectiveYearlyRtt(settings.value, yearlyRtt.value))

  // Le solde prévisionnel : tous les jours posés sont décomptés.
  const monthlyRecap = computed(() => {
    if (!settings.value) return []
    return buildMonthlyRecap(settings.value, rtt.value, allEntries.value)
  })

  // Le solde confirmé : seuls les jours acceptés ou imposés sont décomptés.
  const confirmedRecap = computed(() => {
    if (!settings.value) return []
    return buildMonthlyRecap(settings.value, rtt.value, allEntries.value.filter(e => CONFIRMED_STATUSES.has(e.status)))
  })

  /**
   * Le solde prévisionnel de fin d'année, avant et après une saisie : ce que
   * montre le formulaire pendant qu'on choisit ses jours. `excludeEntries` :
   * les jours du congé modifié, que la saisie remplace. null tant qu'il n'y a
   * pas de période, ou au-delà de l'horizon du récap.
   */
  function previewYearEnd(formDateRange, formType, formDuration, formStatus, excludeEntries = []) {
    if (!formDateRange || !settings.value) return null
    const [start, end] = Array.isArray(formDateRange) ? formDateRange : [formDateRange, formDateRange]
    if (!start) return null

    const excludeIds = new Set(excludeEntries.map(e => e.id))
    const kept = allEntries.value.filter(e => !excludeIds.has(e.id))
    const taken = new Set(kept.map(e => e.date))
    const newDays = getWorkingDaysInRange(start, end ?? start).filter(d => !taken.has(d))
    const year = (end ?? start).getFullYear()
    const december = entries => computeBalances(settings.value, rtt.value, entries).find(r => r.year === year && r.month === 11)

    const before = december(allEntries.value)
    const after = december([...kept, ...newDays.map(date => ({ date, type: formType, duration: Number(formDuration), status: formStatus }))])
    if (!before || !after) return null
    const round = value => Math.round(value * 100) / 100
    return {
      year,
      cp: { before: round(before.cpBalance), after: round(after.cpBalance) },
      rtt: { before: round(before.rttBalance), after: round(after.rttBalance) },
    }
  }

  function checkNegativeBalance(formDateRange, formType, formDuration, formStatus, excludeEntries = []) {
    if (!formDateRange || !settings.value) return { messages: [], blocking: false }

    const range = formDateRange
    const startDate = Array.isArray(range) ? range[0] : range
    const endDate = Array.isArray(range) ? range[1] : range
    const workingDays = getWorkingDaysInRange(startDate, endDate)
    const duration = Number(formDuration)
    const type = formType

    const excludeIds = new Set(excludeEntries.map(e => e.id))
    const filteredEntries = allEntries.value.filter(e => !excludeIds.has(e.id))
    const existingDates = new Set(filteredEntries.map(e => e.date))
    const newDays = workingDays.filter(d => !existingDates.has(d))
    if (newDays.length === 0) return { messages: ['Toutes les dates sélectionnées sont déjà occupées.'], blocking: true }
    // Un arrêt maladie ne touche à aucun solde.
    if (type === 'maladie') return { messages: [], blocking: false }

    const simEntries = [
      ...filteredEntries,
      ...newDays.map(date => ({ date, type, duration, status: formStatus })),
    ]

    const balances = computeBalances(settings.value, rtt.value, simEntries)
    const warnings = []

    let blocking = false

    for (const row of balances) {
      // « en décembre 2026 » : le mois en minuscule, au fil de la phrase.
      const month = `${monthNames[row.month].toLowerCase()} ${row.year}`
      if (row.cpBalance < 0) warnings.push(`CP en négatif en ${month} (${formatDays(row.cpBalance)})`)
      // Les RTT se jugent au 31 décembre. Acquis au fil des mois, ceux posés
      // d'avance font passer le solde sous zéro en cours d'année, comme sur la
      // fiche de paie ; acquis en janvier, il ne fait que baisser jusqu'en
      // décembre, et le juger là revient au même.
      if (row.month !== 11) continue
      if (row.rttBalance <= -1) {
        warnings.push(`RTT : au 31 décembre ${row.year}, le solde ne peut pas descendre sous -1 ; il serait de ${formatDays(row.rttBalance)}`)
        blocking = true
      } else if (row.rttBalance < 0) {
        warnings.push(`RTT en négatif au 31 décembre ${row.year} (${formatDays(row.rttBalance)})`)
      }
    }

    return { messages: warnings, blocking }
  }

  return { monthlyRecap, confirmedRecap, checkNegativeBalance, previewYearEnd }
}
