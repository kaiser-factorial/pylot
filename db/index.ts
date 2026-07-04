import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema'

const dataDir = join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const sqlite = new Database(join(dataDir, 'pylot.db'))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
export { schema }
