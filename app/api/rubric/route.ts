import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listAllExercises } from '@/lib/content/load'
import { collectRubricItems, gradeRubrics } from '@/lib/teacher/rubric'
import { checkBudget } from '@/lib/teacher/spend'

// Grades the ai_rubric checks of a capstone submission (invariant #2's only
// exception). The client sends only its work (code + stdout per section);
// the rubric criteria come from server-side content, and the verdicts are
// merged into the check report client-side before the attempt is recorded.

export const dynamic = 'force-dynamic'

const MAX_SECTION_CODE_CHARS = 12_000
const MAX_SECTION_STDOUT_CHARS = 4_000

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as {
    exerciseId?: string
    sections?: { sectionId?: string; code?: string; stdout?: string }[]
  }

  if (typeof body.exerciseId !== 'string' || !Array.isArray(body.sections)) {
    return NextResponse.json({ error: 'exerciseId and sections are required' }, { status: 400 })
  }

  const ref = listAllExercises().find((r) => r.exercise.id === body.exerciseId)
  if (!ref) return NextResponse.json({ error: 'unknown exercise' }, { status: 404 })

  const submissions = body.sections
    .filter((s) => typeof s.sectionId === 'string' && typeof s.code === 'string')
    .map((s) => ({
      sectionId: s.sectionId as string,
      code: (s.code as string).slice(0, MAX_SECTION_CODE_CHARS),
      stdout: typeof s.stdout === 'string' ? s.stdout.slice(0, MAX_SECTION_STDOUT_CHARS) : '',
    }))

  const items = collectRubricItems(ref.exercise, submissions)
  if (items.length === 0) {
    return NextResponse.json({ error: 'exercise has no ai_rubric checks to grade' }, { status: 400 })
  }

  // same hard monthly cap as the teacher — refuse before any provider call
  const budget = await checkBudget()
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: 'monthly_budget_exhausted',
        detail: `The AI budget for this month ($${budget.capUsd.toFixed(2)}) is used up — rubric grading resets at the start of next month (UTC).`,
        spentUsd: budget.spentUsd,
        capUsd: budget.capUsd,
      },
      { status: 429 }
    )
  }

  try {
    const verdicts = await gradeRubrics({ userId: user.id, exercise: ref.exercise, items })
    return NextResponse.json({ verdicts })
  } catch (err) {
    console.error('[rubric] grading failed:', err)
    return NextResponse.json({ error: 'rubric grading failed — try submitting again' }, { status: 502 })
  }
}
