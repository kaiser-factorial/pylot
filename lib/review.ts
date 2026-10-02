import 'server-only'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { listAllExercises, loadCurriculum, type ExerciseRef } from '@/lib/content/load'
import { deriveStruggleSummary } from '@/lib/memory/derived'

// Spaced quick-review (CURRICULUM "Cross-cutting mechanics"): each chapter
// opens with a 4–6 exercise warm-up drawn from EARLIER chapters' pool.
// Simple scheduling off the attempts log — deliberately no SRS machinery:
//   rank = struggle (concepts the learner actually failed) + staleness
//          (longest since last attempt), deterministic tiebreak.
// Only exercises the learner has PASSED are candidates: review rehearses,
// it never ambushes with unlearned material.

export const REVIEW_MIN = 4
export const REVIEW_MAX = 6

export async function pickReviewExercises(
  userId: string,
  chapterId: string
): Promise<ExerciseRef[]> {
  const curriculum = loadCurriculum()
  const chapterOrder = curriculum.chapters.map((c) => c.id)
  const targetIdx = chapterOrder.indexOf(chapterId)
  if (targetIdx <= 0) return [] // first chapter (or unknown): nothing earlier to review

  const earlierChapters = new Set(chapterOrder.slice(0, targetIdx))
  const refs = listAllExercises().filter((r) => earlierChapters.has(r.chapterId))

  const [progressRows, lastAttempts, struggleSummary] = await Promise.all([
    db
      .select({ exerciseId: schema.progress.exerciseId, status: schema.progress.status })
      .from(schema.progress)
      .where(eq(schema.progress.userId, userId)),
    db
      .select({
        exerciseId: schema.attempts.exerciseId,
        createdAt: schema.attempts.createdAt,
      })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), ne(schema.attempts.exerciseId, 'dev/free-run')))
      .orderBy(desc(schema.attempts.id)),
    deriveStruggleSummary(userId),
  ])

  const passed = new Set(
    progressRows.filter((r) => r.status === 'passed').map((r) => r.exerciseId)
  )
  const candidates = refs.filter((r) => passed.has(r.exercise.id))
  if (candidates.length < REVIEW_MIN) return []

  const newestAttemptAt = new Map<string, number>()
  for (const a of lastAttempts) {
    if (!newestAttemptAt.has(a.exerciseId)) newestAttemptAt.set(a.exerciseId, a.createdAt.getTime())
  }

  const struggleRank = new Map(struggleSummary.struggles.map((s, i) => [s.concept, i]))
  const now = Date.now()

  const scored = candidates.map((ref) => {
    // struggle: best (lowest) rank among the exercise's concepts → big boost
    const bestRank = Math.min(
      ...ref.exercise.concepts.map((c) => struggleRank.get(c) ?? Number.POSITIVE_INFINITY)
    )
    const struggleBoost = Number.isFinite(bestRank) ? Math.max(0, 5 - bestRank) * 10 : 0
    // staleness: days since last attempt (cap 30) — never attempted ranks stale
    const last = newestAttemptAt.get(ref.exercise.id)
    const staleDays = last ? Math.min(30, (now - last) / 86_400_000) : 30
    return { ref, score: struggleBoost + staleDays }
  })

  scored.sort(
    (a, b) => b.score - a.score || a.ref.exercise.id.localeCompare(b.ref.exercise.id)
  )

  // spread coverage: at most 2 per lesson, then fill if we came up short
  const picked: ExerciseRef[] = []
  const perLesson = new Map<string, number>()
  for (const { ref } of scored) {
    if (picked.length >= REVIEW_MAX) break
    const key = `${ref.chapterId}/${ref.lessonDir}`
    if ((perLesson.get(key) ?? 0) >= 2) continue
    perLesson.set(key, (perLesson.get(key) ?? 0) + 1)
    picked.push(ref)
  }
  if (picked.length < REVIEW_MIN) {
    for (const { ref } of scored) {
      if (picked.length >= REVIEW_MIN) break
      if (!picked.includes(ref)) picked.push(ref)
    }
  }

  // present warm-ups in curriculum order — the narrative reads forward
  const orderIndex = new Map(refs.map((r, i) => [r.exercise.id, i]))
  return picked.sort(
    (a, b) => (orderIndex.get(a.exercise.id) ?? 0) - (orderIndex.get(b.exercise.id) ?? 0)
  )
}

/**
 * Union of concept tags across a chapter's exercises — the option list for
 * the "predict your own failure modes" quiz.
 */
export function chapterConcepts(chapterId: string, cap = 10): string[] {
  const seen = new Set<string>()
  for (const ref of listAllExercises()) {
    if (ref.chapterId !== chapterId) continue
    for (const c of ref.exercise.concepts) seen.add(c)
  }
  return [...seen].slice(0, cap)
}
