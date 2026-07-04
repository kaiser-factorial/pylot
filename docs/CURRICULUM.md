# Pylot — Curriculum Plan

The learner profile this is tuned for: strong math/data-sci concepts, working JavaScript,
heavy prior reliance on AI-generated Python. The gap is **syntax + translating intent into
code + reading real library code** — not concepts. So the curriculum leans hard on
*production* (typing code, no copy-paste), *prediction* (what will this print?), and
*diagnosis* (fix this broken code), and it goes lighter on conceptual exposition.

## Exercise kinds (used throughout)

| Kind | What it trains | Notes |
|---|---|---|
| `predict-output` | mental model of execution | answer before running; then run to confirm |
| `fill-blank` | syntax recall | one or two masked expressions |
| `write-code` | intent → code | the Onramp-style core; checked deterministically |
| `fix-bug` | reading + debugging | **directly targets the vibecoding gap** — most AI-era work is diagnosing code you didn't write |
| `parsons` | structure without syntax anxiety | reorder scrambled correct lines; great early |
| `capstone` | integration | sectioned long-form (per-section checks), ends each chapter |

Recurring special exercise: **"Explain the machine's code"** — an AI-generated snippet is
shown; the learner annotates what each part does (AI-rubric checked). This is the meta-skill
the whole app is about: never again shipping code you can't explain.

## Chapters

### Ch. 0 — Orientation (short)
How Python runs: REPL vs script vs notebook; `python file.py`; what
`if __name__ == "__main__":` actually is (a variable you can print!); indentation as syntax;
comments; the workspace panel. *Explicitly contrasts with JS where useful (no braces, `elif`,
`None` vs `null`, truthiness differences).*

### Ch. 1 — Variables, types, strings
Numbers, strings, f-strings, booleans, `None`; dynamic typing; `type()`; conversion;
input/print. JS-contrast callouts (`===` has no equivalent; integer division `//`).

### Ch. 2 — Collections (the big one)
Lists, tuples, dicts, sets; indexing and **slicing** (load-bearing for numpy later);
mutation vs rebinding; nesting; unpacking. Capstone: gradebook script.

### Ch. 3 — Control flow
`if/elif/else`, `for`, `while`, `range`, `enumerate`, `zip`, `break/continue`;
comprehensions (introduced as the idiom, not an afterthought — she'll see them constantly
in real code). Capstone: text-stats tool (sectioned).

### Ch. 4 — Functions & scope
`def`, return values, default/keyword args, `*args/**kwargs` (ubiquitous in ML library
signatures — worth real time), scope/LEGB-lite, lambdas, docstrings. Heavy `fix-bug` load
here (mutable default args, shadowing).

### Ch. 5 — Errors, files, and the outside world
**Reading tracebacks as a first-class skill** (its own lesson: bottom-up reading, common
exception types); `try/except/raise`; file I/O; `with` context managers; JSON; `pathlib`.
This chapter exists because error-message literacy is the single highest-leverage
debugging skill and is usually never taught.

### Ch. 6 — Structuring real programs
Modules & imports (and what `pip`/venv actually do); organizing a script into functions;
`main()` pattern; **classes at reading level** — enough to *read* `class Net(nn.Module)`
and `self` without fear, not OOP design; decorators & `@` at reading level (they're all
over torch/peft); type hints at reading level. Capstone: multi-section CLI data tool
(pure stdlib). Also: asserts + a taste of pytest — testing your own code is the autonomy
skill.

— *Gate: after Ch. 6 the learner writes decently complex vanilla scripts. Library phases unlock.* —

### Ch. 7 — NumPy
Arrays vs lists (why), dtype/shape, vectorization, broadcasting (taught properly — the #1
confusion source), boolean masking, axis semantics, random. Bundled datasets. Capstone:
image manipulation on MNIST digits as raw arrays.

### Ch. 8 — pandas
**Opens with dataset-track selection** (see "The threaded capstone" below): the learner picks
the dataset their Field Report will be about. Series/DataFrame, loc/iloc, filtering, groupby,
merge/join, missing data, apply-vs-vectorized — drills use a mix of tracks so exposure isn't
limited to the chosen one. Chapter capstone = **Field Report milestone 1** on the learner's
track: sectioned analysis (load → clean → transform → aggregate → written observations).

### Ch. 9 — matplotlib (+ a taste of seaborn)
Figure/axes model (the part everyone copy-pastes without understanding), plot types,
subplots, styling, saving. Chapter capstone = **Field Report milestone 2**: 2–3
publication-quality figures that support milestone 1's findings on the learner's track.

### Ch. 10 — ML fundamentals, numpy-from-scratch  *(browser runtime)*
Train/test split, loss, gradient descent — implemented by hand; then a tiny NN
(one hidden layer) on an MNIST subset, from scratch in numpy. The learner earns torch by
first building what torch abstracts. Some scikit-learn for classical baselines — applied,
where the track suits it, as optional **Field Report milestone 3** (a simple predictive
baseline + honest evaluation).

### Ch. 11 — PyTorch and friends  *(remote runtime — Phase 5)*
Tensors mirror numpy (payoff of Ch. 7); autograd; `nn.Module` (payoff of Ch. 6 classes);
training loops; datasets/dataloaders; then the fine-tuning stack: peft/LoRA concepts,
quantization & bitsandbytes at reading level. Capstone: fine-tune something small, end to
end, and **explain every line**.

## The threaded capstone: the Field Report (Ch. 8–10)

Two capstone layers, doing different jobs:

- **Per-chapter capstones** (everywhere): sectioned, deterministically checked, test that
  chapter's skills in isolation. These stay.
- **The Field Report** (libs block only): one dataset, chosen by the learner at the start of
  Ch. 8 from 3–5 bundled **dataset tracks**, threaded through Ch. 8–10 as milestone
  exercises. Milestones accumulate; at the end the app assembles them — analysis sections,
  figures, written conclusions — into an actual rendered report the learner keeps. This is
  the integration proof: not "I can do groupby," but "I produced an analysis, by hand,
  start to finish."

### How track-generic exercises are checked (the machinery)

Milestone exercises are authored **once, as templates**, with role-based parameters
(`{category_col}`, `{value_col}`, `{time_col}`, …). Each track ships:

1. its data file(s),
2. a `track.yaml` mapping the template roles to real columns (plus flavor text), and
3. a **generated answer key**: the content validator runs each milestone's reference
   solution against each track's data and freezes the expected values.

So checks stay deterministic per track, and adding a track never means hand-writing
expected values. Tracks whose shape doesn't fit a template (e.g. no time column → no
time-series milestone) declare that in `track.yaml` and the milestone offers an alternate
variant.

### AFYD: the write-up format for every milestone question

Adopted from the owner's professor's guide (`pascal-assmt-refs/AFYD Guidelines.pdf`).
Each Field Report milestone question = **code** (deterministic checks) + a structured
four-field **AFYD write-up** entered in dedicated fields, not free prose:

- **D — Do:** what you did; every assumption/choice named (one good sentence).
- **Y — Why:** the reasoning for that choice over the alternatives.
- **F — Find:** at least one number, ideally a number *and* a figure, with context.
- **A — Answer:** the conclusion the finding supports, with stated limitations.

The `ai_rubric` check grades each field against concrete criteria (D names the actual
choices the code made — cross-checked against the submitted code; F contains a real number
consistent with the checked results; A states limitations). The teacher's hint ladder also
speaks AFYD: "your F is fine, but your A claims more than the F supports." The compiled
Field Report is then literally the ordered stack of AFYD entries + figures — the report
writes itself as you go. Core ethos, from the guide: *the data doesn't speak for itself;
the choices are the job.*

### Tracks

Small enough to bundle, cleaned enough to load, dirty enough to make Ch. 8 honest:

1. **RMP** (`pascal-assmt-refs/RMP/`): ~90k professors across three **row-aligned** files
   (numeric ratings, qualitative major/school/state, 20 tag counts) — natural join/merge
   teaching; headerless CSVs (attaching column meaning from a spec is itself a lesson);
   spec-sheet judgment calls (rating-count reliability thresholds, tag normalization,
   missing data) are ideal AFYD material. Bundle a ~20–25k-row subsample for load time.
   The original spec sheet's 10 questions seed this track's milestone question bank.
2. **Movies** (`pascal-assmt-refs/movies/`): 1097 participants × 477 columns, wide/matrix
   shaped — positional column semantics, imputation, mass correlation; as much a numpy
   playground as a pandas one. 1.5 MB, bundles whole. Proj 1's inferential questions seed
   milestones; Proj 2 is reserved for the epilogue (below).
3. **1–2 fun Kaggle-style picks** (owner to choose) — also the recommended tracks *for the
   owner herself*, since she has analyzed both datasets above; in-app guidance nudges
   learners toward data they haven't worked with (else milestones become a memory test).

### Epilogue: the redemption arc (optional, rubric/review only)

The finale is doing-for-real a spec you never got to execute — for the owner, that is
concretely **Data Analysis Project 2** (`pascal-assmt-refs/movies/proj_2 (NEW)/`): ML
methods on the movies data — mass simple regressions (a vectorization lesson in disguise),
multiple regression, ridge/lasso with hyperparameter tuning, logistic regression with AUC
and cross-validation — all sklearn-in-Pyodide-feasible, answered in AFYD format. Unseen
questions on familiar data: the ideal finale shape. For distributed users it generalizes to
"bring your own unfinished spec, old AI-written artifact, or dataset" — remake it by hand,
teacher-guided. This is the app's mission statement as an exercise.

## Cross-cutting mechanics

- **Spaced review:** each chapter opens with a 4–6 question quick-review drawn from earlier
  chapters' exercise pool (simple scheduling off the attempts log; no SRS complexity).
- **No copy-paste from lesson pane** into the editor (typing is the point).
- **Datasets:** bundled in `content/datasets/` — 2–3 small Kaggle-style CSVs (owner picks
  ones she finds fun), MNIST subset (~1–2k samples as compressed npy). All fetched into
  Pyodide's filesystem on demand.
- **Reward "vibecode break"** fires on chapter completion or high-struggle passes (see
  ARCHITECTURE §4.8) — the one place the AI is *allowed* to just build something for fun,
  quarantined from the learning loop.
