import { db, schema } from '../db'
import { LOCAL_USER_ID } from '../lib/auth'

const existing = db.select().from(schema.users).all()
if (existing.some((u) => u.id === LOCAL_USER_ID)) {
  console.log('seed: local user already exists, nothing to do')
} else {
  db.insert(schema.users)
    .values({
      id: LOCAL_USER_ID,
      name: 'Corina',
      // profile.background feeds <LangContrast> until the Phase 2 survey exists
      settings: { theme: 'cyber', profile: { background: 'js' } },
    })
    .run()
  console.log('seed: created local user')
}
