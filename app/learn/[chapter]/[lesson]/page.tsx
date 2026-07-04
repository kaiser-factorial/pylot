import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { loadCurriculum, loadLesson, toClientExercise } from '@/lib/content/load'
import { getProgression } from '@/lib/progression'
import { LessonMdx } from '@/components/lesson/LessonMdx'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Workbench, type WorkbenchTask } from '@/components/workbench/Workbench'

export const dynamic = 'force-dynamic'

// The three-pane lesson screen. Server assembles everything (content, profile,
// progress) and hands the client Workbench only what it may see —
// reference solutions never leave the server (toClientExercise strips them).

export default async function LessonPage({
  params,
}: {
  params: Promise<{ chapter: string; lesson: string }>
}) {
  const { chapter, lesson } = await params
  const content = loadLesson(chapter, lesson)
  if (!content) notFound()

  const user = await getCurrentUser()
  const [settings, progression] = await Promise.all([
    getUserSettings(user.id),
    getProgression(user.id),
  ])

  const lessonProgress = progression.exercises.filter(
    (e) => e.chapterId === chapter && e.lessonDir === lesson
  )
  // unlock rule: a lesson is enterable once its first exercise is reachable
  if (lessonProgress.length > 0 && lessonProgress[0].status === 'locked') redirect('/learn')

  const tasks: WorkbenchTask[] = content.exercises.map((ex) => {
    const p = lessonProgress.find((e) => e.id === ex.id)
    return {
      exercise: toClientExercise(ex),
      status: p?.status ?? 'available',
      hintsUsed: p?.hintsUsed ?? 0,
    }
  })

  // resume inside the lesson: first task that isn't passed yet
  const initialTaskId =
    tasks.find((t) => t.status === 'available')?.exercise.id ?? tasks[0].exercise.id

  // prev/next lesson links from curriculum order
  const curriculum = loadCurriculum()
  const flat = curriculum.chapters.flatMap((ch) =>
    ch.lessons.map((l) => ({ chapterId: ch.id, lessonDir: l }))
  )
  const idx = flat.findIndex((f) => f.chapterId === chapter && f.lessonDir === lesson)
  const prev = idx > 0 ? flat[idx - 1] : null
  const next = idx < flat.length - 1 ? flat[idx + 1] : null

  return (
    <Workbench
      chapterTitle={content.chapterTitle}
      lessonTitle={lesson}
      tasks={tasks}
      initialTaskId={initialTaskId}
      lessonSlot={<LessonMdx mdx={content.mdx} profileBackground={settings.profile.background} />}
      themeToggleSlot={<ThemeToggle initial={settings.theme} />}
      nav={{
        learnHref: '/learn',
        prevHref: prev ? `/learn/${prev.chapterId}/${prev.lessonDir}` : null,
        nextHref: next ? `/learn/${next.chapterId}/${next.lessonDir}` : null,
        nextIsReady: tasks.every((t) => t.status === 'passed'),
      }}
    />
  )
}
