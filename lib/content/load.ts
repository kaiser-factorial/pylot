import 'server-only'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { curriculum, exercisesFile, type Curriculum, type Exercise } from './schema'

// Server-side content access. Content is data (ADR-004): everything the app
// shows comes from content/ at request time — no rebuild to change a lesson.

const CONTENT_ROOT = join(process.cwd(), 'content')

export function loadCurriculum(): Curriculum {
  const raw = parse(readFileSync(join(CONTENT_ROOT, 'curriculum.yaml'), 'utf8'))
  return curriculum.parse(raw)
}

export type LessonContent = {
  chapterId: string
  chapterTitle: string
  lessonDir: string
  mdx: string
  exercises: Exercise[]
}

export function loadLesson(chapterId: string, lessonDir: string): LessonContent | null {
  const cur = loadCurriculum()
  const chapter = cur.chapters.find((c) => c.id === chapterId)
  if (!chapter || !chapter.lessons.includes(lessonDir)) return null
  const dir = join(CONTENT_ROOT, chapter.dir, lessonDir)
  if (!existsSync(join(dir, 'lesson.mdx'))) return null
  const mdx = readFileSync(join(dir, 'lesson.mdx'), 'utf8')
  const { exercises } = exercisesFile.parse(parse(readFileSync(join(dir, 'exercises.yaml'), 'utf8')))
  return { chapterId: chapter.id, chapterTitle: chapter.title, lessonDir, mdx, exercises }
}

export type ExerciseRef = {
  chapterId: string
  chapterTitle: string
  lessonDir: string
  exercise: Exercise
}

/** Every exercise in curriculum order — the spine progression is computed on. */
export function listAllExercises(): ExerciseRef[] {
  const cur = loadCurriculum()
  const out: ExerciseRef[] = []
  for (const ch of cur.chapters) {
    for (const lessonDir of ch.lessons) {
      const file = join(CONTENT_ROOT, ch.dir, lessonDir, 'exercises.yaml')
      if (!existsSync(file)) continue
      const { exercises } = exercisesFile.parse(parse(readFileSync(file, 'utf8')))
      for (const exercise of exercises) {
        out.push({ chapterId: ch.id, chapterTitle: ch.title, lessonDir, exercise })
      }
    }
  }
  return out
}

/**
 * What the browser receives. reference_solution never leaves the server —
 * it is a spoiler and the learner-facing app must not ship it.
 *
 * Exception by design: parsons exercises ARE the solution's lines, scrambled.
 * The set of lines is the exercise material; only the ORDER is the answer,
 * and the order is scrambled server-side (deterministically, so a reload
 * doesn't reshuffle mid-solve) before anything reaches the client.
 */
export type ClientExercise = Omit<Exercise, 'reference_solution' | 'sections'> & {
  sections: Omit<Exercise['sections'][number], 'reference_solution'>[]
  /** parsons only: the solution's non-blank lines in scrambled order */
  parsons_lines?: string[]
}

/** FNV-1a — a stable per-exercise shuffle seed (no Math.random: SSR + stability). */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic scramble that is guaranteed not to be the original order. */
export function scrambleLines(code: string, seedKey: string): string[] {
  const lines = code.replace(/\n+$/, '').split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) return lines
  for (let attempt = 0; attempt < 10; attempt++) {
    const rand = mulberry32(fnv1a(`${seedKey}#${attempt}`))
    const shuffled = [...lines]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    if (shuffled.join('\n') !== lines.join('\n')) return shuffled
  }
  // pathological (e.g. all lines identical): order can't matter anyway
  return lines
}

export function toClientExercise(ex: Exercise): ClientExercise {
  const { reference_solution: solution, sections, ...rest } = ex
  return {
    ...rest,
    sections: sections.map(({ reference_solution: _dropSection, ...s }) => s),
    ...(ex.kind === 'parsons' && solution
      ? { parsons_lines: scrambleLines(solution, ex.id) }
      : {}),
  }
}
