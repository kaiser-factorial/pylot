import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { loadCurriculum } from '@/lib/content/load'
import { getProgression, type ExerciseProgress } from '@/lib/progression'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export const dynamic = 'force-dynamic'

// The learning map: chapters → lessons with progress, and one big
// "continue where you left off" action (resume rule, ROADMAP Phase 1).

export default async function LearnPage() {
  const user = await getCurrentUser()
  const [settings, curriculum, progression] = await Promise.all([
    getUserSettings(user.id),
    Promise.resolve(loadCurriculum()),
    getProgression(user.id),
  ])

  const byLesson = new Map<string, ExerciseProgress[]>()
  for (const ep of progression.exercises) {
    const key = `${ep.chapterId}/${ep.lessonDir}`
    byLesson.set(key, [...(byLesson.get(key) ?? []), ep])
  }

  const resume = progression.resume
  // "start" until the learner has actually done anything; "continue" after
  const hasBegun = progression.exercises.some((e) => e.status === 'passed' || e.attemptsCount > 0)

  return (
    <main className="fx-scanlines min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="relative z-[60] mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8 flex items-center gap-4">
          <h1
            className="pane-title-fx text-xl font-bold lowercase tracking-[0.1em]"
            style={{ color: 'var(--pane-title)' }}
          >
            pylot ✈
          </h1>
          <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
            fly the plane yourself
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/settings"
              data-testid="settings-link"
              className="text-[11px] lowercase tracking-[0.15em] hover:opacity-80"
              style={{ color: 'var(--muted-foreground)' }}
            >
              settings ⚙
            </Link>
            <ThemeToggle initial={settings.theme} />
          </div>
        </header>

        {/* onboarding survey prompt (optional + skippable — ADR-006 layer 1) */}
        {!settings.profile.surveyDone && (
          <Link
            href="/settings?survey=1"
            data-testid="survey-prompt"
            className="btn-anim mb-6 block px-4 py-3"
            style={{
              border: '1px dashed var(--pane-border-strong)',
              background: 'color-mix(in srgb, var(--status-info) 5%, transparent)',
            }}
          >
            <span className="text-[12px]" style={{ color: 'var(--prose-fg)' }}>
              <span className="font-bold" style={{ color: 'var(--status-info)' }}>
                new:
              </span>{' '}
              tell the teacher about yourself — 5 optional questions so hints and examples fit
              you ▸
            </span>
          </Link>
        )}

        {resume && (
          <Link
            href={`/learn/${resume.chapterId}/${resume.lessonDir}`}
            data-testid="resume-link"
            className="btn-press btn-anim mb-8 block p-4"
            style={{
              border: 'var(--pane-border-w) solid var(--pane-border-strong)',
              background: 'var(--pane-bg)',
              boxShadow: 'var(--pane-shadow)',
            }}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-[0.25em]"
              style={{ color: 'var(--status-pass)' }}
            >
              ▸ {hasBegun ? 'continue' : 'start'}
            </span>
            <div className="mt-1 text-[14px] font-bold" style={{ color: 'var(--prose-fg)' }}>
              {resume.title}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {resume.chapterTitle} · {resume.lessonDir}
            </div>
          </Link>
        )}

        <div className="space-y-6">
          {curriculum.chapters.map((ch) => (
            <section
              key={ch.id}
              data-testid={`chapter-${ch.id}`}
              style={{
                border: 'var(--pane-border-w) solid var(--pane-border)',
                background: 'var(--pane-bg)',
                boxShadow: 'var(--pane-shadow)',
              }}
            >
              <h2
                className="pane-title-fx px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em]"
                style={{
                  color: 'var(--pane-title)',
                  borderBottom: 'var(--pane-border-w) solid var(--pane-border)',
                }}
              >
                {ch.title}
              </h2>
              <ul>
                {ch.lessons.map((lessonDir) => {
                  const eps = byLesson.get(`${ch.id}/${lessonDir}`) ?? []
                  const passedCount = eps.filter((e) => e.status === 'passed').length
                  const done = eps.length > 0 && passedCount === eps.length
                  const locked = eps.length > 0 && eps[0].status === 'locked'
                  const row = (
                    <span className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                      <span
                        className="w-5 text-center"
                        style={{
                          color: done
                            ? 'var(--status-pass)'
                            : locked
                              ? 'var(--muted-foreground)'
                              : 'var(--pane-title)',
                        }}
                      >
                        {done ? '✓' : locked ? '🔒' : '▸'}
                      </span>
                      <span style={{ color: locked ? 'var(--muted-foreground)' : 'var(--prose-fg)' }}>
                        {lessonDir}
                      </span>
                      <span className="ml-auto text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        {passedCount}/{eps.length}
                      </span>
                    </span>
                  )
                  return (
                    <li key={lessonDir} style={{ borderTop: '1px solid var(--border)' }}>
                      {locked ? (
                        <div data-testid={`lesson-locked-${lessonDir}`} className="opacity-60">
                          {row}
                        </div>
                      ) : (
                        <Link
                          href={`/learn/${ch.id}/${lessonDir}`}
                          data-testid={`lesson-link-${lessonDir}`}
                          className="block hover:opacity-80"
                        >
                          {row}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
