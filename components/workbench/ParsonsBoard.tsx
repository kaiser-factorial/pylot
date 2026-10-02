'use client'

// Parsons exercises (CURRICULUM "structure without syntax anxiety"): the
// solution's lines arrive pre-scrambled from the server (only the ORDER is
// the answer) and the learner rearranges whole lines — drag, or the ▲▼
// buttons. No text entry, no copy affordance (the pane blocks copy anyway).
// Indentation ships with each line, so structure is judged by ordering alone.

import { useRef, useState } from 'react'

type ParsonsBoardProps = {
  lines: string[]
  /** permutation of indices into `lines` — the learner's current ordering */
  order: number[]
  onChange: (order: number[]) => void
}

export function ParsonsBoard({ lines, order, onChange }: ParsonsBoardProps) {
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const move = (pos: number, dir: -1 | 1) => {
    const target = pos + dir
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[pos], next[target]] = [next[target], next[pos]]
    onChange(next)
  }

  const drop = (pos: number) => {
    const from = dragFrom.current
    dragFrom.current = null
    setDragOver(null)
    if (from === null || from === pos) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(pos, 0, moved)
    onChange(next)
  }

  return (
    <div
      data-testid="parsons-board"
      className="readable flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-3"
      style={{ background: 'var(--editor-bg)' }}
    >
      <p className="pb-1 text-[11px] uppercase tracking-[0.15em]" style={{ color: 'var(--muted-foreground)' }}>
        put the lines in order — drag, or use the arrows:
      </p>
      {order.map((lineIdx, pos) => (
        <div
          key={lineIdx}
          data-testid={`parsons-line-${pos}`}
          draggable
          onDragStart={() => (dragFrom.current = pos)}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(pos)
          }}
          onDragLeave={() => setDragOver((v) => (v === pos ? null : v))}
          onDrop={() => drop(pos)}
          onDragEnd={() => {
            dragFrom.current = null
            setDragOver(null)
          }}
          className="flex items-center gap-2 px-2 py-1"
          style={{
            border: `1px solid ${dragOver === pos ? 'var(--pane-border-strong)' : 'var(--pane-border)'}`,
            background: 'var(--console-bg)',
            cursor: 'grab',
          }}
        >
          <span className="select-none text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            ⠿
          </span>
          <pre
            className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-[13px] leading-6"
            style={{ color: 'var(--editor-fg)' }}
          >
            {lines[lineIdx]}
          </pre>
          <span className="flex flex-shrink-0 gap-1">
            <button
              type="button"
              data-testid={`parsons-up-${pos}`}
              onClick={() => move(pos, -1)}
              disabled={pos === 0}
              aria-label={`move line ${pos + 1} up`}
              className="btn-anim px-1 text-[11px] disabled:opacity-30"
              style={{ color: 'var(--pane-title)' }}
            >
              ▲
            </button>
            <button
              type="button"
              data-testid={`parsons-down-${pos}`}
              onClick={() => move(pos, 1)}
              disabled={pos === order.length - 1}
              aria-label={`move line ${pos + 1} down`}
              className="btn-anim px-1 text-[11px] disabled:opacity-30"
              style={{ color: 'var(--pane-title)' }}
            >
              ▼
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
