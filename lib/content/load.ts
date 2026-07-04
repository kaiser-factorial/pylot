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
 */
export type ClientExercise = Omit<Exercise, 'reference_solution' | 'sections'> & {
  sections: Omit<Exercise['sections'][number], 'reference_solution'>[]
}

export function toClientExercise(ex: Exercise): ClientExercise {
  const { reference_solution: _drop, sections, ...rest } = ex
  return {
    ...rest,
    sections: sections.map(({ reference_solution: _dropSection, ...s }) => s),
  }
}
