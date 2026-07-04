import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { listAllExercises, loadLesson } from '@/lib/content/load'
import { getUserSettings, type LearnerProfile } from '@/lib/settings'
import type { Exercise } from '@/lib/content/schema'

// Teacher context assembly (ADR-005 option A): the server — never the client —
// gathers everything the model needs per message, so the learner never has to
// say "what I'm working on". The client contributes exactly one thing: the
// current editor code. Check reports and attempt history come from the DB;
// the client is not trusted for those.

/** Cap history so context stays inside budget (ADR-006 adds a memory section in Phase 3). */
const MAX_ATTEMPTS = 5
const MAX_ATTEMPT_CODE_CHARS = 1_500
const MAX_STDERR_CHARS = 1_200
const MAX_CURRENT_CODE_CHARS = 6_000

export type TeacherAttempt = {
  code: string
  passed: boolean
  /** check-driver rows: {index, type, passed, detail} — detail is already human-readable */
  checkReport: unknown[]
  stderr: string
  createdAt: Date
}

export type TeacherContext = {
  exercise: {
    id: string
    title: string
    kind: Exercise['kind']
    difficulty: number
    prompt: string
    concepts: string[]
    starterCode: string
    /** all authored hints, in ladder order */
    hints: string[]
    /**
     * Server-side only, never sent to the browser. The prompt layer wraps it
     * in an explicit never-reveal block pre-pass; post-pass it may be shown.
     */
    referenceSolution: string | null
  }
  lesson: {
    chapterId: string
    chapterTitle: string
    lessonDir: string
    mdx: string
  }
  learner: {
    profile: LearnerProfile & Record<string, unknown>
    /** exercise already passed → ladder rung 4 (full solutions) is unlocked */
    passed: boolean
    attemptsCount: number
    /** total hint reveals (authored + teacher-improvised), the honest counter */
    hintsUsed: number
    /** how many of the authored hints the learner has already seen */
    authoredHintsRevealed: number
    chapterProgress: { passed: number; total: number }
  }
  /** what's in the editor right now (client-sent, truncated) */
  currentCode: string
  /** newest first; [0] holds the latest check report — the teacher's ground truth */
  recentAttempts: TeacherAttempt[]
}

const truncate = (s: string, max: number) =>
  s.length <= max ? s : s.slice(0, max) + `\n… [truncated, ${s.length - max} more chars]`

/**
 * (userId, exerciseId, currentCode) → everything the teacher prompt needs.
 * Returns null when the exercise id doesn't exist in the curriculum.
 */
export async function assembleTeacherContext(
  userId: string,
  exerciseId: string,
  currentCode: string
): Promise<TeacherContext | null> {
  const ref = listAllExercises().find((r) => r.exercise.id === exerciseId)
  if (!ref) return null
  const lesson = loadLesson(ref.chapterId, ref.lessonDir)
  if (!lesson) return null
  const ex = ref.exercise

  const [settings, progressRows, attemptRows] = await Promise.all([
    getUserSettings(userId),
    db.select().from(schema.progress).where(eq(schema.progress.userId, userId)),
    db
      .select({
        code: schema.attempts.code,
        passed: schema.attempts.passed,
        checkReport: schema.attempts.checkReport,
        stderr: schema.attempts.stderr,
        createdAt: schema.attempts.createdAt,
      })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), eq(schema.attempts.exerciseId, exerciseId)))
      .orderBy(desc(schema.attempts.id))
      .limit(MAX_ATTEMPTS),
  ])

  const progressByExercise = new Map(progressRows.map((r) => [r.exerciseId, r]))
  const row = progressByExercise.get(exerciseId)
  const passed = row?.status === 'passed'
  const hintsUsed = row?.hintsUsed ?? 0

  const chapterExerciseIds = listAllExercises()
    .filter((r) => r.chapterId === ref.chapterId)
    .map((r) => r.exercise.id)
  const chapterPassed = chapterExerciseIds.filter(
    (id) => progressByExercise.get(id)?.status === 'passed'
  ).length

  return {
    exercise: {
      id: ex.id,
      title: ex.title,
      kind: ex.kind,
      difficulty: ex.difficulty,
      prompt: ex.prompt,
      concepts: ex.concepts,
      starterCode: ex.starter_code,
      hints: ex.hints,
      referenceSolution: ex.reference_solution ?? null,
    },
    lesson: {
      chapterId: lesson.chapterId,
      chapterTitle: lesson.chapterTitle,
      lessonDir: lesson.lessonDir,
      mdx: lesson.mdx,
    },
    learner: {
      profile: settings.profile,
      passed,
      attemptsCount: row?.attemptsCount ?? 0,
      hintsUsed,
      authoredHintsRevealed: Math.min(row?.authoredHintsRevealed ?? 0, ex.hints.length),
      chapterProgress: { passed: chapterPassed, total: chapterExerciseIds.length },
    },
    currentCode: truncate(currentCode, MAX_CURRENT_CODE_CHARS),
    recentAttempts: attemptRows.map((a) => ({
      code: truncate(a.code, MAX_ATTEMPT_CODE_CHARS),
      passed: a.passed,
      checkReport: a.checkReport,
      stderr: truncate(a.stderr, MAX_STDERR_CHARS),
      createdAt: a.createdAt,
    })),
  }
}
