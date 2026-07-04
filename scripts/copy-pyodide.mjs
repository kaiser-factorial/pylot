// Copies the Pyodide runtime from node_modules into public/pyodide/ so the
// browser worker loads the exact same pinned version the Node validator uses.
// public/pyodide/ is gitignored; this runs on every npm install (postinstall).
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pyodide')
const dest = join(root, 'public', 'pyodide')

if (!existsSync(src)) {
  console.error('copy-pyodide: node_modules/pyodide not found — run npm install first')
  process.exit(1)
}
mkdirSync(dest, { recursive: true })
cpSync(src, dest, {
  recursive: true,
  filter: (p) => !p.includes('node_modules/pyodide/node_modules'),
})
console.log('copy-pyodide: copied pyodide runtime to public/pyodide/')
