import 'server-only'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { listAllExercises } from '@/lib/content/load'

// ADR-006 layer 2 — the load-bearing memory layer. Pure aggregation over the
// append-only attempts log × exercise concept tags. Computed on demand, never
// stored as prose, never model-written. Feeds:
//   - the teacher context ("slicing is your most frequent stumble" — with the
//     real counts, the ONLY numbers the teacher may cite about performance)
//   - struggle scores for reward triggers (ARCHITECTURE §4.8)
//   - later: adaptive difficulty (Phase 7 reads the same tags)

export type ConceptStruggle = {
  concept: string
  fails: number
  passes: number
  /** progress.hintsUsed summed over exercises carrying this concept */
  hintsUsed: number
  /** distinct exercises with at least one attempt */
  exercisesTried: number
  lastAttemptAt: Date | null
}

export type StruggleSummary = {
  /** concepts ordered by most-struggled-first; only concepts with ≥1 fail */
  struggles: ConceptStruggle[]
  totalAttempts: number
}

/**
 * Sectioned exercises write one attempt row per section per submit. For
 * concept aggregation, a submit is ONE attempt (grouped by exercise +
 * createdAt), so a 5-section capstone doesn't count 5× per submit.
 */
export async function deriveStruggleSummary(userId: string): Promise<StruggleSummary> {
  const [attemptRows, progressRows] = await Promise.all([
    db
      .select({
        exerciseId: schema.attempts.exerciseId,
        passed: schema.attempts.passed,
        createdAt: schema.attempts.createdAt,
      })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), ne(schema.attempts.exerciseId, 'dev/free-run'))),
    db
      .select({ exerciseId: schema.progress.exerciseId, hintsUsed: schema.progress.hintsUsed })
      .from(schema.progress)
      .where(eq(schema.progress.userId, userId)),
  ])

  const conceptsByExercise = new Map(
    listAllExercises().map((r) => [r.exercise.id, r.exercise.concepts])
  )
  const hintsByExercise = new Map(progressRows.map((r) => [r.exerciseId, r.hintsUsed]))

  // collapse per-section rows into one submit: exerciseId + createdAt bucket;
  // a submit passes only if every row in it passed
  const submits = new Map<string, { exerciseId: string; passed: boolean; createdAt: Date }>()
  for (const row of attemptRows) {
    const key = `${row.exerciseId}@${row.createdAt.getTime()}`
    const existing = submits.get(key)
    if (existing) existing.passed = existing.passed && row.passed
    else submits.set(key, { exerciseId: row.exerciseId, passed: row.passed, createdAt: row.createdAt })
  }

  const byConcept = new Map<string, ConceptStruggle & { exerciseIds: Set<string> }>()
  for (const sub of submits.values()) {
    const concepts = conceptsByExercise.get(sub.exerciseId)
    if (!concepts) continue // exercise no longer in curriculum
    for (const concept of concepts) {
      let agg = byConcept.get(concept)
      if (!agg) {
        agg = {
          concept,
          fails: 0,
          passes: 0,
          hintsUsed: 0,
          exercisesTried: 0,
          lastAttemptAt: null,
          exerciseIds: new Set(),
        }
        byConcept.set(concept, agg)
      }
      if (sub.passed) agg.passes++
      else agg.fails++
      if (!agg.lastAttemptAt || sub.createdAt > agg.lastAttemptAt) agg.lastAttemptAt = sub.createdAt
      agg.exerciseIds.add(sub.exerciseId)
    }
  }

  for (const agg of byConcept.values()) {
    agg.exercisesTried = agg.exerciseIds.size
    for (const id of agg.exerciseIds) agg.hintsUsed += hintsByExercise.get(id) ?? 0
  }

  const struggles = [...byConcept.values()]
    .filter((c) => c.fails > 0)
    .map(({ exerciseIds: _drop, ...c }) => c)
    .sort((a, b) => b.fails * (b.fails / (b.fails + b.passes || 1)) - a.fails * (a.fails / (a.fails + a.passes || 1)))

  return { struggles, totalAttempts: submits.size }
}

// ---------------------------------------------------------------------------
// Per-exercise struggle score (ARCHITECTURE §4.8): a function of failed
// attempts, hint depth, and time-on-task, normalized by difficulty. Pure and
// deterministic given the log — reward triggers and tests both call this.
// ---------------------------------------------------------------------------

/** Tunable weights — one place, documented by the tests in verify:phase3. */
export const STRUGGLE_WEIGHTS = {
  perFailedSubmit: 1.0,
  perHint: 0.75,
  /** wall-clock minutes between first and last attempt, capped (idle-damped) */
  perSpanMinute: 1 / 15,
  spanCapMinutes: 30,
}

/** Scores ≥ this are "high-struggle" — a pass at/above it may trigger a reward. */
export const HIGH_STRUGGLE_THRESHOLD = 1.5

export type ExerciseStruggle = {
  exerciseId: string
  score: number
  failedSubmits: number
  hintsUsed: number
  spanMinutes: number
  difficulty: number
}

/**
 * Struggle score for one exercise from its submit history + hint counter.
 * Sectioned rows collapse to submits exactly like deriveStruggleSummary.
 */
export async function computeExerciseStruggle(
  userId: string,
  exerciseId: string
): Promise<ExerciseStruggle | null> {
  const ref = listAllExercises().find((r) => r.exercise.id === exerciseId)
  if (!ref) return null

  const [attemptRows, progressRows] = await Promise.all([
    db
      .select({ passed: schema.attempts.passed, createdAt: schema.attempts.createdAt })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), eq(schema.attempts.exerciseId, exerciseId))),
    db
      .select({ hintsUsed: schema.progress.hintsUsed })
      .from(schema.progress)
      .where(and(eq(schema.progress.userId, userId), eq(schema.progress.exerciseId, exerciseId))),
  ])
  if (attemptRows.length === 0) return null

  const submits = new Map<number, boolean>()
  for (const row of attemptRows) {
    const t = row.createdAt.getTime()
    submits.set(t, (submits.get(t) ?? true) && row.passed)
  }
  const times = [...submits.keys()].sort((a, b) => a - b)
  const failedSubmits = [...submits.values()].filter((p) => !p).length
  const hintsUsed = progressRows[0]?.hintsUsed ?? 0
  const spanMinutes = Math.min(
    STRUGGLE_WEIGHTS.spanCapMinutes,
    (times[times.length - 1] - times[0]) / 60_000
  )
  const difficulty = ref.exercise.difficulty

  const raw =
    failedSubmits * STRUGGLE_WEIGHTS.perFailedSubmit +
    hintsUsed * STRUGGLE_WEIGHTS.perHint +
    spanMinutes * STRUGGLE_WEIGHTS.perSpanMinute
  const score = raw / Math.max(1, difficulty)

  return { exerciseId, score, failedSubmits, hintsUsed, spanMinutes, difficulty }
}
