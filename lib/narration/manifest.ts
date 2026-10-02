import { wordChunks } from './chunks'
import { createHash } from 'node:crypto'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import type { Root } from 'mdast'

export const NARRATION_VERSION = '1'
export const MAX_SEGMENT_LENGTH = 2000
export type NarrationSegment = { id: string; text: string }
export type NarrationManifest = { revision: string; segments: NarrationSegment[] }

type Node = {
  type: string
  value?: string
  name?: string | null
  children?: Node[]
  attributes?: { name?: string; value?: unknown; type: string }[]
  [key: string]: unknown
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const textOf = (n: Node): string => {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value ?? ''
  if (n.type === 'break') return '\n'
  if (n.type === 'image' || n.type === 'imageReference') return ''
  return (n.children ?? []).map(textOf).join('')
}

// Keep offsets into the original text so slicing never flattens inline markup.
export function sentenceRanges(text: string): [number, number][] {
  const boundaries: number[] = []
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  for (const s of segmenter.segment(text)) {
    const end = s.index + s.segment.length
    // Intl handles decimals; join common abbreviations it can treat as sentences.
    if (/\b(?:e\.g|i\.e|Mr|Mrs|Ms|Dr|Prof|vs|etc)\.\s*$/i.test(s.segment) && end < text.length) continue
    boundaries.push(end)
  }
  const ranges: [number, number][] = []
  let start = 0
  for (const end of boundaries) {
    while (end - start > MAX_SEGMENT_LENGTH) {
      const cut = text.lastIndexOf(' ', start + MAX_SEGMENT_LENGTH)
      const next = cut > start ? cut + 1 : start + MAX_SEGMENT_LENGTH
      ranges.push([start, next]); start = next
    }
    if (end > start) ranges.push([start, end])
    start = end
  }
  return ranges
}

function sliceNodes(nodes: Node[], from: number, to: number): Node[] {
  let offset = 0
  return nodes.flatMap((node) => {
    const length = textOf(node).length
    const start = Math.max(0, from - offset)
    const end = Math.min(length, to - offset)
    const at = offset
    offset += length
    // Preserve non-spoken inline nodes once, in their original position.
    if (!length) return at >= from && at < to ? [node] : []
    if (end <= start) return []
    if (node.children) return [{ ...node, children: sliceNodes(node.children, start, end) }]
    if (node.type === 'break') return [node]
    return [{ ...node, value: (node.value ?? '').slice(start, end) }]
  })
}

export function narrateTree(tree: Root, background: string): NarrationSegment[] {
  const segments: NarrationSegment[] = []
  function walk(node: Node) {
    if (!node.children) return
    node.children = node.children.filter((child) => {
      if (child.name !== 'LangContrast') return true
      return child.attributes?.find((a) => a.name === 'lang')?.value === background
    })
    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = textOf(node)
      if (!text.trim()) return
      const original = node.children
      node.children = sentenceRanges(text).map(([start, end]) => {
        const spoken = text.slice(start, end).replace(/\s+/g, ' ').trim()
        const id = `s${segments.length}-${hash(spoken).slice(0, 12)}`
        segments.push({ id, text: spoken })
        return {
          type: 'mdxJsxTextElement', name: 'span',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'className', value: 'tts-sent' },
            { type: 'mdxJsxAttribute', name: 'data-narration-id', value: id },
          ],
          children: wordChunks(text.slice(start, end)).map((chunk, index) => ({
            type: 'mdxJsxTextElement', name: 'span',
            attributes: [
              { type: 'mdxJsxAttribute', name: 'className', value: 'tts-chunk' },
              { type: 'mdxJsxAttribute', name: 'data-chunk-index', value: String(index) },
              { type: 'mdxJsxAttribute', name: 'data-chunk-end', value: String(chunk.until) },
            ],
            children: sliceNodes(original, start + chunk.start, start + chunk.end),
          })),
        }
      })
      return
    }
    // Fenced code and MDX expressions are never a narration source.
    if (node.type === 'code' || node.name === 'pre' || node.name === 'code') return
    node.children.forEach(walk)
  }
  walk(tree as unknown as Node)
  return segments
}

export function narrationPlugin(background: string) {
  return () => (tree: Root) => { narrateTree(tree, background) }
}

export function buildNarration(mdx: string, background: string): NarrationManifest {
  const parser = unified().use(remarkParse).use(remarkMdx).use(remarkGfm)
  const tree = parser.parse(mdx)
  const segments = narrateTree(tree, background)
  return { revision: hash(JSON.stringify([NARRATION_VERSION, mdx, background])), segments }
}

