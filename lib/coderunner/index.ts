import type { Check } from '@/lib/content/schema'
import { CHECK_DRIVER_PY, type RunResult } from './check-driver'

export type { RunResult, CheckResult } from './check-driver'

export type RunOptions = { timeoutMs?: number }

// The seam ADR-002 requires: all user Python goes through this interface.
// PyodideRunner (below) is the browser implementation; Phase 5 adds a
// RemoteRunner (opbdh-backed) for `runtime: remote` lessons.
export interface CodeRunner {
  run(code: string, checks?: Check[], opts?: RunOptions): Promise<RunResult>
  dispose(): void
}

const DEFAULT_TIMEOUT_MS = 10_000

type Pending = {
  resolve: (r: RunResult) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class PyodideRunner implements CodeRunner {
  private worker: Worker | null = null
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((e: Error) => void) | null = null
  private seq = 0
  private pending = new Map<number, Pending>()

  /** Resolves when Pyodide is loaded and the check driver is installed. */
  ensureReady(): Promise<void> {
    if (!this.readyPromise) this.spawn()
    return this.readyPromise!
  }

  private spawn() {
    this.worker = new Worker('/pylot-worker.js', { type: 'module' })
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.worker.onmessage = (e: MessageEvent) => this.onMessage(e.data)
    this.worker.onerror = (e: ErrorEvent) => {
      this.readyReject?.(new Error(`worker failed: ${e.message}`))
    }
    this.worker.postMessage({
      type: 'init',
      pyodideUrl: '/pyodide/pyodide.mjs',
      indexURL: '/pyodide/',
      driver: CHECK_DRIVER_PY,
    })
  }

  private onMessage(msg: { type: string; id?: number; result?: RunResult; message?: string }) {
    if (msg.type === 'ready') {
      this.readyResolve?.()
      return
    }
    if (msg.id === undefined) {
      // init-time failure: fail loudly instead of hanging on "booting"
      if (msg.type === 'error') this.readyReject?.(new Error(msg.message ?? 'worker init failed'))
      return
    }
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.type === 'result' && msg.result) p.resolve(msg.result)
    else p.reject(new Error(msg.message ?? 'unknown worker error'))
  }

  async run(code: string, checks: Check[] = [], opts: RunOptions = {}): Promise<RunResult> {
    await this.ensureReady()
    const id = ++this.seq
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise<RunResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Only worker termination reliably stops an infinite loop in wasm.
        this.pending.delete(id)
        this.dispose()
        resolve({
          stdout: '',
          stderr: '',
          error: {
            type: 'Timeout',
            message: `execution exceeded ${timeoutMs / 1000}s and was stopped — check for infinite loops`,
            traceback: '',
          },
          checks: [],
          workspace: [],
          passed: false,
        })
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.worker!.postMessage({ type: 'run', id, code, checks })
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.readyPromise = null
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('runner disposed'))
    }
    this.pending.clear()
  }
}
