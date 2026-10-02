export const READER_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const
export type ReaderVoice = 'a' | 'b'
export type ReaderPreferences = { voice: ReaderVoice; speed: number }
export function readerPreferences(raw: unknown): ReaderPreferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<ReaderPreferences> : {}
  return {
    voice: value.voice === 'b' ? 'b' : 'a',
    speed: READER_SPEEDS.includes(value.speed as typeof READER_SPEEDS[number]) ? value.speed! : 1,
  }
}
