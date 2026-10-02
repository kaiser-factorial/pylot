import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getCurrentUser } from '@/lib/auth'
import { recordAttemptProgress } from '@/lib/progression'
import { evaluateRewardTrigger } from '@/lib/rewards'

// Append-only attempt log (see db/schema.ts). POST inserts, GET lists recent.
// Graded submissions also upsert the progress row — the attempts table itself
// is never updated (append-only invariant).
//
// Two POST shapes:
//   flat:      { exerciseId, code, result, durationMs, graded }
//   sectioned: { exerciseId, sections: [{ sectionId, code, result }], passed,
//                durationMs, graded } — one attempt row PER SECTION (the teacher
//                diagnoses per section), one progress upsert per submit.

type SectionAttempt = {
  sectionId: string
  code: string
  result: { passed: boolean | null; checks?: unknown[]; stdout?: string; stderr?: string; error?: { traceback?: string; message?: string } | null }
}

const attemptRow = (
  userId: string,
  exerciseId: string,
  sectionId: string | null,
  code: string,
  result: SectionAttempt['result'],
  durationMs: unknown
) => ({
  userId,
  exerciseId,
  sectionId,
  code,
  passed: result.passed === true,
  checkReport: Array.isArray(result.checks) ? result.checks : [],
  stdout: typeof result.stdout === 'string' ? result.stdout : '',
  stderr: result.error ? String(result.error.traceback || result.error.message) : (result.stderr ?? ''),
  durationMs: Number.isFinite(durationMs) ? Math.round(durationMs as number) : 0,
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const body = await req.json()
  const { exerciseId, sectionId, code, result, sections, passed, durationMs, graded } = body ?? {}

  // sectioned submit: batch of per-section rows, atomic progress upsert
  if (Array.isArray(sections)) {
    if (typeof exerciseId !== 'string' || sections.length === 0) {
      return NextResponse.json({ error: 'exerciseId and non-empty sections are required' }, { status: 400 })
    }
    for (const s of sections as SectionAttempt[]) {
      if (typeof s?.sectionId !== 'string' || typeof s?.code !== 'string' || typeof s?.result !== 'object' || s.result === null) {
        return NextResponse.json({ error: 'each section needs sectionId, code, result' }, { status: 400 })
      }
    }
    // one shared timestamp per submit: derived-memory aggregation groups a
    // sectioned submit back into ONE attempt by (exerciseId, createdAt)
    const submittedAt = new Date()
    const rows = await db
      .insert(schema.attempts)
      .values(
        (sections as SectionAttempt[]).map((s) => ({
          ...attemptRow(user.id, exerciseId, s.sectionId, s.code, s.result, durationMs),
          createdAt: submittedAt,
        }))
      )
      .returning({ id: schema.attempts.id })

    if (graded === true) {
      const { newlyPassed } = await recordAttemptProgress(user.id, exerciseId, passed === true)
      const reward = await evaluateRewardTrigger(user.id, exerciseId, newlyPassed)
      return NextResponse.json({ ids: rows.map((r) => r.id), reward })
    }
    return NextResponse.json({ ids: rows.map((r) => r.id) })
  }

  if (typeof code !== 'string' || typeof result !== 'object' || result === null) {
    return NextResponse.json({ error: 'code and result are required' }, { status: 400 })
  }

  const [row] = await db
    .insert(schema.attempts)
    .values(
      attemptRow(
        user.id,
        typeof exerciseId === 'string' ? exerciseId : 'dev/free-run',
        typeof sectionId === 'string' ? sectionId : null,
        code,
        result,
        durationMs
      )
    )
    .returning({ id: schema.attempts.id })

  if (graded === true && typeof exerciseId === 'string') {
    const { newlyPassed } = await recordAttemptProgress(user.id, exerciseId, Boolean(result.passed))
    const reward = await evaluateRewardTrigger(user.id, exerciseId, newlyPassed)
    return NextResponse.json({ id: row.id, reward })
  }

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
