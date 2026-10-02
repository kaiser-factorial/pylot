import { randomUUID } from 'node:crypto'
import { and, eq, gte, ne, or, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/db/schema'

function monthStart() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) }

export function createSpeechAccounting(db: BetterSQLite3Database<typeof schema>, config: { cap: () => number; rate: () => number }) {
  function spent() {
    return db.select({ total: sql<number>`coalesce(sum(${schema.aiSpeechUsage.costUsd}), 0)` })
      .from(schema.aiSpeechUsage).where(and(ne(schema.aiSpeechUsage.status, 'released'), or(
        gte(schema.aiSpeechUsage.createdAt, monthStart()), eq(schema.aiSpeechUsage.status, 'reserved'),
      ))).get()?.total ?? 0
  }
  function reserve(userId: string, model: string, characters: number): string | null {
    const rate = config.rate(), cap = config.cap()
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(cap) || cap < 0 || !Number.isInteger(characters) || characters < 1) {
      throw new Error('Invalid speech budget configuration')
    }
    const costUsd = characters * rate / 1_000_000
    return db.transaction((tx) => {
      const tokens = tx.select({ total: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
        .from(schema.aiUsage).where(gte(schema.aiUsage.createdAt, monthStart())).get()?.total ?? 0
      if (tokens + spent() + costUsd > cap) return null
      const id = randomUUID()
      tx.insert(schema.aiSpeechUsage).values({ id, userId, model, characters, costUsd, status: 'reserved', createdAt: new Date() }).run()
      return id
    }, { behavior: 'immediate' })
  }
  function settle(id: string, status: 'charged' | 'released') {
    db.update(schema.aiSpeechUsage).set({ status }).where(and(eq(schema.aiSpeechUsage.id, id), eq(schema.aiSpeechUsage.status, 'reserved'))).run()
  }
  return { spent, reserve, settle }
}
