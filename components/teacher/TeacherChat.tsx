'use client'

// The teacher chat pane (ADR-005) — lives as a tab in the Workbench's right
// panel. Streaming text from /api/teacher; per-exercise threads persisted
// server-side (this component never posts the assistant turn back). It is a
// readable surface: no glow, theme tokens only. Teacher code renders through
// CodeBlock, which has no copy affordance — invariant #7 applies to teacher
// output too. The learner types.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { InlineCode, WorkbenchButton } from '@/components/workbench/display'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type TeacherSeed = { text: string; nonce: number }

type TeacherChatProps = {
  exerciseId: string
  exerciseTitle: string
  /** current editor code (or prediction text) — rides along with each message */
  code: string
  /** pre-seeded draft from the "ask the teacher" affordance */
  seed: TeacherSeed | null
}

/** Minimal markdown-ish rendering: ``` fences → CodeBlock, `spans` → InlineCode. */
function renderTeacherText(text: string): ReactNode[] {
  const parts = text.split(/```(?:[a-z]*\n)?/)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <CodeBlock key={i} code={part.replace(/\n$/, '')} className="my-2" />
    ) : (
      <span key={i} className="whitespace-pre-wrap">
        <InlineCode text={part} />
      </span>
    )
  )
}

export function TeacherChat({ exerciseId, exerciseTitle, code, seed }: TeacherChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [threadLoaded, setThreadLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const seenSeedNonce = useRef(0)

  // per-(user, exercise) thread: load whenever the exercise changes
  useEffect(() => {
    let cancelled = false
    setThreadLoaded(false)
    setMessages([])
    setNotice(null)
    fetch(`/api/teacher?exerciseId=${encodeURIComponent(exerciseId)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data: { messages?: ChatMessage[] }) => {
        if (cancelled) return
        setMessages((data.messages ?? []).map((m) => ({ role: m.role, content: m.content })))
        setThreadLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setThreadLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [exerciseId])

  // "ask the teacher about this" pre-seeds the draft (learner still hits send)
  useEffect(() => {
    if (seed && seed.nonce !== seenSeedNonce.current) {
      seenSeedNonce.current = seed.nonce
      setInput(seed.text)
    }
  }, [seed])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streaming])

  async function send() {
    const message = input.trim()
    if (message === '' || streaming) return
    setInput('')
    setNotice(null)
    setMessages((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '' }])
    setStreaming(true)
    try {
      const res = await fetch('/api/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, message, code }),
      })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null
        setMessages((m) => m.slice(0, -1)) // drop the empty assistant stub
        setNotice(
          err?.detail ??
            (res.status === 429
              ? 'the teacher is out of budget for this month'
              : `the teacher is unreachable right now (${res.status})`)
        )
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk === '') continue
        setMessages((m) => {
          const next = m.slice()
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      }
      // a tool-only or empty turn leaves an empty bubble — drop it
      setMessages((m) => (m[m.length - 1]?.content === '' ? m.slice(0, -1) : m))
    } catch {
      setNotice('connection lost mid-answer — the thread is saved, ask again')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div
      className="readable flex h-full min-h-0 flex-col"
      data-testid="teacher-chat"
      data-streaming={streaming ? 'true' : 'false'}
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
        style={{ background: 'var(--console-bg)' }}
        data-testid="teacher-messages"
      >
        {!threadLoaded && (
          <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            loading your thread…
          </p>
        )}
        {threadLoaded && messages.length === 0 && (
          <p className="text-[12px] leading-5" style={{ color: 'var(--muted-foreground)' }}>
            this thread is about <span style={{ color: 'var(--prose-fg)' }}>{exerciseTitle}</span>.
            the teacher can see your code, the check report, and what you&apos;ve tried — just ask.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid={`teacher-msg-${m.role}`}
            className="px-2.5 py-1.5 text-[12.5px] leading-6"
            style={
              m.role === 'user'
                ? {
                    borderLeft: '2px solid var(--pane-border-strong)',
                    background: 'color-mix(in srgb, var(--pane-title) 5%, transparent)',
                    color: 'var(--prose-fg)',
                  }
                : { color: 'var(--console-fg)' }
            }
          >
            {m.role === 'assistant' ? (
              <>
                {renderTeacherText(m.content)}
                {streaming && i === messages.length - 1 && (
                  <span className="animate-pulse" style={{ color: 'var(--pane-title)' }}>
                    ▍
                  </span>
                )}
              </>
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </div>
        ))}
        {notice && (
          <p data-testid="teacher-notice" className="text-[12px]" style={{ color: 'var(--status-warn)' }}>
            {notice}
          </p>
        )}
      </div>

      <div
        className="flex flex-shrink-0 items-end gap-2 p-2"
        style={{ borderTop: '1px solid var(--pane-border)' }}
      >
        <textarea
          data-testid="teacher-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="ask the teacher…"
          rows={Math.min(5, Math.max(1, input.split('\n').length))}
          spellCheck={false}
          className="min-w-0 flex-1 resize-none p-2 text-[12.5px] leading-5 outline-none"
          style={{
            background: 'var(--editor-bg)',
            color: 'var(--editor-fg)',
            border: '1px solid var(--pane-border)',
            caretColor: 'var(--editor-cursor)',
          }}
        />
        <WorkbenchButton onClick={send} disabled={streaming || input.trim() === ''} testId="teacher-send">
          {streaming ? '…' : 'send ▸'}
        </WorkbenchButton>
      </div>
    </div>
  )
}
