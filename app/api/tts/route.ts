import { join, dirname } from 'node:path'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { loadLesson } from '@/lib/content/load'
import { getProgression } from '@/lib/progression'
import { buildNarration, MAX_SEGMENT_LENGTH } from '@/lib/narration/manifest'
import { createAudioService, AudioError } from '@/lib/narration/audio'
import { reserveSpeech, settleSpeech } from '@/lib/teacher/spend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  chapter: z.string().max(100), lesson: z.string().max(100),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  segmentId: z.string().max(100), voice: z.enum(['a', 'b']),
}).strict()

const getAudio = createAudioService({ reserve: reserveSpeech, settle: settleSpeech }, {
  cacheDir: process.env.PYLOT_TTS_CACHE_DIR ?? join(dirname(process.env.PYLOT_DB_PATH ?? join(process.cwd(), 'data/pylot.db')), 'tts-cache'),
})

export async function POST(req: Request) {
  // Browser requests always send Origin. Reject cross-site and non-browser
  // requests without it; CLI checks should send the application's exact origin.
  if (req.headers.get('origin') !== new URL(req.url).origin) {
    return Response.json({ error: 'Read-aloud requests must come from this app.' }, { status: 403 })
  }
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Sign in to read lessons aloud.' }, { status: 401 })
  // Bound the body while reading it, rather than trusting Content-Length.
  const reader = req.body?.getReader()
  if (!reader) return Response.json({ error: 'Missing request.' }, { status: 400 })
  let raw = '', size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); return Response.json({ error: 'Request is too large.' }, { status: 413 }) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    const parsed = requestSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return Response.json({ error: 'Invalid narration request.' }, { status: 400 })
    const body = parsed.data
    const lesson = loadLesson(body.chapter, body.lesson)
    if (!lesson) return Response.json({ error: 'Lesson not found.' }, { status: 404 })
    const progression = await getProgression(user.id)
    const first = progression.exercises.find((e) => e.chapterId === body.chapter && e.lessonDir === body.lesson)
    if (!first || first.status === 'locked') return Response.json({ error: 'This lesson is still locked.' }, { status: 403 })
    const settings = await getUserSettings(user.id)
    const manifest = buildNarration(lesson.mdx, settings.profile.background)
    if (manifest.revision !== body.revision) return Response.json({ error: 'This lesson has changed. Reload the page to continue.' }, { status: 409 })
    const segment = manifest.segments.find((s) => s.id === body.segmentId)
    if (!segment || !segment.text || segment.text.length > MAX_SEGMENT_LENGTH) return Response.json({ error: 'Invalid narration segment.' }, { status: 400 })
    const voiceId = process.env[body.voice === 'a' ? 'PYLOT_TTS_VOICE_A' : 'PYLOT_TTS_VOICE_B']
    if (!voiceId) return Response.json({ error: `Voice ${body.voice.toUpperCase()} is not configured on the server.` }, { status: 503 })
    const audio = await getAudio({ text: segment.text, voiceId, userId: user.id,
      model: process.env.PYLOT_TTS_MODEL || 'voxtral-mini-tts-2603', apiKey: process.env.MISTRAL_API_KEY })
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof SyntaxError) return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
    if (e instanceof AudioError) return Response.json({ error: e.message }, { status: e.status })
    // Never return provider bodies, credentials, lesson text or filesystem paths.
    console.error('Read-aloud failed', e instanceof Error ? e.name : 'UnknownError')
    return Response.json({ error: 'Read-aloud is temporarily unavailable. Try again.' }, { status: 503 })
  }
}
