import { readerPreferences, type ReaderPreferences } from '@/lib/narration/preferences'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// Typed view over users.settings (JSON). The profile fills out in Phase 2 with
// the onboarding survey (ADR-006 layer 1); until then the seeded learner
// defaults to a JS background so <LangContrast lang="js"> callouts render.

export type ThemeName = 'cyber' | 'primary'

// The declared layer of learner memory (ADR-006 layer 1): written only by the
// learner via the onboarding survey / settings view, injected verbatim into
// teacher context. Every field beyond `background` is optional — the survey
// is skippable and the reader stays defensive.
export type LearnerProfile = {
  // 'none' = new to programming entirely → no contrast callouts render
  background: 'none' | 'js' | 'cpp' | 'java' | 'r' | 'matlab' | (string & {})
  /** why they're learning Python, in their own words */
  whyLearning?: string
  /** what they're headed toward — flavors the teacher's examples */
  targetDomain?: 'data-science' | 'ml' | 'general' | (string & {})
  /** datasets/topics they find fun (comma-ish free text) */
  datasetInterests?: string
  /** how they like hints delivered */
  hintStyle?: 'socratic' | 'direct' | (string & {})
  /** survey completed OR explicitly skipped — stops the onboarding prompt */
  surveyDone?: boolean
}

/**
 * "Predict your own failure modes" — the pre-chapter quiz (owner idea, Phase 1;
 * designed in Phase 3 with the teacher in mind). Declared-layer signal like the
 * profile: written only by the learner, injected into teacher context for the
 * chapter it belongs to.
 */
export type ChapterPrediction = {
  /** concept tags the learner expects to stumble on */
  concepts: string[]
  /** anything else they suspect, in their own words */
  note?: string
  /** ISO timestamp of when the prediction was made */
  at: string
}

export type UserSettings = {
  reader: ReaderPreferences
  theme: ThemeName
  profile: LearnerProfile
  /** keyed by chapterId */
  predictions: Record<string, ChapterPrediction>
}

const DEFAULTS: UserSettings = {
  reader: readerPreferences(null),
  theme: 'cyber',
  profile: { background: 'js' },
  predictions: {},
}

const optionalString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db
    .select({ settings: schema.users.settings })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
  const raw = (row?.settings ?? {}) as Partial<UserSettings>
  const p = (raw.profile ?? {}) as Partial<LearnerProfile>

  const predictions: Record<string, ChapterPrediction> = {}
  if (raw.predictions && typeof raw.predictions === 'object') {
    for (const [chapterId, v] of Object.entries(raw.predictions)) {
      const pred = v as Partial<ChapterPrediction>
      if (Array.isArray(pred?.concepts)) {
        predictions[chapterId] = {
          concepts: pred.concepts.filter((c): c is string => typeof c === 'string'),
          note: optionalString(pred.note),
          at: typeof pred.at === 'string' ? pred.at : new Date(0).toISOString(),
        }
      }
    }
  }

  return {
    reader: readerPreferences(raw.reader),
    theme: raw.theme === 'primary' ? 'primary' : DEFAULTS.theme,
    profile: {
      background: typeof p.background === 'string' ? p.background : DEFAULTS.profile.background,
      whyLearning: optionalString(p.whyLearning),
      targetDomain: optionalString(p.targetDomain),
      datasetInterests: optionalString(p.datasetInterests),
      hintStyle: optionalString(p.hintStyle),
      surveyDone: p.surveyDone === true ? true : undefined,
    },
    predictions,
  }
}

export async function updateUserSettings(
  userId: string,
  patch: {
    reader?: Partial<ReaderPreferences>
    theme?: ThemeName
    profile?: Partial<LearnerProfile>
    /** merged per chapter — a new prediction replaces that chapter's, others stay */
    predictions?: Record<string, ChapterPrediction>
  }
): Promise<UserSettings> {
  const current = await getUserSettings(userId)
  const next: UserSettings = {
    reader: readerPreferences({ ...current.reader, ...patch.reader }),
    theme: patch.theme ?? current.theme,
    profile: { ...current.profile, ...patch.profile },
    predictions: { ...current.predictions, ...patch.predictions },
  }
  await db.update(schema.users).set({ settings: next }).where(eq(schema.users.id, userId))
  return next
}
