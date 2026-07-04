# ADR-004: Curriculum content as validated data files

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

The curriculum is large (multiple chapters × many exercises), will be authored incrementally
— mostly by an AI agent — and must be trustworthy: a broken exercise (checks that can't pass,
starter code that errors) destroys learner trust in exactly the way this app exists to repair.
Content churn must never require app-code changes.

## Decision

Lessons are **MDX** files; exercises are **YAML** conforming to a Zod schema; chapter/unlock
structure lives in `content/curriculum.yaml`. Exercise IDs are stable strings
(`py-basics/loops/03-fizzbuzz`) referenced by the DB. A CI-enforced validator
(`npm run validate:content`) (a) schema-checks everything and (b) **executes each exercise's
bundled reference solution against its own checks in Pyodide** — content that cannot pass
itself cannot merge.

## Exercise schema (shape)

```yaml
id: py-basics/loops/03-fizzbuzz
title: FizzBuzz
kind: write-code          # predict-output | fill-blank | write-code | fix-bug | parsons | capstone
difficulty: 2             # 1-5, feeds struggle-score normalization
runtime: browser          # browser | remote (remote = Phase 5+)
starter_code: |
  # your code here
reference_solution: |     # never shown to the learner; used by the validator & teacher context
  ...
sections: []              # optional; ordered sub-parts for long scripts, each with own checks
checks:
  - type: stdout          # stdout | state | function | ast | exception | ai_rubric
    ...
hints:                    # optional authored hints, used before the teacher improvises
  - "Think about what % gives you."
params: {}                # optional; role-based placeholders ({category_col}, …) resolved
                          # per dataset track for Field Report milestone templates —
                          # expected check values come from validator-generated answer keys
```

## Options Considered

### Option A: MDX + YAML + Zod validator (chosen)
**Pros:** Human-diffable; agent-authorable; prose (MDX) and machine-checked structure (YAML)
each in the right format; the self-testing validator is the load-bearing guarantee.
**Cons:** Two file types per lesson dir. Accepted.

### Option B: Everything in a database / CMS
**Pros:** Editable UI.
**Cons:** Not versioned with the app; agents author files far more reliably than they drive
CMSes; overkill for a single author. Rejected for now (a distribution-era import step can
lift files into a DB if ever needed).

### Option C: Exercises as TypeScript modules
**Pros:** Types for free; checks could be arbitrary code.
**Cons:** Content authors (human or agent) can break the app; arbitrary check code bypasses
the declarative check taxonomy the teacher agent relies on to explain failures. Rejected.

## Consequences

- Easier: agent-driven curriculum authoring at scale, review via git diff, community
  contributions later.
- Harder: genuinely novel check semantics require extending the schema + checker first
  (feature, not bug — keeps failure explanations uniform).
- Revisit: if check types proliferate past ~10, consider a plugin registry.
