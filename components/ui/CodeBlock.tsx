'use client'

// Adapted from ccru 7c38ad9104 (CyberCodeBlock, by @lumpenspace — verbatim
// original in vendor/themez/ccru/). Fork-and-tokenize: upstream's fixed vsDark
// prism theme is replaced by a theme built on the --syn-* CSS variables, so
// lesson code matches the CodeMirror editor under both app themes.
//
// This is READ-ONLY display for lesson prose. It is not the editor, has no
// copy button, and actively blocks copy/selection — the learner types
// (product invariant: no copy-paste affordance from lesson content).

import { Highlight, type PrismTheme } from 'prism-react-renderer'

const TOKEN_THEME: PrismTheme = {
  plain: { color: 'var(--editor-fg)', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog'], style: { color: 'var(--syn-comment)', fontStyle: 'italic' } },
    { types: ['string', 'char', 'triple-quoted-string', 'inserted'], style: { color: 'var(--syn-string)' } },
    { types: ['number'], style: { color: 'var(--syn-number)' } },
    { types: ['keyword'], style: { color: 'var(--syn-keyword)', fontWeight: '700' } },
    { types: ['boolean', 'constant'], style: { color: 'var(--syn-constant)', fontWeight: '700' } },
    { types: ['function', 'class-name'], style: { color: 'var(--syn-def)' } },
    { types: ['builtin'], style: { color: 'var(--syn-builtin)' } },
    { types: ['operator'], style: { color: 'var(--syn-operator)' } },
    { types: ['punctuation'], style: { color: 'var(--syn-punct)' } },
    { types: ['decorator', 'annotation'], style: { color: 'var(--syn-builtin)' } },
  ],
}

type CodeBlockProps = {
  code: string
  language?: string
  className?: string
}

export function CodeBlock({ code, language = 'python', className = '' }: CodeBlockProps) {
  return (
    <div
      className={`readable select-none overflow-auto ${className}`}
      onCopy={(e) => e.preventDefault()}
      style={{
        border: '1px solid var(--pane-border)',
        backgroundColor: 'var(--editor-bg)',
      }}
    >
      <Highlight code={code.replace(/\n$/, '')} language={language} theme={TOKEN_THEME}>
        {({ className: prismClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`m-0 p-3 text-[13px] leading-6 ${prismClassName}`}
            style={{ ...style, background: 'transparent' }}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })}>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
}
