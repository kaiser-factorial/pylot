# Phase 4 handoff — the data-science block

Written at Phase 3 build-completion (2026-07-05) by the Phase 3 building agent, for the
Phase 4 building agent. Governing docs, in order: ROADMAP Phase 4 → CURRICULUM.md ("The
threaded capstone: the Field Report", "Tracks", "AFYD") → ARCHITECTURE §4.2/§4.3 (Pyodide
package loading, matplotlib target) → the ADRs. This file adds what those don't: exactly
what Phase 3 built, where the seams are, and the traps already sprung.

## 0. Phase 3 close-out state — CODE COMPLETE, owner playtest PENDING

All three offline gates are green and committed on branch `phase-3-longform`:
- `npm run validate:content` — 140 exercises / 156 check-units, all reference solutions
  pass their own checks (Ch. 0–6 fully authored).
- `npm run eval:teacher` — 16 cases pass ($0.47/run), including the 4 new Phase 3 cases.
- `npm run verify:phase3` — PASS including the live teacher section (needs the key).

**Still owed by the owner (do not mark Phase 3 "signed off" until she does):**
1. A real playtest of a **sectioned capstone** end-to-end (she has passed Ch. 0–1 only;
   Ch. 2–6 reference solutions are unread by her per the spoiler policy — the Haiku review
   panel + validator are what vouch for them).
2. The **refusal-under-pressure re-test** the Phase 2 agent bookmarked: the eval now has
   real capstone-shaped refusal cases and they pass, but the owner wanted to run her own
   sweet-talk playtest against a genuinely-hard, one-section-from-done exercise. That
   exercise now exists (any Ch. 2–6 capstone).
3. Confirm a **reward "vibecode break"** actually fires and the toy renders for her (the
   trigger + iframe are verified automatically; the felt experience is hers to judge).

If she hits bugs, they land on you — but the machinery is tested, so expect polish, not
rebuilds.

## 1. What Phase 3 built (all offline checks green)

| Piece | Where | Notes for Phase 4 |
|---|---|---|
| Sectioned engine | `lib/coderunner/check-driver.ts` (`pylot_run_sections`), `lib/coderunner/index.ts` (`runSections`), `public/pylot-worker.js` | ONE cumulative namespace; per-section stdout/ast/exception scoping; halt-on-unexpected-error marks downstream sections "not run". The validator AND the worker run this exact code — they can't drift. **Field Report milestones are sectioned exercises** — this is your execution substrate. |
| Sectioned UI | `components/workbench/Workbench.tsx` (`isSectioned` branch), `components/workbench/display.tsx` (`SectionedReportView`) | Section stack: per-section instructions + editor, run-to-here, submit-all, reset-section. Per-section pass/fail report names the first failing section. The AFYD editor (Phase 4) is a **new per-section field UI** — the section stack is where it slots in. |
| Sectioned attempts | `app/api/attempts/route.ts` (batch shape) | One attempt row PER SECTION per submit, **one shared `created_at`** (so derived memory collapses a submit to one attempt). `attempts` stays append-only. AFYD entries are milestone artifacts to persist — decide their table/JSON shape (ARCHITECTURE §4 has no AFYD table yet). |
| Parsons | `components/workbench/ParsonsBoard.tsx`, `toClientExercise` scramble | Server scrambles the solution's lines deterministically (FNV/mulberry32 by exercise id), so the reference_solution still never reaches the client as an ordered whole. |
| ai_rubric grading | `lib/teacher/rubric.ts`, `app/api/rubric/route.ts` | `generateText(Output.object)` grades every rubric check of a submission in one call, through the **same $10/month cap** (`kind: 'rubric'`). Ungraded rubric checks fail closed. Reference solution deliberately EXCLUDED from grader context (feedback is learner-visible). **AFYD's per-field `ai_rubric` (D cross-checked against code, F against results) extends this** — the grader already receives section code + stdout; AFYD needs the checked numeric results too. |
| Derived memory (layer 2) | `lib/memory/derived.ts` | `deriveStruggleSummary` (concept aggregation, top-5 into teacher context) + `computeExerciseStruggle` (the reward-trigger score). Pure over the attempts log × concept tags. **Adaptive difficulty (Phase 7) reads the same functions.** Concept vocab is `content/concepts.yaml` — Phase 4 will add namespaced tags (`pandas/groupby`) per ADR-006. |
| Reward system | `lib/rewards.ts`, `app/api/reward/route.ts`, `components/workbench/RewardBreak.tsx`, `reward_events` (+ `exercise_id`, `toy_html` cols) | Fires on chapter-completion OR a high-struggle fresh pass (never a re-pass, never an easy pass). Toy = self-contained HTML in a `sandbox="allow-scripts"` iframe, generated through the spend cap. Dedupe ledger prevents double-fire. |
| Spaced review + predict-quiz | `lib/review.ts`, `app/learn/[chapter]/review/page.tsx`, `components/lesson/PredictQuiz.tsx` | 4–6 warm-ups from earlier chapters (struggle + staleness ranked, passed-only). The "predict your own failure modes" quiz writes `settings.predictions[chapterId]` (declared layer) → teacher context. Reuses the whole Workbench. |
| Teacher context grew | `lib/teacher/context.ts`, `lib/teacher/prompt.ts` | New context fields: per-section latest attempts, `derivedStruggles`, `predictedFailureModes`, section specs + per-section reference solutions (same never-reveal policy). Prompt teaches sectioned/parsons diagnosis and the derived-numbers honesty rule. **Static prefix stays byte-stable** — new context goes in `renderTeacherContext`. |

## 2. What Phase 4 builds (ROADMAP) — the short version

Lazy per-chapter Pyodide package loading (numpy/pandas/matplotlib/sklearn); matplotlib →
output pane; dataset bundling + fetch-into-Pyodide-FS; workspace upgrades for
arrays/DataFrames. **The Field Report machinery**: `track.yaml` (role→column mapping),
template exercises with role params, validator extension that runs each milestone per track
and **generates the answer keys**, track-selection UX at Ch. 8, the **AFYD editor** (Do/
Why/Find/Answer per milestone, per-field `ai_rubric`), milestone artifact persistence, and
report assembly/export. Prepare **RMP** + **Movies** tracks from `pascal-assmt-refs/`, plus
1–2 owner-picked Kaggle tracks. Author **Ch. 7–10** + the redemption-arc epilogue (Project 2).

## 3. Traps sprung in Phase 3 (don't re-spring)

- **predict-output cannot carry an uncaught exception in stdout.** A predict exercise's
  reference solution IS the code; the validator runs it against the `stdout` check. If the
  code raises, `result.error` is set and it fails validation. I sprang this TWICE (tuple
  immutability, scope NameError) before internalizing it. To teach "this raises X", use the
  **`exception` check** on a write-code/fix-bug, or the **"name the exception"** pattern
  (read non-running code in the prompt, assign the type name as a string) — both in Ch. 5.
- **`function`-check `expected` can't express a tuple.** YAML/JSON arrays decode to Python
  lists, and `("a", 1) != ["a", 1]`. If a function returns a tuple, check it with a
  **`state`** expr (`f(x) == ("a", 1)`) evaluated in real Python, not a function check.
- **AST checks are presence-only** (requires/forbids over node-class-name sets) — they
  can't count (can't force "3 asserts") or match function names (can't forbid `sum`
  specifically). And `forbids: [Call]`/`[Constant]`/`[Dict]` routinely bans a construct the
  reference itself uses (`print`, string literals, `{}`) — a HARD BUG. The review panel
  flagged several "hardcode-gameable" checks; I declined the ones whose only fix was a
  reference-breaking forbid. **Lean on the honest-learner premise** (this app exists to cure
  self-cheating) plus `requires: [For/If/AugAssign/Lambda/...]` where it's safe.
- **Fix-bug scoping is real and easy to violate** — a fix-bug's fix must already be taught.
  I scoped each chapter's bugs to that chapter or earlier (e.g. the mutable-default fix is
  taught in the arguments-lesson prose BEFORE the fix-bug uses it). The Haiku pedagogy lens
  catches misses; run it.
- **`content/concepts.yaml` is validator-enforced** — every new tag must be added there
  first or `validate:content` rejects it. Phase 4 adds ~a chapter's worth per chapter; add
  them up front.
- **Register chapters in `curriculum.yaml` incrementally** as you finish each — a registered
  chapter with missing `lesson.mdx`/`exercises.yaml` fails the whole schema pass and buries
  the signal for the chapter you're actually working on.
- Same old ones still bite: **AI SDK is v7** (`instructions`/`onEnd`/`isStepCount`/
  `inputSchema`; `generateText` uses `output: Output.object(...)` + `result.usage`);
  **`server-only` can't be imported by tsx scripts** (verify/eval drive the real HTTP
  endpoint; verify-phase3 parses `content/**/exercises.yaml` directly for the id list);
  **`drizzle-kit push --force`** for additive schema changes; **auto-mode blocks writes to
  `data/pylot.db`** (scratch-DB for everything automated). All in CLAUDE.md.

## 4. The Haiku review panel (keep doing this)

After authoring each chapter I spawned 3 Haiku subagents in parallel — **check-robustness**,
**pedagogy** (difficulty/scoping/freshness/coverage), **JS-contrast-accuracy** — over that
chapter's content, then applied the real findings and committed them separately. This is the
owner's QA proxy (she can't read unpassed reference solutions). It caught: a broken
`forbids:[Call]`, a call-site arg-order bug, value-reuse in predict snippets, thin pathlib
coverage, and a contradictory lambda-vs-comprehension prompt. Worth every run; ~$0 (Haiku).
The JS-contrast lens came back clean 4/6 chapters — the `<LangContrast lang="js">` blocks
are solid, but Phase 4's data content has fewer JS analogies (numpy/pandas have no JS
equivalent), so that lens matters less; the robustness + pedagogy lenses matter MORE
(numeric answer keys, float tolerances, track-generic templates).

## 5. Content state (for fixtures + track work)

140 exercises across Ch. 0–6 (`py-basics`, `py-values`, `py-collections`, `py-flow`,
`py-functions`, `py-errors`, `py-structure`), all validating. **Sectioned-capstone
fixtures** (good for testing the AFYD/report machinery against a known-good sectioned
shape): `py-collections/06-capstone/01-gradebook` (4 sections, one `ai_rubric` section —
the pattern your milestones follow), `py-errors/05-capstone/01-flight-log` (files+JSON
pipeline), `py-structure/05-capstone/01-stats-tool` (ends in an "explain the machine's
code" `ai_rubric` section — the meta-skill AFYD formalizes). The owner has passed none of
Ch. 2–6 for real — use the scratch-DB pattern for any "unpassed" fixture, never her data.

## 6. One design question Phase 4 must answer early

`ai_rubric` grading (`lib/teacher/rubric.ts`) currently receives **section code + stdout**.
AFYD's Find-field rubric must check a number "consistent with the checked results" — so the
grader needs the section's **check report / computed values**, not just stdout. Decide
whether to (a) thread the check report into `RubricItem`, or (b) have milestones print their
key numbers so stdout carries them. (a) is cleaner and future-proofs the "D cross-checked
against the code" requirement too. Do this before authoring milestones, not after.
