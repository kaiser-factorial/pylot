import 'server-only'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Exercise } from '@/lib/content/schema'
import { resolveTeacherModel, teacherModelId } from './model'
import { recordUsage } from './spend'

// ai_rubric grading — the ONE exception to "deterministic checks decide
// pass/fail" (invariant #2), allowed on capstone exercises only (schema-
// enforced). The server loads the rubric text from content itself (never
// trusted from the client) and grades every rubric check of a submission in
// a single model call. Spend goes through the same monthly cap as the
// teacher, under its own ledger kind ('rubric').
//
// Deliberately NOT in the grader's context: the reference solution. Grader
// feedback is shown to the learner in the check report — criteria must be
// self-contained, and this keeps solution leakage structurally impossible.

export type RubricItem = {
  /** null for (hypothetical) top-level rubric checks; sectioned in practice */
  sectionId: string | null
  checkIndex: number
  rubric: string
  sectionTitle: string
  sectionInstructions: string
  code: string
  stdout: string
}

export type RubricVerdict = {
  sectionId: string | null
  checkIndex: number
  passed: boolean
  feedback: string
}

/** Every ai_rubric check of the exercise, with its section's spec attached. */
export function collectRubricItems(
  ex: Exercise,
  submissions: { sectionId: string | null; code: string; stdout: string }[]
): RubricItem[] {
  const items: RubricItem[] = []
  const subBySection = new Map(submissions.map((s) => [s.sectionId ?? '', s]))
  for (const sec of ex.sections) {
    const sub = subBySection.get(sec.id)
    if (!sub) continue
    sec.checks.forEach((chk, i) => {
      if (chk.type === 'ai_rubric') {
        items.push({
          sectionId: sec.id,
          checkIndex: i,
          rubric: chk.rubric,
          sectionTitle: sec.title ?? sec.id,
          sectionInstructions: sec.instructions,
          code: sub.code,
          stdout: sub.stdout,
        })
      }
    })
  }
  return items
}

const GRADER_INSTRUCTIONS = `You grade rubric criteria for capstone exercises inside Pylot, a Python-learning app whose learners are weaning themselves off AI-written code.

For each numbered item you receive: one criterion, the learner's submitted work for that section, and what it printed. Decide whether the submission ACTUALLY meets the criterion, and write one short feedback sentence addressed to the learner.

Rules:
- Be strict but fair. Vague, generic, or restated-prompt answers fail. A criterion is met by what the submission demonstrably contains — not by what the learner probably meant.
- Where a criterion asks the learner to EXPLAIN or DESCRIBE, grade the explanation's correctness against the code/output shown. Confidently wrong explanations fail with a pointer to where they diverge.
- Feedback is 1–2 sentences, warm and specific. On fail: say what's missing or wrong, never dictate the full correct answer. On pass: confirm what earned it.
- Grade ONLY the listed criteria. Do not invent extra requirements.`

const verdictSchema = z.object({
  verdicts: z.array(
    z.object({
      item: z.number().int().describe('the item number being graded, as given'),
      passed: z.boolean(),
      feedback: z.string(),
    })
  ),
})

/**
 * Grade all rubric checks of one submission in one model call.
 * Caller is responsible for the budget check (429 path) BEFORE calling.
 */
export async function gradeRubrics(args: {
  userId: string
  exercise: Exercise
  items: RubricItem[]
}): Promise<RubricVerdict[]> {
  const { userId, exercise, items } = args
  if (items.length === 0) return []

  const prompt = [
    `Exercise: ${exercise.title}`,
    `Overall task: ${exercise.prompt.trim()}`,
    '',
    ...items.map((it, n) =>
      [
        `## item ${n + 1}`,
        `section: ${it.sectionTitle}`,
        `section instructions: ${it.sectionInstructions.trim()}`,
        `criterion: ${it.rubric.trim()}`,
        'learner submission:',
        '```',
        it.code,
        '```',
        'output (stdout):',
        '```',
        it.stdout || '(no output)',
        '```',
      ].join('\n')
    ),
  ].join('\n')

  const modelId = teacherModelId()
  const result = await generateText({
    model: resolveTeacherModel(),
    instructions: GRADER_INSTRUCTIONS,
    prompt,
    output: Output.object({ schema: verdictSchema }),
    temperature: 0,
  })

  await recordUsage({
    userId,
    kind: 'rubric',
    model: modelId,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  })

  const byItem = new Map(result.output.verdicts.map((v) => [v.item, v]))
  return items.map((it, n) => {
    const v = byItem.get(n + 1)
    return {
      sectionId: it.sectionId,
      checkIndex: it.checkIndex,
      // a missing verdict is a failed grading run, not a free pass
      passed: v?.passed === true,
      feedback: v?.feedback ?? 'the grader returned no verdict for this criterion — submit again',
    }
  })
}
