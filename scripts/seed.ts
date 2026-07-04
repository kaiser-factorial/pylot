import { db, schema } from '../db'
import { LOCAL_USER_ID } from '../lib/auth'

const existing = db.select().from(schema.users).all()
if (existing.some((u) => u.id === LOCAL_USER_ID)) {
  console.log('seed: local user already exists, nothing to do')
} else {
  db.insert(schema.users)
    .values({ id: LOCAL_USER_ID, name: 'Corina', settings: { theme: 'cyber' } })
    .run()
  console.log('seed: created local user')
}
