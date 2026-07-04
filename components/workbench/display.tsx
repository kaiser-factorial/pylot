'use client'

// Presentational pieces of the work pane: console, check report,
// workspace variable table, kind/difficulty badges, inline-code text.
// All are readability surfaces (.readable): no glow, no effects, ever.

import type { ReactNode } from 'react'
import type { CheckResult, RunResult } from '@/lib/coderunner'

/** Renders `backtick spans` in prompts/hints as inline code. */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split('`')
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="px-1"
            style={{ background: 'var(--editor-bg)', color: 'var(--syn-string)' }}
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em]"
      style={{
        border: '1px solid var(--pane-border)',
        color: 'var(--muted-foreground)',
      }}
    >
      {kind}
    </span>
  )
}

export function DifficultyDots({ level }: { level: number }) {
  return (
    <span aria-label={`difficulty ${level} of 5`} style={{ color: 'var(--pane-title)' }}>
      {'●'.repeat(level)}
      {/* --muted stays distinguishable from the filled dots in BOTH themes
          (--border is black-on-black under primary) */}
      <span style={{ color: 'var(--muted)' }}>{'●'.repeat(5 - level)}</span>
    </span>
  )
}

export function Console({ result, placeholder }: { result: RunResult | null; placeholder: string }) {
  return (
    <pre
      data-testid="console-output"
      className="readable min-h-20 whitespace-pre-wrap p-3 text-[12.5px] leading-6"
      style={{ background: 'var(--console-bg)', color: 'var(--console-fg)' }}
    >
      {result === null && <span style={{ color: 'var(--muted-foreground)' }}>{placeholder}</span>}
      {result?.stdout}
      {result?.stderr && <span style={{ color: 'var(--status-warn)' }}>{result.stderr}</span>}
      {result?.error && (
        <span data-testid="console-error" style={{ color: 'var(--status-fail)' }}>
          {result.error.traceback || `${result.error.type}: ${result.error.message}`}
        </span>
      )}
    </pre>
  )
}

/**
 * One check row: pass/fail mark + the driver's detail string, which carries
 * expected-vs-actual ("expected output 'x', got 'y'") — the Phase 1
 * "failing check shows expected vs actual clearly" requirement.
 */
export function CheckReportView({ checks }: { checks: CheckResult[] }) {
  if (checks.length === 0) return null
  return (
    <ul data-testid="check-report" className="readable space-y-1 px-3 pb-3">
      {checks.map((c) => {
        const color =
          c.passed === true ? 'var(--status-pass)' : c.passed === false ? 'var(--status-fail)' : 'var(--status-warn)'
        return (
          <li
            key={c.index}
            data-testid={`check-${c.passed === true ? 'pass' : c.passed === false ? 'fail' : 'pending'}`}
            className="flex gap-2 text-[12.5px] leading-5"
          >
            <span className="font-bold" style={{ color }}>
              {c.passed === true ? '✓' : c.passed === false ? '✗' : '~'}
            </span>
            <span>
              <span
                className="mr-2 text-[9px] font-bold uppercase tracking-[0.15em]"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {c.type}
              </span>
              <span
              className="whitespace-pre-wrap"
              style={{ color: c.passed === false ? color : 'var(--console-fg)' }}
            >
              {c.detail}
            </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function WorkspaceTable({ workspace }: { workspace: RunResult['workspace'] }) {
  if (workspace.length === 0) {
    return (
      <p className="readable p-3 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        no variables yet — run some code
      </p>
    )
  }
  return (
    <table data-testid="workspace-table" className="readable w-full border-collapse text-[12px]">
      <thead>
        <tr
          className="text-left text-[9px] uppercase tracking-[0.2em]"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <th className="px-3 py-1.5 font-bold">name</th>
          <th className="px-1 py-1.5 font-bold">type</th>
          <th className="px-1 py-1.5 font-bold">value</th>
        </tr>
      </thead>
      <tbody>
        {workspace.map((v) => (
          <tr key={v.name} style={{ borderTop: '1px solid var(--border)' }}>
            <td className="px-3 py-1" style={{ color: 'var(--pane-title)' }}>
              {v.name}
            </td>
            <td className="px-1 py-1" style={{ color: 'var(--muted-foreground)' }}>
              {v.type}
            </td>
            <td className="break-all px-1 py-1" style={{ color: 'var(--console-fg)' }}>
              {v.repr}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function WorkbenchButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  testId,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost'
  testId?: string
  title?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn-press btn-anim ${variant === 'primary' ? 'wb-btn-primary' : 'wb-btn-ghost'} px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  )
}
