import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { listAllExercises } from '@/lib/content/load'

// Progression rules (ROADMAP Phase 1): exercises unlock strictly in curriculum
// order — an exercise is available once every earlier exercise is passed.
// Lock state is DERIVED here from the pass set, never stored; the progress
// table stores facts (passed/attempts/hints), content order stores structure.

export type ExerciseStatus = 'locked' | 'available' | 'passed'

export type ExerciseProgress = {
  id: string
  title: string
  kind: string
  difficulty: number
  chapterId: string
  chapterTitle: string
  lessonDir: string
  status: ExerciseStatus
  attemptsCount: number
  hintsUsed: number
  authoredHintsRevealed: number
}

export type ProgressionState = {
  exercises: ExerciseProgress[]
  /** first non-passed exercise in curriculum order — the resume target */
  resume: ExerciseProgress | null
}

export async function getProgression(userId: string): Promise<ProgressionState> {
  const refs = listAllExercises()
  const rows = await db
    .select()
    .from(schema.progress)
    .where(eq(schema.progress.userId, userId))
  const byId = new Map(rows.map((r) => [r.exerciseId, r]))

  let allPreviousPassed = true
  const exercises: ExerciseProgress[] = []
  for (const ref of refs) {
    const row = byId.get(ref.exercise.id)
    const passed = row?.status === 'passed'
    const status: ExerciseStatus = passed ? 'passed' : allPreviousPassed ? 'available' : 'locked'
    exercises.push({
      id: ref.exercise.id,
      title: ref.exercise.title,
      kind: ref.exercise.kind,
      difficulty: ref.exercise.difficulty,
      chapterId: ref.chapterId,
      chapterTitle: ref.chapterTitle,
      lessonDir: ref.lessonDir,
      status,
      attemptsCount: row?.attemptsCount ?? 0,
      hintsUsed: row?.hintsUsed ?? 0,
      authoredHintsRevealed: row?.authoredHintsRevealed ?? 0,
    })
    if (!passed) allPreviousPassed = false
  }

  return { exercises, resume: exercises.find((e) => e.status !== 'passed') ?? null }
}

/** Upsert progress for an attempt. Never touches the attempts log itself. */
export async function recordAttemptProgress(
  userId: string,
  exerciseId: string,
  passed: boolean
): Promise<void> {
  const [existing] = await db
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.exerciseId, exerciseId)))

  if (!existing) {
    await db.insert(schema.progress).values({
      userId,
      exerciseId,
      status: passed ? 'passed' : 'available',
      passedAt: passed ? new Date() : null,
      attemptsCount: 1,
    })
    return
  }

  await db
    .update(schema.progress)
    .set({
      attemptsCount: existing.attemptsCount + 1,
      // once passed, stays passed (re-attempts after passing are fine but don't demote)
      status: existing.status === 'passed' || passed ? 'passed' : 'available',
      passedAt: existing.passedAt ?? (passed ? new Date() : null),
    })
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.exerciseId, exerciseId)))
}

/**
 * Bump the honest hint counter. `authored: true` additionally marks the next
 * authored hint as revealed (the UI reconstructs the shown-hints list from
 * that number) — the reveal button and the teacher delivering an authored
 * hint both set it; teacher-improvised hints only bump the total.
 */
export async function recordHintUsed(
  userId: string,
  exerciseId: string,
  opts: { authored?: boolean } = {}
): Promise<number> {
  const authoredInc = opts.authored ? 1 : 0
  const [existing] = await db
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.exerciseId, exerciseId)))
  if (!existing) {
    await db.insert(schema.progress).values({
      userId,
      exerciseId,
      status: 'available',
      hintsUsed: 1,
      authoredHintsRevealed: authoredInc,
    })
    return 1
  }
  const next = existing.hintsUsed + 1
  await db
    .update(schema.progress)
    .set({ hintsUsed: next, authoredHintsRevealed: existing.authoredHintsRevealed + authoredInc })
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.exerciseId, exerciseId)))
  return next
}
