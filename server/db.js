// La base : un seul fichier SQLite, ouvert une fois par processus. Un seul
// serveur écrit dedans, pas besoin d'un serveur de base à côté.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
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
 * Renvoie les noms des migrations appliquées.
 */
export function migrate(db, dir) {
  db.exec('create table if not exists migrations (name text primary key, applied_at text not null) strict')
  const done = new Set(db.prepare('select name from migrations').pluck().all())
  const pending = readdirSync(dir).filter(f => f.endsWith('.sql') && !done.has(f)).sort()
  for (const name of pending) {
    db.transaction(() => {
      db.exec(readFileSync(join(dir, name), 'utf8'))
      db.prepare('insert into migrations (name, applied_at) values (?, ?)').run(name, new Date().toISOString())
    })()
  }
  return pending
}
