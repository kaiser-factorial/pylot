import { redirect } from 'next/navigation'

// Home is the learning map; /dev/runner remains as a development surface.
export default function Home() {
  redirect('/learn')
}
