import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// All tables are keyed by userId from day one (see ADR-003): local mode has a
// single seeded user behind lib/auth.ts, but nothing else may assume that.

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // arbitrary user preferences (e.g. { theme: "cyber" }) as JSON
  settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

// Append-only event log. Never UPDATE or DELETE rows here — struggle scores,
// reward triggers, and (later) adaptive difficulty are computed from it.
export const attempts = sqliteTable('attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  exerciseId: text('exercise_id').notNull(), // stable content ID, e.g. "py-basics/loops/03-fizzbuzz"
  sectionId: text('section_id'), // set for sectioned (multi-part) exercises
  code: text('code').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  // full check report: [{type, passed, expected, actual, message}, ...]
  checkReport: text('check_report', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  stdout: text('stdout').notNull().default(''),
  stderr: text('stderr').notNull().default(''),
  durationMs: integer('duration_ms').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const progress = sqliteTable('progress', {
  userId: text('user_id').notNull().references(() => users.id),
  exerciseId: text('exercise_id').notNull(),
  status: text('status', { enum: ['locked', 'available', 'passed'] }).notNull().default('available'),
  passedAt: integer('passed_at', { mode: 'timestamp_ms' }),
  attemptsCount: integer('attempts_count').notNull().default(0),
  hintsUsed: integer('hints_used').notNull().default(0),
})

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  exerciseId: text('exercise_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const rewardEvents = sqliteTable('reward_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  chapterId: text('chapter_id').notNull(),
  triggerReason: text('trigger_reason', { enum: ['chapter_complete', 'high_struggle_pass'] }).notNull(),
  struggleScore: real('struggle_score').notNull().default(0),
  accepted: integer('accepted', { mode: 'boolean' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})
