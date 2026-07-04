# Pylot — Build Roadmap

Phased so that each phase ends with something the learner can actually use, and so an
autonomous agent can execute a phase end-to-end against explicit acceptance criteria.
Do not start phase N+1 with phase N's acceptance criteria unmet.

## Open decisions (owner) — resolve before or during the phase noted

| Decision | By when | Notes |
|---|---|---|
| ~~App name~~ | ✅ resolved | **Pylot** (confirmed 2026-07-03) |
| ~~Build workflow~~ | ✅ resolved | One phase per agent session; owner verifies each "Done when" list personally before the next phase starts |
| ~~Repo hosting~~ | ✅ resolved | Private (confirmed 2026-07-03) — `pascal-assmt-refs/` contains graded coursework with the owner's name; dataset redistribution rights unexamined (revisit at Phase 6) |
| ~~Visual direction~~ | ✅ resolved | Port the owner's **Themez** design systems (`~/Projects/Themes/`): cyber-terminal theme as default, Bauhaus primary theme as the alternate, runtime-switchable — see Phase 1 theming work |
| ccru license | deferred to distribution era | @lumpenspace's ccru library has **no published license** (all-rights-reserved by default). Owner will raise it with him in person (~mid-July 2026); no distribution is planned soon, so this is low-urgency — but it **hard-blocks any future distribution**, along with dataset/curriculum permissions from the professor (`pascal-assmt-refs/`). Record outcomes in `vendor/themez/ccru/UPSTREAM.md` |
| ~~Spoiler policy~~ | ✅ resolved (2026-07-04) | Owner reviews app code and content *structure* freely, but does not read `reference_solution` blocks or generated answer keys for chapters she hasn't passed. Who vouches for solutions instead: `validate:content` (executes them against their own checks) **plus a review panel of Haiku subagents** (check robustness / pedagogy / contrast-accuracy lenses) run by the authoring agent after writing content |
| Anthropic API key + monthly spend cap | Phase 2 | Teacher agent needs it; set a hard monthly budget before it ships |
| Kaggle track picks | Phase 4 | Wait — the track schema will define exactly what shapes qualify; keep a running list of fun candidates meanwhile |
| Remote runner vendor confirmation | Phase 5 | opbdh is the leading candidate; confirmed by the spike |
| Auth provider + hosted DB | Phase 6 | Only if distribution actually happens |

## Phase 0 — Skeleton ✅ (completed 2026-07-03; acceptance automated in `npm run verify:phase0`)
Scaffold Next.js (App Router, TS, Tailwind, shadcn/ui). Drizzle + SQLite with the full schema
from ARCHITECTURE §4.6 (seeded single user). Zod content schema + `validate:content` script
(validates schema AND runs each reference solution against its own checks in Pyodide via a
headless harness). Pyodide loading in a Web Worker with the `CodeRunner` interface:
run code → {stdout, stderr, traceback, workspace snapshot}, hard timeout via worker kill.

**Done when:** a dev page has a textarea; submitted Python runs in Pyodide; output, errors,
and a variable table render; a row lands in `attempts`; `validate:content` passes on a
sample exercise and fails on a deliberately broken one.

## Phase 1 — The Onramp loop (MVP)
Three-pane lesson UI (lesson MDX / editor + console / workspace panel). Check engine: stdout,
state, function, ast, exception. Task progression with checkmarks, chapter nav, unlock rules
from `curriculum.yaml`. Progress persistence + resume where you left off. Author **Ch. 0 and
Ch. 1 in full** (they double as the content-pipeline shakedown). Predict-output, fill-blank,
write-code, fix-bug exercise kinds working end to end. **`<LangContrast>` MDX component**
(variants keyed by background language, rendered per profile — see CURRICULUM); author `js`
variants throughout Ch. 0–1; until the Phase 2 survey exists, the seeded user's profile
defaults to `{ background: "js" }`.

**Theming** — port the owner's **Themez** design systems (`~/Projects/Themes/`, vendored
into the repo with attribution): extract each theme's palette/borders/shadows/typography
into CSS custom properties mapped onto the Tailwind/shadcn token layer, so behavior-heavy
components (dialogs, tabs, panes — Radix-based) get skinned rather than rebuilt; reuse
Themez's simple components (buttons, badges, alerts, progress, spinners, timeline) directly
where they fit. **Cyber-terminal theme is the default** (monospace/dark suits a coding app
and the console/workspace panes); **Bauhaus primary** is the alternate; toggle persisted in
user settings. Author a **CodeMirror syntax-highlight theme per theme** from the same
tokens (neither exists yet in Themez). Readability rules: scanline/glow effects are
ambient-chrome only — disabled or heavily muted inside the editor, console output, and
lesson-prose containers; verify WCAG-ish contrast for long-form text in both themes
(esp. yellow accents in primary).

**CCRU components** (by @lumpenspace; verbatim archive with provenance at
`~/Projects/Themes/cyber_theme/vendor/ccru/`, commit `7c38ad9`): adopt **CyberContainer /
CyberPanel / CyberPanelHeader / CyberGridGroup / CyberStackGroup** as the pane chrome for
the three-pane layout (workspace variable table, console, task list — collapsible titled
panels are exactly that job), and **CyberCodeBlock** (prism-react-renderer) for *read-only*
code display inside lesson prose — it is not the editor (CodeMirror is) and has no copy
button, which the no-copy-paste rule requires stays true. Integration is
**fork-and-tokenize**: upstream styling hardcodes hex in Tailwind arbitrary values
(`border-[#10ff50]/20`), so create Pylot-local forks (`components/ui/Panel.tsx`,
`CodeBlock.tsx`, marked "adapted from ccru <commit>") that keep upstream structure/behavior
(collapse, drag, panel headers) but express all colors/effects via the theme tokens — same
geometry renders neon-on-dark under cyber and 3px-black-border Bauhaus under primary, with
glow/glitch effects token-gated off in primary. Never edit the vendored originals.

**Done when:** the learner completes Ch. 0–1 with saved/resumable progress; every check type
has at least one exercise exercising it; a failing check shows expected-vs-actual clearly;
both themes render the full lesson UI with matching editor syntax highlighting, the toggle
persists across sessions, and code/prose areas pass the readability rules above.

## Phase 2 — The teacher
`/api/teacher` per ADR-005: server-side context assembly (lesson, code, check report, recent
attempts, hint history), streaming chat UI in the right pane, hint-ladder system prompt,
authored-hints-first policy, per-(user, exercise) chat persistence, hint-depth tracking.
Prompt eval set (≥10 cases: wrong code + question → expected behavior, incl. "refuses to
just give the solution").

**Learner profile (ADR-006 layer 1):** optional skippable onboarding survey (why learning,
new-to-programming vs. experienced + primary language, target domain, dataset interests,
hint-style preference) → `users.settings.profile`, editable in a settings view, injected
into teacher context. Add eval cases for goal-aware teaching (datasci-profile learner gets
a datasci-flavored example) and language-aware contrast (JS-background learner writing
`let x = 1` gets the drop-the-`let` correction, not a what-is-a-variable lecture).

**Done when:** mid-exercise "why is this failing?" yields a concept-level hint referencing
the actual check failure, never a solution; evals pass; hints-used shows in progress data.

## Phase 3 — Long-form + full vanilla curriculum
Sectioned exercises (cumulative namespace, per-section checks/editors, section-aware teacher
diagnosis). Parsons + capstone (ai_rubric) exercise kinds. Author **Ch. 2–6 in full**.
Struggle score computation on the attempts log. Reward system: chapter-completion +
high-struggle triggers, offer UX, sandboxed-iframe toy rendering, `reward_events` persistence.
Spaced quick-review at chapter openings.

**Learner memory layers 2–3 (ADR-006):** derived struggle-by-concept summary
(`lib/memory/derived.ts` over attempts × concept tags) added to teacher context — enables
"slicing is your most frequent stumble, want more examples?" grounded in real counts.
Optional scope: episodic teacher notes with the transparency rules (user-visible/deletable
panel, capped, no performance claims — those must cite derived numbers).

**Done when:** a capstone reports per-section pass/fail and the teacher pinpoints the failing
section; reward fires after a struggle-heavy pass and does NOT fire after an easy one
(test both); Ch. 2–6 fully validated.

## Phase 4 — Data-science block
Lazy per-chapter Pyodide package loading (numpy/pandas/matplotlib/sklearn). Matplotlib
rendering to the output pane. Dataset bundling + fetch-into-Pyodide-FS. Workspace panel
upgrades for arrays/DataFrames (shape/dtype/head preview).

**Field Report machinery** (see CURRICULUM "The threaded capstone"): dataset-track schema
(`track.yaml`: role→column mapping, applicable-milestone flags); template exercises with
role parameters resolved per track; validator extension that runs each milestone's
reference solution per track and **generates the answer keys**; track-selection UX at
Ch. 8 start (persisted per user); **AFYD editor** — four structured fields (Do / Why /
Find / Answer) attached to each milestone question, with per-field `ai_rubric` criteria
(D cross-checked against the submitted code, F against the checked numeric results);
milestone artifacts (code, AFYD entries, figures) persisted; **report assembly view**
rendering accumulated AFYD entries + figures into a final document the learner can export.

**Track preparation** from `pascal-assmt-refs/` into `content/datasets/` + `track.yaml`s:
**RMP** (subsample ~20–25k of 90k rows; keep headerless — column naming from the spec is
part of the exercise; milestone bank seeded from the spec sheet's 10 questions) and
**Movies** (bundle whole, 1.5 MB; wide-format 477 cols; milestones seeded from Proj 1),
plus 1–2 owner-picked Kaggle-style tracks. Author **Ch. 7–10** (incl. numpy-from-scratch
MNIST) and the **redemption-arc epilogue** — for the owner: Project 2's five ML questions
(`movies/proj_2 (NEW)/Project 2_specSheet.pdf`) in AFYD format, rubric/review only.
Verify sklearn-in-Pyodide handles Proj-2-scale work (Q1's 400×399 simple regressions
vectorized via correlation matrix, ridge/lasso CV) within acceptable browser time.

**Done when:** the same milestone template passes on two different tracks with different
expected values, all keys generated (not hand-written); the Ch. 8 sectioned milestone runs
fully in-browser on a bundled CSV; a matplotlib figure renders inline and its exercise is
checkable; an AFYD entry with a fabricated F (number not matching results) is caught by
the rubric check; the assembled Field Report renders AFYD entries + figures and exports;
MNIST-from-scratch trains to >85% on the bundled subset inside the browser within the
exercise timeout.

## Phase 5 — Real ML runtime
Spike the remote backend, starting with **[opbdh](https://pypi.org/project/opbdh/)**
(local checkout: `~/Projects/opbdh_root/opbdh`) — a CLI that launches a RunPod GPU pod,
runs a verified script with HF-model caching, syncs `logs/`+`results/` back locally, and
deletes the pod, with price caps and a hard `max_spend_dollars` guard. Architecture of the
integration: the app writes the learner's script + a `requirements.txt` to a workdir,
invokes `opbdh launch --yes` (spend caps from app config, `RUNPOD_API_TOKEN` from env),
and tails the synced `runpod_results/<run_id>/` directory for output/artifacts.

This makes `RemoteRunner` **asynchronous by nature** — Ch. 11 exercises are batch-shaped
(write training script → launch → inspect results), so build a job-status UX (queued /
booting / running with live log tail / synced), not a blocking spinner. Checks for remote
exercises run against the synced results (stdout log, metric files the exercise asks the
learner to write into `results/`). Teacher context includes the tail of the remote log.
Fallbacks if the opbdh spike shows bad fit: Modal / Vercel Sandbox / self-hosted Docker.
Author **Ch. 11** (torch, peft/bitsandbytes at reading level).

**Done when:** a torch training-loop exercise runs on a real GPU via opbdh end-to-end
(launch → live log tail in the app → results synced → checks pass → teacher can discuss
the failure/success); a dry-run mode exists for exercise development; per-exercise cost
is measured and written down, and the spend guard is verified to actually stop a runaway run.

*Note for distribution (Phase 6): opbdh runs as a local CLI with the owner's RunPod token —
fine for single-user. Multi-user remote execution needs per-user tokens or a shared metered
pool; treat that as a Phase 6+ design question, and consider Ch. 11 "bring your own RunPod
token" as the honest first version.*

## Phase 6 — Distribution
Real auth (Clerk or similar) replacing the stub; Drizzle driver → hosted Postgres
(Neon/Supabase); local-data export/import for the original user; deploy (Vercel);
rate-limit/usage-cap the teacher endpoint; landing page.

**Done when:** a stranger can sign up, do Ch. 0, close the tab, and resume from another
device; the original local progress is migrated.

## Phase 7 — Adaptive difficulty (deliberately last)
Onboarding placement quiz (chapter skipping); dynamic exercise selection from per-skill
mastery estimates computed off the attempts log; teacher-suggested review. Design doc first —
this phase gets its own ADR.

## Standing rules for the building agent
- Content changes must pass `validate:content`; app changes must not break it.
- Nothing outside `lib/auth.ts` assumes a single user.
- `attempts` stays append-only.
- The teacher must never emit a full solution for an unpassed exercise — treat prompt
  changes as production changes (run the eval set).
- No copy-paste affordance from lesson content into the editor.
