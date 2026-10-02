// Approximate speech timing, not provider word timestamps. Balanced groups of
// about four words avoid a distracting single-word tail. Offsets preserve the
// original whitespace/markup; weights give longer words and punctuation time.
export type WordChunk = { start: number; end: number; until: number }

export function wordChunks(text: string): WordChunk[] {
  const words = Array.from(text.matchAll(/\S+/gu))
  if (!words.length) return []
  const count = Math.max(1, Math.round(words.length / 4))
  const weights = words.map(([word]) => Math.max(1, Array.from(word).length / 4) + (/[,:;.!?]$/.test(word) ? 0.5 : 0))
  const total = weights.reduce((a, b) => a + b, 0)
  const chunks: WordChunk[] = []
  let consumed = 0, weight = 0
  for (let i = 0; i < count; i++) {
    const size = Math.ceil((words.length - consumed) / (count - i))
    const start = consumed === 0 ? 0 : words[consumed].index!
    weight += weights.slice(consumed, consumed + size).reduce((a, b) => a + b, 0)
    consumed += size
    chunks.push({ start, end: consumed < words.length ? words[consumed].index! : text.length,
      until: i === count - 1 ? 1 : weight / total })
  }
  return chunks
}

export function activeChunk(ends: number[], currentTime: number, duration: number): number {
  if (!ends.length) return -1
  const fraction = Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime)
    ? Math.max(0, Math.min(1, currentTime / duration)) : 0
  const index = ends.findIndex((end) => fraction < end)
  return index < 0 ? ends.length - 1 : index
}
