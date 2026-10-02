// Generic Pyodide execution worker (module worker — pyodide v314's loader
// relies on dynamic import, which stalls in classic workers).
// Deliberately a static, unbundled file: the check-driver Python source is
// sent by the client at init (single source of truth in
// lib/coderunner/check-driver.ts), so this file never changes when checking
// logic does. Killed and respawned by PyodideRunner on timeout.

let runFn = null
let runSectionsFn = null

self.onmessage = async (e) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      const { loadPyodide } = await import(msg.pyodideUrl)
      const pyodide = await loadPyodide({ indexURL: msg.indexURL })
      pyodide.runPython(msg.driver)
      runFn = pyodide.globals.get('pylot_run')
      runSectionsFn = pyodide.globals.get('pylot_run_sections')
      self.postMessage({ type: 'ready' })
    } else if (msg.type === 'run') {
      if (!runFn) throw new Error('worker not initialized')
      const json = runFn(JSON.stringify(msg.code), JSON.stringify(msg.checks || []))
      self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(json) })
    } else if (msg.type === 'runSections') {
      if (!runSectionsFn) throw new Error('worker not initialized')
      const json = runSectionsFn(JSON.stringify(msg.sections || []))
      self.postMessage({ type: 'result', id: msg.id, result: JSON.parse(json) })
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id, // undefined for init errors — client rejects ready
      message: String((err && err.message) || err),
    })
  }
}
