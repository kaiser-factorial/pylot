import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { loadCurriculum, toClientExercise } from '@/lib/content/load'
import { getProgression } from '@/lib/progression'
import { pickReviewExercises, chapterConcepts } from '@/lib/review'
import { PredictQuiz } from '@/components/lesson/PredictQuiz'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Workbench, type WorkbenchTask } from '@/components/workbench/Workbench'

export const dynamic = 'force-dynamic'

// Chapter-opening quick review (CURRICULUM cross-cutting mechanics): 4–6
// warm-ups picked from earlier chapters (struggle + staleness ranked), plus
// the "predict your own failure modes" quiz. Reuses the whole Workbench —
// re-attempts append to the log as usual and can never demote progress.

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ chapter: string }>
}) {
  const { chapter } = await params
  const curriculum = loadCurriculum()
  const ch = curriculum.chapters.find((c) => c.id === chapter)
  if (!ch || ch.lessons.length === 0) notFound()
  const firstLessonHref = `/learn/${chapter}/${ch.lessons[0]}`

  const user = await getCurrentUser()
  const [settings, progression, picks] = await Promise.all([
    getUserSettings(user.id),
    getProgression(user.id),
    pickReviewExercises(user.id, chapter),
  ])
  // nothing worth reviewing (first chapter / too little passed) → straight in
  if (picks.length === 0) redirect(firstLessonHref)

  const progressById = new Map(progression.exercises.map((e) => [e.id, e]))
  const tasks: WorkbenchTask[] = picks.map((ref) => {
    const p = progressById.get(ref.exercise.id)
    return {
      exercise: toClientExercise(ref.exercise),
      // presented fresh: review means doing it again, not admiring the ✓
      status: 'available',
      hintsUsed: p?.hintsUsed ?? 0,
      authoredHintsRevealed: p?.authoredHintsRevealed ?? 0,
    }
  })

  const concepts = chapterConcepts(chapter)
  const existingPrediction = settings.predictions[chapter] ?? null

  return (
    <Workbench
      chapterTitle={ch.title}
      lessonTitle="quick review"
      tasks={tasks}
      initialTaskId={tasks[0].exercise.id}
      lessonSlot={
        <div className="space-y-4 py-2">
          <p className="text-[13px] leading-6" style={{ color: 'var(--prose-fg)' }}>
            Warm-up before <b>{ch.title}</b>: {tasks.length} exercises you have seen before,
            picked from where you fought hardest and what has gone longest un-touched. Knock
            them out, then fly on.
          </p>
          {concepts.length > 0 && (
            <PredictQuiz chapterId={chapter} concepts={concepts} existing={existingPrediction} />
          )}
        </div>
      }
      themeToggleSlot={<ThemeToggle initial={settings.theme} />}
      nav={{
        learnHref: '/learn',
        prevHref: null,
        nextHref: firstLessonHref,
        nextIsReady: true,
      }}
    />
  )
}
