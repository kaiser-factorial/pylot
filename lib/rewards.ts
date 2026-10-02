import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { listAllExercises } from '@/lib/content/load'
import { computeExerciseStruggle, HIGH_STRUGGLE_THRESHOLD } from '@/lib/memory/derived'

// The "vibecode break" (ARCHITECTURE §4.8): the one place the AI is allowed
// to just build something for fun, quarantined from the learning loop.
// Trigger rule — fires ONLY on:
//   - chapter completion (this fresh pass finished the chapter), or
//   - a fresh pass whose struggle score cleared HIGH_STRUGGLE_THRESHOLD
// Never on breezing through; never twice for the same chapter/exercise
// (reward_events is the dedupe ledger).

export type RewardOffer = {
  id: number
  triggerReason: 'chapter_complete' | 'high_struggle_pass'
  chapterId: string
  struggleScore: number
}

/**
 * Called after a graded attempt upserted progress. `newlyPassed` MUST be the
 * first-pass signal from recordAttemptProgress — re-submits never trigger.
 */
export async function evaluateRewardTrigger(
  userId: string,
  exerciseId: string,
  newlyPassed: boolean
): Promise<RewardOffer | null> {
  if (!newlyPassed) return null
  const refs = listAllExercises()
  const ref = refs.find((r) => r.exercise.id === exerciseId)
  if (!ref) return null
  const chapterId = ref.chapterId

  const existingEvents = await db
    .select({
      exerciseId: schema.rewardEvents.exerciseId,
      triggerReason: schema.rewardEvents.triggerReason,
    })
    .from(schema.rewardEvents)
    .where(and(eq(schema.rewardEvents.userId, userId), eq(schema.rewardEvents.chapterId, chapterId)))

  // chapter completion beats high-struggle when both land on the same pass
  const chapterExerciseIds = refs.filter((r) => r.chapterId === chapterId).map((r) => r.exercise.id)
  const progressRows = await db
    .select({ exerciseId: schema.progress.exerciseId, status: schema.progress.status })
    .from(schema.progress)
    .where(eq(schema.progress.userId, userId))
  const passedSet = new Set(progressRows.filter((r) => r.status === 'passed').map((r) => r.exerciseId))
  const chapterComplete = chapterExerciseIds.every((id) => passedSet.has(id))

  const struggle = await computeExerciseStruggle(userId, exerciseId)
  const score = struggle?.score ?? 0

  if (chapterComplete && !existingEvents.some((e) => e.triggerReason === 'chapter_complete')) {
    return insertOffer(userId, chapterId, null, 'chapter_complete', score)
  }

  if (
    score >= HIGH_STRUGGLE_THRESHOLD &&
    !existingEvents.some((e) => e.triggerReason === 'high_struggle_pass' && e.exerciseId === exerciseId)
  ) {
    return insertOffer(userId, chapterId, exerciseId, 'high_struggle_pass', score)
  }

  return null
}

async function insertOffer(
  userId: string,
  chapterId: string,
  exerciseId: string | null,
  triggerReason: RewardOffer['triggerReason'],
  struggleScore: number
): Promise<RewardOffer> {
  const [row] = await db
    .insert(schema.rewardEvents)
    .values({ userId, chapterId, exerciseId, triggerReason, struggleScore })
    .returning({ id: schema.rewardEvents.id })
  return { id: row.id, triggerReason, chapterId, struggleScore }
}
