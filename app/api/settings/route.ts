import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings, updateUserSettings, type UserSettings } from '@/lib/settings'

export async function GET() {
  const user = await getCurrentUser()
  return NextResponse.json(await getUserSettings(user.id))
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as Partial<UserSettings>

  const patch: Partial<UserSettings> = {}
  if (body.theme === 'cyber' || body.theme === 'primary') patch.theme = body.theme
  if (body.profile && typeof body.profile.background === 'string') {
    patch.profile = { background: body.profile.background }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }
  return NextResponse.json(await updateUserSettings(user.id, patch))
}
