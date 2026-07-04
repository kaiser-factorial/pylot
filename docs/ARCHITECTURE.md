# Pylot — Architecture

> Working title: **Pylot** — learning to fly the plane yourself instead of leaving it on autopilot.
> An interactive Python learning app in the style of MATLAB Onramp, with an embedded AI teacher,
> built first for one learner (Corina) but structured for eventual multi-user distribution.

## 1. What this app is

A web app where the learner works through a structured curriculum of short lessons and
checked exercises. Python code is written in an in-browser editor, executed **in the browser**
via Pyodide (WebAssembly CPython), and checked deterministically (output, variable state,
function behavior). An AI "teacher" agent is always available in a side panel for questions,
hints, and — on longer multi-section projects — pinpointing *which section* went wrong rather
than just judging the final output. Progress, attempts, and struggle metrics are persisted
so the learner can stop and resume anytime, and so later features (adaptive difficulty,
reward triggers) have data to work from.

## 2. Guiding principles

1. **The learner types the code.** No copy-paste affordances in lesson content. The product
   goal is autonomy from AI code generation, so the app must never write the answer for you.
2. **Teacher guides, never solves.** The AI tutor is Socratic by default: escalating hints,
   never the full solution until the exercise is already passed (then it can show idiomatic
   alternatives).
3. **Deterministic checks first, AI judgment second.** Exercises pass/fail on real assertions
   run against real execution. The AI explains *why* something failed; it does not decide
   *whether* it failed (except for open-ended capstones, which use an AI rubric).
4. **Content is data, not code.** Lessons/exercises live in versioned content files with a
   strict schema. Adding a chapter never requires touching app code. This is what makes the
   app generalizable/distributable later.
5. **Log everything from day one.** Every attempt (code, result, errors, duration) is an event
   in the DB. Adaptive difficulty and reward triggers are pure functions over this log — they
   can be added later without retrofitting.
6. **Single-user now, multi-user shaped.** Every table has a `user_id` from day one, auth is a
   stub (one hardcoded local user) behind an interface that can be swapped for real auth.

## 3. System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ Lesson pane    │  │ Editor (CodeMirror)│ │ Teacher chat │  │
│  │ (MDX content)  │  │ + Run/Submit      │ │ (streaming)  │  │
│  └───────────────┘  └────────┬─────────┘  └──────┬───────┘  │
│                              │                    │          │
│  ┌───────────────────────────▼─────────────────┐  │          │
│  │ Pyodide Web Worker                          │  │          │
│  │  - runs user code (timeout, isolated)       │  │          │
│  │  - captures stdout/stderr/tracebacks        │  │          │
│  │  - snapshots variable workspace             │  │          │
│  │  - runs exercise check suite                │  │          │
│  └───────────────────────────┬─────────────────┘  │          │
│                              │ results            │          │
└──────────────────────────────┼────────────────────┼──────────┘
                               │                    │
                    ┌──────────▼────────────────────▼─────────┐
                    │ Next.js server (API routes)             │
                    │  - progress/attempts persistence        │
                    │  - teacher agent endpoint (Claude API,  │
                    │    assembles lesson+attempt context)    │
                    │  - reward-trigger evaluation            │
                    └──────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────┐   ┌───────────────────────┐
                    │ SQLite (Drizzle ORM)│   │ [Phase 5] Remote      │
                    │ users, attempts,    │   │ Python runner for     │
                    │ progress, chats,    │   │ torch/peft/GPU work   │
                    │ reward_events       │   │ (sandboxed, API-based)│
                    └─────────────────────┘   └───────────────────────┘
```

## 4. Components

### 4.1 Frontend (Next.js App Router, TypeScript, React)

**Theming:** the visual language comes from the owner's Themez design systems (vendored
from `~/Projects/Themes/`) — a cyber-terminal theme (default: dark, monospace, neon-green,
muted CRT effects) and a Bauhaus primary theme (alternate: sharp corners, 3px borders, hard
shadows), runtime-switchable and persisted per user. Theme tokens are CSS custom properties
mapped onto the Tailwind/shadcn token layer; Radix-based components are skinned by tokens,
simple components reuse Themez CSS directly; each theme includes a matching CodeMirror
syntax theme. Pane chrome (collapsible titled panels for workspace/console/task list) and
read-only lesson code blocks come from @lumpenspace's **ccru** library (vendored archive
with provenance in the Themez repo), as Pylot-local tokenized forks so the same components
render under both themes — see ROADMAP Phase 1 for the fork-and-tokenize rules and license
caveat. Effects like scanlines/glow never run inside editor, console, or lesson-prose
containers (readability rule, enforced in Phase 1).

Three-pane lesson layout, modeled on MATLAB Onramp:

- **Lesson pane** (left): rendered MDX content — explanation, then a TASK card. Task list /
  chapter navigation, per-task checkmarks.
- **Work pane** (center): CodeMirror 6 editor with Python syntax highlighting; Run and Submit
  buttons; console output area; on failure, the check report ("expected `total == 15`, got
  `12`") plus a "Ask the teacher about this" affordance.
- **Workspace panel** (right, collapsible): live variable table (name / value / type) read from
  the Pyodide interpreter after each run — the MATLAB workspace equivalent. The teacher chat
  shares this pane as a tab.

### 4.2 Python execution: Pyodide in a Web Worker

- Pyodide runs in a dedicated Web Worker so the UI never blocks and infinite loops are killed
  by terminating the worker (hard timeout, default 10s, per-exercise override).
- Each submission runs in a **fresh namespace** (fresh interpreter state per exercise; sections
  within a multi-part exercise share state deliberately — see 4.4).
- Captures: stdout, stderr, exception + traceback, wall time, and a **workspace snapshot**
  (top-level names, reprs, types) for the workspace panel and variable-state checks.
- Packages: numpy, pandas, matplotlib (rendered to an image target in the output pane),
  scikit-learn — all available as Pyodide wheels, loaded lazily per-chapter.
- `if __name__ == "__main__":` and script-vs-REPL semantics are teachable in Pyodide by
  controlling how we execute the code (`runpy`-style as `__main__` vs. as an imported module).

### 4.3 Exercise checking

Every exercise declares a `checks` array in its content file. Check types:

| Type | What it asserts | Example |
|---|---|---|
| `stdout` | printed output (exact / regex / contains) | prints `Hello, world!` |
| `state` | variable in workspace equals/satisfies | `total == 105`, `type(names) is list` |
| `function` | user-defined function passes test cases | `fib(10) == 55`, incl. edge cases |
| `ast` | structural constraint on the code | "must use a `for` loop", "no `import numpy`" |
| `exception` | code raises (or handles) correctly | `ValueError` on bad input |
| `ai_rubric` | AI-graded, capstones only | "does it handle empty input gracefully?" |

Checks run inside the worker *after* the user code, in the same namespace, as generated
assertion code. The check report (which checks passed/failed, with expected/actual) is what
gets rendered, persisted with the attempt, and handed to the teacher agent.

### 4.4 Sectioned (multi-part) exercises

For longer scripts, an exercise is an **ordered list of sections**, each with its own
instructions, its own editor region, and its own checks. Execution is cumulative: section N
runs in the namespace produced by sections 1..N-1. So when the final output is wrong, the
check report says *"sections 1–3 pass, section 4's `clean_rows` drops the header incorrectly"*
— exactly the "where did I go wrong" experience requested, and the teacher agent receives
per-section pass/fail rather than one opaque failure.

### 4.5 Teacher agent

- Server-side endpoint (`/api/teacher`) calling Claude via the AI SDK (streaming).
- **Context assembly** (server-side, per message): current lesson content + task, the user's
  current code, the last check report, the last N attempts for this exercise (to see what
  they've already tried), and chapter-level progress. The model never has to ask "what are
  you working on."
- **Learner memory** (ADR-006, phased in): the declared profile (goals/background from the
  optional onboarding survey), a derived struggle-by-concept summary computed from the
  attempts log × exercise concept tags (never model-written), and capped, user-visible
  episodic notes. Rule: performance claims must cite derived numbers, not impressions.
- **Hint ladder policy** in the system prompt: (1) point at the relevant concept, (2) point at
  the offending line/section, (3) give the shape of the fix — never paste a full solution for
  an unpassed exercise. After a pass, it may show idiomatic alternatives and explain them.
- Chat history persisted per (user, exercise) so a resumed session keeps its thread.

### 4.6 Progress & persistence

SQLite file (local) via Drizzle ORM. Schema (all tables keyed by `user_id`):

- `users` — id, name, settings JSON. (Local mode: one seeded user.)
- `attempts` — id, user_id, exercise_id, section_id?, code, passed, check_report JSON,
  stderr, duration_ms, created_at. **Append-only; this is the event log.**
- `progress` — user_id, exercise_id, status (locked/available/passed), passed_at,
  attempts_count, hints_used.
- `chat_messages` — user_id, exercise_id, role, content, created_at.
- `reward_events` — user_id, chapter_id, trigger_reason, struggle_score, accepted?, created_at.

Because content lives in files, the DB stores only **references** (stable string IDs like
`py-basics/loops/03-fizzbuzz`) — DB and curriculum evolve independently. Drizzle keeps the
Postgres migration path (distribution phase) mechanical.

### 4.7 Content pipeline

```
content/
  curriculum.yaml            # chapter order, unlock rules
  py-basics/
    01-hello/
      lesson.mdx             # explanation shown in lesson pane
      exercises.yaml         # tasks: prompt, starter code, checks, hints metadata
  datasets/                  # bundled CSVs + MNIST subset (served statically,
                             # loaded into Pyodide via fetch)
```

A build-time validator (`npm run validate:content`) checks every exercise against the schema
and **executes every exercise's reference solution against its own checks** in Pyodide —
content that can't pass its own checks fails CI. This is the guardrail that lets an agent
author curriculum autonomously.

### 4.8 Reward system ("vibecode break")

- After each attempt, the server updates a per-exercise **struggle score** (function of failed
  attempts, hint depth used, and time-on-task, normalized by the exercise's difficulty tag).
- Trigger rule: fires only at **chapter completion**, or on passing an exercise whose struggle
  score exceeded a threshold — never on breezing through, per the design intent.
- On trigger: teacher agent offers a break + builds a small self-contained HTML toy from the
  learner's idea (rendered in a sandboxed iframe). Stored in `reward_events` so it never
  double-fires.

### 4.9 [Phase 5] Remote runner for ML libraries

torch/peft/bitsandbytes can't run in Pyodide. The execution layer is behind a
`CodeRunner` interface (`run(code, files, packages) → {stdout, stderr, artifacts, workspace}`)
with two implementations: `PyodideRunner` (default) and `RemoteRunner`. The leading
candidate backend for `RemoteRunner` is **opbdh** (friend-built CLI, local checkout at
`~/Projects/opbdh_root/opbdh`): it launches a RunPod GPU pod, runs a statically-verified
script with HF-model caching on a network volume, live-syncs `logs/`+`results/` back, and
tears the pod down — with price caps and a hard max-spend guard. That makes remote runs
**asynchronous jobs** (submit → monitor → collect), which matches Ch. 11's batch-shaped
exercises; see ROADMAP Phase 5 for the integration design and fallbacks. Lessons declare
`runtime: browser | remote` in their metadata. Until Phase 5, NN fundamentals are taught
**numpy-from-scratch on an MNIST subset in the browser** — which is arguably the better
pedagogy anyway.

## 5. What was deliberately deferred

- **Auth / multi-user / hosting** — Phase 6. Stub auth interface now; Clerk-or-similar +
  Postgres later. No code outside `lib/auth.ts` may assume a single user.
- **Adaptive difficulty** — Phase 7. Requires only the `attempts` log, which exists from day 1.
- **Notebook-style lessons** — maybe never; script + REPL semantics are the learning target.

## 6. Related documents

- [ADR-001: Full-stack framework](adr/ADR-001-stack.md)
- [ADR-002: Python execution strategy](adr/ADR-002-python-execution.md)
- [ADR-003: Persistence](adr/ADR-003-persistence.md)
- [ADR-004: Content as data](adr/ADR-004-content-format.md)
- [ADR-005: Teacher agent design](adr/ADR-005-teacher-agent.md)
- [CURRICULUM.md](CURRICULUM.md) — the learning plan itself
- [ROADMAP.md](ROADMAP.md) — phased build plan with acceptance criteria
