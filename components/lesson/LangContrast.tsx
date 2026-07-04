// <LangContrast lang="js"> … </LangContrast> — profile-aware contrast callout
// (CURRICULUM "Language-contrast callouts"). Authored per background language;
// rendered only when the learner's declared background matches. Learners marked
// new-to-programming ('none') see none of them. Server-rendered: the profile is
// bound in the MDX components map (see LessonMdx), so unmatched variants never
// reach the client at all.

import type { ReactNode } from 'react'

const LANG_LABELS: Record<string, string> = {
  js: 'JS',
  cpp: 'C++',
  java: 'Java',
  r: 'R',
  matlab: 'MATLAB',
}

type LangContrastProps = {
  lang: string
  profileBackground: string
  children: ReactNode
}

export function LangContrast({ lang, profileBackground, children }: LangContrastProps) {
  if (lang !== profileBackground) return null
  const label = LANG_LABELS[lang] ?? lang.toUpperCase()
  return (
    <aside
      data-testid="lang-contrast"
      className="my-4 px-3 py-2 text-[0.95em]"
      style={{
        borderLeft: '3px solid var(--status-info)',
        background: 'color-mix(in srgb, var(--status-info) 6%, transparent)',
      }}
    >
      <div
        className="mb-1 text-[9px] font-bold uppercase tracking-[0.25em]"
        style={{ color: 'var(--status-info)' }}
      >
        {label} ⇄ PY
      </div>
      {children}
    </aside>
  )
}
