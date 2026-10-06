// Ce que calcule le tableau de bord (src/dashboard.js), sur le jeu de
// démonstration, un lundi 5 octobre 2026.

import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import { DEMO_PERIODS, DEMO_SETTINGS, DEMO_YEARLY_RTT } from '../scripts/lib/demo.mjs'
import { buildMonthlyRecap, getWorkingDaysInRange } from '../src/composables/useBalance.js'
import { CONFIRMED_STATUSES } from '../src/constants.js'
import { mergeRecaps, nextPeriod, pendingDays, periodOf, periodsOf, splitByYear, summaryMonths, whenLabel, yearsLabel } from '../src/dashboard.js'
import { setSolidarite } from '../src/holidays.js'

const NOW = new Date(2026, 9, 5, 12)
const TODAY = '2026-10-05'

describe('le tableau de bord', () => {
  let entries, months
  before(() => {
    setSolidarite(DEMO_SETTINGS.journee_solidarite)
    let id = 0
    entries = DEMO_PERIODS.flatMap(([from, to, type, status, duration]) =>
      getWorkingDaysInRange(new Date(`${from}T00:00`), new Date(`${to}T00:00`))
        .map(date => ({ id: `e${++id}`, date, type, status, duration })))
    const yearlyRtt = DEMO_YEARLY_RTT.map(([year, rtt_count]) => ({ year, rtt_count }))
    const forecast = buildMonthlyRecap(DEMO_SETTINGS, yearlyRtt, entries, NOW)
    const confirmed = buildMonthlyRecap(DEMO_SETTINGS, yearlyRtt, entries.filter(e => CONFIRMED_STATUSES.has(e.status)), NOW)
    months = mergeRecaps(forecast, confirmed, NOW)
  })

  test('chaque mois a ses deux soldes : le confirmé ignore brouillons et demandes', () => {
    const month = (year, m) => months.find(r => r.year === year && r.month === m)
    // Octobre : le RTT du 30 est demandé, pas encore accepté.
    assert.deepEqual([month(2026, 10).forecast.rtt, month(2026, 10).confirmed.rtt], [6.32, 7.32])
    assert.deepEqual([month(2026, 10).forecast.cp, month(2026, 10).confirmed.cp], [7.92, 7.92])
    // Décembre : 8 jours de CP en attente (4 demandés, 4 en brouillon), 1,5 RTT.
    assert.deepEqual([month(2026, 12).forecast.cp, month(2026, 12).confirmed.cp], [4.09, 12.09])
    assert.deepEqual([month(2026, 12).forecast.rtt, month(2026, 12).confirmed.rtt], [5.82, 7.32])
  })

  test('les mois passés et le mois en cours sont repérés', () => {
    assert.equal(months.filter(m => m.isPast).length, 9)
    assert.deepEqual(months.filter(m => m.isCurrent).map(m => m.label), ['Octobre 2026'])
  })

  test('un congé à cheval sur deux mois est une seule période', () => {
    const periods = periodsOf(entries)
    const summer = periodOf(periods, entries.find(e => e.date === '2026-08-12').id)
    assert.deepEqual([summer.startDate, summer.endDate, summer.days], ['2026-07-27', '2026-08-14', 15])
    const easter = periodOf(periods, entries.find(e => e.date === '2026-04-08').id)
    assert.deepEqual([easter.startDate, easter.endDate, easter.days], ['2026-04-07', '2026-04-10', 4])
  })

  test('le prochain congé, et quand il commence', () => {
    const next = nextPeriod(periodsOf(entries), TODAY)
    assert.deepEqual([next.startDate, next.type, next.status], ['2026-10-30', 'rtt', 'demande'])
    assert.equal(whenLabel(next, TODAY), 'dans 25 jours')
    assert.equal(whenLabel(next, '2026-10-29'), 'demain')
    assert.equal(whenLabel(next, '2026-10-30'), 'en cours')
  })

  test('les jours en attente à partir d’aujourd’hui', () => {
    // 30 octobre (1), 13 novembre (½), Noël (4 + 4), février 2027 (5).
    assert.equal(pendingDays(entries, TODAY), 14.5)
  })

  test('le résumé montre le mois en cours et la prochaine fin d’année', () => {
    const { current, yearEnd } = summaryMonths(months, NOW)
    assert.deepEqual([current.label, yearEnd.label], ['Octobre 2026', 'Décembre 2026'])
    assert.equal(summaryMonths(months, new Date(2026, 11, 10)).yearEnd.label, 'Décembre 2027')
  })

  test('les mois se rangent autour de l’année en cours', () => {
    const { before, during, after } = splitByYear(months, 2026)
    assert.equal(before.length, 0)
    assert.deepEqual([during[0].label, during.at(-1).label, during.length], ['Janvier 2026', 'Décembre 2026', 12])
    assert.deepEqual([after[0].label, after.at(-1).label], ['Janvier 2027', 'Décembre 2027'])
    assert.deepEqual(splitByYear(months, 2027).before.map(m => m.label), during.map(m => m.label))
  })
})

describe('les années d’un bouton « Afficher »', () => {
  const months = years => years.map(year => ({ year }))

  test('une année, deux, ou davantage', () => {
    assert.equal(yearsLabel(months([2027, 2027])), '2027')
    assert.equal(yearsLabel(months([2024, 2025])), '2024 et 2025')
    assert.equal(yearsLabel(months([2023, 2024, 2025])), '2023, 2024 et 2025')
  })
})
