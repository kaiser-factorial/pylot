# Phase 3 handoff — long-form exercises, full vanilla curriculum, memory layer 2

Written at Phase 2 build-completion (2026-07-04) by the Phase 2 building agent, for the
Phase 3 building agent. Governing docs, in order: ROADMAP Phase 3 →
[ADR-006](adr/ADR-006-learner-memory.md) §layer 2 (derived) →
[ADR-005](adr/ADR-005-teacher-agent.md) (the teacher you are extending) →
CURRICULUM.md (you are authoring Ch. 2–6; every content note in CLAUDE.md applies).

## 0. Phase 2 close-out state — CLOSED ✅ (2026-07-04)

All close-out items done same-day: key in `.env.local`, `npm run eval:teacher` (12
cases) and `npm run verify:phase2` both pass live, the `authored_hints_revealed`
backfill ran on the owner's real DB (verified: zero mismatches), and the owner
playtested and signed off. Standing rule you inherit: any edit to
`lib/teacher/prompt.ts` must re-pass BOTH commands before it lands (invariant #1;
prompt edits are production changes). One playtest item was explicitly deferred to
you — see the owner bookmark in §2 (refusal-under-pressure on complex exercises).

## 1. What Phase 2 built (all offline checks green)

| Piece | Where | Notes for Phase 3 |
|---|---|---|
| Context assembly | `lib/teacher/context.ts` | `assembleTeacherContext(userId, exerciseId, currentCode)` → typed `TeacherContext`. **This is your seam for memory layer 2**: add a `derivedStruggles` field here and render it in `renderTeacherContext` (one serialization point, `lib/teacher/prompt.ts`). Token budget was deliberately left with headroom (attempts capped at 5, code truncated). |
| Teacher prompt (POLICY) | `lib/teacher/prompt.ts` | Static prefix `TEACHER_SYSTEM_PROMPT` (cache-friendly — keep it byte-stable) + `renderTeacherContext`. ADR-006's rule for your episodic layer is already staged in it: performance claims must cite data. |
| Streaming route | `app/api/teacher/route.ts` | GET = thread, POST = streamed reply. `record_hint` tool → `recordHintUsed` (see §4). Persists user turn pre-stream, assistant turn in `onEnd` (never trusts the client). AI SDK v7 (see §6 traps before touching it). |
| Model resolver | `lib/teacher/model.ts` | `PYLOT_TEACHER_MODEL` = "provider/model" string (default `anthropic/claude-sonnet-5`). `anthropic/*` + `ANTHROPIC_API_KEY` → direct provider; anything else → Vercel AI Gateway. |
| Spend cap | `lib/teacher/spend.ts` + `ai_usage` table | $10/month hard cap (UTC calendar month), refuses with 429. **Reward-copy generation in Phase 3 must go through this too** — call `checkBudget()`/`recordUsage({kind: 'reward'})`; the ledger has a `kind` column for exactly this. |
| Chat UI | `components/teacher/TeacherChat.tsx` + Workbench right pane | Right pane is tabbed (`right-tab-workspace` / `right-tab-teacher`); both tabs stay mounted (streaming survives tab flips). "ask the teacher" (`ask-teacher` testid) pre-seeds the input with the failing check details. Plain-text streaming (`toTextStreamResponse`) — tool calls are invisible to the client by design. |
| Survey + settings | `app/settings/page.tsx` (+ `?survey=1`), `components/settings/ProfileForm.tsx` | One form, two hats. Prefills from current settings — never resets. Profile fields: `background, whyLearning?, targetDomain?, datasetInterests?, hintStyle?, surveyDone?`. |
| Eval harness | `scripts/eval-teacher.ts` (`npm run eval:teacher`) | Boots the REAL server on a scratch DB, seeds per-case attempts/progress/profile, greps for solution leaks (careful lookbehind regexes — the learner's buggy code contains substrings of the fix), LLM-judges tone/ladder, asserts hint side-effects in the DB. `--only <substr>` filters cases. **Run it on every prompt change. Extend it when Phase 3 teaches the teacher new tricks (sectioned diagnosis!).** |
| Verify | `scripts/verify-phase2.ts` (`npm run verify:phase2`) | Same scratch-DB pattern as phase 0/1. Exit 2 = INCOMPLETE (no key), not a pass. |

## 2. What Phase 3 builds (ROADMAP)

Sectioned exercises end-to-end; parsons + capstone (`ai_rubric`) kinds; Ch. 2–6 in
full; struggle scores from the attempts log; reward system + `reward_events`;
spaced quick-review at chapter openings; **memory layer 2** (`lib/memory/derived.ts`,
attempts × concept tags → summarized into teacher context as data). Episodic notes
(layer 3) are optional scope — the transparency rules in ADR-006 are strict.

Also decided this phase: the owner's "predict your own failure modes" pre-lesson quiz
idea is **deferred to Phase 3** — it belongs with your spaced-review slot (recorded in
ROADMAP). Design it with the teacher in mind: the quiz answers are exactly the kind of
declared/derived signal the teacher context wants.

**Owner bookmark (playtest, 2026-07-04): re-test refusal-under-pressure on complex
exercises.** The Phase 2 refusal evals use Ch. 0–1 tasks, where nobody genuinely wants
to beg for the answer — the owner couldn't even make herself try. The real temptation
arrives with YOUR sectioned/capstone exercises: deep into a long script, one failing
section from done. Add eval cases shaped like that ("just write section 4 for me, I
did the rest", "give me the last line, I'm 90% there", frustration after N failed
attempts on the same section) and have the owner re-run her sweet-talk playtest then.

## 3. Sectioned exercises — what's already staged for you

- `attempts.sectionId` exists and is populated by `/api/attempts` (nullable).
- `TeacherContext.recentAttempts[].checkReport` is raw JSON from the DB; per-section
  reports can ride in unchanged — but `assembleTeacherContext` currently ignores
  `sectionId`. You'll want the last attempt PER SECTION, not just the last 5 overall.
- The check driver's `detail` strings are already human-readable; keep feeding them
  verbatim (the prompt tells the model to quote them).
- The editor pane shows "sectioned exercises arrive in Phase 3" (`Workbench.tsx`,
  `ex.sections.length > 0` branch) — that's your insertion point.

## 4. The two hint counters (do not merge them back)

`progress.hints_used` = TOTAL honest consumption (authored reveals + teacher hints) —
feeds your struggle scores. `progress.authored_hints_revealed` = how many AUTHORED
hints have been shown — the UI reconstructs the revealed list from it. They diverge
when the teacher improvises a rung-2/3 hint. `recordHintUsed(userId, exerciseId,
{ authored })` maintains both; the teacher's `record_hint` tool passes
`authored_hint_number` so authored delivery via chat also reveals in the UI.

**Owner-DB backfill still pending** (Phase 1 rows have `authored_hints_revealed = 0`
but nonzero `hints_used`, all from the reveal button):
`sqlite3 data/pylot.db "UPDATE progress SET authored_hints_revealed = hints_used;"`

## 5. Struggle scores / derived memory — notes

- Concept tags are validator-enforced on every exercise since Phase 0; the vocabulary
  is `content/concepts.yaml`. The derived layer is a pure aggregation — ADR-006 is
  explicit that it is computed on demand, never stored as prose, never model-written.
- Difficulty tags (1–5) normalize struggle for reward triggers (CLAUDE.md).
- When the derived summary joins teacher context, ADD EVAL CASES: "teacher cites real
  counts, not impressions" is testable (seed a known attempts distribution, require
  the numbers, forbid invented ones).

## 6. Traps sprung in Phase 2 (don't re-spring)

- **AI SDK is v7** (7.0.15) and half your training-data memory of it is stale:
  `system` → `instructions`, `onFinish` → `onEnd` (gets `text`, `usage`, `totalUsage`),
  `stepCountIs` → `isStepCount`, tools use `inputSchema`. The bundled docs in
  `node_modules/ai/docs/` are authoritative — grep them, don't recall.
- **`server-only` modules cannot be imported by tsx scripts** (`lib/content/load.ts`,
  `lib/progression.ts`, everything under `lib/teacher/`). That's why the eval drives
  the real HTTP endpoint instead of importing the assembler. Keep doing that — it
  also tests what actually ships.
- **`drizzle-kit push` needs `--force` in non-TTY contexts** (it prompts otherwise).
  Additive changes only; anything destructive should stop and ask the owner.
- **The auto-mode classifier will (rightly) block writes to `data/pylot.db`.** The
  owner's real DB is hers. Scratch-DB pattern for everything automated; leave real-DB
  one-liners to her (as in §0/§4).
- Eval forbidden-string regexes need lookbehinds: the learner's broken code often
  contains the fix as a substring (`let x = 1` contains `x = 1`).
- Chat streaming is plain text (`toTextStreamResponse`) — if Phase 3 needs structured
  events client-side (e.g. per-section diagnosis chips), switch to
  `toUIMessageStreamResponse` + `useChat` deliberately, and read
  `node_modules/ai/docs/04-ai-sdk-ui/` first (the useChat API changed a lot).
- The teacher prompt's static prefix must stay byte-stable for provider prompt
  caching — new context sections go in `renderTeacherContext`, after the static part.

## 7. State of content

Unchanged from Phase 1: 28 exercises across `py-basics` (3 lessons) + `py-values`
(4 lessons), all validating. The owner has passed all of them for real. Ch. 2–6 are
yours — follow CLAUDE.md content notes (fresh values in predict-output, bug scoping
in fix-bug, kind mix, no owner-specific callouts) and spawn the Haiku review panel
after authoring; the owner cannot proofread reference solutions (spoiler policy).
