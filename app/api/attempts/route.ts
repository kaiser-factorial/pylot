import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getCurrentUser } from '@/lib/auth'

// Append-only attempt log (see db/schema.ts). POST inserts, GET lists recent.

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const body = await req.json()
  const { exerciseId, sectionId, code, result, durationMs } = body ?? {}

  if (typeof code !== 'string' || typeof result !== 'object' || result === null) {
    return NextResponse.json({ error: 'code and result are required' }, { status: 400 })
  }

  const [row] = await db
    .insert(schema.attempts)
    .values({
      userId: user.id,
      exerciseId: typeof exerciseId === 'string' ? exerciseId : 'dev/free-run',
      sectionId: typeof sectionId === 'string' ? sectionId : null,
      code,
      passed: Boolean(result.passed),
      checkReport: Array.isArray(result.checks) ? result.checks : [],
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: result.error ? String(result.error.traceback || result.error.message) : (result.stderr ?? ''),
      durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : 0,
    })
    .returning({ id: schema.attempts.id })

  return NextResponse.json({ id: row.id })
}

export async function GET() {
  const user = await getCurrentUser()
  const rows = await db
    .select({
      id: schema.attempts.id,
      exerciseId: schema.attempts.exerciseId,
      passed: schema.attempts.passed,
      createdAt: schema.attempts.createdAt,
    })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, user.id))
    .orderBy(desc(schema.attempts.id))
    .limit(5)
  return NextResponse.json({ attempts: rows })
}
