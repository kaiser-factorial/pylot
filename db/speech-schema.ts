import type Database from 'better-sqlite3'

// Only adds this feature's table. Safe for existing installations; never alters
// attempts/progress or rebuilds tables. Also represented in the Drizzle schema.
export function ensureSpeechSchema(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS ai_speech_usage (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL DEFAULT 'tts',
    model TEXT NOT NULL,
    characters INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)
}
