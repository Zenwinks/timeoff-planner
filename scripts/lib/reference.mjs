// La référence de contrôle d'une sauvegarde : ce qu'une migration ou une
// restauration doit retrouver à l'identique. Commune à backup-supabase.mjs
// (qui la produit) et à migrate-from-supabase.mjs (qui s'y compare).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { buildMonthlyRecap } from '../../src/composables/useBalance.js'

/** Les tables utiles à l'app, telles que snapshot.sql les exporte en JSON. */
export function readTables(dir) {
  const read = name => JSON.parse(readFileSync(join(dir, 'tables', `${name}.json`), 'utf8'))
  return {
    users: read('auth.users'),
    identities: read('auth.identities'),
    settings: read('user_settings'),
    yearlyRtt: read('yearly_rtt'),
    entries: read('time_off_entries'),
  }
}

/**
 * La date à laquelle les soldes sont calculés, à midi heure locale : le mois
 * courant et l'horizon du récap en dépendent, pas le fuseau.
 */
export function balanceDate(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/**
 * Les soldes de chaque compte, mois par mois, tels que le tableau de bord les
 * affiche (buildMonthlyRecap, le calcul de useBalance). Un compte sans
 * paramètres n'a pas de récap : l'app l'envoie d'abord aux paramètres.
 *
 * `userIds` liste les comptes ; les lignes sont des objets au format renvoyé
 * par Supabase (nombres en nombres, dates en 'AAAA-MM-JJ').
 */
export function computeBalances({ userIds, settings, yearlyRtt, entries }, now) {
  const balances = {}
  for (const id of [...userIds].sort()) {
    const s = settings.find(r => r.user_id === id) ?? null
    const full = s
      ? buildMonthlyRecap(s, yearlyRtt.filter(r => r.user_id === id), entries.filter(r => r.user_id === id), now)
      : []
    const recap = full.map(({ label, cp, cpUsed, rtt, rttUsed, total }) => ({ label, cp, cpUsed, rtt, rttUsed, total }))
    const current = full.findIndex(r => r.isCurrent)
    balances[id] = {
      hasSettings: !!s,
      entries: entries.filter(r => r.user_id === id).length,
      current: current >= 0 ? recap[current] : null,
      recap,
    }
  }
  return balances
}

/** Les écarts entre deux jeux de soldes, en clair. Vide : identiques. */
export function diffBalances(expected, actual) {
  const problems = []
  const ids = new Set([...Object.keys(expected), ...Object.keys(actual)])
  for (const id of ids) {
    if (!(id in actual)) problems.push(`compte ${id} : absent`)
    else if (!(id in expected)) problems.push(`compte ${id} : en trop`)
    else if (!isDeepStrictEqual(expected[id], actual[id])) {
      const e = expected[id].recap, a = actual[id].recap
      const month = e.findIndex((row, i) => !isDeepStrictEqual(row, a[i]))
      problems.push(month >= 0
        ? `compte ${id} : soldes différents en ${e[month].label} (attendu ${JSON.stringify(e[month])}, obtenu ${JSON.stringify(a[month] ?? null)})`
        : `compte ${id} : récap différent (${e.length} mois attendus, ${a.length} obtenus)`)
    }
  }
  return problems
}

/**
 * Le résumé sans donnée personnelle : les comptes deviennent « compte 1 »,
 * « compte 2 »… dans l'ordre de leur création.
 */
export function anonymousSummary(reference, users) {
  const order = [...users].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(u => u.id)
  const lines = [
    `Référence du ${reference.taken_at} (soldes calculés au ${reference.balance_date})`,
    '',
    'Lignes par table :',
    ...['public.time_off_entries', 'public.user_settings', 'public.yearly_rtt', 'auth.users', 'auth.identities']
      .map(t => `  ${t.padEnd(26)} ${String(reference.tables[t].rows).padStart(5)}`),
    '',
    `Comptes : ${order.length}`,
    '',
    'Soldes du mois courant, par compte :',
  ]
  order.forEach((id, i) => {
    const b = reference.balances[id]
    lines.push(b.current
      ? `  compte ${i + 1}  ${b.current.label.padEnd(15)} CP ${String(b.current.cp).padStart(7)}  RTT ${String(b.current.rtt).padStart(6)}  total ${String(b.current.total).padStart(7)}  (${b.entries} jours posés, ${b.recap.length} mois comparés)`
      : `  compte ${i + 1}  pas encore de paramètres (${b.entries} jours posés)`)
  })
  return lines.join('\n')
}
