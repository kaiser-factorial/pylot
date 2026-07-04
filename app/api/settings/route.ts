import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getUserSettings,
  updateUserSettings,
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

  const patch: { theme?: 'cyber' | 'primary'; profile?: Partial<LearnerProfile> } = {}
  if (body.theme === 'cyber' || body.theme === 'primary') patch.theme = body.theme

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
