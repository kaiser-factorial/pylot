'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ThemeName } from '@/lib/settings'

// Theme switch: optimistic DOM flip (tokens do the rest), persisted to
// users.settings via /api/settings so it survives across sessions/devices.

export function ThemeToggle({ initial }: { initial: ThemeName }) {
  const router = useRouter()
  const [theme, setTheme] = useState<ThemeName>(initial)
  const [, startTransition] = useTransition()

  async function toggle() {
    const next: ThemeName = theme === 'cyber' ? 'primary' : 'cyber'
    setTheme(next)
    document.documentElement.dataset.theme = next
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    })
    startTransition(() => router.refresh())
  }

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggle}
      className="btn-press px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
      style={{
        border: 'var(--pane-border-w) solid var(--pane-border)',
        color: 'var(--pane-title)',
        boxShadow: 'var(--pane-shadow)',
        background: 'var(--pane-bg)',
      }}
      title="Switch theme"
    >
      {theme === 'cyber' ? 'theme: cyber' : 'theme: bauhaus'}
    </button>
  )
}
