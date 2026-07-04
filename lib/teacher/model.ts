import 'server-only'
import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

// Model choice is CONFIG, not code (ADR-005 "Revisit"): PYLOT_TEACHER_MODEL is
// a "provider/model" string. Resolution:
//   - "anthropic/<id>" with ANTHROPIC_API_KEY set → direct Anthropic provider
//     (the owner's actual key; no gateway account needed for local use)
//   - anything else → the string passes through to the AI SDK's default
//     provider, the Vercel AI Gateway (needs AI_GATEWAY_API_KEY)
// Swapping models or moving to the gateway is an env edit, never a deploy.

export const DEFAULT_TEACHER_MODEL = 'anthropic/claude-sonnet-5'

export function teacherModelId(): string {
  return process.env.PYLOT_TEACHER_MODEL || DEFAULT_TEACHER_MODEL
}

export function resolveTeacherModel(): LanguageModel {
  const id = teacherModelId()
  const [provider, ...rest] = id.split('/')
  if (provider === 'anthropic' && rest.length > 0 && process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return anthropic(rest.join('/'))
  }
  return id
}
