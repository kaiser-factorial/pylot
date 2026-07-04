# ADR-005: Teacher agent — server-assembled context, Socratic hint ladder

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

The app exists to *repair* over-reliance on AI code generation. An embedded AI tutor is
therefore both the killer feature and the biggest product risk: if it hands over solutions,
the app becomes the disease it treats. It must also be genuinely useful on multi-section
exercises ("where did I go wrong"), which requires it to see structured check results, not
just chat text.

## Decision

One server-side endpoint (`/api/teacher`) using the **AI SDK** with a Claude model via a
`"provider/model"` gateway string. The server — not the client — assembles context per
message: lesson content, task spec, learner's current code, latest check report
(per-section pass/fail), the last N failed attempts, hints already consumed, and chapter
progress. The system prompt enforces a **hint ladder**:

1. Name the concept in play (no code).
2. Point to the failing line/section and what the check expected vs. got (no fix).
3. Describe the shape of the fix (pseudocode at most).
4. Full solutions and idiomatic alternatives: **only after the exercise is passed.**

Authored per-exercise hints (from content files) are offered before the model improvises.
Hint depth consumed is persisted per exercise (feeds struggle score; displayed honestly to
the learner). Chat history is stored per (user, exercise).

## Options Considered

### Option A: Server-assembled context, single tutor persona (chosen)
**Pros:** Model always knows exactly where the learner is with zero learner effort; the
solution-withholding policy lives in one audited prompt; check reports give it ground truth
so it explains real failures instead of guessing.
**Cons:** Context assembly is a real server module with tests. Worth it.

### Option B: Plain chat widget; learner pastes their code/question
**Pros:** Trivial to build.
**Cons:** This is just ChatGPT-in-an-iframe — it recreates the exact vibecoding dynamic the
app exists to break, and it can't do sectioned-failure diagnosis. Rejected on product grounds.

### Option C: Multi-agent (tutor + grader + curriculum-planner agents)
**Pros:** Clean separation on paper.
**Cons:** Grading is already deterministic (checks), planning is Phase 7; premature
orchestration. Revisit at Phase 7 (adaptive difficulty may want a planner).

## Trade-off Analysis

The binding constraint is pedagogical (withhold solutions, diagnose precisely), not
infrastructural. That argues for maximum context + a single strongly-specified prompt (A),
and against both the too-dumb (B) and too-clever (C) options.

## Consequences

- Easier: "where did I go wrong" on long scripts; honest hint accounting; reward-trigger
  copy generation ("that was a tough one…") reuses the same persona.
- Harder: prompt regressions are product regressions → keep a small eval set of
  (exercise, wrong code, question) → expected-behavior cases and run it on prompt changes.
- Revisit: model choice is a config string; re-evaluate cost/quality per phase.
