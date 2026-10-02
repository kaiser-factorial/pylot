'use client'

// The vibecode break offer + toy surface (ARCHITECTURE §4.8). Shown when a
// graded submit's response carries a reward event. Three states:
//   offer  → warm pitch + accept/decline
//   idea   → one input: "what should I build you?"
//   toy    → the generated page in a SANDBOXED iframe (allow-scripts only;
//            no same-origin, no network by CSP of the sandbox, no storage)
// Declines are recorded too (accepted=false) so the trigger never re-fires.

import { useState } from 'react'
import type { RewardOffer } from '@/lib/rewards'
import { WorkbenchButton } from './display'

export function RewardBreak({ offer, onDone }: { offer: RewardOffer; onDone: () => void }) {
  const [phase, setPhase] = useState<'offer' | 'idea' | 'building' | 'toy' | 'error'>('offer')
  const [idea, setIdea] = useState('')
  const [toyHtml, setToyHtml] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  async function decline() {
    onDone()
    await fetch('/api/reward', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rewardId: offer.id, accepted: false }),
    }).catch(() => {})
  }

  async function buildToy() {
    if (idea.trim() === '') return
    setPhase('building')
    try {
      const resp = await fetch('/api/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: offer.id, idea }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        setErrorMsg(json.detail ?? json.error ?? 'something broke')
        setPhase('error')
        return
      }
      setToyHtml(json.html)
      setPhase('toy')
    } catch {
      setErrorMsg('could not reach the toy factory — connection?')
      setPhase('error')
    }
  }

  const headline =
    offer.triggerReason === 'chapter_complete'
      ? 'chapter complete. that was all you.'
      : 'that one fought back — and you won.'

  return (
    <div
      data-testid="reward-break"
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'color-mix(in srgb, var(--background) 75%, transparent)' }}
    >
      <div
        className="readable flex max-h-full w-full max-w-2xl flex-col gap-3 p-5"
        style={{
          background: 'var(--pane-bg)',
          border: 'var(--pane-border-w) solid var(--pane-border-strong)',
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--status-pass)' }}>
          ✓ {headline}
        </p>

        {phase === 'offer' && (
          <>
            <p className="text-[13px] leading-6" style={{ color: 'var(--prose-fg)' }}>
              Time for a <b>vibecode break</b>: the one place in this app where the AI is allowed
              to just build something — for fun, for you, zero learning value. Want a little toy?
            </p>
            <div className="flex gap-2">
              <WorkbenchButton onClick={() => setPhase('idea')} testId="reward-accept">
                yes, build me a toy ▸
              </WorkbenchButton>
              <WorkbenchButton variant="ghost" onClick={decline} testId="reward-decline">
                not now
              </WorkbenchButton>
            </div>
          </>
        )}

        {phase === 'idea' && (
          <>
            <label
              htmlFor="toy-idea"
              className="text-[11px] uppercase tracking-[0.15em]"
              style={{ color: 'var(--muted-foreground)' }}
            >
              what should it be? (anything. seriously.)
            </label>
            <textarea
              id="toy-idea"
              data-testid="toy-idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) buildToy()
              }}
              rows={3}
              maxLength={500}
              placeholder="a tiny aquarium where the fish are afraid of my cursor"
              className="w-full resize-y p-2 text-[13px] outline-none"
              style={{
                background: 'var(--editor-bg)',
                color: 'var(--editor-fg)',
                border: '1px solid var(--pane-border)',
                caretColor: 'var(--editor-cursor)',
              }}
            />
            <div className="flex gap-2">
              <WorkbenchButton onClick={buildToy} disabled={idea.trim() === ''} testId="toy-build">
                build it ▸
              </WorkbenchButton>
              <WorkbenchButton variant="ghost" onClick={decline}>
                actually, back to work
              </WorkbenchButton>
            </div>
          </>
        )}

        {phase === 'building' && (
          <p className="text-[13px]" style={{ color: 'var(--status-warn)' }}>
            building your toy…
          </p>
        )}

        {phase === 'toy' && toyHtml && (
          <>
            <iframe
              data-testid="toy-frame"
              sandbox="allow-scripts"
              srcDoc={toyHtml}
              title="your vibecode break"
              className="w-full"
              style={{ height: 'min(60vh, 480px)', border: '1px solid var(--pane-border)', background: '#0a0f0a' }}
            />
            <div className="flex gap-2">
              <WorkbenchButton onClick={onDone} testId="toy-close">
                back to work ▸
              </WorkbenchButton>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="text-[13px]" style={{ color: 'var(--status-fail)' }}>
              {errorMsg}
            </p>
            <div className="flex gap-2">
              <WorkbenchButton variant="ghost" onClick={() => setPhase('idea')}>
                try again
              </WorkbenchButton>
              <WorkbenchButton variant="ghost" onClick={onDone}>
                skip it
              </WorkbenchButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
