import { redirect } from 'next/navigation'

// Phase 0: the only surface is the dev runner. Phase 1 replaces this with the
// real chapter/lesson home.
export default function Home() {
  redirect('/dev/runner')
}
