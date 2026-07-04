# Pylot

An interactive Python learning app — MATLAB-Onramp-style checked exercises, an in-browser
Python runtime (Pyodide), and an embedded AI teacher that gives hints, diagnoses *where* a
long script went wrong, and never just writes the answer for you.

Built to cure a specific ailment: knowing what you want conceptually, having AI generate the
code, and never truly understanding it. Pylot makes you type, predict, fix, and explain code
— with AI as a tutor instead of a ghostwriter.

**Status:** architecture/documentation phase. No application code yet.

## Documentation map

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design: components, execution model, checking engine, data model |
| [docs/adr/](docs/adr/) | Decision records (stack, Python execution, persistence, content format, teacher agent) |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | The learning plan: chapters, exercise kinds, pedagogy |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased build plan with per-phase acceptance criteria |
| [CLAUDE.md](CLAUDE.md) | Orientation + invariants for AI agents building this |

## Quick architectural summary

- **Next.js (App Router, TS)** full-stack; shadcn/ui; CodeMirror editor.
- **Pyodide in a Web Worker** runs all Python client-side (incl. numpy/pandas/matplotlib);
  a remote sandboxed runner is added in Phase 5 only for torch/peft content.
- **SQLite + Drizzle** persists progress/attempts locally; schema is multi-user-shaped for a
  later Postgres + auth swap.
- **Curriculum is data**: MDX lessons + YAML exercises, CI-validated by executing each
  exercise's reference solution against its own checks.
- **Teacher agent** (Claude via AI SDK) gets server-assembled context and follows a strict
  hint ladder — solutions only after you've passed.
