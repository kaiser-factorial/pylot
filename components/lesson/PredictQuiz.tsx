'use client'

// "Predict your own failure modes" (owner idea, designed Phase 3): before a
// chapter starts, the learner forecasts which concepts will bite them. The
// answer is declared-layer memory (ADR-006) — stored in settings, injected
// into teacher context for this chapter, and delightfully checkable against
// reality later. Optional, skippable, editable.

import { useState } from 'react'
import type { ChapterPrediction } from '@/lib/settings'
import { WorkbenchButton } from '@/components/workbench/display'

type PredictQuizProps = {
  chapterId: string
  concepts: string[]
  existing: ChapterPrediction | null
}

export function PredictQuiz({ chapterId, concepts, existing }: PredictQuizProps) {
  const [picks, setPicks] = useState<string[]>(existing?.concepts ?? [])
  const [note, setNote] = useState(existing?.note ?? '')
  const [state, setState] = useState<'editing' | 'saving' | 'saved'>(existing ? 'saved' : 'editing')

  const toggle = (c: string) =>
    setPicks((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))

  async function save() {
    setState('saving')
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictions: { [chapterId]: { concepts: picks, note: note.trim() || undefined } },
      }),
    }).catch(() => {})
    setState('saved')
  }

  if (state === 'saved') {
    return (
      <div data-testid="predict-quiz-saved" className="space-y-2">
        <p className="text-[12px]" style={{ color: 'var(--status-pass)' }}>
          ✓ prediction on file{picks.length > 0 ? `: ${picks.join(', ')}` : ' (no picks — brave)'}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          the teacher knows what you called. let&apos;s see if you were right.
        </p>
        <WorkbenchButton variant="ghost" onClick={() => setState('editing')} testId="predict-edit">
          revise prediction
        </WorkbenchButton>
      </div>
    )
  }

  return (
    <div data-testid="predict-quiz" className="space-y-2">
      <p className="text-[12px] leading-5" style={{ color: 'var(--prose-fg)' }}>
        before you start: <b>predict your own failure modes.</b> which of these do you expect to
        trip you up? (the teacher will watch for them — and so will you, which is the point.)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {concepts.map((c) => {
          const on = picks.includes(c)
          return (
            <button
              key={c}
              type="button"
              data-testid={`predict-chip-${c}`}
              onClick={() => toggle(c)}
              aria-pressed={on}
              className="btn-anim px-2 py-1 text-[11px]"
              style={{
                border: `1px solid ${on ? 'var(--pane-border-strong)' : 'var(--pane-border)'}`,
                color: on ? 'var(--pane-title)' : 'var(--muted-foreground)',
                background: on ? 'color-mix(in srgb, var(--pane-title) 8%, transparent)' : 'transparent',
              }}
            >
              {on ? '✓ ' : ''}
              {c}
            </button>
          )
        })}
      </div>
      <textarea
        data-testid="predict-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="anything else you suspect? ('I will absolutely forget the colon')"
        className="w-full resize-y p-2 text-[12px] outline-none"
        style={{
          background: 'var(--editor-bg)',
          color: 'var(--editor-fg)',
          border: '1px solid var(--pane-border)',
          caretColor: 'var(--editor-cursor)',
        }}
      />
      <WorkbenchButton
        onClick={save}
        disabled={state === 'saving'}
        testId="predict-save"
      >
        {state === 'saving' ? 'saving…' : 'log the prediction ▸'}
      </WorkbenchButton>
    </div>
  )
}
