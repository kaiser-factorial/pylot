import 'server-only'
import { gte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

// The HARD monthly spend cap (owner decision 2026-07-04: $10/month). Enforced
// server-side before every teacher call by summing the ai_usage ledger for the
// current UTC calendar month. Costs are computed from a per-model price table
// at STICKER prices (intro discounts ignored) so the guard errs conservative.

export const SPEND_CAP_USD = Number(process.env.PYLOT_TEACHER_SPEND_CAP_USD || 10)

/** USD per million tokens { in, out } — sticker prices, cached 2026-07-04. */
const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-5': { in: 3, out: 15 },
  'anthropic/claude-sonnet-4.6': { in: 3, out: 15 },
  'anthropic/claude-opus-4.8': { in: 5, out: 25 },
  'anthropic/claude-haiku-4.5': { in: 1, out: 5 },
  'anthropic/claude-fable-5': { in: 10, out: 50 },
}

// unknown model → assume the most expensive tier so the cap can't undercount
const FALLBACK_PRICE = { in: 10, out: 50 }

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const envIn = Number(process.env.PYLOT_TEACHER_USD_PER_MTOK_IN)
  const envOut = Number(process.env.PYLOT_TEACHER_USD_PER_MTOK_OUT)
  const price =
    Number.isFinite(envIn) && Number.isFinite(envOut) && envIn > 0 && envOut > 0
      ? { in: envIn, out: envOut }
      : (PRICES_PER_MTOK[model] ?? FALLBACK_PRICE)
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Total AI spend this UTC calendar month, across all users and kinds. */
export async function getMonthlySpendUsd(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
    .from(schema.aiUsage)
    .where(gte(schema.aiUsage.createdAt, startOfCurrentUtcMonth()))
  return row?.total ?? 0
}

export type BudgetStatus = { allowed: boolean; spentUsd: number; capUsd: number }

export async function checkBudget(): Promise<BudgetStatus> {
  const spentUsd = await getMonthlySpendUsd()
  return { allowed: spentUsd < SPEND_CAP_USD, spentUsd, capUsd: SPEND_CAP_USD }
}

export async function recordUsage(args: {
  userId: string
  kind?: string
  model: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  await db.insert(schema.aiUsage).values({
    userId: args.userId,
    kind: args.kind ?? 'teacher',
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd: estimateCostUsd(args.model, args.inputTokens, args.outputTokens),
  })
}
