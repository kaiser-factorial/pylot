// The ONLY place in the codebase allowed to know there is a single local user.
// Phase 6 swaps this implementation for real auth (see ADR-003, ROADMAP).
// Everything else must treat the returned user as "whoever is signed in."

export const LOCAL_USER_ID = 'local-user'

export type CurrentUser = { id: string; name: string }

export async function getCurrentUser(): Promise<CurrentUser> {
  return { id: LOCAL_USER_ID, name: 'Corina' }
}
