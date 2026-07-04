// Phase 1 acceptance check (ROADMAP "Done when"), self-contained:
// boots its own dev server on :3100 against a SCRATCH COPY of the DB
// (PYLOT_DB_PATH), so verification passes never pollute the real learner's
// progress — completing Ch. 0–1 for real is the owner's job, not Playwright's.
//
// Asserts: the lesson loop end-to-end (write-code, predict-output, fix-bug,
// wrong-answer expected-vs-actual, hints), resume-across-sessions, unlock
// rules, both themes incl. persisted toggle + matching syntax highlighting,
// and the Phase 1 readability rules via computed styles (per CLAUDE.md:
// check computed styles, not textContent).
//
// Usage: npm run verify:phase1   (builds nothing; needs deps + pyodide assets)

import { spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import Database from 'better-sqlite3'
import { parse } from 'yaml'

const PORT = 3100
const BASE = `http://localhost:${PORT}`
let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

// -- helpers ----------------------------------------------------------------

async function waitForReady(page: Page) {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="runner-status"]')?.textContent?.includes('ready'),
    undefined,
    { timeout: 90_000 }
  )
}

async function setEditor(page: Page, code: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

async function submitAndWaitPass(page: Page) {
  await page.getByTestId('submit-button').click()
  await page.getByTestId('passed-banner').waitFor({ state: 'visible', timeout: 60_000 })
}

/** WCAG relative-luminance contrast between two computed colors, in-page.
 *  Colors go through a canvas pixel so oklch()/color() serializations from
 *  Chrome resolve to honest sRGB before the luminance math. */
const CONTRAST_FN = `
  (el) => {
    const ctx = document.createElement('canvas').getContext('2d')
    const toRgb = (c) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const s = getComputedStyle(el)
    let bgEl = el, bg = getComputedStyle(bgEl).backgroundColor
    while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bgEl = bgEl.parentElement
      if (bgEl) bg = getComputedStyle(bgEl).backgroundColor
    }
    const l1 = lum(toRgb(s.color)), l2 = lum(toRgb(bg || 'rgb(0,0,0)'))
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
`

/** Distinct computed colors among highlighted spans in the editor. */
const EDITOR_TOKEN_COLORS = `
  () => {
    const content = document.querySelector('.cm-content')
    return new Set([...content.querySelectorAll('span')].map((s) => getComputedStyle(s).color)).size
  }
`
const TOKEN_RICH_CODE = 'if True:\n    total = 1 + 2  # tally\nprint("done")'

// -- static content assertions ------------------------------------------------

function staticContentChecks() {
  const kinds = new Set<string>()
  const checkTypes = new Set<string>()
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'exercises.yaml') {
        const { exercises } = parse(readFileSync(p, 'utf8'))
        for (const ex of exercises) {
          kinds.add(ex.kind)
          for (const c of ex.checks ?? []) checkTypes.add(c.type)
        }
      }
    }
  }
  walk('content')
  for (const t of ['stdout', 'state', 'function', 'ast', 'exception']) {
    check(`check type "${t}" exercised by ≥1 exercise`, checkTypes.has(t))
  }
  for (const k of ['predict-output', 'fill-blank', 'write-code', 'fix-bug']) {
    check(`exercise kind "${k}" present`, kinds.has(k))
  }
}

// -- main ---------------------------------------------------------------------

async function main() {
  staticContentChecks()

  // scratch DB: clean single-file copy via VACUUM INTO, then wipe progress
  const scratchDir = mkdtempSync(join(tmpdir(), 'pylot-verify-'))
  const scratchDb = join(scratchDir, 'pylot.db')
  new Database('data/pylot.db', { readonly: true }).exec(
    `VACUUM INTO '${scratchDb.replace(/'/g, "''")}'`
  )
  const wipe = new Database(scratchDb)
  wipe.prepare('DELETE FROM progress').run()
  wipe.close()

  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    env: { ...process.env, PYLOT_DB_PATH: scratchDb },
    stdio: 'pipe',
  })
  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})

  let browser: Browser | null = null
  try {
    // wait for the server
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${BASE}/learn`)
        if (r.ok) break
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))
    }
    check('dev server up on scratch DB', true)

    browser = await chromium.launch()

    // ---------------- session 1: fresh learner works through lesson 1 -------
    let ctx = await browser.newContext()
    let page = await ctx.newPage()
    await page.goto(`${BASE}/learn`)

    check(
      'learning map lists both chapters',
      (await page.getByTestId('chapter-py-basics').count()) === 1 &&
        (await page.getByTestId('chapter-py-values').count()) === 1
    )
    check(
      'later lessons are locked at start',
      (await page.getByTestId('lesson-locked-01-indentation').count()) === 1
    )

    await page.getByTestId('resume-link').click()
    await page.waitForURL('**/learn/py-basics/00-hello')
    check('resume goes to first lesson', true)
    await waitForReady(page)

    // task 1: write-code (state check)
    await setEditor(page, 'ans = 3 * 5')
    await submitAndWaitPass(page)
    check('write-code exercise passes (state check)', true)

    // task 2: wrong answer first — expected-vs-actual + hint
    await page.getByTestId('next-task').click()
    await page.getByTestId('reveal-hint').click()
    await page.getByTestId('hint-0').waitFor({ state: 'visible' })
    check('hint reveals', true)
    await setEditor(page, 'print("Hello!")')
    await page.getByTestId('submit-button').click()
    await page.getByTestId('check-fail').first().waitFor({ state: 'visible', timeout: 60_000 })
    const failText = await page.getByTestId('check-report').textContent()
    check(
      'failing check shows expected vs actual',
      /expected/i.test(failText ?? '') && /got/i.test(failText ?? ''),
      (failText ?? '').slice(0, 80)
    )
    await setEditor(page, 'print("Hello, Pylot!")')
    await submitAndWaitPass(page)
    check('stdout+ast exercise passes after fix', true)

    // task 3: predict-output
    await page.getByTestId('next-task').click()
    await page.getByTestId('prediction-input').fill('10\n25')
    await submitAndWaitPass(page)
    check('predict-output exercise passes', true)

    // task 4: fix-bug (the owner's own JS-in-Python attempt)
    await page.getByTestId('next-task').click()
    await setEditor(
      page,
      'x = 1\ny = 2\n\nif x == y:\n    print("yes")\nelse:\n    print("no")'
    )
    await submitAndWaitPass(page)
    check('fix-bug exercise passes', true)
    check('lesson-complete link to next lesson appears', (await page.getByTestId('next-lesson').count()) === 1)

    // readability rules, cyber theme
    const consoleShadow = await page
      .getByTestId('console-output')
      .evaluate((el) => getComputedStyle(el).textShadow)
    check('console has no glow (text-shadow: none)', consoleShadow === 'none')
    const consoleVisible = await page.getByTestId('console-output').evaluate((el) => {
      const s = getComputedStyle(el)
      return s.color !== s.backgroundColor
    })
    check('console text color differs from background', consoleVisible)
    const noScanlinesInReadable = await page.evaluate(
      () => document.querySelector('.readable .fx-scanlines') === null
    )
    check('no scanline overlays inside readable surfaces', noScanlinesInReadable)
    const proseContrast = await page
      .locator('.lesson-prose p')
      .first()
      .evaluate(new Function('el', `return (${CONTRAST_FN})(el)`) as (el: Element) => number)
    check('lesson prose contrast ≥ 4.5 (cyber)', proseContrast >= 4.5, proseContrast.toFixed(2))

    // syntax highlighting present in lesson code block (cyber)
    const cyberTokenColors = await page.evaluate(() => {
      const pre = document.querySelector('.lesson-prose pre')!
      const tokens = [...pre.querySelectorAll('span')].map((s) => getComputedStyle(s).color)
      return new Set(tokens).size
    })
    check('lesson code block is syntax-highlighted (cyber)', cyberTokenColors > 1)

    await ctx.close()

    // ---------------- session 2: resume + unlock rules ----------------------
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto(`${BASE}/learn`)
    const resumeText = await page.getByTestId('resume-link').textContent()
    check(
      'progress survives a fresh session; resume points at lesson 2',
      (resumeText ?? '').includes('01-indentation'),
      (resumeText ?? '').replace(/\s+/g, ' ').slice(0, 80)
    )
    check(
      'lesson 2 unlocked after lesson 1 passed',
      (await page.getByTestId('lesson-link-01-indentation').count()) === 1
    )
    await page.goto(`${BASE}/learn/py-basics/00-hello`)
    const done = await page.getByTestId('task-list').textContent()
    check('completed tasks show checkmarks on revisit', (done?.match(/✓/g) ?? []).length >= 4)

    // deep-link to a locked lesson bounces back to the map
    await page.goto(`${BASE}/learn/py-values/03-conversion`)
    await page.waitForURL('**/learn')
    check('locked lesson deep-link redirects to map', true)

    // ---------------- theme toggle + persistence ----------------------------
    await page.goto(`${BASE}/learn/py-basics/00-hello`)
    const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme)
    check('default theme is cyber', themeBefore === 'cyber')
    await page.getByTestId('theme-toggle').click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'primary')
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    check('primary theme flips surface to Bauhaus white', bodyBg === 'rgb(250, 250, 250)')
    await page.waitForTimeout(700) // settings PATCH lands

    // fresh session → theme persisted from user settings (server-rendered)
    await ctx.close()
    ctx = await browser.newContext()
    page = await ctx.newPage()
    await page.goto(`${BASE}/learn/py-basics/00-hello`)
    const themePersisted = await page.evaluate(() => document.documentElement.dataset.theme)
    check('theme toggle persists across sessions', themePersisted === 'primary')

    // primary theme: readability + highlighting + no scanlines
    const primaryProseContrast = await page
      .locator('.lesson-prose p')
      .first()
      .evaluate(new Function('el', `return (${CONTRAST_FN})(el)`) as (el: Element) => number)
    check('lesson prose contrast ≥ 4.5 (primary)', primaryProseContrast >= 4.5, primaryProseContrast.toFixed(2))
    const primaryTokens = await page.evaluate(() => {
      const pre = document.querySelector('.lesson-prose pre')!
      const tokens = [...pre.querySelectorAll('span')].map((s) => getComputedStyle(s).color)
      return new Set(tokens).size
    })
    check('lesson code block is syntax-highlighted (primary)', primaryTokens > 1)
    const scanlinesGone = await page.evaluate(() => {
      const el = document.querySelector('.fx-scanlines')
      return el ? getComputedStyle(el, '::before').display === 'none' : true
    })
    check('scanlines fully disabled under primary theme', scanlinesGone)
    await waitForReady(page)
    // fill the editor with token-rich code (starter is a single comment token)
    await setEditor(page, TOKEN_RICH_CODE)
    await page.waitForTimeout(300)
    const editorTokens = await page.evaluate(
      new Function(`return (${EDITOR_TOKEN_COLORS})()`) as () => number
    )
    check('editor syntax highlighting active (primary)', editorTokens >= 3, `${editorTokens} colors`)

    // flip back to cyber and verify editor highlighting there too
    await page.getByTestId('theme-toggle').click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'cyber')
    const editorTokensCyber = await page.evaluate(
      new Function(`return (${EDITOR_TOKEN_COLORS})()`) as () => number
    )
    check('editor syntax highlighting active (cyber)', editorTokensCyber >= 3, `${editorTokensCyber} colors`)
    await page.waitForTimeout(700)
    await ctx.close()

    // ---------------- DB facts on the scratch copy --------------------------
    const db = new Database(scratchDb, { readonly: true })
    const passedRows = db
      .prepare("select exercise_id from progress where status = 'passed' order by exercise_id")
      .all() as { exercise_id: string }[]
    check('4 progress rows passed', passedRows.length === 4, passedRows.map((r) => r.exercise_id).join(','))
    const hints = db
      .prepare('select hints_used from progress where exercise_id = ?')
      .get('py-basics/00-hello/02-hello-print') as { hints_used: number } | undefined
    check('hints_used persisted', (hints?.hints_used ?? 0) >= 1)
    const attemptCount = db
      .prepare("select count(*) as n from attempts where exercise_id like 'py-basics/%'")
      .get() as { n: number }
    check('graded attempts appended to the log', attemptCount.n >= 5, `${attemptCount.n} rows`)
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
  }

  console.log(
    failures === 0 ? '\nphase 1 verification: PASS ✓' : `\nphase 1 verification: ${failures} FAILURE(S)`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('verify crashed:', e)
  process.exit(1)
})
