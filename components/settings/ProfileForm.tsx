'use client'

// The learner profile form (ADR-006 layer 1) — doubles as the onboarding
// survey (?survey=1 framing) and the always-editable settings view. Every
// question is optional; PREFILLS from current settings and only PATCHes what
// the learner touched, so saving never nukes an existing profile. The
// background answer writes profile.background — the same field <LangContrast>
// and the teacher's contrast behavior read.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LearnerProfile } from '@/lib/settings'
import { WorkbenchButton } from '@/components/workbench/display'

const BACKGROUNDS: { value: string; label: string }[] = [
  { value: 'none', label: 'new to programming' },
  { value: 'js', label: 'JavaScript / TypeScript' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'java', label: 'Java' },
  { value: 'r', label: 'R' },
  { value: 'matlab', label: 'MATLAB' },
]

const DOMAINS: { value: string; label: string }[] = [
  { value: 'data-science', label: 'data science' },
  { value: 'ml', label: 'machine learning' },
  { value: 'general', label: 'general programming' },
]

const HINT_STYLES: { value: string; label: string }[] = [
  { value: 'socratic', label: 'ask me questions first — let me find it' },
  { value: 'direct', label: 'tell me plainly what to look at' },
]

const field = 'w-full p-2 text-[13px] outline-none'
const fieldStyle = {
  background: 'var(--editor-bg)',
  color: 'var(--editor-fg)',
  border: '1px solid var(--pane-border)',
  caretColor: 'var(--editor-cursor)',
} as const

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em]"
      style={{ color: 'var(--pane-title)' }}
    >
      {children}
    </label>
  )
}

export function ProfileForm({ initial, isSurvey }: { initial: LearnerProfile; isSurvey: boolean }) {
  const router = useRouter()
  const [background, setBackground] = useState(initial.background)
  const [whyLearning, setWhyLearning] = useState(initial.whyLearning ?? '')
  const [targetDomain, setTargetDomain] = useState(initial.targetDomain ?? '')
  const [datasetInterests, setDatasetInterests] = useState(initial.datasetInterests ?? '')
  const [hintStyle, setHintStyle] = useState(initial.hintStyle ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function patchProfile(profile: Partial<LearnerProfile>) {
    setSaving(true)
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    await patchProfile({
      background,
      whyLearning,
      targetDomain,
      datasetInterests,
      hintStyle,
      surveyDone: true,
    })
    setSaved(true)
    if (isSurvey) router.push('/learn')
    else router.refresh()
  }

  async function skip() {
    await patchProfile({ surveyDone: true })
    router.push('/learn')
  }

  return (
    <div className="readable space-y-5">
      <div>
        <Label>your programming background</Label>
        <select
          data-testid="profile-background"
          value={BACKGROUNDS.some((b) => b.value === background) ? background : 'none'}
          onChange={(e) => setBackground(e.target.value)}
          className={field}
          style={fieldStyle}
        >
          {BACKGROUNDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          lessons and the teacher will contrast Python with this language — &ldquo;new to
          programming&rdquo; hides all contrast callouts
        </p>
      </div>

      <div>
        <Label>why are you learning python?</Label>
        <textarea
          data-testid="profile-why"
          value={whyLearning}
          onChange={(e) => setWhyLearning(e.target.value)}
          rows={2}
          placeholder="in your own words — the teacher reads this"
          className={`${field} resize-y`}
          style={fieldStyle}
          spellCheck={false}
        />
      </div>

      <div>
        <Label>where are you headed?</Label>
        <select
          data-testid="profile-domain"
          value={targetDomain}
          onChange={(e) => setTargetDomain(e.target.value)}
          className={field}
          style={fieldStyle}
        >
          <option value="">(not sure yet)</option>
          {DOMAINS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>datasets or topics you&apos;d enjoy working with</Label>
        <input
          data-testid="profile-datasets"
          value={datasetInterests}
          onChange={(e) => setDatasetInterests(e.target.value)}
          placeholder="e.g. movies, ratings data, neuroscience, music"
          className={field}
          style={fieldStyle}
          spellCheck={false}
        />
      </div>

      <div>
        <Label>how do you like hints?</Label>
        <select
          data-testid="profile-hintstyle"
          value={hintStyle}
          onChange={(e) => setHintStyle(e.target.value)}
          className={field}
          style={fieldStyle}
        >
          <option value="">(no preference)</option>
          {HINT_STYLES.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <WorkbenchButton onClick={save} disabled={saving} testId="profile-save">
          {saving ? 'saving…' : isSurvey ? 'save & start learning ▸' : 'save'}
        </WorkbenchButton>
        {isSurvey && (
          <WorkbenchButton variant="ghost" onClick={skip} disabled={saving} testId="profile-skip">
            skip for now
          </WorkbenchButton>
        )}
        {saved && !isSurvey && (
          <span data-testid="profile-saved" className="text-[12px]" style={{ color: 'var(--status-pass)' }}>
            ✓ saved
          </span>
        )}
      </div>
    </div>
  )
}
