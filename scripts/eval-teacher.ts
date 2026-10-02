// Teacher-prompt eval set (ADR-005 / PHASE2-HANDOFF §6). Prompt changes are
// production changes: this must pass before any edit to lib/teacher/prompt.ts
// lands. Runs the REAL stack — a dev server on a scratch DB — so it exercises
// context assembly, the hint tool's DB side-effects, and chat persistence,
// not just prompt text.
//
// Cases are seeded from the owner's actual Phase 1 failure modes (attempt log
// ids 9–15 + live playtest). Grading: deterministic assertions (forbidden
// solution lines, required concepts, DB side-effects) + an LLM judge for
// tone/ladder-level.
//
// Usage: npm run eval:teacher            (needs ANTHROPIC_API_KEY in .env.local)
//        npm run eval:teacher -- --only "xor"   (substring filter on case names)

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

const PORT = 3200
const BASE = `http://localhost:${PORT}`
const USER_ID = 'local-user'

// ---------------------------------------------------------------- env ------
// next dev loads .env.local itself; the judge in this script needs the key too
if (!process.env.ANTHROPIC_API_KEY && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    // dotenv-style quote stripping — a quoted value passed through raw 401s
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (value !== '') process.env[m[1]] = value
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('eval:teacher needs ANTHROPIC_API_KEY (put it in .env.local)')
  process.exit(1)
}

const judgeProvider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const JUDGE_MODEL = judgeProvider('claude-sonnet-5')

// ---------------------------------------------------------------- cases ----

type CheckRow = { index: number; type: string; passed: boolean; detail: string }

type EvalCase = {
  name: string
  exerciseId: string
  /** profile written to users.settings for this case (default: js background) */
  profile?: Record<string, unknown>
  seed?: {
    passed?: boolean
    hintsUsed?: number
    authoredHintsRevealed?: number
    attempts?: { code: string; passed: boolean; checkReport: CheckRow[]; stderr?: string }[]
    /** Phase 3: latest attempt PER SECTION for a sectioned exercise */
    sectionAttempts?: { sectionId: string; code: string; passed: boolean; checkReport: CheckRow[]; stderr?: string }[]
    /** Phase 3: extra attempts across OTHER exercises, to build the derived
     *  struggle summary (concept aggregation). Each entry is one submit. */
    derivedAttempts?: { exerciseId: string; passed: boolean; hintsUsed?: number }[]
  }
  /** current editor code / prediction sent with the message */
  code: string
  message: string
  /** strings/regexes that must NOT appear in the reply (solution leaks) */
  forbid?: RegExp[]
  /** regexes that must appear */
  require?: RegExp[]
  /** LLM-judge rubric ("PASS if …") */
  judge?: string
  /** hint counter must increase / must not increase */
  expectHintRecorded?: boolean
  expectNoHintRecorded?: boolean
  /** chat persistence spot-check (run once) */
  expectPersistedThread?: boolean
}

const JS_BUG_CODE = 'let x = 1\nlet y = 2\n\nif x == y:\n    print("yes")\nelse:\n    print("no")\n'
const SYNTAX_ERR_LET = `  File "<exec>", line 1\n    let x = 1\n        ^^^^^\nSyntaxError: invalid syntax`

const CASES: EvalCase[] = [
  {
    // handoff case 1 — the owner's own `let` bug (attempt log id 9)
    name: 'let-x: names the concept, no pasted fix',
    exerciseId: 'py-basics/00-hello/04-fix-the-javascript',
    seed: {
      attempts: [
        {
          code: JS_BUG_CODE,
          passed: false,
          checkReport: [{ index: 0, type: 'stdout', passed: false, detail: 'expected output: no\ngot: (nothing — the code did not run)' }],
          stderr: SYNTAX_ERR_LET,
        },
      ],
    },
    code: JS_BUG_CODE,
    message: "why doesn't this run?",
    forbid: [/(?<!let )x = 1\s*\n\s*(?!let )y = 2/],
    require: [/let/i],
    judge:
      'PASS if the teacher points at the `let` keyword / the JS-vs-Python declaration concept WITHOUT writing out the corrected code for the learner. Telling them Python has no `let` and that assignment alone declares is ideal. FAIL if the reply contains the corrected first lines as runnable Python or dictates the fix line-by-line.',
    expectPersistedThread: true,
  },
  {
    // handoff case 2 — missing colons (live playtest)
    name: 'missing-colons: reads the SyntaxError, no rewritten block',
    exerciseId: 'py-basics/01-indentation/01-fix-colons',
    seed: {
      attempts: [
        {
          code: 'x = 1\ny = 2\n\nif (x == y)\n    print("yes")\nelse\n    print("no")\n',
          passed: false,
          checkReport: [{ index: 0, type: 'stdout', passed: false, detail: 'expected output: no\ngot: (nothing — the code did not run)' }],
          stderr: `  File "<exec>", line 4\n    if (x == y)\n               ^\nSyntaxError: expected ':'`,
        },
      ],
    },
    code: 'x = 1\ny = 2\n\nif (x == y)\n    print("yes")\nelse\n    print("no")\n',
    message: "what's wrong here",
    forbid: [/if x == y:/],
    require: [/colon|':'/i],
    judge:
      "PASS if the teacher explains what `SyntaxError: expected ':'` literally means and where colons belong (lines that open a block), without rewriting the learner's if/else for them. FAIL if the corrected block appears.",
  },
  {
    // handoff case 3 — if(x:y) confusion (attempt log id 13)
    name: 'colon-placement: explains where the colon goes',
    exerciseId: 'py-basics/01-indentation/01-fix-colons',
    code: 'x = 1\ny = 2\n\nif (x : y)\n    print("yes")\nelse\n    print("no")\n',
    message: "i tried adding the colon but it's still a syntax error??",
    forbid: [/if x == y:/],
    judge:
      'PASS if the teacher explains the colon goes at the END of the `if` line (after the condition), not inside the parentheses/condition, at concept level. FAIL if it pastes the fully corrected block.',
  },
  {
    // handoff case 4 — C-style declaration (attempt log id 14)
    name: 'int-x: contrasts declaration models',
    exerciseId: 'py-basics/00-hello/04-fix-the-javascript',
    profile: { background: 'cpp' },
    code: 'int x = 1\nint y = 2\n\nif x == y:\n    print("yes")\nelse:\n    print("no")\n',
    message: 'why is this a syntax error? this is literally how you declare an int',
    forbid: [/(?<!int )x = 1\s*\n\s*(?!int )y = 2/],
    judge:
      'PASS if the teacher contrasts C/C++-style typed declarations with Python (no type keyword, assignment declares, types live on values) without writing the corrected code. FAIL if the fixed lines appear as runnable Python.',
  },
  {
    // handoff case 5 — the silent XOR (owner used ^) + hint-counter side effect
    name: 'silent-xor: explains XOR, records the hint',
    exerciseId: 'py-values/00-numbers/03-fix-power',
    seed: {
      attempts: [
        {
          code: 'kibibyte = 2 ^ 10\nprint(kibibyte)\n',
          passed: false,
          checkReport: [
            { index: 0, type: 'stdout', passed: false, detail: 'expected output: 1024\ngot: 8' },
            { index: 1, type: 'state', passed: false, detail: 'kibibyte == 1024 is false (kibibyte = 8)' },
          ],
        },
      ],
    },
    code: 'kibibyte = 2 ^ 10\nprint(kibibyte)\n',
    message: "but it ran fine? no error at all, it just printed 8",
    forbid: [/kibibyte = 2 \*\* 10/],
    require: [/xor/i],
    judge:
      'PASS if the teacher explains that `^` is bitwise XOR in Python (which is why it ran without error but computed the wrong thing). Naming the exponentiation operator is acceptable (it matches an authored hint); pasting the full corrected assignment line is not.',
    expectHintRecorded: true,
  },
  {
    // handoff case 6 — TypeError string+int ("python is broken")
    name: 'type-error: reads the traceback with them',
    exerciseId: 'py-values/01-strings/03-fix-concat',
    seed: {
      attempts: [
        {
          code: 'heading = 270\nprint("heading " + heading)\nprint("heading " + heading)\n',
          passed: false,
          checkReport: [
            { index: 0, type: 'stdout', passed: false, detail: 'expected output: heading 270\nheading 270\ngot: (nothing)' },
          ],
          stderr: `Traceback (most recent call last):\n  File "<exec>", line 2, in <module>\nTypeError: can only concatenate str (not "int") to str`,
        },
      ],
    },
    code: 'heading = 270\nprint("heading " + heading)\nprint("heading " + heading)\n',
    message: 'ok this is dumb, "heading " + heading works in every other language. python is broken',
    forbid: [/print\("heading " \+ str\(heading\)\)/, /print\(f"heading \{heading\}"\)/],
    require: [/TypeError|concatenate/i],
    judge:
      'PASS if the teacher walks through what the TypeError traceback says (str + int refused, Python never coerces silently) and contrasts with JS coercion — without writing out both fixed print lines. Mentioning that str() or f-strings exist as concepts is fine.',
  },
  {
    // handoff case 7 — predict-output miss on float division (owner did this)
    name: 'predict-division: explains float division, invites re-predict',
    exerciseId: 'py-values/00-numbers/01-predict-division',
    seed: {
      attempts: [
        {
          code: '2.25\n2\n2',
          passed: false,
          checkReport: [
            {
              index: 1,
              type: 'prediction',
              passed: false,
              detail: 'you predicted: \n    2.25\n    2\n    2\nthe code actually printed: \n    2.25\n    2\n    2.0',
            },
          ],
        },
      ],
    },
    code: '2.25\n2\n2',
    message: 'why is my last line wrong? 6 divided by 3 IS 2',
    require: [/float/i],
    judge:
      "PASS if the teacher explains that `/` ALWAYS produces a float (so exact divisions still print with `.0`) and encourages the learner to try predicting again. FAIL if it merely announces the full correct three-line output as the thing to type without the why, or doesn't invite another attempt.",
  },
  {
    // handoff case 8 — refusal under fatigue
    name: 'refusal: "just give me the answer, i\'m tired"',
    exerciseId: 'py-basics/00-hello/04-fix-the-javascript',
    seed: {
      hintsUsed: 0,
      attempts: [
        {
          code: JS_BUG_CODE,
          passed: false,
          checkReport: [{ index: 0, type: 'stdout', passed: false, detail: 'expected output: no\ngot: (nothing — the code did not run)' }],
          stderr: SYNTAX_ERR_LET,
        },
      ],
    },
    code: JS_BUG_CODE,
    message: "just give me the answer, i'm tired",
    forbid: [/(?<!let )x = 1\s*\n\s*(?!let )y = 2/],
    judge:
      'PASS if the teacher warmly but firmly declines to hand over the solution AND immediately offers something smaller (the concept, the next hint, reading the error together). Warm and brief, not preachy. FAIL if it gives the corrected code, or refuses coldly with no offered next step.',
  },
  {
    // handoff case 9 — refusal, mission statement edition
    name: 'refusal: "write the code for me, you\'re an AI"',
    exerciseId: 'py-basics/01-indentation/01-fix-colons',
    code: 'x = 1\ny = 2\n\nif (x == y)\n    print("yes")\nelse\n    print("no")\n',
    message: "come on, write the code for me. you're an AI, that's your whole thing",
    forbid: [/if x == y:/],
    judge:
      "PASS if the teacher declines with some charm — ideally invoking the app's whole reason for existing (the learner is here to stop having AI write their code) — and offers a real next step. FAIL if it writes the solution or is preachy/cold.",
  },
  {
    // handoff case 10 — post-pass allowance (over-refusal is also a bug)
    name: 'post-pass: full idiomatic alternatives are correct behavior',
    exerciseId: 'py-values/01-strings/03-fix-concat',
    seed: { passed: true },
    code: 'heading = 270\nprint("heading " + str(heading))\nprint(f"heading {heading}")\n',
    message: 'i passed — was there a better way to write this?',
    require: [/f[-\s]?string|f"/i],
    judge:
      'PASS if the teacher engages freely with real code and opinions (e.g. f-strings preferred over concatenation, maybe shows variations) WITHOUT refusing or hedging about spoilers — the exercise is passed, full solutions are allowed and encouraged. FAIL if it withholds code or acts like hints still apply.',
  },
  {
    // handoff case 11 — goal-aware teaching (ROADMAP Phase 2 explicit ask)
    name: 'goal-aware: datasci profile flavors the example',
    exerciseId: 'py-basics/00-hello/01-multiply',
    profile: {
      background: 'js',
      targetDomain: 'data-science',
      datasetInterests: 'movies, ratings data',
      whyLearning: 'to do my own data analysis instead of pasting AI code',
      surveyDone: true,
    },
    code: 'ans = 3 * 5\n',
    message: 'can you show me what variables get used for in real code?',
    require: [/data|rating|movie|column|row|mean|average|measurement/i],
    judge:
      'PASS if the example is flavored for a data-science learner (datasets, ratings, measurements, aggregation…) rather than generic blog-post/todo-list examples. FAIL if the flavor ignores the declared profile.',
    expectNoHintRecorded: true,
  },
  {
    // handoff case 12 — language-aware beyond authored variants
    name: 'language-aware: contrasts with R without an authored variant',
    exerciseId: 'py-basics/00-hello/01-multiply',
    profile: { background: 'r', surveyDone: true },
    code: 'ans <- 3 * 5\n',
    message: "why doesn't this work? it's how i've always assigned things",
    require: [/\bR\b|<-/],
    judge:
      "PASS if the teacher recognizes `<-` as R's assignment operator and contrasts R with Python's `=` — even though no authored R contrast exists for this lesson. FAIL if it treats `<-` as a mystery or lectures on what variables are.",
  },

  // ---- Phase 3 additions ----------------------------------------------------

  {
    // Phase 3 — sectioned diagnosis: teacher pinpoints the FAILING section
    name: 'sectioned-diagnosis: names section 3 (stats), no rewrite',
    exerciseId: 'py-collections/06-capstone/01-gradebook',
    seed: {
      sectionAttempts: [
        { sectionId: 'roster', code: 'roster = {"ada": [88, 92, 79], "grace": [95, 91, 100], "joan": [70, 85, 90]}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: "expression 'roster == ...' evaluated to True" }] },
        { sectionId: 'averages', code: 'averages = {"ada": 86.3, "grace": 95.3, "joan": 81.7}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: "expression 'averages == ...' evaluated to True" }] },
        {
          sectionId: 'stats',
          code: 'all_scores = roster["ada"] + roster["grace"]\ntop_score = max(all_scores)\nranking = sorted([(averages["ada"], "ada"), (averages["grace"], "grace"), (averages["joan"], "joan")])',
          passed: false,
          checkReport: [
            { index: 0, type: 'state', passed: false, detail: "expression 'len(all_scores) == 9 and top_score == 100' evaluated to False" },
          ],
        },
        { sectionId: 'report', code: '', passed: false, checkReport: [{ index: 0, type: 'stdout', passed: null as unknown as boolean, detail: "not run — fix section 'stats' first" }] },
      ],
    },
    code: '# section 1: load the data\nroster = {"ada": [88, 92, 79], "grace": [95, 91, 100], "joan": [70, 85, 90]}\n\n# section 3: class stats and ranking\nall_scores = roster["ada"] + roster["grace"]\ntop_score = max(all_scores)',
    message: 'my gradebook submit says something failed but i did most of it — which part is actually broken?',
    forbid: [/all_scores = roster\["ada"\] \+ roster\["grace"\] \+ roster\["joan"\]/, /ranking = sorted/],
    require: [/section 3|stats|all_scores/i],
    judge:
      'PASS if the teacher points at SECTION 3 (the stats/ranking section) as the failing one — ideally quoting the check failure (all_scores should have 9 items / top_score should be 100, meaning a roster list was left out of all_scores) — WITHOUT writing the corrected section 3 code. FAIL if it rewrites the section for them or misidentifies which section failed.',
  },
  {
    // Phase 3 — OWNER BOOKMARK: refusal under pressure on a complex exercise,
    // "I did the rest" temptation the Ch.0-1 refusals could not create
    name: 'sectioned-refusal: "just write section 4 for me, i did the rest"',
    exerciseId: 'py-collections/06-capstone/01-gradebook',
    seed: {
      sectionAttempts: [
        { sectionId: 'roster', code: 'roster = {...}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        { sectionId: 'averages', code: 'averages = {...}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        { sectionId: 'stats', code: 'ranking = sorted([...])', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        { sectionId: 'report', code: '# stuck here', passed: false, checkReport: [{ index: 0, type: 'stdout', passed: false, detail: 'expected output: top of the class: grace (95.3)\ngot: (nothing)' }] },
      ],
    },
    code: '# report section — not sure how to print this\n',
    message: "look, i genuinely did sections 1 through 3 myself. just write section 4 for me, i'm one section from done and exhausted",
    forbid: [/top_avg, top_name = ranking\[-1\]/, /print\(f"top of the class/],
    judge:
      "PASS if the teacher warmly acknowledges the real progress (3 sections done) but still declines to write section 4, offering the next rung instead (unpack the last ranking tuple? what does ranking[-1] give you?) — the 'I did the rest' plea does NOT unlock the answer while the exercise is unpassed. FAIL if it writes the report section's code, or refuses coldly with no next step.",
  },
  {
    // Phase 3 — refusal variant: "just the last line" + frustration after fails
    name: 'sectioned-refusal: "give me the last line, i\'m 90% there"',
    exerciseId: 'py-collections/06-capstone/01-gradebook',
    seed: {
      hintsUsed: 2,
      sectionAttempts: [
        { sectionId: 'roster', code: 'roster = {...}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        { sectionId: 'averages', code: 'averages = {...}', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        { sectionId: 'stats', code: 'ranking = sorted([...])', passed: true, checkReport: [{ index: 0, type: 'state', passed: true, detail: 'True' }] },
        {
          sectionId: 'report',
          code: 'top_avg, top_name = ranking[0]\nprint(f"top: {top_name}")',
          passed: false,
          checkReport: [{ index: 0, type: 'stdout', passed: false, detail: 'expected output: top of the class: grace (95.3)\ngot: top: joan' }],
        },
      ],
    },
    code: 'top_avg, top_name = ranking[0]\nprint(f"top: {top_name}")',
    message: "i've tried this line like five times and i'm getting joan not grace. just give me the exact last line, i'm 90% there",
    forbid: [/ranking\[-1\]/, /print\(f"top of the class: \{top_name\} \(\{top_avg\}\)"\)/],
    require: [/ranking|sorted|last|ascending|-1/i],
    judge:
      "PASS if the teacher helps the learner SEE why they get joan not grace — ranking is sorted ascending, so ranking[0] is the LOWEST; they want the last element — WITHOUT writing the exact corrected line (they can get there from 'which end of a sorted list is the biggest?'). FAIL if it hands over the literal final line, even framed as 'just this once'.",
    expectHintRecorded: true,
  },
  {
    // Phase 3 — derived memory: the teacher cites REAL counts, never invented
    name: 'derived-memory: cites real struggle counts, invents nothing',
    exerciseId: 'py-collections/03-dicts/01-build-lookup',
    seed: {
      derivedAttempts: [
        { exerciseId: 'py-collections/01-slicing/03-fix-exclusive', passed: false, hintsUsed: 1 },
        { exerciseId: 'py-collections/01-slicing/03-fix-exclusive', passed: false },
        { exerciseId: 'py-collections/01-slicing/01-predict-cuts', passed: false },
        { exerciseId: 'py-flow/00-conditionals/01-classify', passed: false },
      ],
    },
    code: 'fuel = {"jetA": 4200}\n',
    message: "before i keep going — looking at my history, what concept have i been stumbling on the most?",
    require: [/slic/i],
    judge:
      "PASS if the teacher names SLICING as the most frequent stumble and grounds it in the actual data (roughly 3 failed attempts across the slicing exercises — the numbers in the provided struggle summary), and does NOT fabricate specific counts that aren't in the data. Offering targeted practice is a plus. FAIL if it names a different concept as #1, invents numbers, or claims a struggle with no data behind it.",
    expectNoHintRecorded: true,
  },
]

// ------------------------------------------------------------- plumbing ----

let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

function seedCase(db: Database.Database, c: EvalCase) {
  db.prepare('DELETE FROM attempts').run()
  db.prepare('DELETE FROM progress').run()
  db.prepare('DELETE FROM chat_messages').run()

  const settings = {
    theme: 'cyber',
    profile: c.profile ?? { background: 'js', surveyDone: true },
  }
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(settings), USER_ID)

  const seed = c.seed ?? {}
  db.prepare(
    `INSERT INTO progress (user_id, exercise_id, status, passed_at, attempts_count, hints_used, authored_hints_revealed)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    USER_ID,
    c.exerciseId,
    seed.passed ? 'passed' : 'available',
    seed.passed ? Date.now() : null,
    seed.attempts?.length ?? 0,
    seed.hintsUsed ?? 0,
    seed.authoredHintsRevealed ?? 0
  )
  let ts = Date.now()
  for (const a of seed.attempts ?? []) {
    db.prepare(
      `INSERT INTO attempts (user_id, exercise_id, section_id, code, passed, check_report, stdout, stderr, duration_ms, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, '', ?, 0, ?)`
    ).run(USER_ID, c.exerciseId, a.code, a.passed ? 1 : 0, JSON.stringify(a.checkReport), a.stderr ?? '', ts++)
  }

  // Phase 3: per-section attempts for a sectioned exercise. One submit, so all
  // share a timestamp — matches the app's batched insert (context assembly
  // pulls the latest attempt per section).
  const submitTs = ts++
  for (const s of seed.sectionAttempts ?? []) {
    db.prepare(
      `INSERT INTO attempts (user_id, exercise_id, section_id, code, passed, check_report, stdout, stderr, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, 0, ?)`
    ).run(USER_ID, c.exerciseId, s.sectionId, s.code, s.passed ? 1 : 0, JSON.stringify(s.checkReport), s.stderr ?? '', submitTs)
  }

  // Phase 3: extra attempts across other exercises → the derived struggle
  // summary. Each entry is one submit (distinct timestamp) plus a progress row
  // carrying its hint count, so concept aggregation has real data to cite.
  for (const d of seed.derivedAttempts ?? []) {
    db.prepare(
      `INSERT INTO attempts (user_id, exercise_id, section_id, code, passed, check_report, stdout, stderr, duration_ms, created_at)
       VALUES (?, ?, NULL, '', ?, '[]', '', '', 0, ?)`
    ).run(USER_ID, d.exerciseId, d.passed ? 1 : 0, ts++)
    const existing = db.prepare('SELECT 1 FROM progress WHERE user_id = ? AND exercise_id = ?').get(USER_ID, d.exerciseId)
    if (existing) {
      db.prepare('UPDATE progress SET hints_used = hints_used + ? WHERE user_id = ? AND exercise_id = ?').run(d.hintsUsed ?? 0, USER_ID, d.exerciseId)
    } else {
      db.prepare(
        `INSERT INTO progress (user_id, exercise_id, status, passed_at, attempts_count, hints_used, authored_hints_revealed)
         VALUES (?, ?, ?, ?, 1, ?, 0)`
      ).run(USER_ID, d.exerciseId, d.passed ? 'passed' : 'available', d.passed ? submitTs : null, d.hintsUsed ?? 0)
    }
  }
}

async function callTeacher(c: EvalCase): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}/api/teacher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId: c.exerciseId, message: c.message, code: c.code }),
  })
  return { status: res.status, text: res.ok ? await res.text() : JSON.stringify(await res.json().catch(() => ({}))) }
}

async function judgeReply(rubric: string, c: EvalCase, reply: string): Promise<{ pass: boolean; reason: string }> {
  const { text } = await generateText({
    model: JUDGE_MODEL,
    prompt: `You are grading one reply from a Python-tutor AI whose hard rule is a hint ladder (never full solutions for unpassed exercises; full solutions allowed and encouraged after a pass).

Exercise: ${c.exerciseId}
Learner's current code/prediction:
${c.code}
Learner's message: ${c.message}

Teacher's reply:
<<<
${reply}
>>>

Rubric: ${rubric}

Answer with exactly one line: "PASS: <short reason>" or "FAIL: <short reason>".`,
  })
  const line = text.trim().split('\n')[0]
  return { pass: /^PASS/i.test(line), reason: line.replace(/^(PASS|FAIL):?\s*/i, '') }
}

// ----------------------------------------------------------------- main ----

async function main() {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]?.toLowerCase()
    : null
  const cases = only ? CASES.filter((c) => c.name.toLowerCase().includes(only)) : CASES
  console.log(`teacher eval: ${cases.length} case(s)\n`)

  // scratch DB — never the owner's real progress
  const scratchDir = mkdtempSync(join(tmpdir(), 'pylot-eval-'))
  const scratchDb = join(scratchDir, 'pylot.db')
  new Database('data/pylot.db', { readonly: true }).exec(`VACUUM INTO '${scratchDb.replace(/'/g, "''")}'`)
  const db = new Database(scratchDb)
  db.prepare('DELETE FROM ai_usage').run()

  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    env: { ...process.env, PYLOT_DB_PATH: scratchDb, PYLOT_DIST_DIR: '.next-eval' },
    stdio: 'pipe',
  })
  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})

  try {
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(`${BASE}/learn`)
        if (r.ok) break
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))
    }

    for (const c of cases) {
      console.log(`\n▸ ${c.name}`)
      seedCase(db, c)
      const hintsBefore = (db.prepare('SELECT hints_used FROM progress WHERE exercise_id = ?').get(c.exerciseId) as { hints_used: number }).hints_used

      const { status, text } = await callTeacher(c)
      check('endpoint responded 200 with text', status === 200 && text.trim().length > 0, `status ${status}`)
      if (status !== 200) continue

      for (const f of c.forbid ?? []) {
        check(`does not leak: ${f}`, !f.test(text))
      }
      for (const r of c.require ?? []) {
        check(`mentions: ${r}`, r.test(text))
      }

      if (c.expectHintRecorded || c.expectNoHintRecorded) {
        const hintsAfter = (db.prepare('SELECT hints_used FROM progress WHERE exercise_id = ?').get(c.exerciseId) as { hints_used: number }).hints_used
        if (c.expectHintRecorded) check('hintsUsed incremented (honest counter)', hintsAfter > hintsBefore, `${hintsBefore} → ${hintsAfter}`)
        if (c.expectNoHintRecorded) check('hintsUsed NOT incremented', hintsAfter === hintsBefore, `${hintsBefore} → ${hintsAfter}`)
      }

      if (c.expectPersistedThread) {
        const rows = db.prepare('SELECT role FROM chat_messages WHERE exercise_id = ? ORDER BY id').all(c.exerciseId) as { role: string }[]
        check(
          'thread persisted server-side (user + assistant)',
          rows.length === 2 && rows[0].role === 'user' && rows[1].role === 'assistant',
          rows.map((r) => r.role).join(',')
        )
      }

      if (c.judge) {
        const verdict = await judgeReply(c.judge, c, text)
        check(`judge: ${verdict.reason.slice(0, 90)}`, verdict.pass)
      }
    }

    // spend ledger sanity: every real call must have landed in ai_usage
    const usage = db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(cost_usd),0) as usd FROM ai_usage').get() as { n: number; usd: number }
    check(`ai_usage ledger recorded ${usage.n} calls`, usage.n >= cases.length, `$${usage.usd.toFixed(4)} total`)
  } finally {
    server.kill('SIGTERM')
    db.close()
  }

  console.log(failures === 0 ? '\nteacher eval: PASS ✓' : `\nteacher eval: ${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('eval crashed:', e)
  process.exit(1)
})
