// L'export vers l'agenda (server/ics.js), sur le jeu de démonstration : un
// événement par congé d'un seul tenant, au format iCalendar.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { DEMO_PERIODS, DEMO_SETTINGS } from '../scripts/lib/demo.mjs'
import { buildCalendar, fold } from '../server/ics.js'
import { holidayChecker } from '../shared/holidays.js'
import { formatDate } from '../shared/periods.js'

/** Les jours ouvrés des périodes du jeu de démonstration, comme les poserait l'app. */
function demoEntries() {
  const isHoliday = holidayChecker(DEMO_SETTINGS.journee_solidarite)
  let id = 0
  return DEMO_PERIODS.flatMap(([from, to, type, status, duration, half_day = null]) => {
    const days = []
    for (const d = new Date(`${from}T00:00`); formatDate(d) <= to; d.setDate(d.getDate() + 1)) {
      const date = formatDate(d)
      if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(date)) days.push({ id: `e${++id}`, date, type, status, duration, half_day })
    }
    return days
  })
}

describe('l’export vers l’agenda', () => {
  const ics = buildCalendar({
    entries: demoEntries(),
    solidarityKey: DEMO_SETTINGS.journee_solidarite,
    host: 'timeoff.test',
    now: new Date('2026-10-05T08:00:00Z'),
  })
  const events = ics.split('BEGIN:VEVENT').slice(1)
  const event = start => events.find(e => e.includes(`DTSTART;VALUE=DATE:${start}`))

  test('un événement par congé d’un seul tenant, sur des journées entières', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
    assert.equal(events.length, DEMO_PERIODS.length)
    // L'été, du lundi 27 juillet au vendredi 14 août : la fin est exclusive.
    assert.match(event('20260727'), /DTEND;VALUE=DATE:20260815\r\n/)
    assert.match(event('20260727'), /SUMMARY:CP \(accepté\)/)
    assert.match(event('20260727'), /15 jours ouvrés/)
  })

  test('brouillons et demandes sont provisoires, le reste est confirmé', () => {
    assert.match(event('20261221'), /STATUS:TENTATIVE/)
    assert.match(event('20261228'), /STATUS:TENTATIVE/)
    assert.match(event('20260727'), /STATUS:CONFIRMED/)
    assert.match(event('20260515'), /STATUS:CONFIRMED/)
  })

  test('une demi-journée dit son moment, ou qu’il n’est pas précisé', () => {
    assert.match(event('20261113'), /SUMMARY:RTT · après-midi \(brouillon\)/)
    assert.match(event('20260313'), /SUMMARY:CP · demi-journée \(accepté\)/)
  })

  test('des identifiants stables, et des lignes de 75 octets au plus', () => {
    assert.match(event('20260727'), /UID:e\d+@timeoff\.test/)
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line)
  })

  test('les longues lignes se plient sans couper un caractère', () => {
    const line = `DESCRIPTION:${'é'.repeat(60)}`
    const folded = fold(line)
    const parts = folded.split('\r\n')
    assert.ok(parts.length > 1)
    for (const part of parts) assert.ok(Buffer.byteLength(part) <= 75)
    assert.ok(parts.slice(1).every(p => p.startsWith(' ')))
    assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), line)
  })
})
