import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { streamText, tool, isStepCount, type ModelMessage } from 'ai'
import { z } from 'zod'
import { db, schema } from '@/db'
import { getCurrentUser } from '@/lib/auth'
import { recordHintUsed } from '@/lib/progression'
import { assembleTeacherContext } from '@/lib/teacher/context'
import { buildTeacherSystemPrompt, HINT_TOOL_NAME } from '@/lib/teacher/prompt'
import { resolveTeacherModel, teacherModelId } from '@/lib/teacher/model'
import { checkBudget, recordUsage } from '@/lib/teacher/spend'

// The teacher endpoint (ADR-005). The server assembles ALL context per
// message — the client contributes only the new message and the current
// editor code. Check reports and attempt history come from the DB (never
// trusted from the client), both chat turns are persisted server-side (the
// assistant turn only after the stream completes), and every call is gated
// by the hard monthly spend cap and logged to the ai_usage ledger.

export const dynamic = 'force-dynamic'

/** Cap history sent to the model; the full thread stays in the DB. */
const MAX_HISTORY_MESSAGES = 30
const MAX_MESSAGE_CHARS = 4_000

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  const exerciseId = req.nextUrl.searchParams.get('exerciseId')
  if (!exerciseId) return NextResponse.json({ error: 'exerciseId required' }, { status: 400 })
  const rows = await db
    .select({
      id: schema.chatMessages.id,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(
      and(eq(schema.chatMessages.userId, user.id), eq(schema.chatMessages.exerciseId, exerciseId))
    )
    .orderBy(asc(schema.chatMessages.id))
  return NextResponse.json({ messages: rows })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const body = (await req.json().catch(() => ({}))) as {
    exerciseId?: string
    message?: string
    code?: string
  }
  const { exerciseId, message } = body
  const code = typeof body.code === 'string' ? body.code : ''

  if (typeof exerciseId !== 'string' || typeof message !== 'string' || message.trim() === '') {
    return NextResponse.json({ error: 'exerciseId and message are required' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: 'message too long' }, { status: 400 })
  }

  // hard monthly spend cap — refuse before any provider call
  const budget = await checkBudget()
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: 'monthly_budget_exhausted',
        detail: `The teacher's monthly budget ($${budget.capUsd.toFixed(2)}) is used up — it resets at the start of next month (UTC).`,
        spentUsd: budget.spentUsd,
        capUsd: budget.capUsd,
      },
      { status: 429 }
    )
  }

  const ctx = await assembleTeacherContext(user.id, exerciseId, code)
  if (!ctx) return NextResponse.json({ error: 'unknown exercise' }, { status: 404 })

  const historyRows = await db
    .select({ role: schema.chatMessages.role, content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(
      and(eq(schema.chatMessages.userId, user.id), eq(schema.chatMessages.exerciseId, exerciseId))
    )
    .orderBy(asc(schema.chatMessages.id))
  const history: ModelMessage[] = historyRows
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))

  // persist the learner's turn now; the assistant turn lands in onEnd
  await db
    .insert(schema.chatMessages)
    .values({ userId: user.id, exerciseId, role: 'user', content: message })

  const modelId = teacherModelId()
  const result = streamText({
    model: resolveTeacherModel(),
    instructions: buildTeacherSystemPrompt(ctx),
    messages: [...history, { role: 'user', content: message }],
    stopWhen: isStepCount(3),
    tools: {
      [HINT_TOOL_NAME]: tool({
        description:
          'Record that this reply delivers a substantive hint on the current (unpassed) exercise. Call at most once per reply, with the deepest rung the reply reaches.',
        inputSchema: z.object({
          rung: z
            .number()
            .int()
            .min(1)
            .max(3)
            .describe('hint ladder rung this reply reaches (1 concept, 2 failure, 3 shape of fix)'),
          authored_hint_number: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe('1-based number of the authored hint delivered, if this reply delivers one'),
        }),
        execute: async ({ rung, authored_hint_number }) => {
          // post-pass discussion is free — never counted
          if (ctx.learner.passed) return { recorded: false, reason: 'exercise already passed' }
          const deliversNextAuthored =
            typeof authored_hint_number === 'number' &&
            authored_hint_number === ctx.learner.authoredHintsRevealed + 1 &&
            authored_hint_number <= ctx.exercise.hints.length
          const hintsUsed = await recordHintUsed(user.id, exerciseId, {
            authored: deliversNextAuthored,
          })
          return { recorded: true, rung, hintsUsed }
        },
      }),
    },
    onEnd: async ({ text, totalUsage }) => {
      if (text.trim() !== '') {
        await db
          .insert(schema.chatMessages)
          .values({ userId: user.id, exerciseId, role: 'assistant', content: text })
      }
      await recordUsage({
        userId: user.id,
        model: modelId,
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
      })
    },
    onError: ({ error }) => {
      console.error('[teacher] stream error:', error)
    },
  })

  return result.toTextStreamResponse()
}
