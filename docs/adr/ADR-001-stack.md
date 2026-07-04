# ADR-001: Full-stack framework — Next.js (TypeScript)

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

We need a web app with a lesson UI, an in-browser code editor, streaming AI chat, and a thin
persistence layer for progress. Constraints: the builder-of-record is an AI agent working
autonomously; the human owner reads JavaScript comfortably (and is learning Python — so the
app's own code shouldn't also be her learning burden); the app must run locally first and be
distributable later.

## Decision

Next.js (App Router) + TypeScript + React, one repo, one process. API routes serve
persistence and the teacher-agent endpoint. UI components via shadcn/ui + Tailwind;
editor via CodeMirror 6; AI via the AI SDK.

## Options Considered

### Option A: Next.js full-stack (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one framework, one deploy unit |
| Cost | Free locally; free-tier deployable later |
| Scalability | Fine for this workload (persistence is tiny; execution is client-side) |
| Owner familiarity | High (JS background) |

**Pros:** Single codebase; AI SDK streaming chat is first-class; huge agent-training-data
footprint (an autonomous agent builds Next.js reliably); trivial path to hosted distribution.
**Cons:** Server is JS, so any future server-side Python execution is a separate service (this
is true of Option B's frontend/backend split anyway, and is by design — see ADR-002).

### Option B: FastAPI (Python) backend + React frontend

**Pros:** Backend in the language being learned — poetic; natural home for a future ML runner.
**Cons:** Two apps, two dev servers, CORS, duplicated types; slower for an agent to build well;
the poetic benefit is small since the learner isn't meant to read the app's plumbing. The ML
runner will be its own isolated sandbox service regardless (ADR-002), so this buys little.

### Option C: Local desktop app (Electron/Tauri)

**Pros:** Fully offline; filesystem-native.
**Cons:** Kills the distribution story (installers, updates); packaging Pyodide + a DB is more
work; no meaningful benefit over localhost web.

## Trade-off Analysis

The deciding forces are agent buildability and the distribution path, and A wins both.
B's only durable advantage (Python-native ML execution) is neutralized because arbitrary
user-code execution must be sandbox-isolated from the app server anyway.

## Consequences

- Easier: streaming chat, deployment, agent-driven development, later multi-user hosting.
- Harder: the Phase-5 remote Python runner is a separate service behind an interface
  (accepted; see ADR-002).
- Revisit: nothing before Phase 5.
