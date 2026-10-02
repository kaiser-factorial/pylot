import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { NARRATION_VERSION } from './manifest'

export class AudioError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function isMp3(bytes: Uint8Array): boolean {
  // ID3 metadata followed by an MPEG frame, or an MPEG frame without ID3.
  let offset = 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.length < 10 || bytes.slice(6, 10).some((b) => b > 127)) return false
    offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9])
    if (bytes[5] & 0x10) offset += 10
  }
  return bytes.length > offset + 4 && bytes[offset] === 0xff && (bytes[offset + 1] & 0xe0) === 0xe0
    && (bytes[offset + 1] & 0x06) !== 0 && (bytes[offset + 2] & 0xf0) !== 0xf0
    && (bytes[offset + 2] & 0x0c) !== 0x0c
}

export function decodeAudio(body: unknown): Buffer {
  const value = body && typeof body === 'object' ? (body as { audio_data?: unknown }).audio_data : null
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new AudioError(502, 'The speech service returned invalid audio. Try again.')
  }
  const audio = Buffer.from(value, 'base64')
  if (!isMp3(audio)) throw new AudioError(502, 'The speech service returned invalid audio. Try again.')
  return audio
}

type Accounting = {
  reserve: (userId: string, model: string, characters: number) => string | null
  settle: (id: string, status: 'charged' | 'released') => void
}
type AudioInput = { text: string; voiceId: string; model: string; userId: string; apiKey?: string }

export function audioCacheKey(input: Pick<AudioInput, 'text' | 'voiceId' | 'model'>) {
  return createHash('sha256').update(JSON.stringify([NARRATION_VERSION, input.text, input.model, input.voiceId, 'mp3'])).digest('hex')
}

// One service per process; requests for the same clip share the paid operation.
// Constructor injection allows tests without a live provider or real ledger.
export function createAudioService(accounting: Accounting, options: {
  cacheDir: string; fetcher?: typeof fetch; timeoutMs?: number
}) {
  const pending = new Map<string, Promise<Buffer>>()
  const fetcher = options.fetcher ?? fetch
  return async function getAudio(input: AudioInput): Promise<Buffer> {
    const key = audioCacheKey(input)
    const file = join(options.cacheDir, `${key}.mp3`)
    try { const audio = await readFile(file); if (isMp3(audio)) return audio } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new AudioError(503, 'Audio cache is unavailable. Try again.')
    }
    const current = pending.get(key)
    if (current) return current
    const work = async () => {
      if (!input.apiKey) throw new AudioError(503, 'Read-aloud is not configured. Set the Mistral API key on the server.')
      await mkdir(options.cacheDir, { recursive: true })
      const reservation = accounting.reserve(input.userId, input.model, Array.from(input.text).length)
      if (!reservation) throw new AudioError(429, 'The monthly AI budget is used up. Previously saved audio is still available.')
      // The reservation is deliberately retained on ambiguous network/parse failure.
      let response: Response
      try {
        response = await fetcher('https://api.mistral.ai/v1/audio/speech', {
          method: 'POST', signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
          headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: input.model, input: input.text, voice_id: input.voiceId, response_format: 'mp3', stream: false }),
        })
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 408) accounting.settle(reservation, 'released')
          throw new AudioError(response.status === 429 ? 429 : 502,
            response.status === 429 ? 'The speech service is busy. Try again shortly.' : 'The speech service could not generate audio. Try again.')
        }
        const audio = decodeAudio(await response.json())
        accounting.settle(reservation, 'charged')
        const temp = `${file}.${randomUUID()}.tmp`
        try { await writeFile(temp, audio); await rename(temp, file) }
        finally { await unlink(temp).catch(() => {}) }
        return audio
      } catch (e) {
        if (e instanceof AudioError) throw e
        throw new AudioError(502, 'Audio could not be loaded. Check your connection and try again.')
      }
    }
    const promise = work().finally(() => { pending.delete(key) })
    pending.set(key, promise)
    return promise
  }
}
