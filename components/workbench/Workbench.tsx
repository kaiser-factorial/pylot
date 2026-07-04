'use client'

// The three-pane Onramp loop (ROADMAP Phase 1, ARCHITECTURE §4.1):
//   lesson pane (MDX + task list + current task card)
//   work pane   (CodeMirror editor / predict-output prompt, Run/Submit, console + checks)
//   workspace   (live variable table, side-collapsible)
//
// Run = exploratory: executes without checks, feeds console + workspace only.
// Submit = graded: executes with the exercise's checks, appends an attempt row
// (graded:true also upserts progress server-side), advances the task on pass.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PyodideRunner, type RunResult } from '@/lib/coderunner'
import type { ClientExercise } from '@/lib/content/load'
import type { ExerciseStatus } from '@/lib/progression'
import { Panel } from '@/components/ui/Panel'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { PythonEditor } from '@/components/editor/PythonEditor'
import {
  CheckReportView,
  Console,
  DifficultyDots,
  InlineCode,
  KindBadge,
  WorkbenchButton,
  WorkspaceTable,
} from './display'

export type WorkbenchTask = {
  exercise: ClientExercise
  status: ExerciseStatus
  hintsUsed: number
}

type WorkbenchProps = {
  chapterTitle: string
  lessonTitle: string
  tasks: WorkbenchTask[]
  initialTaskId: string
  lessonSlot: ReactNode
  themeToggleSlot: ReactNode
  nav: {
    learnHref: string
    prevHref: string | null
    nextHref: string | null
    nextIsReady: boolean
  }
}

type RunnerStatus = 'booting' | 'ready' | 'running'

const normalizeOutput = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')

export function Workbench({
  chapterTitle,
  lessonTitle,
  tasks,
  initialTaskId,
  lessonSlot,
  themeToggleSlot,
  nav,
}: WorkbenchProps) {
  const runnerRef = useRef<PyodideRunner | null>(null)
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('booting')
  const [currentId, setCurrentId] = useState(initialTaskId)
  const [statuses, setStatuses] = useState<Record<string, ExerciseStatus>>(() =>
    Object.fromEntries(tasks.map((t) => [t.exercise.id, t.status]))
  )
  const [codeById, setCodeById] = useState<Record<string, string>>({})
  const [predictionById, setPredictionById] = useState<Record<string, string>>({})
  const [resultById, setResultById] = useState<Record<string, RunResult | null>>({})
  const [submittedById, setSubmittedById] = useState<Record<string, RunResult | null>>({})
  const [hintsRevealed, setHintsRevealed] = useState<Record<string, number>>(() =>
    Object.fromEntries(tasks.map((t) => [t.exercise.id, Math.min(t.hintsUsed, t.exercise.hints.length)]))
  )

  const taskIndex = Math.max(0, tasks.findIndex((t) => t.exercise.id === currentId))
  const task = tasks[taskIndex]
  const ex = task.exercise
  const isPredict = ex.kind === 'predict-output'
  const code = codeById[ex.id] ?? ex.starter_code
  const prediction = predictionById[ex.id] ?? ''
  const result = resultById[ex.id] ?? null
  const submitted = submittedById[ex.id] ?? null
  const passed = statuses[ex.id] === 'passed'
  const revealed = hintsRevealed[ex.id] ?? 0
  const allPassed = tasks.every((t) => statuses[t.exercise.id] === 'passed')
  const nextTask = tasks.slice(taskIndex + 1).find((t) => statuses[t.exercise.id] !== 'locked')

  useEffect(() => {
    const runner = new PyodideRunner()
    runnerRef.current = runner
    runner.ensureReady().then(() => setRunnerStatus('ready')).catch(() => setRunnerStatus('booting'))
    return () => runner.dispose()
  }, [])

  const rebootAfterTimeout = (res: RunResult) => {
    if (res.error?.type === 'Timeout') {
      setRunnerStatus('booting')
      runnerRef.current?.ensureReady().then(() => setRunnerStatus('ready'))
      return true
    }
    return false
  }

  async function runExploratory() {
    if (!runnerRef.current || runnerStatus !== 'ready') return
    setRunnerStatus('running')
    const res = await runnerRef.current.run(code)
    setResultById((m) => ({ ...m, [ex.id]: res }))
    if (!rebootAfterTimeout(res)) setRunnerStatus('ready')
  }

  async function submit() {
    if (!runnerRef.current || runnerStatus !== 'ready') return
    setRunnerStatus('running')
    const started = performance.now()
    const codeToRun = isPredict ? ex.starter_code : code
    const res = await runnerRef.current.run(codeToRun, ex.checks)
    const durationMs = performance.now() - started

    let graded: RunResult = res
    if (isPredict) {
      const ok = normalizeOutput(prediction) === normalizeOutput(res.stdout)
      graded = {
        ...res,
        checks: [
          ...res.checks,
          {
            index: res.checks.length,
            type: 'prediction',
            passed: ok,
            detail: ok
              ? 'your prediction matched the real output'
              : `you predicted ${JSON.stringify(prediction)} — the code actually printed ${JSON.stringify(res.stdout)}`,
          },
        ],
        passed: res.passed && ok,
      }
    }

    setResultById((m) => ({ ...m, [ex.id]: graded }))
    setSubmittedById((m) => ({ ...m, [ex.id]: graded }))
    if (!rebootAfterTimeout(graded)) setRunnerStatus('ready')

    await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exerciseId: ex.id,
        code: isPredict ? prediction : code,
        result: graded,
        durationMs,
        graded: true,
      }),
    })

    if (graded.passed) {
      setStatuses((m) => {
        const next = { ...m, [ex.id]: 'passed' as ExerciseStatus }
        // local unlock mirror of the server rule: next task opens on pass
        const after = tasks[taskIndex + 1]
        if (after && next[after.exercise.id] === 'locked') next[after.exercise.id] = 'available'
        return next
      })
    }
  }

  async function revealHint() {
    setHintsRevealed((m) => ({ ...m, [ex.id]: Math.min((m[ex.id] ?? 0) + 1, ex.hints.length) }))
    await fetch('/api/progress/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: ex.id }),
    })
  }

  const statusIcon = (id: string, idx: number) => {
    const s = statuses[id]
    if (s === 'passed') return <span style={{ color: 'var(--status-pass)' }}>✓</span>
    if (id === currentId) return <span style={{ color: 'var(--pane-title)' }}>▸</span>
    if (s === 'locked') return <span style={{ color: 'var(--muted-foreground)' }}>·</span>
    return <span style={{ color: 'var(--muted-foreground)' }}>{idx + 1}</span>
  }

  const runnerBadge = useMemo(
    () => (
      <span
        data-testid="runner-status"
        className="text-[9px] uppercase tracking-[0.2em]"
        style={{
          color:
            runnerStatus === 'ready'
              ? 'var(--status-pass)'
              : runnerStatus === 'running'
                ? 'var(--status-warn)'
                : 'var(--muted-foreground)',
        }}
      >
        ● {runnerStatus === 'booting' ? 'python booting…' : runnerStatus}
      </span>
    ),
    [runnerStatus]
  )

  return (
    <div className="fx-scanlines flex h-screen flex-col" style={{ background: 'var(--background)' }}>
      {/* top bar */}
      <header className="relative z-[60] flex items-center gap-3 px-4 py-2">
        <a
          href={nav.learnHref}
          className="pane-title-fx text-[13px] font-bold lowercase tracking-[0.1em]"
          style={{ color: 'var(--pane-title)' }}
        >
          pylot ✈
        </a>
        <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          {chapterTitle} · {lessonTitle}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {runnerBadge}
          {themeToggleSlot}
        </div>
      </header>

      <div className="relative z-[60] flex min-h-0 flex-1 gap-3 px-3 pb-3">
        {/* ---------------------------------------------------- lesson pane */}
        <Panel
          id="lesson"
          title="lesson"
          fill
          className="w-[36%] min-w-[320px] max-w-[560px] flex-shrink-0"
        >
          {/* copy is blocked pane-wide: the learner types (product invariant) */}
          <div className="readable" onCopy={(e) => e.preventDefault()}>
            <nav className="px-4 pt-3" data-testid="task-list">
              <ul className="space-y-1">
                {tasks.map((t, i) => {
                  const locked = statuses[t.exercise.id] === 'locked'
                  return (
                    <li key={t.exercise.id} className="flex items-center gap-2 text-[12px]">
                      <span className="w-4 text-center">{statusIcon(t.exercise.id, i)}</span>
                      <button
                        type="button"
                        data-testid={`task-nav-${i}`}
                        disabled={locked}
                        onClick={() => setCurrentId(t.exercise.id)}
                        className={`text-left disabled:cursor-not-allowed ${
                          t.exercise.id === currentId ? 'font-bold' : ''
                        }`}
                        style={{
                          color: locked
                            ? 'var(--muted-foreground)'
                            : t.exercise.id === currentId
                              ? 'var(--pane-title)'
                              : 'var(--prose-fg)',
                          opacity: locked ? 0.5 : 1,
                        }}
                      >
                        {t.exercise.title}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="lesson-prose px-4 py-3">{lessonSlot}</div>

            {/* current task card */}
            <div
              data-testid="task-card"
              className="mx-4 mb-4 p-3"
              style={{
                border: 'var(--pane-border-w) solid var(--pane-border-strong)',
                background: 'color-mix(in srgb, var(--pane-title) 4%, transparent)',
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.25em]"
                  style={{ color: 'var(--pane-title)' }}
                >
                  task {taskIndex + 1}/{tasks.length}
                </span>
                <KindBadge kind={ex.kind} />
                <span className="ml-auto text-[10px]">
                  <DifficultyDots level={ex.difficulty} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-6" data-testid="task-prompt">
                <InlineCode text={ex.prompt.trim()} />
              </p>

              {ex.hints.length > 0 && (
                <div className="mt-3 space-y-1">
                  {ex.hints.slice(0, revealed).map((h, i) => (
                    <p
                      key={i}
                      data-testid={`hint-${i}`}
                      className="text-[12px] leading-5"
                      style={{ color: 'var(--status-warn)' }}
                    >
                      hint {i + 1}: <InlineCode text={h} />
                    </p>
                  ))}
                  {revealed < ex.hints.length && !passed && (
                    <WorkbenchButton variant="ghost" onClick={revealHint} testId="reveal-hint">
                      reveal hint ({revealed}/{ex.hints.length} used)
                    </WorkbenchButton>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* ------------------------------------------------------ work pane */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Panel id="editor" title={`editor — ${ex.title}`} fill className="min-h-0 flex-[3]">
            {ex.sections.length > 0 ? (
              <p className="p-4 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                sectioned exercises arrive in Phase 3
              </p>
            ) : isPredict ? (
              <div className="flex h-full min-h-0 flex-col gap-2 p-3">
                <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: 'var(--muted-foreground)' }}>
                  read the code and run it in your head — no editor for this one:
                </p>
                <CodeBlock code={ex.starter_code} className="min-h-0 flex-shrink overflow-auto" />
                <label
                  className="mt-1 text-[11px] uppercase tracking-[0.15em]"
                  htmlFor="prediction"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  what will it print? (exactly, line by line)
                </label>
                <textarea
                  id="prediction"
                  data-testid="prediction-input"
                  value={prediction}
                  onChange={(e) => setPredictionById((m) => ({ ...m, [ex.id]: e.target.value }))}
                  spellCheck={false}
                  rows={4}
                  className="readable w-full resize-y p-2 text-[13px] outline-none"
                  style={{
                    background: 'var(--editor-bg)',
                    color: 'var(--editor-fg)',
                    border: '1px solid var(--pane-border)',
                    caretColor: 'var(--editor-cursor)',
                  }}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <PythonEditor
                  value={code}
                  onChange={(next) => setCodeById((m) => ({ ...m, [ex.id]: next }))}
                />
              </div>
            )}

            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderTop: '1px solid var(--pane-border)' }}
            >
              {!isPredict && (
                <WorkbenchButton
                  variant="ghost"
                  onClick={runExploratory}
                  disabled={runnerStatus !== 'ready' || ex.sections.length > 0}
                  testId="run-button"
                >
                  {runnerStatus === 'running' ? 'running…' : 'run ▸'}
                </WorkbenchButton>
              )}
              <WorkbenchButton
                onClick={submit}
                disabled={runnerStatus !== 'ready' || ex.sections.length > 0 || (isPredict && prediction.trim() === '')}
                testId="submit-button"
              >
                {isPredict ? 'check prediction' : 'submit ✓'}
              </WorkbenchButton>
              {!isPredict && (
                <WorkbenchButton
                  variant="ghost"
                  onClick={() => setCodeById((m) => ({ ...m, [ex.id]: ex.starter_code }))}
                  testId="reset-button"
                >
                  reset
                </WorkbenchButton>
              )}

              {passed && (
                <span
                  data-testid="passed-banner"
                  className="ml-auto flex items-center gap-3 text-[12px] font-bold"
                  style={{ color: 'var(--status-pass)' }}
                >
                  ✓ passed
                  {nextTask ? (
                    <WorkbenchButton
                      variant="ghost"
                      onClick={() => setCurrentId(nextTask.exercise.id)}
                      testId="next-task"
                    >
                      next task ▸
                    </WorkbenchButton>
                  ) : allPassed && nav.nextHref ? (
                    <a
                      href={nav.nextHref}
                      data-testid="next-lesson"
                      className="text-[11px] font-bold uppercase tracking-[0.15em] underline"
                      style={{ color: 'var(--pane-title)' }}
                    >
                      next lesson ▸
                    </a>
                  ) : allPassed ? (
                    <a
                      href={nav.learnHref}
                      className="text-[11px] font-bold uppercase tracking-[0.15em] underline"
                      style={{ color: 'var(--pane-title)' }}
                    >
                      lesson complete — back to map ▸
                    </a>
                  ) : null}
                </span>
              )}
            </div>
          </Panel>

          <Panel id="console" title="console + checks" fill className="min-h-0 flex-[2]">
            <Console
              result={result}
              placeholder={isPredict ? 'submit your prediction to see the real output' : 'run your code to see output'}
            />
            {submitted && <CheckReportView checks={submitted.checks} />}
          </Panel>
        </div>

        {/* ------------------------------------------------- workspace pane */}
        <Panel id="workspace" title="workspace" collapse="side" fill className="w-72 flex-shrink-0">
          <WorkspaceTable workspace={result?.workspace ?? []} />
        </Panel>
      </div>
    </div>
  )
}
