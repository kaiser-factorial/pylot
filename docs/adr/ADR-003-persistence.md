# ADR-003: Persistence — SQLite via Drizzle, multi-user-shaped schema

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

The primary stated need: "save my progress along the way." Secondary: attempts must be logged
richly enough to power later features (struggle-score reward triggers, adaptive difficulty),
and the whole thing must survive a future move to hosted multi-user without a rewrite.

## Decision

**SQLite** (a single local file, `data/pylot.db`) accessed through **Drizzle ORM** from
Next.js API routes. Every table carries `user_id` from day one; local mode seeds exactly one
user behind a swappable `getCurrentUser()` in `lib/auth.ts`. `attempts` is append-only.

## Options Considered

### Option A: SQLite + Drizzle (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Minimal — no service to run, one file to back up |
| Cost | Zero |
| Migration path | Drizzle targets Postgres with the same schema definitions |
| Durability | Single file; back up by copying (and it's gitignored but easily synced) |

**Pros:** Zero-ops for a localhost app; real SQL (the attempt-log analytics for adaptive
difficulty want SQL, not JSON grep); mechanical Postgres migration at distribution time.
**Cons:** Not directly usable if deployed serverless — Phase 6 swaps the Drizzle driver to a
hosted Postgres (Neon/Supabase). Accepted: that swap is the *point* of using Drizzle.

### Option B: localStorage / IndexedDB (no backend persistence)

**Pros:** No API routes at all.
**Cons:** Progress dies with the browser profile; no server-side view for the teacher-agent
context assembly; awkward analytics; painful multi-user retrofit. Rejected — this is the
"best way to save progress?" question's wrong answer.

### Option C: Hosted Postgres now (Supabase/Neon)

**Pros:** Zero migration later; progress follows you across machines immediately.
**Cons:** Network dependency and account setup for a personal local tool; slower agent dev
loop; ~all its advantages arrive automatically in Phase 6 anyway.

## Trade-off Analysis

The real requirement is *durable, queryable, user-keyed* progress. A delivers that with zero
operational cost today and a paved road to C when distribution actually happens. The only
discipline required now: no code outside `lib/auth.ts` may assume a single user, and no
SQLite-only SQL features in queries Drizzle can't translate.

## Consequences

- Easier: local dev, backup, attempt-log analytics, later Postgres move.
- Harder: cross-device sync before Phase 6 (workaround: copy the db file).
- Revisit: at Phase 6 — swap driver to Postgres, replace auth stub with real auth (Clerk or
  similar), add a data-export/import path for the existing local user.
