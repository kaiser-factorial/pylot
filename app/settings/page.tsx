import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { ProfileForm } from '@/components/settings/ProfileForm'

export const dynamic = 'force-dynamic'

// Settings view (ADR-006): the learner profile, editable anytime. With
// ?survey=1 the same form wears its onboarding-survey hat (skippable, returns
// to /learn) — one source of truth for the declared memory layer.

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ survey?: string }>
}) {
  const { survey } = await searchParams
  const isSurvey = survey === '1'
  const user = await getCurrentUser()
  const settings = await getUserSettings(user.id)

  return (
    <main className="fx-scanlines min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="relative z-[60] mx-auto max-w-xl px-6 py-10">
        <header className="mb-8 flex items-center gap-4">
          <Link
            href="/learn"
            className="pane-title-fx text-xl font-bold lowercase tracking-[0.1em]"
            style={{ color: 'var(--pane-title)' }}
          >
            pylot ✈
          </Link>
          <span className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
            {isSurvey ? 'tell the teacher about yourself' : 'settings'}
          </span>
          <div className="ml-auto">
            <ThemeToggle initial={settings.theme} />
          </div>
        </header>

        <section
          className="p-5"
          style={{
            border: 'var(--pane-border-w) solid var(--pane-border)',
            background: 'var(--pane-bg)',
            boxShadow: 'var(--pane-shadow)',
          }}
        >
          {isSurvey && (
            <p className="readable mb-5 text-[13px] leading-6" style={{ color: 'var(--prose-fg)' }}>
              all of this is optional — it just makes the teacher&apos;s hints and examples fit
              you better. you can change any of it here later.
            </p>
          )}
          <ProfileForm initial={settings.profile} isSurvey={isSurvey} />
        </section>

        {!isSurvey && (
          <p className="mt-4 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            <Link href="/learn" className="underline hover:opacity-80">
              ← back to the map
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
