import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// Typed view over users.settings (JSON). The profile fills out in Phase 2 with
// the onboarding survey (ADR-006 layer 1); until then the seeded learner
// defaults to a JS background so <LangContrast lang="js"> callouts render.

export type ThemeName = 'cyber' | 'primary'

export type LearnerProfile = {
  // 'none' = new to programming entirely → no contrast callouts render
  background: 'none' | 'js' | 'cpp' | 'java' | 'r' | 'matlab' | (string & {})
}

export type UserSettings = {
  theme: ThemeName
  profile: LearnerProfile
}

const DEFAULTS: UserSettings = {
  theme: 'cyber',
  profile: { background: 'js' },
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db
    .select({ settings: schema.users.settings })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
  const raw = (row?.settings ?? {}) as Partial<UserSettings>
  return {
    theme: raw.theme === 'primary' ? 'primary' : DEFAULTS.theme,
    profile: {
      background:
        typeof raw.profile?.background === 'string' ? raw.profile.background : DEFAULTS.profile.background,
    },
  }
}

export async function updateUserSettings(
  userId: string,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId)
  const next: UserSettings = {
    theme: patch.theme ?? current.theme,
    profile: { ...current.profile, ...patch.profile },
  }
  await db.update(schema.users).set({ settings: next }).where(eq(schema.users.id, userId))
  return next
}
