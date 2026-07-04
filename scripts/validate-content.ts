// validate:content — the guardrail from ADR-004.
//  1. Schema-validates curriculum.yaml and every exercises.yaml (Zod).
//  2. Executes every exercise's reference_solution (and every section's)
//     against its own checks in Pyodide — content that can't pass itself fails.
//
// Usage:
//   npm run validate:content              -> validates content/
//   npm run validate:content -- <dir>     -> validates another root (fixtures)
// Exit code 0 = all good, 1 = any failure.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { loadPyodide } from 'pyodide'
import { curriculum, exercisesFile, type Exercise } from '../lib/content/schema'
import { CHECK_DRIVER_PY, type RunResult } from '../lib/coderunner/check-driver'

const root = process.argv[2] ?? 'content'
let failures = 0
const fail = (msg: string) => {
  failures++
  console.error(`  ✗ ${msg}`)
}

function collectExerciseFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectExerciseFiles(p))
    else if (entry.name === 'exercises.yaml') out.push(p)
  }
  return out
}

async function main() {
  if (!existsSync(root)) {
    console.error(`validate:content: root ${root} does not exist`)
    process.exit(1)
  }

  // --- 1. schema pass -------------------------------------------------------
  const curriculumPath = join(root, 'curriculum.yaml')
  if (existsSync(curriculumPath)) {
    const parsed = curriculum.safeParse(parse(readFileSync(curriculumPath, 'utf8')))
    if (!parsed.success) fail(`curriculum.yaml: ${parsed.error.message}`)
    else {
      for (const ch of parsed.data.chapters) {
        for (const lesson of ch.lessons) {
          const lessonDir = join(root, ch.dir, lesson)
          if (!existsSync(join(lessonDir, 'lesson.mdx'))) fail(`${lessonDir}: missing lesson.mdx`)
          if (!existsSync(join(lessonDir, 'exercises.yaml'))) fail(`${lessonDir}: missing exercises.yaml`)
        }
      }
    }
  } else {
    console.log(`(no curriculum.yaml under ${root} — validating exercise files only)`)
  }

  const files = collectExerciseFiles(root)
  if (files.length === 0) fail(`no exercises.yaml files found under ${root}`)

  const all: { file: string; ex: Exercise }[] = []
  const seenIds = new Set<string>()
  for (const file of files) {
    const parsed = exercisesFile.safeParse(parse(readFileSync(file, 'utf8')))
    if (!parsed.success) {
      fail(`${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
      continue
    }
    for (const ex of parsed.data.exercises) {
      if (seenIds.has(ex.id)) fail(`${file}: duplicate exercise id ${ex.id}`)
      seenIds.add(ex.id)
      all.push({ file, ex })
    }
  }
  console.log(`schema: ${files.length} file(s), ${all.length} exercise(s), ${failures} problem(s)`)

  // --- 2. execution pass: reference solutions must pass their own checks ----
  console.log('loading pyodide…')
  const pyodide = await loadPyodide({ indexURL: 'node_modules/pyodide' })
  pyodide.runPython(CHECK_DRIVER_PY)
  const runFn = pyodide.globals.get('pylot_run')

  const runChecks = (code: string, checks: unknown[]): RunResult =>
    JSON.parse(runFn(JSON.stringify(code), JSON.stringify(checks)))

  for (const { ex } of all) {
    if (ex.runtime === 'remote') {
      console.log(`  ~ ${ex.id}: runtime=remote, execution skipped (Phase 5)`)
      continue
    }
    const units =
      ex.sections.length > 0
        ? ex.sections.map((s, i) => ({
            label: `${ex.id}#${s.id}`,
            // cumulative: section i runs after sections 0..i-1 (ARCHITECTURE §4.4)
            code: ex.sections.slice(0, i + 1).map((p) => p.reference_solution).join('\n'),
            checks: s.checks,
          }))
        : [{ label: ex.id, code: ex.reference_solution!, checks: ex.checks }]

    for (const u of units) {
      const result = runChecks(u.code, u.checks)
      const rubricOnly = result.checks.length > 0 && result.checks.every((c) => c.passed === null)
      if (rubricOnly) {
        console.log(`  ~ ${u.label}: ai_rubric-only, execution ok=${result.error === null}`)
        if (result.error) fail(`${u.label}: reference solution errored: ${result.error.message}`)
        continue
      }
      if (!result.passed) {
        const why =
          result.error?.message ??
          result.checks.filter((c) => c.passed === false).map((c) => c.detail).join('; ')
        fail(`${u.label}: reference solution FAILS its own checks: ${why}`)
      } else {
        console.log(`  ✓ ${u.label}`)
      }
    }
  }

  if (failures > 0) {
    console.error(`\nvalidate:content: FAILED with ${failures} problem(s)`)
    process.exit(1)
  }
  console.log('\nvalidate:content: all good ✓')
}

main().catch((e) => {
  console.error('validate:content crashed:', e)
  process.exit(1)
})
