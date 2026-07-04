# ADR-006: Learner memory — three layers, ground truth over impressions

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

The teacher agent should know more than the current exercise: where the learner is, what
has historically been hardest ("want more practice with dict methods? that's your most
frequent stumble"), and *why* they're learning (data science → suggest relevant libraries,
datasets, examples). The danger: an LLM's remembered *impressions* of a learner are
unreliable, sycophancy-prone, and — in an app whose mission is restoring self-trust around
code — corrosive if wrong. Memory must be lightweight and trustworthy.

## Decision

Three layers, distinguished by **who writes them**:

### 1. Declared (written by the learner)
A `profile` object in `users.settings`: goals/why-learning, background languages, target
domain (data sci / ML / general), dataset interests, hint-style preference. Seeded by an
**optional, skippable onboarding survey**; editable anytime in settings. Injected verbatim
into teacher context. Powers goal-aware teaching ("since you're headed for pandas, here's
the same idea with a DataFrame") and reward-break personalization.

### 2. Derived (computed, never stored as prose, never model-written)
Aggregations over the append-only `attempts` log joined with **exercise concept tags**:
fail ratio, retries-to-pass, hint depth, and recency per concept. Computed on demand by
`lib/memory/derived.ts` and summarized into context as data ("top struggles: slicing
(7 fails/2 passes), dict-methods (5/3)"). This is the load-bearing layer: it also feeds
struggle scores (Phase 3) and adaptive difficulty (Phase 7), which read the same tags.

**Requires concept tags on exercises** — added to the content schema now (before Phase 1
authors the curriculum): `concepts: [string]`, ≥1 per exercise, drawn from a controlled
vocabulary in `content/concepts.yaml` (validator-enforced to prevent tag sprawl).

### 3. Episodic (written by the teacher agent — the constrained layer)
Short notes the agent may persist mid-conversation ("prefers hints as questions",
"mutability clicked via the shared-shopping-list analogy"). Hard rules:

- **User-visible and deletable** — a "what the teacher remembers about you" panel; nothing
  hidden. Transparency is the product ethos.
- **Capped** (≤50 notes, ≤200 chars each; oldest evicted) — memory, not a dossier.
- **No performance claims.** Notes may record preferences and what-worked; any "you
  struggle with X" statement must come from layer 2's numbers, cited. The teacher prompt
  enforces this: impressions never masquerade as data.

## Options considered

- **One free-form memory blob the model reads/writes** (typical chatbot memory): rejected —
  conflates all three layers, lets impressions overwrite ground truth, un-auditable.
- **No memory, context-window only**: rejected — loses goals and long-horizon patterns;
  the "why you're learning" signal is cheap and high-value.
- **Full user-modeling / mastery estimation now**: rejected as premature — that's Phase 7
  (adaptive difficulty), which this ADR's tags and derived layer deliberately set up.

## Phasing

| Piece | Phase |
|---|---|
| Concept tags in content schema + vocabulary + validator rule | **now** (pre-Phase 1, so all content is tagged from birth) |
| Onboarding survey → profile; profile injected into teacher context | Phase 2 |
| Derived struggle summary in teacher context (shares Phase 3 struggle-score work) | Phase 3 |
| Episodic notes + "what the teacher remembers" panel | Phase 3 (optional scope) |
| Mastery estimates / adaptive difficulty on the same tags | Phase 7 |

## Consequences

- Easier: personalized teaching grounded in real data; Phase 7 becomes a read of
  already-tagged history; reward breaks can use declared interests.
- Harder: content authoring must tag concepts (validator makes this unskippable);
  context assembly grows a memory section with a token budget.
- Revisit: vocabulary size at Phase 4 (library chapters will want namespaced tags like
  `pandas/groupby`); episodic-layer value after Phase 3 usage.
