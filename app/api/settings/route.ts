import { READER_SPEEDS, type ReaderPreferences } from '@/lib/narration/preferences'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getUserSettings,
  updateUserSettings,
  type ChapterPrediction,
  type LearnerProfile,
  type UserSettings,
} from '@/lib/settings'

export async function GET() {
  const user = await getCurrentUser()
  return NextResponse.json(await getUserSettings(user.id))
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as Partial<UserSettings>

  const patch: {
    reader?: Partial<ReaderPreferences>
    theme?: 'cyber' | 'primary'
    profile?: Partial<LearnerProfile>
    predictions?: Record<string, ChapterPrediction>
  } = {}
  if (body.reader && typeof body.reader === 'object') {
    const reader: Partial<ReaderPreferences> = {}
    if (body.reader.voice === 'a' || body.reader.voice === 'b') reader.voice = body.reader.voice
    if (READER_SPEEDS.includes(body.reader.speed as typeof READER_SPEEDS[number])) reader.speed = body.reader.speed
    if (Object.keys(reader).length) patch.reader = reader
  }
  if (body.theme === 'cyber' || body.theme === 'primary') patch.theme = body.theme

  // pre-chapter failure-mode predictions (declared layer — learner-written)
  if (body.predictions && typeof body.predictions === 'object') {
    const cleaned: Record<string, ChapterPrediction> = {}
    for (const [chapterId, v] of Object.entries(body.predictions).slice(0, 20)) {
      const pred = v as Partial<ChapterPrediction>
      if (typeof chapterId === 'string' && Array.isArray(pred?.concepts)) {
        cleaned[chapterId.slice(0, 100)] = {
          concepts: pred.concepts
            .filter((c): c is string => typeof c === 'string')
            .slice(0, 12)
            .map((c) => c.slice(0, 60)),
          note: typeof pred.note === 'string' && pred.note.trim() !== '' ? pred.note.slice(0, 500) : undefined,
          at: new Date().toISOString(),
        }
      }
    }
    if (Object.keys(cleaned).length > 0) patch.predictions = cleaned
  }

  if (body.profile && typeof body.profile === 'object') {
    const p = body.profile as Record<string, unknown>
    const profilePatch: Partial<LearnerProfile> = {}
    // learner-declared profile (ADR-006 layer 1) — free strings, length-capped
    const take = (key: 'background' | 'whyLearning' | 'targetDomain' | 'datasetInterests' | 'hintStyle') => {
      if (typeof p[key] === 'string') profilePatch[key] = (p[key] as string).slice(0, 500)
    }
    take('background')
    take('whyLearning')
    take('targetDomain')
    take('datasetInterests')
    take('hintStyle')
    if (typeof p.surveyDone === 'boolean') profilePatch.surveyDone = p.surveyDone
    if (Object.keys(profilePatch).length > 0) patch.profile = profilePatch
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }
  return NextResponse.json(await updateUserSettings(user.id, patch))
}
