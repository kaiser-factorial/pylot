import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { recordHintUsed } from '@/lib/progression'

// Reveal-a-hint counter. hints_used feeds struggle scores (Phase 3) and the
// teacher's context (Phase 2), so it is persisted per (user, exercise).

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const { exerciseId } = (await req.json().catch(() => ({}))) as { exerciseId?: string }
  if (typeof exerciseId !== 'string') {
    return NextResponse.json({ error: 'exerciseId required' }, { status: 400 })
  }
  const hintsUsed = await recordHintUsed(user.id, exerciseId, { authored: true })
  return NextResponse.json({ hintsUsed })
}
