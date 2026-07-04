// Phase 2 acceptance check (ROADMAP "Done when" + PHASE2-HANDOFF §8),
// self-contained: boots its own dev server on :3300 against a SCRATCH COPY of
// the DB (PYLOT_DB_PATH) + its own build dir (PYLOT_DIST_DIR), so it can run
// beside the owner's live `npm run dev` and never touches her real progress.
//
// Covers: survey → profile → LangContrast flip (with PREFILL check — saving
// must not nuke the existing profile), the teacher tab + "ask the teacher"
// pre-seeding, hint-counter honesty (authored vs total), the $10/month spend
// cap refusing with 429, and — when ANTHROPIC_API_KEY is present — a live
// streamed teacher reply that references the actual check failure, does not
// contain the reference solution line, and persists across a reload.
//
// Without a key the live section is SKIPPED and the script exits 2
// (INCOMPLETE): Phase 2 does not pass until it runs green WITH the key,
// alongside `npm run eval:teacher`.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import Database from 'better-sqlite3'

const PORT = 3300
const BASE = `http://localhost:${PORT}`

let failures = 0
let skippedLive = false
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

// load .env.local so the live section sees the key the way next dev does —
// including dotenv's quote-stripping (a quoted value would override the
// server's own .env loading with the quotes still on, and the API 401s)
if (!process.env.ANTHROPIC_API_KEY && existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (value !== '') process.env[m[1]] = value
  }
}
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY)

async function waitForReady(page: Page) {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="runner-status"]')?.textContent?.includes('ready'),
    undefined,
    { timeout: 120_000 }
  )
}

async function setEditor(page: Page, code: string) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code)
}

async function main() {
  // ---- static checks -------------------------------------------------------
  console.log('static:')
  const evalSrc = existsSync('scripts/eval-teacher.ts') ? readFileSync('scripts/eval-teacher.ts', 'utf8') : ''
  const caseCount = (evalSrc.match(/^\s+name: '/gm) ?? []).length
  check('eval script exists with ≥10 cases', caseCount >= 10, `${caseCount} cases`)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  check('npm run eval:teacher wired', pkg.scripts['eval:teacher'] === 'tsx scripts/eval-teacher.ts')
  const prompt = readFileSync('lib/teacher/prompt.ts', 'utf8')
  check('prompt encodes the hint ladder', /Full solutions.*only after/i.test(prompt.replace(/\n/g, ' ')))
  check('prompt forbids revealing the reference solution', /NEVER reveal/.test(prompt))

  // ---- scratch server ------------------------------------------------------
  const scratchDir = mkdtempSync(join(tmpdir(), 'pylot-verify2-'))
  const scratchDb = join(scratchDir, 'pylot.db')
  new Database('data/pylot.db', { readonly: true }).exec(`VACUUM INTO '${scratchDb.replace(/'/g, "''")}'`)
  const db = new Database(scratchDb)
  db.prepare('DELETE FROM progress').run()
  db.prepare('DELETE FROM attempts').run()
  db.prepare('DELETE FROM chat_messages').run()
  db.prepare('DELETE FROM ai_usage').run()
  // survey not yet done, JS background (the seeded owner state pre-Phase-2)
  db.prepare('UPDATE users SET settings = ?').run(JSON.stringify({ theme: 'cyber', profile: { background: 'js' } }))

  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    env: { ...process.env, PYLOT_DB_PATH: scratchDb, PYLOT_DIST_DIR: '.next-verify' },
    stdio: 'pipe',
  })
  // keep a rolling tail of server output for post-mortems on failures
  const serverLog: string[] = []
  const capture = (buf: Buffer) => {
    serverLog.push(...buf.toString().split('\n'))
    if (serverLog.length > 200) serverLog.splice(0, serverLog.length - 200)
  }
  server.stdout.on('data', capture)
  server.stderr.on('data', capture)

  let browser: Browser | null = null
  try {
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(`${BASE}/learn`)
        if (r.ok) break
      } catch {}
      await new Promise((r) => setTimeout(r, 1000))
    }
    console.log('\nsurvey & profile:')
    browser = await chromium.launch()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // ---- survey flow -------------------------------------------------------
    await page.goto(`${BASE}/learn`)
    check('survey prompt shows until done', (await page.getByTestId('survey-prompt').count()) === 1)
    await page.getByTestId('survey-prompt').click()
    await page.waitForURL('**/settings?survey=1')
    check(
      'survey PREFILLS from existing profile (background=js, not reset)',
      (await page.getByTestId('profile-background').inputValue()) === 'js'
    )
    await page.getByTestId('profile-background').selectOption('none')
    await page.getByTestId('profile-domain').selectOption('data-science')
    await page.getByTestId('profile-save').click()
    await page.waitForURL('**/learn')
    check('survey prompt gone after completion', (await page.getByTestId('survey-prompt').count()) === 0)

    const settingsRow = db.prepare('SELECT settings FROM users').get() as { settings: string }
    const savedProfile = JSON.parse(settingsRow.settings).profile
    check(
      'profile landed in users.settings',
      savedProfile.background === 'none' && savedProfile.targetDomain === 'data-science' && savedProfile.surveyDone === true
    )

    // background 'none' hides ALL contrast callouts (path tested in Phase 1)
    await page.goto(`${BASE}/learn/py-basics/00-hello`)
    check(
      "background 'none' → zero lang-contrast callouts",
      (await page.getByTestId('lang-contrast').count()) === 0
    )
    // flip back to js in the settings view (editable anytime) → callouts return
    await page.goto(`${BASE}/settings`)
    await page.getByTestId('profile-background').selectOption('js')
    await page.getByTestId('profile-save').click()
    await page.getByTestId('profile-saved').waitFor({ state: 'visible' })
    await page.goto(`${BASE}/learn/py-basics/00-hello`)
    const contrastCount = await page.getByTestId('lang-contrast').count()
    check("background 'js' → contrast callouts render again", contrastCount >= 1, `${contrastCount} callouts`)

    // ---- teacher tab + ask-the-teacher ------------------------------------
    console.log('\nteacher tab:')
    await waitForReady(page)
    check('right pane has workspace|teacher tabs', (await page.getByTestId('right-tab-teacher').count()) === 1)

    await setEditor(page, 'ans = 3 * 4')
    await page.getByTestId('submit-button').click()
    await page.getByTestId('check-fail').first().waitFor({ state: 'visible', timeout: 60_000 })
    check('failing submit shows ask-teacher affordance', (await page.getByTestId('ask-teacher').count()) === 1)

    await page.getByTestId('ask-teacher').click()
    await page.getByTestId('teacher-chat').waitFor({ state: 'visible' })
    // the seed lands via a client effect — wait for it instead of racing it
    await page
      .waitForFunction(
        () => ((document.querySelector('[data-testid="teacher-input"]') as HTMLTextAreaElement)?.value ?? '') !== '',
        undefined,
        { timeout: 10_000 }
      )
      .catch(() => {})
    const seeded = await page.getByTestId('teacher-input').inputValue()
    check('teacher tab opens pre-seeded with the actual failure', /failed this check/.test(seeded) && /state:/.test(seeded), seeded.slice(0, 60))

    // ---- hint-counter honesty ---------------------------------------------
    console.log('\nhint accounting:')
    await page.getByTestId('right-tab-workspace').click()
    await page.getByTestId('reveal-hint').click()
    await page.waitForTimeout(600)
    const hintRow = db
      .prepare("SELECT hints_used, authored_hints_revealed FROM progress WHERE exercise_id = 'py-basics/00-hello/01-multiply'")
      .get() as { hints_used: number; authored_hints_revealed: number }
    check(
      'reveal button bumps both counters',
      hintRow?.hints_used === 1 && hintRow?.authored_hints_revealed === 1,
      JSON.stringify(hintRow)
    )

    // ---- spend cap ----------------------------------------------------------
    console.log('\nspend cap:')
    db.prepare(
      "INSERT INTO ai_usage (user_id, kind, model, input_tokens, output_tokens, cost_usd, created_at) VALUES ('local-user','teacher','x',0,0,11.0,?)"
    ).run(Date.now())
    const capped = await fetch(`${BASE}/api/teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'py-basics/00-hello/01-multiply', message: 'hi', code: '' }),
    })
    const cappedBody = (await capped.json().catch(() => ({}))) as { error?: string }
    check('over-cap POST refused with 429', capped.status === 429 && cappedBody.error === 'monthly_budget_exhausted')
    db.prepare('DELETE FROM ai_usage').run()

    // ---- live teacher (needs ANTHROPIC_API_KEY) ----------------------------
    console.log('\nlive teacher:')
    if (!HAS_KEY) {
      skippedLive = true
      console.log('  ⚠ SKIPPED — no ANTHROPIC_API_KEY; run again with the key in .env.local')
    } else {
      // capture what actually comes back from /api/teacher in the browser
      const teacherResponses: string[] = []
      page.on('response', (res) => {
        if (res.url().includes('/api/teacher')) {
          teacherResponses.push(`${res.request().method()} ${res.status()}`)
        }
      })
      page.on('console', (msg) => {
        if (msg.type() === 'error') teacherResponses.push(`console.error: ${msg.text().slice(0, 200)}`)
      })
      await page.getByTestId('right-tab-teacher').click()
      await page.getByTestId('teacher-send').click()
      try {
        await page.waitForFunction(
          () => {
            const msgs = document.querySelectorAll('[data-testid="teacher-msg-assistant"]')
            const last = msgs[msgs.length - 1]
            return Boolean(last && (last.textContent ?? '').length > 20)
          },
          undefined,
          { timeout: 120_000 }
        )
      } catch (e) {
        const notice = await page.getByTestId('teacher-notice').textContent().catch(() => null)
        console.log('  ✗ no streamed reply within 120s — diagnostics:')
        console.log(`    ui notice: ${notice ?? '(none)'}`)
        console.log(`    /api/teacher responses seen: ${teacherResponses.join(' | ') || '(none)'}`)
        console.log('    server log tail:')
        for (const l of serverLog.slice(-25)) if (l.trim()) console.log(`      ${l}`)
        throw e
      }
      // wait for the stream to settle (component reports via data-streaming;
      // the send button is no signal — it stays disabled while input is empty)
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="teacher-chat"]')?.getAttribute('data-streaming') === 'false',
        undefined,
        { timeout: 120_000 }
      )
      const reply = (await page.getByTestId('teacher-msg-assistant').last().textContent()) ?? ''
      check('response streams', reply.length > 20, `${reply.length} chars`)
      check(
        'response references the actual failure',
        /ans|15|expected/i.test(reply),
        reply.slice(0, 80).replace(/\n/g, ' ')
      )
      check('response does NOT contain the reference solution line', !/ans = 3 \* 5/.test(reply))

      const chatRows = db.prepare('SELECT COUNT(*) as n FROM chat_messages').get() as { n: number }
      check('both turns persisted server-side', chatRows.n === 2, `${chatRows.n} rows`)
      const usage = db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(cost_usd),0) as usd FROM ai_usage').get() as { n: number; usd: number }
      check('call landed in the ai_usage ledger', usage.n >= 1, `$${usage.usd.toFixed(4)}`)

      // thread survives a reload (per-(user, exercise) persistence)
      await page.reload()
      await page.getByTestId('right-tab-teacher').click()
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid^="teacher-msg-"]').length >= 2,
        undefined,
        { timeout: 30_000 }
      )
      check('thread persists across reload', true)
    }

    await ctx.close()
  } finally {
    await browser?.close()
    server.kill('SIGTERM')
    db.close()
  }

  if (failures > 0) {
    console.log(`\nphase 2 verification: ${failures} FAILURE(S)`)
    process.exit(1)
  }
  if (skippedLive) {
    console.log('\nphase 2 verification: INCOMPLETE — live teacher checks skipped (no key). Not a pass yet.')
    process.exit(2)
  }
  console.log('\nphase 2 verification: PASS ✓ (also run: npm run eval:teacher)')
  process.exit(0)
}

main().catch((e) => {
  console.error('verify crashed:', e)
  process.exit(1)
})
