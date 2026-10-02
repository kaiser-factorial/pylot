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
import { PyodideRunner, type RunResult, type SectionedRunResult } from '@/lib/coderunner'
import type { ClientExercise } from '@/lib/content/load'
import type { ExerciseStatus } from '@/lib/progression'
import { Panel } from '@/components/ui/Panel'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { PythonEditor } from '@/components/editor/PythonEditor'
import { ParsonsBoard } from './ParsonsBoard'
import { RewardBreak } from './RewardBreak'
import type { RewardOffer } from '@/lib/rewards'
import { TeacherChat, type TeacherSeed } from '@/components/teacher/TeacherChat'
import {
  CheckReportView,
  Console,
  DifficultyDots,
  InlineCode,
  KindBadge,
  SectionedReportView,
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
    /** set on a chapter's first lesson while a quick review is on offer */
    reviewHref?: string | null
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
  // sectioned exercises (ARCHITECTURE §4.4): per-section code keyed "exId::sectionId",
  // one current (expanded) section per exercise, sectioned run/submit results per exercise
  const [sectionCodeById, setSectionCodeById] = useState<Record<string, string>>({})
  const [currentSectionByEx, setCurrentSectionByEx] = useState<Record<string, string>>({})
  const [secResultById, setSecResultById] = useState<Record<string, SectionedRunResult | null>>({})
  const [secSubmittedById, setSecSubmittedById] = useState<Record<string, SectionedRunResult | null>>({})
  // parsons: the learner's current permutation of the (server-scrambled) lines
  const [parsonsOrderById, setParsonsOrderById] = useState<Record<string, number[]>>({})
  const [hintsRevealed, setHintsRevealed] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      tasks.map((t) => [t.exercise.id, Math.min(t.authoredHintsRevealed, t.exercise.hints.length)])
    )
  )
  // right pane tabs (ARCHITECTURE §4.1: teacher chat shares the pane as a tab)
  const [rightTab, setRightTab] = useState<'workspace' | 'teacher'>('workspace')
  const [teacherSeed, setTeacherSeed] = useState<TeacherSeed | null>(null)
  // vibecode break offer, when a graded submit triggers one (ARCHITECTURE §4.8)
  const [rewardOffer, setRewardOffer] = useState<RewardOffer | null>(null)

  const taskIndex = Math.max(0, tasks.findIndex((t) => t.exercise.id === currentId))
  const task = tasks[taskIndex]
  const ex = task.exercise
  const isPredict = ex.kind === 'predict-output'
  const isSectioned = ex.sections.length > 0
  const isParsons = ex.kind === 'parsons'
  const parsonsLines = ex.parsons_lines ?? []
  const parsonsOrder = parsonsOrderById[ex.id] ?? parsonsLines.map((_, i) => i)
  // for parsons, "the code" IS the current ordering, joined
  const code = isParsons
    ? parsonsOrder.map((i) => parsonsLines[i]).join('\n')
    : (codeById[ex.id] ?? ex.starter_code)
  const prediction = predictionById[ex.id] ?? ''
  const result = resultById[ex.id] ?? null
  const submitted = submittedById[ex.id] ?? null
  const passed = statuses[ex.id] === 'passed'
  const passedCount = tasks.filter((t) => statuses[t.exercise.id] === 'passed').length
  const allPassed = passedCount === tasks.length
  const nextTask = tasks.slice(taskIndex + 1).find((t) => statuses[t.exercise.id] !== 'locked')

  // -------------------------------------------------- sectioned derivations
  const sectionKey = (sectionId: string) => `${ex.id}::${sectionId}`
  const sectionCodeOf = (s: ClientExercise['sections'][number]) =>
    sectionCodeById[sectionKey(s.id)] ?? s.starter_code
  const currentSectionId = isSectioned
    ? (currentSectionByEx[ex.id] ?? ex.sections[0].id)
    : null
  const currentSectionIndex = isSectioned
    ? Math.max(0, ex.sections.findIndex((s) => s.id === currentSectionId))
    : 0
  const secResult = secResultById[ex.id] ?? null
  const secSubmitted = secSubmittedById[ex.id] ?? null
  const sectionTitles = Object.fromEntries(ex.sections.map((s) => [s.id, s.title ?? s.id]))
  /** the whole script as the teacher should see it — all sections, labeled */
  const composedSectionCode = isSectioned
    ? ex.sections
        .map((s, i) => `# --- section ${i + 1}: ${s.title ?? s.id} ---\n${sectionCodeOf(s)}`)
        .join('\n\n')
    : null
  const secConsole = secResult
    ? {
        stdout: secResult.stdout,
        stderr: secResult.sections.map((s) => s.stderr).join(''),
        error:
          secResult.error ??
          secResult.sections.find((s) => s.error)?.error ??
          null,
      }
    : null

  useEffect(() => {
    const runner = new PyodideRunner()
    runnerRef.current = runner
    runner.ensureReady().then(() => setRunnerStatus('ready')).catch(() => setRunnerStatus('booting'))
    return () => runner.dispose()
  }, [])

  const rebootAfterTimeout = (res: { error: RunResult['error'] }) => {
    if (res.error?.type === 'Timeout') {
      setRunnerStatus('booting')
      runnerRef.current?.ensureReady().then(() => setRunnerStatus('ready'))
      return true
    }
    return false
  }

  const markPassedLocally = () => {
    setStatuses((m) => {
      const next = { ...m, [ex.id]: 'passed' as ExerciseStatus }
      // local unlock mirror of the server rule: next task opens on pass
      const after = tasks[taskIndex + 1]
      if (after && next[after.exercise.id] === 'locked') next[after.exercise.id] = 'available'
      return next
    })
  }

  async function runExploratory() {
    if (!runnerRef.current || runnerStatus !== 'ready' || isPredict) return
    setRunnerStatus('running')
    if (isSectioned) {
      // exploratory run = sections up to and including the one being worked on,
      // no checks — the console/workspace show the cumulative state so far
      const specs = ex.sections
        .slice(0, currentSectionIndex + 1)
        .map((s) => ({ id: s.id, code: sectionCodeOf(s) }))
      const res = await runnerRef.current.runSections(specs)
      setSecResultById((m) => ({ ...m, [ex.id]: res }))
      if (!rebootAfterTimeout(res)) setRunnerStatus('ready')
      return
    }
    const res = await runnerRef.current.run(code)
    setResultById((m) => ({ ...m, [ex.id]: res }))
    if (!rebootAfterTimeout(res)) setRunnerStatus('ready')
  }

  /**
   * Fold server rubric verdicts into a sectioned result and recompute pass
   * state. Ungraded rubric checks (budget exhausted, grader error) count as
   * NOT passed — a capstone never passes on an unconfirmed criterion.
   */
  function mergeRubricVerdicts(
    res: SectionedRunResult,
    verdicts: { sectionId: string | null; checkIndex: number; passed: boolean; feedback: string }[] | null,
    failureNote?: string
  ): SectionedRunResult {
    const sections = res.sections.map((sr) => {
      if (!sr.ran || !sr.checks.some((c) => c.type === 'ai_rubric')) return sr
      const checks = sr.checks.map((c) => {
        if (c.type !== 'ai_rubric') return c
        const v = verdicts?.find((v) => v.sectionId === sr.id && v.checkIndex === c.index)
        if (v) return { ...c, passed: v.passed, detail: `rubric: ${v.feedback}` }
        return { ...c, passed: false, detail: `rubric: ${failureNote ?? 'not graded — submit again'}` }
      })
      const passed = sr.error === null && checks.every((c) => c.passed === true)
      return { ...sr, checks, passed }
    })
    return { ...res, sections, passed: sections.length > 0 && sections.every((s) => s.passed === true) }
  }

  async function submitSectioned() {
    if (!runnerRef.current || runnerStatus !== 'ready') return
    setRunnerStatus('running')
    const started = performance.now()
    const specs = ex.sections.map((s) => ({ id: s.id, code: sectionCodeOf(s), checks: s.checks }))
    let res = await runnerRef.current.runSections(specs)

    // capstones: grade ai_rubric checks server-side, then merge (invariant #2's
    // one exception) — deterministic checks were already decided in the worker
    const needsRubric = res.sections.some(
      (sr) => sr.ran && sr.checks.some((c) => c.type === 'ai_rubric')
    )
    if (needsRubric) {
      try {
        const resp = await fetch('/api/rubric', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exerciseId: ex.id,
            sections: res.sections
              .filter((sr) => sr.ran)
              .map((sr) => ({
                sectionId: sr.id,
                code: specs.find((sp) => sp.id === sr.id)?.code ?? '',
                stdout: sr.stdout,
              })),
          }),
        })
        if (resp.ok) {
          const { verdicts } = await resp.json()
          res = mergeRubricVerdicts(res, verdicts)
        } else {
          const err = await resp.json().catch(() => ({}))
          res = mergeRubricVerdicts(res, null, err.detail ?? err.error ?? `grading failed (${resp.status})`)
        }
      } catch {
        res = mergeRubricVerdicts(res, null, 'grading unreachable — check your connection and submit again')
      }
    }
    const durationMs = performance.now() - started

    setSecResultById((m) => ({ ...m, [ex.id]: res }))
    setSecSubmittedById((m) => ({ ...m, [ex.id]: res }))
    if (!rebootAfterTimeout(res)) setRunnerStatus('ready')

    if (res.sections.length === 0) {
      // timeout before any section completed — log one flat attempt honestly
      await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: ex.id,
          code: composedSectionCode ?? '',
          result: { passed: false, checks: [], stdout: '', error: res.error },
          durationMs,
          graded: true,
        }),
      })
      return
    }

    const resp = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exerciseId: ex.id,
        sections: res.sections.map((sr) => ({
          sectionId: sr.id,
          code: specs.find((sp) => sp.id === sr.id)?.code ?? '',
          result: {
            passed: sr.passed,
            checks: sr.checks,
            stdout: sr.stdout,
            stderr: sr.stderr,
            error: sr.error,
          },
        })),
        passed: res.passed,
        durationMs,
        graded: true,
      }),
    })
    const respJson = await resp.json().catch(() => ({}))
    if (respJson.reward) setRewardOffer(respJson.reward)

    if (res.passed) markPassedLocally()
  }

  async function submit() {
    if (!runnerRef.current || runnerStatus !== 'ready') return
    if (isSectioned) return submitSectioned()
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

    const resp = await fetch('/api/attempts', {
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
    const respJson = await resp.json().catch(() => ({}))
    if (respJson.reward) setRewardOffer(respJson.reward)

    if (graded.passed) markPassedLocally()
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
    let detail = ''
    if (isSectioned && secSubmitted) {
      // point the teacher at the FIRST failing section — that's where to look
      const idx = secSubmitted.sections.findIndex((s) => s.passed === false || s.error)
      const failingSec = idx >= 0 ? secSubmitted.sections[idx] : null
      if (failingSec) {
        const checkLines = failingSec.checks
          .filter((c) => c.passed === false)
          .map((c) => `${c.type}: ${c.detail}`)
          .join('\n')
        const errLine = failingSec.error
          ? `${failingSec.error.type}: ${failingSec.error.message}`
          : ''
        detail = [
          `section ${idx + 1} (${sectionTitles[failingSec.id]}) is the first one failing:`,
          errLine,
          checkLines,
        ]
          .filter(Boolean)
          .join('\n')
      }
    } else if (submitted) {
      const failing = submitted.checks.filter((c) => c.passed === false)
      detail = failing.map((c) => `${c.type}: ${c.detail}`).join('\n')
      if (!detail && submitted.error) detail = `${submitted.error.type}: ${submitted.error.message}`
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
      {rewardOffer && <RewardBreak offer={rewardOffer} onDone={() => setRewardOffer(null)} />}
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

            {/* chapter-opening quick-review offer (spaced review, Phase 3) */}
            {nav.reviewHref && (
              <div className="px-4 pt-3">
                <a
                  href={nav.reviewHref}
                  data-testid="review-banner"
                  className="btn-anim block px-3 py-2"
                  style={{
                    border: '1px dashed var(--pane-border-strong)',
                    background: 'color-mix(in srgb, var(--status-warn) 6%, transparent)',
                  }}
                >
                  <span className="text-[12px]" style={{ color: 'var(--prose-fg)' }}>
                    <span className="font-bold" style={{ color: 'var(--status-warn)' }}>
                      new chapter:
                    </span>{' '}
                    quick warm-up first? a few exercises from earlier chapters, picked for you ▸
                  </span>
                </a>
              </div>
            )}

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
              {isSectioned ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3" data-testid="section-stack">
                  {ex.sections.map((s, i) => {
                    const isCur = s.id === currentSectionId
                    const rep = secSubmitted?.sections.find((r) => r.id === s.id) ?? null
                    const mark =
                      rep?.passed === true
                        ? '✓'
                        : rep && (rep.passed === false || rep.error)
                          ? '✗'
                          : rep && rep.ran === false
                            ? '·'
                            : isCur
                              ? '▸'
                              : '·'
                    const markColor =
                      rep?.passed === true
                        ? 'var(--status-pass)'
                        : rep && (rep.passed === false || rep.error)
                          ? 'var(--status-fail)'
                          : isCur
                            ? 'var(--pane-title)'
                            : 'var(--muted-foreground)'
                    return (
                      <div
                        key={s.id}
                        data-testid={`section-${i}`}
                        style={{
                          border: `1px solid ${isCur ? 'var(--pane-border-strong)' : 'var(--pane-border)'}`,
                        }}
                      >
                        <button
                          type="button"
                          data-testid={`section-nav-${i}`}
                          onClick={() =>
                            setCurrentSectionByEx((m) => ({ ...m, [ex.id]: s.id }))
                          }
                          className="btn-anim flex w-full items-center gap-2 px-3 py-1.5 text-left"
                          aria-expanded={isCur}
                        >
                          <span className="text-[11px] font-bold" style={{ color: markColor }}>
                            {mark}
                          </span>
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.2em]"
                            style={{ color: isCur ? 'var(--pane-title)' : 'var(--muted-foreground)' }}
                          >
                            section {i + 1}
                          </span>
                          <span
                            className="truncate text-[12px]"
                            style={{ color: isCur ? 'var(--prose-fg)' : 'var(--muted-foreground)' }}
                          >
                            {s.title ?? s.id}
                          </span>
                        </button>
                        {isCur && (
                          <div className="flex flex-col">
                            <p
                              className="whitespace-pre-wrap px-3 pb-2 text-[12.5px] leading-5"
                              data-testid="section-instructions"
                            >
                              <InlineCode text={s.instructions.trim()} />
                            </p>
                            <div className="h-52" style={{ borderTop: '1px solid var(--pane-border)' }}>
                              <PythonEditor
                                value={sectionCodeOf(s)}
                                onChange={(next) =>
                                  setSectionCodeById((m) => ({ ...m, [sectionKey(s.id)]: next }))
                                }
                                onRun={runExploratory}
                                onSubmit={submit}
                                className="h-full"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
              ) : isParsons ? (
                <ParsonsBoard
                  lines={parsonsLines}
                  order={parsonsOrder}
                  onChange={(next) => setParsonsOrderById((m) => ({ ...m, [ex.id]: next }))}
                />
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
                  disabled={runnerStatus !== 'ready'}
                  testId="run-button"
                  title="⌘↵"
                >
                  {runnerStatus === 'running'
                    ? 'running…'
                    : isSectioned
                      ? `run sections 1–${currentSectionIndex + 1} ▸`
                      : 'run ▸'}
                </WorkbenchButton>
              )}
              <WorkbenchButton
                onClick={submit}
                disabled={runnerStatus !== 'ready' || (isPredict && prediction.trim() === '')}
                testId="submit-button"
                title={isPredict ? '⌘↵' : '⌘⇧↵'}
              >
                {isPredict ? 'check prediction' : isSectioned ? 'submit all sections ✓' : 'submit ✓'}
              </WorkbenchButton>
              {!isPredict && (
                <WorkbenchButton
                  variant="ghost"
                  onClick={() => {
                    if (isSectioned && currentSectionId) {
                      const starter = ex.sections[currentSectionIndex].starter_code
                      setSectionCodeById((m) => ({ ...m, [sectionKey(currentSectionId)]: starter }))
                    } else if (isParsons) {
                      setParsonsOrderById((m) => ({ ...m, [ex.id]: parsonsLines.map((_, i) => i) }))
                    } else {
                      setCodeById((m) => ({ ...m, [ex.id]: ex.starter_code }))
                    }
                  }}
                  testId="reset-button"
                >
                  {isSectioned ? 'reset section' : isParsons ? 'reset order' : 'reset'}
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
              result={isSectioned ? secConsole : result}
              placeholder={isPredict ? 'submit your prediction to see the real output' : 'run your code to see output'}
            />
            {isSectioned
              ? secSubmitted && (
                  <SectionedReportView sections={secSubmitted.sections} titles={sectionTitles} />
                )
              : submitted && <CheckReportView checks={submitted.checks} />}
            {(isSectioned ? secSubmitted && !secSubmitted.passed : submitted && !submitted.passed) && (
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
            <WorkspaceTable workspace={(isSectioned ? secResult?.workspace : result?.workspace) ?? []} />
          </div>
          <div className={rightTab === 'teacher' ? 'min-h-0 flex-1' : 'hidden'}>
            <TeacherChat
              exerciseId={ex.id}
              exerciseTitle={ex.title}
              code={isSectioned ? (composedSectionCode ?? '') : isPredict ? prediction : code}
              seed={teacherSeed}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}
