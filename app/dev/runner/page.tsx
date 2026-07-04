'use client'

// Phase 0 proof-of-loop page (ROADMAP "Done when"): textarea in, Python runs
// in the Pyodide worker, stdout/errors/workspace render, attempt row persists.
// This is scaffolding for development — the real lesson UI arrives in Phase 1.

import { useEffect, useRef, useState } from 'react'
import { PyodideRunner, type RunResult } from '@/lib/coderunner'

const SAMPLE = `nums = [1, 2, 3, 4, 5]
total = sum(nums)
greeting = "hello from python " + "3.14"
print(f"total = {total}")
`

export default function DevRunnerPage() {
  const runnerRef = useRef<PyodideRunner | null>(null)
  const [status, setStatus] = useState<'booting' | 'ready' | 'running'>('booting')
  const [code, setCode] = useState(SAMPLE)
  const [result, setResult] = useState<RunResult | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)

  useEffect(() => {
    const runner = new PyodideRunner()
    runnerRef.current = runner
    runner.ensureReady().then(() => setStatus('ready'))
    return () => runner.dispose()
  }, [])

  async function run() {
    if (!runnerRef.current) return
    setStatus('running')
    setAttemptId(null)
    const started = performance.now()
    const res = await runnerRef.current.run(code)
    const durationMs = performance.now() - started
    setResult(res)
    // timeout disposes the worker; it re-boots lazily on the next run
    setStatus(res.error?.type === 'Timeout' ? 'booting' : 'ready')
    if (res.error?.type === 'Timeout') {
      runnerRef.current.ensureReady().then(() => setStatus('ready'))
    }

    const saved = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: 'dev/free-run', code, result: res, durationMs }),
    }).then((r) => r.json())
    setAttemptId(saved.id ?? null)
  }

  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
      <h1 className="mb-1 text-lg font-bold">pylot // dev runner</h1>
      <p className="mb-4 text-neutral-500">
        status: {status}
        {attemptId !== null && ` · attempt #${attemptId} saved`}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <textarea
            data-testid="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="h-64 w-full resize-y rounded border border-neutral-700 bg-neutral-950 p-3 text-green-300 outline-none"
          />
          <button
            data-testid="run-button"
            onClick={run}
            disabled={status !== 'ready'}
            className="mt-2 rounded border border-green-600 px-4 py-1.5 text-green-500 disabled:opacity-40"
          >
            {status === 'running' ? 'running…' : 'run ▸'}
          </button>
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="mb-1 text-neutral-400">console</h2>
            <pre
              data-testid="console-output"
              className="min-h-16 whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-100"
            >
              {result?.stdout}
              {result?.stderr && <span className="text-yellow-500">{result.stderr}</span>}
              {result?.error && (
                <span className="text-red-500">
                  {result.error.traceback || `${result.error.type}: ${result.error.message}`}
                </span>
              )}
            </pre>
          </section>

          <section>
            <h2 className="mb-1 text-neutral-400">workspace</h2>
            <table data-testid="workspace-table" className="w-full border-collapse">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="border-b border-neutral-800 py-1 pr-2">name</th>
                  <th className="border-b border-neutral-800 py-1 pr-2">type</th>
                  <th className="border-b border-neutral-800 py-1">value</th>
                </tr>
              </thead>
              <tbody>
                {(result?.workspace ?? []).map((v) => (
                  <tr key={v.name}>
                    <td className="py-1 pr-2 text-green-400">{v.name}</td>
                    <td className="py-1 pr-2 text-neutral-400">{v.type}</td>
                    <td className="py-1 break-all">{v.repr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  )
}
