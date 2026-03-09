// Calcul de Pâques (algorithme de Meeus/Jones/Butcher)
function getEasterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function fmt(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Liste des jours fériés avec leur clé et label
export const HOLIDAY_KEYS = [
  { key: 'jour_an', label: "Jour de l'An (1er janv.)" },
  { key: 'lundi_paques', label: 'Lundi de Pâques' },
  { key: 'fete_travail', label: 'Fête du Travail (1er mai)' },
  { key: 'victoire_1945', label: 'Victoire 1945 (8 mai)' },
  { key: 'ascension', label: 'Ascension' },
  { key: 'lundi_pentecote', label: 'Lundi de Pentecôte' },
  { key: 'fete_nationale', label: 'Fête nationale (14 juil.)' },
  { key: 'assomption', label: 'Assomption (15 août)' },
  { key: 'toussaint', label: 'Toussaint (1er nov.)' },
  { key: 'armistice', label: 'Armistice (11 nov.)' },
  { key: 'noel', label: 'Noël (25 déc.)' },
]

// Retourne un Map clé -> date pour une année
export function getFrenchHolidaysMap(year) {
  const easter = getEasterDate(year)
  return {
    jour_an: `${year}-01-01`,
    lundi_paques: fmt(addDays(easter, 1)),
    fete_travail: `${year}-05-01`,
    victoire_1945: `${year}-05-08`,
    ascension: fmt(addDays(easter, 39)),
    lundi_pentecote: fmt(addDays(easter, 50)),
    fete_nationale: `${year}-07-14`,
    assomption: `${year}-08-15`,
    toussaint: `${year}-11-01`,
    armistice: `${year}-11-11`,
    noel: `${year}-12-25`,
  }
}

// Journée de solidarité exclue (clé du jour férié travaillé)
let solidariteKey = null

export function setSolidarite(key) {
  solidariteKey = key || null
  // Invalider le cache
  for (const k in cache) delete cache[k]
}

// Retourne un Set de dates fériées pour une année, en excluant la journée de solidarité
export function getFrenchHolidays(year) {
  const map = getFrenchHolidaysMap(year)
  const holidays = []
  for (const [key, date] of Object.entries(map)) {
    if (key !== solidariteKey) {
      holidays.push(date)
    }
  }
  return new Set(holidays)
}

// Cache par année
const cache = {}

export function isHoliday(dateStr) {
  const year = parseInt(dateStr.substring(0, 4))
  if (!cache[year]) {
    cache[year] = getFrenchHolidays(year)
  }
  return cache[year].has(dateStr)
}

export function isHolidayDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return isHoliday(`${y}-${m}-${d}`)
}
