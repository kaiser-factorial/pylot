# ADR-002: Python execution — Pyodide in-browser, remote sandbox later

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Corina

## Context

The app's core loop is: learner writes Python → it runs → checks assert on the result.
Executing arbitrary learner code is the app's hardest technical/security problem. The
curriculum needs vanilla Python, then numpy/pandas/matplotlib/scikit-learn, then eventually
torch/peft/bitsandbytes (which need real wheels and ideally GPU). We also want MATLAB-Onramp-
style **workspace inspection** (variable name/value/type after each run).

## Decision

Execute in the browser with **Pyodide (CPython → WebAssembly) inside a Web Worker** for all
vanilla-Python and data-science content. Put execution behind a `CodeRunner` interface;
add a **remote sandboxed runner** implementation in Phase 5 for ML-library content only.
Lessons declare `runtime: browser | remote`.

## Options Considered

### Option A: Pyodide in-browser (chosen for phases 1–4)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Med (worker plumbing, package lazy-loading) |
| Cost | Zero — user's CPU |
| Security | Excellent — user code never touches a server |
| Coverage | Full stdlib + numpy/pandas/matplotlib/sklearn; **no torch/peft/bitsandbytes** |

**Pros:** No sandbox to build or secure; zero latency run loop (feels like Onramp); offline-
capable; direct interpreter access enables workspace snapshots and variable-state checks;
scales to N users for free (relevant to distribution).
**Cons:** ~10–15 MB initial download (cache after first load); no GPU/native wheels; long-running
loops handled by worker termination rather than OS limits; slight numeric-perf gap (irrelevant
for teaching).

### Option B: Server-side subprocess/Docker sandbox from day one

**Pros:** Any package works immediately, incl. torch.
**Cons:** We'd be building and securing an arbitrary-code-execution service before writing a
single lesson; per-run latency; cost scales with users; workspace inspection requires a
serialization protocol Pyodide gives us for free. Massive up-front cost for a capability only
the *last* curriculum phase needs.

### Option C: Third-party execution API from day one (Vercel Sandbox / Modal / Judge0 / opbdh+RunPod)

**Pros:** Sandbox is someone else's problem.
**Cons:** Cost per run, latency in the core loop, network dependency for every keystroke-level
interaction, still needed for only one curriculum phase. Right answer for Phase 5, wrong
default for the core loop.

## Trade-off Analysis

90% of the curriculum (all of vanilla Python + the entire data-science block) runs in
Pyodide. The core learning loop should be instant, free, and safe — that's A. The ML block
genuinely requires B or C, but not until Phase 5, and NN fundamentals are taught better
numpy-from-scratch (browser-capable, MNIST subset) before touching torch anyway. The
`CodeRunner` interface keeps the Phase-5 choice (likely Vercel Sandbox or Modal) open.

## Consequences

- Easier: security, cost, offline use, workspace panel, instant feedback, distribution.
- Harder: torch content blocked until Phase 5; exercise checks must run inside the worker;
  must lazy-load Pyodide packages per chapter to keep load times sane.
- Revisit: choose the remote-runner backend at Phase 5 kickoff. **Leading candidate:
  [opbdh](https://pypi.org/project/opbdh/)** (local checkout: `~/Projects/opbdh_root/opbdh`),
  a CLI that launches a RunPod GPU pod, runs a script, syncs `logs/`+`results/` back, and
  tears the pod down — with static pre-verification, price caps, and a hard `max_spend`
  guard built in. This fits Ch. 11 unusually well because those exercises are *batch-shaped*
  (write a training script → launch → inspect results), not REPL-shaped, and the built-in
  spend guards are exactly what a learning app wants around GPU money. Implication: the
  `RemoteRunner` over opbdh is **asynchronous** (submit → monitor → collect results), so
  Phase 5 needs a job-status UX, not a spinner. Fallbacks if the fit fails in the spike:
  Modal / Vercel Sandbox / self-hosted Docker (criteria: cold start, GPU availability,
  cost per session).
