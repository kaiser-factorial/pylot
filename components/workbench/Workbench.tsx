'use client'

// The three-pane Onramp loop (ROADMAP Phase 1, ARCHITECTURE §4.1):
//   lesson pane (sticky progress strip → collapsible briefing → stacked task cards)
//   work pane   (CodeMirror editor / predict-output prompt, Run/Submit, console + checks)
//   workspace   (live variable table, side-collapsible)
//
// Run = exploratory: executes without checks, feeds console + workspace only.
// Submit = graded (it runs the code itself — no prior Run needed): executes with
// the exercise's checks, appends an attempt row (graded:true also upserts
// progress server-side), and lights up the next task card in the stack.
// Shortcuts: Mod-Enter = run, Mod-Shift-Enter = submit.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PyodideRunner, type RunResult } from '@/lib/coderunner'
import type { ClientExercise } from '@/lib/content/load'
import type { ExerciseStatus } from '@/lib/progression'
import { Panel } from '@/components/ui/Panel'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { PythonEditor } from '@/components/editor/PythonEditor'
import { TeacherChat, type TeacherSeed } from '@/components/teacher/TeacherChat'
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
  authoredHintsRevealed: number
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

/** Multi-line values render as indented lines, matching the Python driver. */
const fmtOutput = (s: string) => {
  const t = s.replace(/\n+$/, '')
  if (t.includes('\n')) return '\n' + t.split('\n').map((l) => `    ${l}`).join('\n')
  return t === '' || t !== t.trim() ? JSON.stringify(t) : t
}

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
  const anyPassedHere = tasks.some((t) => t.status === 'passed')
  const [briefingOpen, setBriefingOpen] = useState(!anyPassedHere)
  const [codeById, setCodeById] = useState<Record<string, string>>({})
  const [predictionById, setPredictionById] = useState<Record<string, string>>({})
  const [resultById, setResultById] = useState<Record<string, RunResult | null>>({})
  const [submittedById, setSubmittedById] = useState<Record<string, RunResult | null>>({})
  const [hintsRevealed, setHintsRevealed] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      tasks.map((t) => [t.exercise.id, Math.min(t.authoredHintsRevealed, t.exercise.hints.length)])
    )
  )
  // right pane tabs (ARCHITECTURE §4.1: teacher chat shares the pane as a tab)
  const [rightTab, setRightTab] = useState<'workspace' | 'teacher'>('workspace')
  const [teacherSeed, setTeacherSeed] = useState<TeacherSeed | null>(null)

  const taskIndex = Math.max(0, tasks.findIndex((t) => t.exercise.id === currentId))
  const task = tasks[taskIndex]
  const ex = task.exercise
  const isPredict = ex.kind === 'predict-output'
  const code = codeById[ex.id] ?? ex.starter_code
  const prediction = predictionById[ex.id] ?? ''
  const result = resultById[ex.id] ?? null
  const submitted = submittedById[ex.id] ?? null
  const passed = statuses[ex.id] === 'passed'
  const passedCount = tasks.filter((t) => statuses[t.exercise.id] === 'passed').length
  const allPassed = passedCount === tasks.length
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
    if (!runnerRef.current || runnerStatus !== 'ready' || isPredict || ex.sections.length > 0) return
    setRunnerStatus('running')
    const res = await runnerRef.current.run(code)
    setResultById((m) => ({ ...m, [ex.id]: res }))
    if (!rebootAfterTimeout(res)) setRunnerStatus('ready')
  }

  async function submit() {
    if (!runnerRef.current || runnerStatus !== 'ready' || ex.sections.length > 0) return
    if (isPredict && prediction.trim() === '') return
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
              : `you predicted: ${fmtOutput(prediction)}\nthe code actually printed: ${fmtOutput(res.stdout)}`,
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

  // NOTE: keep the header's children as plain inline JSX. A memoized element
  // variable next to the RSC slot made React reconcile them as a dynamic
  // unkeyed array → spurious "unique key" dev warning on re-render.
  /** Pre-seed the teacher thread with the actual failure (learner still hits send). */
  function askTeacherAboutFailure() {
    const res = submitted
    let detail = ''
    if (res) {
      const failing = res.checks.filter((c) => c.passed === false)
      detail = failing.map((c) => `${c.type}: ${c.detail}`).join('\n')
      if (!detail && res.error) detail = `${res.error.type}: ${res.error.message}`
    }
    setTeacherSeed({
      text: `my submission just failed this check — can you help me see what's going on?\n\n${detail}`.trim(),
      nonce: Date.now(),
    })
    setRightTab('teacher')
  }

  const runnerBadgeColor =
    runnerStatus === 'ready'
      ? 'var(--status-pass)'
      : runnerStatus === 'running'
        ? 'var(--status-warn)'
        : 'var(--muted-foreground)'

  // ---------------------------------------------------------- task cards ---
  function TaskCard({ t, i }: { t: WorkbenchTask; i: number }) {
    const id = t.exercise.id
    const status = statuses[id]
    const isCurrent = id === currentId
    const isLocked = status === 'locked'
    const isPassed = status === 'passed'
    const revealed = hintsRevealed[id] ?? 0
    const expanded = isCurrent

    const borderColor = isCurrent
      ? 'var(--pane-border-strong)'
      : isPassed
        ? 'color-mix(in srgb, var(--status-pass) 45%, var(--pane-bg))'
        : 'var(--border)'

    return (
      <div
        data-testid={`task-card-${i}`}
        className="transition-all duration-150"
        style={{
          border: `var(--pane-border-w) solid ${borderColor}`,
          background: isCurrent
            ? 'color-mix(in srgb, var(--pane-title) 4%, transparent)'
            : 'transparent',
          opacity: isLocked ? 0.45 : 1,
        }}
      >
        <button
          type="button"
          data-testid={`task-nav-${i}`}
          disabled={isLocked}
          onClick={() => setCurrentId(id)}
          className="btn-anim flex w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-not-allowed"
          aria-expanded={expanded}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{
              color: isCurrent ? 'var(--pane-title)' : isPassed ? 'var(--status-pass)' : 'var(--muted-foreground)',
            }}
          >
            {isPassed ? '✓' : isLocked ? '🔒' : isCurrent ? '▸' : '·'} task {i + 1}
          </span>
          <span
            className="truncate text-[12px]"
            style={{ color: isCurrent ? 'var(--prose-fg)' : 'var(--muted-foreground)' }}
          >
            {t.exercise.title}
          </span>
          <span className="ml-auto flex flex-shrink-0 items-center gap-2">
            <KindBadge kind={t.exercise.kind} />
            <span className="text-[10px]">
              <DifficultyDots level={t.exercise.difficulty} />
            </span>
          </span>
        </button>

        {expanded && (
          <div className="px-3 pb-3">
            <p className="whitespace-pre-wrap text-[13px] leading-6" data-testid="task-prompt">
              <InlineCode text={t.exercise.prompt.trim()} />
            </p>

            {t.exercise.hints.length > 0 && (
              <div className="mt-3 space-y-1">
                {t.exercise.hints.slice(0, revealed).map((h, hi) => (
                  <p
                    key={hi}
                    data-testid={`hint-${hi}`}
                    className="text-[12px] leading-5"
                    style={{ color: 'var(--status-warn)' }}
                  >
                    hint {hi + 1}: <InlineCode text={h} />
                  </p>
                ))}
                {revealed < t.exercise.hints.length && !isPassed && (
                  <WorkbenchButton variant="ghost" onClick={revealHint} testId="reveal-hint">
                    reveal hint ({revealed}/{t.exercise.hints.length} used)
                  </WorkbenchButton>
                )}
              </div>
            )}

            {isPassed && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[12px] font-bold" style={{ color: 'var(--status-pass)' }}>
                  ✓ passed
                </span>
                {isCurrent && nextTask && (
                  <WorkbenchButton onClick={() => setCurrentId(nextTask.exercise.id)} testId="next-task">
                    next task ▸
                  </WorkbenchButton>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

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
          <span
            data-testid="runner-status"
            className="text-[9px] uppercase tracking-[0.2em]"
            style={{ color: runnerBadgeColor }}
          >
            ● {runnerStatus === 'booting' ? 'python booting…' : runnerStatus}
          </span>
          <span>{themeToggleSlot}</span>
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
            {/* persistent "where am I" strip */}
            <div
              data-testid="task-list"
              className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2"
              style={{
                background: 'var(--pane-bg)',
                borderBottom: '1px solid var(--pane-border)',
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: 'var(--pane-title)' }}
              >
                {allPassed ? 'lesson complete' : `task ${taskIndex + 1}/${tasks.length}`}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[11px]">
                {tasks.map((t, i) => {
                  const s = statuses[t.exercise.id]
                  return (
                    <span
                      key={t.exercise.id}
                      title={t.exercise.title}
                      style={{
                        color:
                          s === 'passed'
                            ? 'var(--status-pass)'
                            : t.exercise.id === currentId
                              ? 'var(--pane-title)'
                              : 'var(--muted)',
                      }}
                    >
                      {s === 'passed' ? '✓' : '●'}
                    </span>
                  )
                })}
              </span>
            </div>

            {/* collapsible briefing (the lesson prose) */}
            <div className="px-4 pt-3">
              <div style={{ border: '1px solid var(--pane-border)' }}>
                <button
                  type="button"
                  data-testid="briefing-toggle"
                  onClick={() => setBriefingOpen((v) => !v)}
                  className="btn-anim flex w-full items-center gap-2 px-3 py-2 text-left"
                  style={{ background: 'var(--briefing-bg)' }}
                  aria-expanded={briefingOpen}
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.25em]"
                    style={{ color: 'var(--pane-title)' }}
                  >
                    briefing
                  </span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                    {briefingOpen ? '▾' : '▸'}
                  </span>
                </button>
                {briefingOpen && <div className="lesson-prose px-3 pb-3">{lessonSlot}</div>}
              </div>
            </div>

            {/* the task stack: every task in the lesson, states at a glance */}
            <div className="space-y-2 px-4 py-3">
              {tasks.map((t, i) => (
                <TaskCard key={t.exercise.id} t={t} i={i} />
              ))}

              {allPassed && (
                <div className="pt-2">
                  {nav.nextHref ? (
                    <a href={nav.nextHref} data-testid="next-lesson" className="block">
                      <WorkbenchButton>next lesson ▸</WorkbenchButton>
                    </a>
                  ) : (
                    <a href={nav.learnHref} className="block">
                      <WorkbenchButton>back to the map ▸</WorkbenchButton>
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* ------------------------------------------------------ work pane */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Panel
            id="editor"
            title={`editor — ${ex.title}`}
            fill
            className="min-h-0 flex-[3]"
            bodyClassName="flex flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {ex.sections.length > 0 ? (
                <p className="p-4 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
                  sectioned exercises arrive in Phase 3
                </p>
              ) : isPredict ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
                  <p className="text-[11px] uppercase tracking-[0.15em]" style={{ color: 'var(--muted-foreground)' }}>
                    read the code and run it in your head — no editor for this one:
                  </p>
                  <CodeBlock code={ex.starter_code} className="flex-shrink-0" />
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                    }}
                    spellCheck={false}
                    rows={4}
                    className="readable w-full flex-shrink-0 resize-y p-2 text-[13px] outline-none"
                    style={{
                      background: 'var(--editor-bg)',
                      color: 'var(--editor-fg)',
                      border: '1px solid var(--pane-border)',
                      caretColor: 'var(--editor-cursor)',
                    }}
                  />
                </div>
              ) : (
                <PythonEditor
                  value={code}
                  onChange={(next) => setCodeById((m) => ({ ...m, [ex.id]: next }))}
                  onRun={runExploratory}
                  onSubmit={submit}
                />
              )}
            </div>

            <div
              className="flex flex-shrink-0 items-center gap-2 px-3 py-2"
              style={{ borderTop: '1px solid var(--pane-border)' }}
            >
              {!isPredict && (
                <WorkbenchButton
                  variant="ghost"
                  onClick={runExploratory}
                  disabled={runnerStatus !== 'ready' || ex.sections.length > 0}
                  testId="run-button"
                  title="⌘↵"
                >
                  {runnerStatus === 'running' ? 'running…' : 'run ▸'}
                </WorkbenchButton>
              )}
              <WorkbenchButton
                onClick={submit}
                disabled={runnerStatus !== 'ready' || ex.sections.length > 0 || (isPredict && prediction.trim() === '')}
                testId="submit-button"
                title={isPredict ? '⌘↵' : '⌘⇧↵'}
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
                  className="ml-auto text-[12px] font-bold"
                  style={{ color: 'var(--status-pass)' }}
                >
                  ✓ passed
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
            {submitted && !submitted.passed && (
              <div className="px-3 pb-3">
                <WorkbenchButton variant="ghost" onClick={askTeacherAboutFailure} testId="ask-teacher">
                  ask the teacher about this ▸
                </WorkbenchButton>
              </div>
            )}
          </Panel>
        </div>

        {/* ------------------- right pane: workspace | teacher (tabbed) ---- */}
        <Panel
          id="workspace"
          title={rightTab}
          collapse="side"
          fill
          className={`${rightTab === 'teacher' ? 'w-96' : 'w-72'} flex-shrink-0 transition-all`}
          bodyClassName="flex flex-col"
        >
          <div
            className="flex flex-shrink-0 items-center gap-1 px-2 py-1.5"
            style={{ borderBottom: '1px solid var(--pane-border)' }}
          >
            {(['workspace', 'teacher'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                data-testid={`right-tab-${tab}`}
                onClick={() => setRightTab(tab)}
                aria-selected={rightTab === tab}
                className="btn-anim px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{
                  color: rightTab === tab ? 'var(--pane-title)' : 'var(--muted-foreground)',
                  borderBottom:
                    rightTab === tab ? '2px solid var(--pane-border-strong)' : '2px solid transparent',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          {/* both tabs stay mounted so a streaming teacher reply survives a tab flip */}
          <div className={rightTab === 'workspace' ? 'min-h-0 flex-1 overflow-auto' : 'hidden'}>
            <WorkspaceTable workspace={result?.workspace ?? []} />
          </div>
          <div className={rightTab === 'teacher' ? 'min-h-0 flex-1' : 'hidden'}>
            <TeacherChat
              exerciseId={ex.id}
              exerciseTitle={ex.title}
              code={isPredict ? prediction : code}
              seed={teacherSeed}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}
