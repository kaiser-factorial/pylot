# Pylot

An interactive Python learning app: short lessons, checked exercises, an in-browser
Python runtime, and an AI teacher that guides without writing unpassed solutions.
The learner types, predicts, fixes, and explains code.

**Status:** Phases 0–2 complete. Phase 3 is code-complete; the owner's capstone,
teacher-refusal, and reward-break playtests are still pending. Phase 4, the data-science
block, is next. Read-aloud is an improvement to the existing lesson experience, not
Phase 3 sign-off or the start of Phase 4.

## Quickstart: open Pylot

Pylot runs locally on your Mac as a **Next.js development server**, managed by the
`dev` launcher. Your browser opens the app; Python exercises execute in the browser,
while progress is saved locally in SQLite. Teacher chat and new read-aloud audio use
external APIs with the keys in `.env.local`.

For this already-configured checkout, open Terminal and run:

```bash
cd /Users/corinakaiser/Projects/learn-python
dev start --port 3000 --detach --json
```

Once the command reports `ready`, open **[Pylot → /learn](http://localhost:3000/learn)**.
If the launcher reports a different URL, open that URL with `/learn` appended instead.
The lesson map lets you resume your progress. Within a lesson, expand **Briefing** and
select **Read aloud** to hear the lesson with highlighting.

`--detach` keeps the server running after you close Terminal. It is not installed as an
automatic startup service: after a restart, run the same command again. A healthy existing
server is reused. If port 3000 belongs to another app, choose another port (for example,
`--port 3100`) and use the returned URL.

From the project directory:

```bash
dev status --json           # check the server and its URL
dev kill learn-python       # stop Pylot's managed server
```

Normal opening does **not** require reinstalling dependencies, reseeding the database, or
running a production build. For a fresh checkout, follow [Development](#development) first.

## Curriculum available

**38 lessons and 140 exercises across Chapters 0–6** are authored. These counts describe
available content, not the learner's personal completion.

| Chapter | Topic | Lessons | Exercises |
|---|---|---:|---:|
| 0 | Orientation: first programs, indentation, scripts | 3 | 12 |
| 1 | Variables, types, strings | 4 | 16 |
| 2 | Collections | 7 | 26 |
| 3 | Control flow | 6 | 21 |
| 4 | Functions and scope | 6 | 22 |
| 5 | Errors, files, JSON, pathlib | 6 | 22 |
| 6 | Structuring real programs | 6 | 21 |

Chapters 2–6 include sectioned capstones. Exercise kinds include writing code, predicting
output, fixing bugs, filling blanks, and arranging scrambled code. Next: NumPy, pandas,
plotting, and NumPy-based ML (Ch. 7–10), followed by a remote PyTorch runtime (Ch. 11).
See the [curriculum plan](docs/CURRICULUM.md) and [roadmap](docs/ROADMAP.md).

## Project structure

| Path | Purpose |
|---|---|
| `app/` | Next.js lesson/settings pages and API routes |
| `components/` | Lesson reader, editor, teacher chat, workbench, themes |
| `content/` | MDX lessons, YAML exercises, curriculum order and concept vocabulary |
| `lib/` | Content loading, Python runner, progression, teacher, narration, review and rewards |
| `db/` | SQLite/Drizzle schema and connection |
| `scripts/`, `tests/` | Content validation, browser acceptance and focused tests |
| `public/pylot-worker.js` | Browser Python worker; Pyodide assets are copied on install |
| `docs/` | Architecture, decisions, curriculum, roadmap and handoffs |

Python runs in a **Pyodide Web Worker**, behind the `CodeRunner` interface. Deterministic
checks grade ordinary exercises; selected capstone checks use AI rubrics. The Next.js
server persists user-keyed progress, append-only attempts, teacher chats and AI spending.
The teacher uses lesson/code/check context and an escalating hint ladder. Cyber and
Bauhaus themes share component and syntax-color tokens.

## Development

```bash
npm install
# First-time setup only; do not reseed an existing learner database:
npm run db:push
npm run db:seed
dev start --detach --json --yes
```

Open **`/learn`** at the URL returned by `dev`. Use `dev status --json` to check the server
and `dev kill` to stop the server it manages. Install the local universal `dev` launcher
from `~/Projects/devserver/` if it is not on PATH. Configure detection through
`.devserver.toml` if necessary; use the launcher for development servers.

Local progress lives in ignored `data/pylot.db`; back it up separately. `PYLOT_DB_PATH`
and `PYLOT_DIST_DIR` isolate automated checks from the learner's database and normal build.
Do not run automated completion exercises against the real database.

## Lesson read-aloud

Expand **Briefing**, then select **Read aloud**. The current sentence is subtly highlighted, with a stronger highlight moving through
short word chunks. Chunk timing is estimated from the clip duration and word lengths
(no provider word timestamps); it follows playback position through pauses and speed changes.
Controls include exact-position pause/resume, restart, previous/next sentence, voices A/B,
and speeds 0.75×, 1×, 1.25×, 1.5× and 2×. Voice and speed persist per user. Changing voice
pauses at the beginning of the current sentence; navigating sentences while paused stays
paused. Restart plays from the beginning. Page navigation stops audio; reload starts idle.

Narration covers headings and lesson prose, including inline terms and matching language
callouts. It skips fenced code, exercise prompts and teacher replies. There is no autoplay
or silent fallback to another voice provider.

Configure these server-only values in `.env.local`:

```dotenv
MISTRAL_API_KEY=your-key
PYLOT_TTS_VOICE_A=your-voice-id
PYLOT_TTS_VOICE_B=your-other-voice-id
# Optional defaults:
PYLOT_TTS_MODEL=voxtral-mini-tts-2603
PYLOT_TTS_USD_PER_MCHAR=16
PYLOT_TEACHER_SPEND_CAP_USD=10
```

The default speech price is $16 per million characters; update the override when your
provider pricing changes. Speech shares the existing monthly AI budget. Paid generation
reserves its estimated cost atomically; definitive provider rejections release that
reservation. Ambiguous failures/timeouts remain counted because the provider may have
billed them. Speech characters are recorded separately from token usage in the additive
`ai_speech_usage` table, created on database initialization; existing progress is untouched.
Outstanding reservations remain counted across month boundaries until reconciled.

Audio is cached beside the selected database in `tts-cache/`, or at `PYLOT_TTS_CACHE_DIR`.
The key includes text, model, resolved voice, format, and narration version. Replays survive
server restarts without another generation charge; cached clips still work at the budget
limit. Playback prefetches at most the next sentence. Cache files are disposable; deleting
them causes regeneration costs. Do not commit them or server credentials.

The endpoint accepts registered lesson/segment identities, not arbitrary speech text.
Missing configuration, stale lessons, provider errors and budget limits produce visible
messages. Retry recovers transient failures; reload when a lesson has changed.

## Verification

```bash
npm run validate:content       # schemas + reference solutions against their checks
npm run test:narration         # segmentation, caching, provider failures, accounting
npm run verify:read-aloud      # scratch DB + isolated dev server, fixture audio
npm run verify:read-aloud -- --live  # additionally generates one short clip per voice
npx tsc --noEmit
npm run lint
```

The read-aloud verifier uses `dev` with a separate launcher identity, saves screenshots and
a scratch DB in the printed temporary directory, and stops its own server afterward.
`--live` requires the speech configuration and incurs a small charge; it verifies browser
audio decoding and cache reuse. Voice quality still benefits from a human listening check.

The Phase 3 handoff records historically passing `verify:phase3`, `eval:teacher` and
`validate:content`. Those historical results are not a claim that every current check was
rerun. Teacher prompt changes still require teacher evaluations. The repository-wide lint
command also includes existing vendor/runtime files and has pre-existing failures;
read-aloud's changed files are checked separately during development.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — execution, persistence and component design
- [Roadmap](docs/ROADMAP.md) — phases and acceptance criteria
- [Curriculum](docs/CURRICULUM.md) — pedagogy, content and future chapters
- [Phase 4 handoff](docs/PHASE4-HANDOFF.md) — Phase 3 state and next-phase seams
- [Architecture decisions](docs/adr/) — stack, content, persistence and teacher policy
- [Agent instructions](AGENTS.md) — project invariants and development conventions
