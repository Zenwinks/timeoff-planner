// La base : un seul fichier SQLite, ouvert une fois par processus. Un seul
// serveur écrit dedans, pas besoin d'un serveur de base à côté.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true })
  const db = new Database(file)
  // WAL : les lectures ne bloquent pas les écritures.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

/**
 * Applique, dans l'ordre de leur nom, les migrations pas encore passées. Chacune
 * dans sa transaction : une migration qui échoue ne laisse rien derrière elle.
 *
 * Avec `backupDir`, une base qui a déjà des données est d'abord copiée là
 * (VACUUM INTO : une copie cohérente, même en cours d'usage) : aucune évolution
 * de sa structure ne peut perdre une donnée.
 *
 * Renvoie les migrations appliquées, et la copie faite (ou null).
 */
export function migrate(db, dir, { backupDir = null } = {}) {
  db.exec('create table if not exists migrations (name text primary key, applied_at text not null) strict')
  const done = new Set(db.prepare('select name from migrations').pluck().all())
  const pending = readdirSync(dir).filter(f => f.endsWith('.sql') && !done.has(f)).sort()

  let backup = null
  if (backupDir && pending.length && done.size) {
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = join(backupDir, `avant-${pending[0].replace(/\.sql$/, '')}-${stamp}.sqlite`)
    db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`)
  }

  for (const name of pending) {
    db.transaction(() => {
      db.exec(readFileSync(join(dir, name), 'utf8'))
      db.prepare('insert into migrations (name, applied_at) values (?, ?)').run(name, new Date().toISOString())
    })()
  }
  return { applied: pending, backup }
}

/** Efface les copies d'avant migration de plus de `maxAgeDays` jours. Renvoie les fichiers effacés. */
export function pruneBackups(backupDir, maxAgeDays = 30) {
  let files
  try {
    files = readdirSync(backupDir)
  } catch {
    return []
  }
  const limit = Date.now() - maxAgeDays * 864e5
  const removed = files.filter(f => f.startsWith('avant-') && f.endsWith('.sqlite') && statSync(join(backupDir, f)).mtimeMs < limit)
  for (const f of removed) rmSync(join(backupDir, f))
  return removed
}
