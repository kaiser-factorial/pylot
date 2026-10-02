import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { generateText } from 'ai'
import { db, schema } from '@/db'
import { getCurrentUser } from '@/lib/auth'
import { getUserSettings } from '@/lib/settings'
import { resolveTeacherModel, teacherModelId } from '@/lib/teacher/model'
import { checkBudget, recordUsage } from '@/lib/teacher/spend'

// The vibecode break's server side (ARCHITECTURE §4.8).
//   PATCH — accept/decline an offer (accepted is recorded either way, so the
//           trigger never re-fires and the data shows what the learner wanted)
//   POST  — build the toy: a tiny self-contained HTML page from the learner's
//           idea, generated through the SAME monthly spend cap (kind 'reward'),
//           persisted on the event row, rendered client-side in a sandboxed
//           iframe. This is the ONE place the AI writes something for the
//           learner — and it is quarantined from the learning loop by design.

export const dynamic = 'force-dynamic'

const MAX_IDEA_CHARS = 500

const TOY_INSTRUCTIONS = `You build a tiny celebratory browser toy inside Pylot, a Python-learning app. The learner just earned a break — either they finished a chapter or they fought through a genuinely hard exercise. You get their idea for a toy; build it.

Hard requirements:
- ONE self-contained HTML document: inline <style> and <script> only. No external URLs of any kind (no CDNs, fonts, images, fetch). It will run inside a sandboxed iframe with no network and no storage.
- Small: aim for under 150 lines. Playful over polished. It should do something delightful within 2 seconds of loading — no instructions screen.
- Interactive if the idea allows (mouse/keyboard), animated otherwise.
- No Python teaching, no code lessons, no "while you're here" education. This is a break.
- Dark background (#0a0f0a-ish) unless the idea demands otherwise.

Return ONLY the HTML document, starting with <!doctype html>. No markdown fences, no commentary.`

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as { rewardId?: number; accepted?: boolean }
  if (typeof body.rewardId !== 'number' || typeof body.accepted !== 'boolean') {
    return NextResponse.json({ error: 'rewardId and accepted are required' }, { status: 400 })
  }
  const [row] = await db
    .update(schema.rewardEvents)
    .set({ accepted: body.accepted })
    .where(and(eq(schema.rewardEvents.id, body.rewardId), eq(schema.rewardEvents.userId, user.id)))
    .returning({ id: schema.rewardEvents.id })
  if (!row) return NextResponse.json({ error: 'unknown reward' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as { rewardId?: number; idea?: string }
  if (typeof body.rewardId !== 'number' || typeof body.idea !== 'string' || body.idea.trim() === '') {
    return NextResponse.json({ error: 'rewardId and idea are required' }, { status: 400 })
  }

  const [event] = await db
    .select()
    .from(schema.rewardEvents)
    .where(and(eq(schema.rewardEvents.id, body.rewardId), eq(schema.rewardEvents.userId, user.id)))
  if (!event) return NextResponse.json({ error: 'unknown reward' }, { status: 404 })
  if (event.toyHtml) return NextResponse.json({ html: event.toyHtml }) // already built — replay

  const budget = await checkBudget()
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: 'monthly_budget_exhausted',
        detail: `The AI budget for this month ($${budget.capUsd.toFixed(2)}) is used up — the break is still yours, the toy has to wait for next month.`,
      },
      { status: 429 }
    )
  }

  const settings = await getUserSettings(user.id)
  const interests = [settings.profile?.targetDomain, settings.profile?.datasetInterests]
    .filter(Boolean)
    .join(', ')

  const modelId = teacherModelId()
  try {
    const result = await generateText({
      model: resolveTeacherModel(),
      instructions: TOY_INSTRUCTIONS,
      prompt: [
        `Occasion: ${event.triggerReason === 'chapter_complete' ? 'the learner just completed a whole chapter' : 'the learner just cracked an exercise they fought hard for'}.`,
        interests ? `Their declared interests (flavor only if it fits): ${interests}` : null,
        `Their toy idea: ${body.idea.trim().slice(0, MAX_IDEA_CHARS)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    })

    await recordUsage({
      userId: user.id,
      kind: 'reward',
      model: modelId,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    })

    // strip accidental markdown fences defensively
    const html = result.text.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim()

    await db
      .update(schema.rewardEvents)
      .set({ toyHtml: html, accepted: true })
      .where(eq(schema.rewardEvents.id, event.id))

    return NextResponse.json({ html })
  } catch (err) {
    console.error('[reward] toy generation failed:', err)
    return NextResponse.json({ error: 'toy generation failed — try again' }, { status: 502 })
  }
}
