# CLAUDE.md — agent orientation for Pylot

Read before writing code: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then
[docs/ROADMAP.md](docs/ROADMAP.md) to find the current phase, then the ADRs relevant to what
you're touching. [docs/CURRICULUM.md](docs/CURRICULUM.md) governs all content authoring.

## What this is
A Python-learning web app (MATLAB-Onramp-style) for an owner with strong math/data-sci
concepts and JS experience whose gap is Python syntax and intent→code translation, built to
replace AI-ghostwritten code with genuine understanding. Single learner now; designed to be
distributable later.

## Build order
Work the phases in docs/ROADMAP.md strictly in order; a phase's acceptance criteria
("Done when") must pass before the next phase starts. Verify by actually running the app
and the checks, not by reading the code.

## Invariants (violating these is a product bug, not a style issue)
1. **The teacher never gives a full solution for an unpassed exercise.** The hint ladder in
   ADR-005 is policy. Prompt changes require running the teacher eval set.
2. **Deterministic checks decide pass/fail**; AI explains, it does not grade (capstone
   `ai_rubric` checks are the only exception).
3. **Content must self-validate**: every exercise ships a reference solution;
   `npm run validate:content` executes it against the exercise's own checks and must pass.
4. **`attempts` is append-only.** Never update or delete attempt rows.
5. **No single-user assumptions outside `lib/auth.ts`.** Everything is keyed by `user_id`.
6. **All user Python executes through the `CodeRunner` interface** (Pyodide worker today,
   remote runner in Phase 5). Never eval learner code on the Next.js server.
7. **No copy-paste affordance** from lesson content into the editor. The learner types.

## Content authoring notes
- Exercise IDs are stable path-style strings; never rename a shipped ID (the DB references it).
- Follow the exercise-kind mix in CURRICULUM.md — especially `fix-bug` and `predict-output`
  density; don't default everything to `write-code`.
- Lesson prose stays short; the exercises carry the teaching. Include JS-contrast callouts
  where the curriculum notes them.
- Difficulty tags (1–5) matter: they normalize struggle scores for reward triggers.

## Build notes (learned in Phase 0 — save yourself the debugging)
- **Verify by driving a real browser.** Playwright is installed; follow the
  `scripts/verify-phase0.ts` pattern for each phase's acceptance criteria. The Claude
  Chrome extension cannot open localhost (org policy) — use Playwright headless.
- **Check computed styles, not just textContent.** Phase 0 shipped black-on-black stdout
  that every content assertion passed. Assert color != backgroundColor on output surfaces.
- **Pyodide must load in a MODULE worker** (`new Worker(url, { type: 'module' })` +
  `import('/pyodide/pyodide.mjs')`). Its loader stalls silently in classic workers.
- Worker init errors must reject the ready promise — never leave the UI stuck on "booting".
- npm blocks native install scripts; approvals live in package.json `allowScripts`
  (`npm approve-scripts <pkg>` for new native deps).
- Pyodide is pinned (314.0.2) and served from `public/pyodide/` (copied by postinstall);
  the Node validator and browser worker must always share one version.
- The owner's real early attempts (ids 9–15 in `data/pylot.db`) are JS-in-Python errors —
  authentic material for Ch. 0–1 fix-bug exercises and LangContrast callouts.

## Stack facts
Next.js App Router + TypeScript, Tailwind + shadcn/ui, CodeMirror 6, Drizzle + SQLite
(`data/pylot.db`, gitignored), Pyodide in a Web Worker, AI SDK with a `"provider/model"`
gateway string for the teacher. Content in `content/` as MDX + YAML (Zod-validated).
Phase-5 remote GPU runs go through **opbdh** (RunPod launcher CLI with spend guards;
local checkout at `~/Projects/opbdh_root/opbdh`) — see ROADMAP Phase 5 before building.
