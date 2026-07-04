import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema'

// PYLOT_DB_PATH lets verification scripts run against a scratch copy instead
// of the real learner DB (verify-phase1 passes exercises; those rows must not
// pollute actual progress). Default stays data/pylot.db.
const defaultDir = join(process.cwd(), 'data')
mkdirSync(defaultDir, { recursive: true })
const dbPath = process.env.PYLOT_DB_PATH ?? join(defaultDir, 'pylot.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { schema }
