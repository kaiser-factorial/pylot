// Phase 0 acceptance check (ROADMAP "Done when"), run against a live dev server:
// loads /dev/runner in a real (headless) browser, submits Python through the
// Pyodide worker, and asserts: stdout renders, workspace table renders, an
// error case renders a traceback, and attempt rows land in the DB.
// Usage: npm run dev (separately), then: npx tsx scripts/verify-phase0.ts

import { chromium } from 'playwright'
import Database from 'better-sqlite3'

const BASE = process.env.PYLOT_BASE_URL ?? 'http://localhost:3000'
let failures = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const before = (
    new Database('data/pylot.db', { readonly: true })
      .prepare('select count(*) as n from attempts')
      .get() as { n: number }
  ).n

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${BASE}/dev/runner`)

  // Pyodide boot (first load fetches ~16MB of local assets)
  await page.getByTestId('run-button').waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="run-button"]:not([disabled])'),
    undefined,
    { timeout: 60_000 }
  )
  check('pyodide worker boots to ready', true)

  // 1. happy path: stdout + workspace
  await page.getByTestId('code-input').fill('x = 3 * 5\nwords = ["a", "b"]\nprint(f"x is {x}")')
  await page.getByTestId('run-button').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="console-output"]')?.textContent?.includes('x is 15'),
    undefined,
    { timeout: 30_000 }
  )
  check('stdout renders', true)
  const rows = await page.getByTestId('workspace-table').locator('tbody tr').allTextContents()
  check('workspace shows x:int = 15', rows.some((r) => r.includes('x') && r.includes('int') && r.includes('15')))
  check('workspace shows words:list', rows.some((r) => r.includes('words') && r.includes('list')))
  await page.waitForFunction(
    () => document.body.textContent?.includes('attempt #'),
    undefined,
    { timeout: 15_000 }
  )
  check('attempt id reported in UI', true)

  // 2. error path: traceback renders
  await page.getByTestId('code-input').fill('boom = 1 / 0')
  await page.getByTestId('run-button').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="console-output"]')
        ?.textContent?.includes('ZeroDivisionError'),
    undefined,
    { timeout: 30_000 }
  )
  check('traceback renders for errors', true)

  // 3. infinite loop: hard timeout kills the worker, UI recovers
  await page.getByTestId('code-input').fill('while True:\n    pass')
  await page.getByTestId('run-button').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="console-output"]')
        ?.textContent?.includes('was stopped'),
    undefined,
    { timeout: 30_000 }
  )
  check('infinite loop is killed by timeout', true)
  await page.waitForFunction(
    () => document.querySelector('[data-testid="run-button"]:not([disabled])'),
    undefined,
    { timeout: 60_000 }
  )
  check('worker respawns to ready after kill', true)

  await page.waitForTimeout(500) // let the last POST land
  await browser.close()

  // 3. persistence: rows actually in SQLite
  const db = new Database('data/pylot.db', { readonly: true })
  const after = (db.prepare('select count(*) as n from attempts').get() as { n: number }).n
  check('attempt rows persisted', after >= before + 3, `${before} -> ${after}`)
  const recent = db
    .prepare('select passed, stderr from attempts order by id desc limit 2')
    .all() as { passed: number; stderr: string }[]
  check('timeout attempt recorded as failed', recent[0].passed === 0 && recent[0].stderr.includes('was stopped'))
  check('error attempt recorded with traceback', recent[1].passed === 0 && recent[1].stderr.includes('ZeroDivisionError'))

  console.log(failures === 0 ? '\nphase 0 verification: PASS ✓' : `\nphase 0 verification: ${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('verify crashed:', e)
  process.exit(1)
})
