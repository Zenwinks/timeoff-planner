// Les migrations : la copie de la base avant d'en changer la structure, et la
// migration 0002 sur une base qui a déjà des données.

import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { migrate, openDb, pruneBackups } from '../server/db.js'

const migrationsDir = fileURLToPath(new URL('../server/migrations', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'timeoff-db-'))

/** Un dossier de migrations : les premières du projet, et d'autres pour le test. */
function migrations(name, files, extra = {}) {
  const dir = join(work, name)
  mkdirSync(dir)
  for (const f of files) copyFileSync(join(migrationsDir, f), join(dir, f))
  for (const [f, sql] of Object.entries(extra)) writeFileSync(join(dir, f), sql)
  return dir
}

describe('les migrations', () => {
  after(() => rmSync(work, { recursive: true, force: true }))

  test('une base qui a des données est copiée avant une migration, et seulement alors', () => {
    const file = join(work, 'base.sqlite')
    const backups = join(work, 'sauvegardes')
    const db = openDb(file)

    // Une base neuve : rien à copier.
    const first = migrate(db, migrations('v1', ['0001_schema-initial.sql']), { backupDir: backups })
    assert.deepEqual(first, { applied: ['0001_schema-initial.sql'], backup: null })
    db.prepare("insert into users (id, google_sub, email, created_at) values ('u1', 'sub-1', 'a@example.test', '2026-10-03')").run()

    // Une migration de plus : la base est copiée d'abord, dans son état d'avant.
    const second = migrate(db, migrations('v2', ['0001_schema-initial.sql'], { '0002_essai.sql': 'create table essai (x integer) strict;' }), { backupDir: backups })
    assert.deepEqual(second.applied, ['0002_essai.sql'])
    assert.ok(second.backup)
    const copy = new Database(second.backup, { readonly: true })
    assert.equal(copy.prepare('select count(*) from users').pluck().get(), 1)
    assert.equal(copy.prepare("select count(*) from sqlite_master where name = 'essai'").pluck().get(), 0)
    copy.close()

    // Rien de neuf : pas de nouvelle copie.
    assert.deepEqual(migrate(db, join(work, 'v2'), { backupDir: backups }), { applied: [], backup: null })
    assert.equal(readdirSync(backups).length, 1)
    db.close()
  })

  test('les copies de plus de 30 jours s’effacent, les autres restent', () => {
    const dir = join(work, 'tri')
    mkdirSync(dir)
    for (const f of ['avant-0002-ancienne.sqlite', 'avant-0003-recente.sqlite', 'autre-fichier.sqlite']) writeFileSync(join(dir, f), '')
    const old = (Date.now() - 40 * 864e5) / 1000
    utimesSync(join(dir, 'avant-0002-ancienne.sqlite'), old, old)
    utimesSync(join(dir, 'autre-fichier.sqlite'), old, old)
    assert.deepEqual(pruneBackups(dir, 30), ['avant-0002-ancienne.sqlite'])
    assert.deepEqual(readdirSync(dir).sort(), ['autre-fichier.sqlite', 'avant-0003-recente.sqlite'])
  })

  test('la migration 0002 garde chaque jour posé, et n’admet que matin ou après-midi', () => {
    const db = openDb(':memory:')
    migrate(db, migrations('v1-seule', ['0001_schema-initial.sql']))
    db.prepare("insert into users (id, google_sub, email, created_at) values ('u1', 'sub-1', 'a@example.test', '2026-10-03')").run()
    const insert = db.prepare("insert into time_off_entries (id, user_id, date, type, status, created_at, updated_at, duration) values (?, 'u1', ?, 'conge', 'accepte', '2026-10-03', '2026-10-03', ?)")
    insert.run('e1', '2026-10-05', 1)
    insert.run('e2', '2026-10-06', 0.5)
    const before = db.prepare('select * from time_off_entries order by id').all()

    migrate(db, migrationsDir)
    const after = db.prepare('select * from time_off_entries order by id').all()
    assert.deepEqual(after, before.map(row => ({ ...row, half_day: null })))

    db.prepare("update time_off_entries set half_day = 'apres-midi' where id = 'e2'").run()
    assert.throws(() => db.prepare("update time_off_entries set half_day = 'soir' where id = 'e2'").run(), /CHECK/)
    db.close()
  })
})
