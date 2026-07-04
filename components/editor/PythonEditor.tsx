'use client'

// The real editor (CodeMirror 6) — the learner types here, and only here.
//
// Syntax + chrome colors are expressed entirely through the --syn-* / --editor-*
// CSS variables from globals.css, so a single theme definition follows the
// active data-theme (cyber ↔ primary) live, with no CM reconfiguration.
// Editor surfaces are readability zones: no glow, no scanlines (see ROADMAP
// Phase 1 readability rules) — enforced here by the `readable` wrapper class.

import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { tags as t } from '@lezer/highlight'

const pylotHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)', fontWeight: '700' },
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--syn-keyword)', fontWeight: '700' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.bool, t.null], color: 'var(--syn-constant)', fontWeight: '700' },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], color: 'var(--syn-def)' },
  { tag: [t.definition(t.variableName)], color: 'var(--editor-fg)' },
  { tag: [t.className, t.definition(t.className)], color: 'var(--syn-def)' },
  { tag: [t.standard(t.variableName)], color: 'var(--syn-builtin)' },
  { tag: [t.operator, t.arithmeticOperator, t.compareOperator, t.logicOperator], color: 'var(--syn-operator)' },
  { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.squareBracket, t.brace], color: 'var(--syn-punct)' },
  { tag: [t.meta, t.annotation], color: 'var(--syn-builtin)' },
  { tag: t.invalid, color: 'var(--status-fail)' },
])

const pylotChrome = EditorView.theme({
  '&': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-fg)',
    fontSize: '13px',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-app)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    caretColor: 'var(--editor-cursor)',
    padding: '12px 0',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--editor-cursor)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--editor-selection) !important',
  },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--editor-gutter-fg)',
    border: 'none',
    borderRight: '1px solid var(--pane-border)',
    paddingRight: '4px',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--editor-active-line)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--editor-selection)',
    outline: '1px solid var(--pane-border-strong)',
  },
})

type PythonEditorProps = {
  value: string
  onChange: (code: string) => void
  readOnly?: boolean
  className?: string
}

export function PythonEditor({ value, onChange, readOnly = false, className = '' }: PythonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentUnit.of('    '),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        python(),
        syntaxHighlighting(pylotHighlight),
        pylotChrome,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // recreate only when readOnly flips; `value` flows through the transaction below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // External resets (task switch, "reset to starter") replace the doc.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return (
    <div
      ref={hostRef}
      data-testid="python-editor"
      className={`readable min-h-0 flex-1 overflow-hidden ${className}`}
    />
  )
}
