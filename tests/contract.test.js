// Le contrat (src/contract.js) et ce qu'il change aux soldes : le forfait jours
// et ses RTT, la journée de solidarité retirée des RTT, les RTT au fil des mois.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEMO_SETTINGS, DEMO_YEARLY_RTT } from '../scripts/lib/demo.mjs'
import { buildMonthlyRecap } from '../src/composables/useBalance.js'
import { cpPerYear, effectiveYearlyRtt, forfaitRtt, hasRtt, isForfait, workedDays, workingDaysOf } from '../src/contract.js'
import { holidayChecker } from '../shared/holidays.js'

const NOW = new Date(2026, 9, 5, 12)
const yearlyRtt = DEMO_YEARLY_RTT.map(([year, rtt_count]) => ({ year, rtt_count }))
const forfait = { ...DEMO_SETTINGS, contrat: 'forfait_jours', forfait_jours: 218, rtt_mode: 'annuel', solidarite_rtt: false }

describe('le forfait jours', () => {
  test('2026 : 253 jours ouvrés avec le lundi de Pentecôte travaillé, 252 sans', () => {
    assert.equal(workingDaysOf(2026, holidayChecker('lundi_pentecote')).length, 253)
    assert.equal(workingDaysOf(2026, holidayChecker(null)).length, 252)
  })

  test('ses RTT : les jours ouvrés, moins les CP, moins le forfait', () => {
    assert.equal(cpPerYear(forfait), 25)
    assert.deepEqual(forfaitRtt(forfait, 2026), { year: 2026, working: 253, cp: 25, forfait: 218, rtt: 10 })
    // La journée de solidarité retirée des RTT : le lundi de Pentecôte reste chômé.
    assert.equal(forfaitRtt({ ...forfait, solidarite_rtt: true }, 2026).rtt, 9)
  })

  test('une année corrigée à la main garde sa valeur, les autres suivent le forfait', () => {
    const rtt = effectiveYearlyRtt(forfait, [{ year: 2027, rtt_count: 8.5 }], NOW)
    assert.deepEqual(rtt.map(r => [r.year, r.rtt_count]), [[2026, 10], [2027, 8.5]])
  })

  test('avec ou sans RTT', () => {
    const none = { ...DEMO_SETTINGS, rtt_mode: 'aucun' }
    assert.equal(hasRtt(none), false)
    assert.deepEqual(effectiveYearlyRtt(none, yearlyRtt, NOW), [])
    assert.equal(hasRtt({ ...forfait, rtt_mode: 'aucun' }), true, 'toujours au forfait')
    assert.equal(isForfait({ ...forfait, forfait_jours: null }), false)
    assert.deepEqual(effectiveYearlyRtt(DEMO_SETTINGS, yearlyRtt, NOW), yearlyRtt, 'contrat horaire : ceux saisis')
  })

  test('les jours travaillés de l’année, à ce jour, et ceux de trop', () => {
    const entries = [
      { date: '2026-03-02', type: 'conge', duration: 1 },
      { date: '2026-03-03', type: 'conge', duration: 1 },
      { date: '2026-03-04', type: 'rtt', duration: 0.5 },
      { date: '2026-11-16', type: 'maladie', duration: 1 },
      { date: '2026-03-07', type: 'conge', duration: 1 }, // un samedi : rien à retirer
    ]
    const w = workedDays(forfait, entries, 2026, '2026-10-05')
    assert.deepEqual([w.working, w.cp, w.rtt, w.sick, w.worked, w.over], [253, 2, 0.5, 1, 249.5, 31.5])
    // Du 1er janvier au lundi 5 octobre : 192 jours ouvrés, dont 2,5 posés.
    assert.equal(w.workedToDate, 189.5)
  })
})

describe('les RTT au fil des mois', () => {
  const recap = settings => buildMonthlyRecap(settings, yearlyRtt, [], NOW)
  const rttAt = (rows, year, month) => rows.find(r => r.year === year && r.month === month).rtt

  test('un douzième par mois, et le même solde en décembre', () => {
    const yearly = recap(DEMO_SETTINGS)
    const monthly = recap({ ...DEMO_SETTINGS, rtt_mode: 'mensuel' })
    assert.equal(rttAt(yearly, 2026, 1), 10.32)
    assert.equal(rttAt(monthly, 2026, 1), 1.15)
    assert.equal(rttAt(monthly, 2026, 6), 5.32)
    assert.deepEqual([rttAt(monthly, 2026, 12), rttAt(yearly, 2026, 12)], [10.32, 10.32])
  })

  test('en janvier, seules les décimales passent, même après douze douzièmes', () => {
    // 2026 : douze douzièmes de 10, aucun posé. Janvier 2027 : rien de reporté, puis 9 / 12.
    const monthly = recap({ ...DEMO_SETTINGS, initial_rtt: 0, rtt_mode: 'mensuel' })
    assert.equal(rttAt(monthly, 2026, 12), 10)
    assert.equal(rttAt(monthly, 2027, 1), 0.75)
  })
})
