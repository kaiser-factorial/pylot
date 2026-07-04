import { z } from 'zod'

// Content schema per ADR-004. Exercises live in content/**/exercises.yaml and
// must validate against this — `npm run validate:content` also executes each
// reference_solution against the exercise's own checks in Pyodide.

export const stdoutCheck = z.object({
  type: z.literal('stdout'),
  // exactly one matching mode
  equals: z.string().optional(),
  contains: z.string().optional(),
  regex: z.string().optional(),
  message: z.string().optional(),
})

export const stateCheck = z.object({
  type: z.literal('state'),
  // a Python expression evaluated in the post-run namespace, must be truthy,
  // e.g. "total == 105" or "type(names) is list"
  expr: z.string(),
  message: z.string().optional(),
})

export const functionCheck = z.object({
  type: z.literal('function'),
  name: z.string(),
  cases: z
    .array(
      z.object({
        args: z.array(z.unknown()).default([]),
        // `expected` is compared with == against the return value
        expected: z.unknown(),
      })
    )
    .min(1),
  message: z.string().optional(),
})

export const astCheck = z.object({
  type: z.literal('ast'),
  // Python ast node class names, e.g. "For", "While", "ListComp", "Import"
  requires: z.array(z.string()).default([]),
  forbids: z.array(z.string()).default([]),
  message: z.string().optional(),
})

export const exceptionCheck = z.object({
  type: z.literal('exception'),
  // running the code must raise this exception type (by name)
  raises: z.string(),
  message: z.string().optional(),
})

export const aiRubricCheck = z.object({
  type: z.literal('ai_rubric'),
  rubric: z.string(),
  message: z.string().optional(),
})

export const check = z.discriminatedUnion('type', [
  stdoutCheck,
  stateCheck,
  functionCheck,
  astCheck,
  exceptionCheck,
  aiRubricCheck,
])
export type Check = z.infer<typeof check>

export const exerciseKind = z.enum([
  'predict-output',
  'fill-blank',
  'write-code',
  'fix-bug',
  'parsons',
  'capstone',
])

export const section = z.object({
  id: z.string(),
  instructions: z.string(),
  starter_code: z.string().default(''),
  reference_solution: z.string(),
  checks: z.array(check).min(1),
})

export const exercise = z.object({
  id: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/, 'path-style id, e.g. py-basics/hello/01-print'),
  title: z.string(),
  kind: exerciseKind,
  difficulty: z.number().int().min(1).max(5),
  runtime: z.enum(['browser', 'remote']).default('browser'),
  prompt: z.string(),
  starter_code: z.string().default(''),
  // never shown to the learner; validated against `checks` by validate:content
  reference_solution: z.string().optional(),
  sections: z.array(section).default([]),
  checks: z.array(check).default([]),
  hints: z.array(z.string()).default([]),
  // role-based placeholders resolved per dataset track (Field Report templates)
  params: z.record(z.string(), z.string()).default({}),
})
  .refine((e) => e.sections.length > 0 || e.checks.length > 0, {
    message: 'exercise must have top-level checks or sections',
  })
  .refine((e) => e.sections.length > 0 || e.reference_solution !== undefined, {
    message: 'non-sectioned exercise must have a reference_solution',
  })
export type Exercise = z.infer<typeof exercise>

export const exercisesFile = z.object({
  exercises: z.array(exercise).min(1),
})

export const curriculum = z.object({
  chapters: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        dir: z.string(), // content/<dir>/ holds lessondirs
        lessons: z.array(z.string()), // ordered lesson dir names
      })
    )
    .min(1),
})
export type Curriculum = z.infer<typeof curriculum>
