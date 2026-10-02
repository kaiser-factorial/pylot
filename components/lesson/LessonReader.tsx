'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { NarrationManifest } from '@/lib/narration/manifest'
import { activeChunk } from '@/lib/narration/chunks'
import { READER_SPEEDS, type ReaderPreferences, type ReaderVoice } from '@/lib/narration/preferences'
import { WorkbenchButton } from '@/components/workbench/display'

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export function LessonReader({ children, chapter, lesson, manifest, initial }: {
  children: ReactNode
  chapter: string
  lesson: string
  manifest: NarrationManifest
  initial: ReaderPreferences
}) {
  const proseRef = useRef<HTMLDivElement>(null)
  const session = useRef({
    generation: 0, index: 0, status: 'idle' as Status,
    voice: initial.voice, speed: initial.speed,
    audio: null as HTMLAudioElement | null, loadedKey: '',
    clips: new Map<string, Promise<string>>(), urls: new Set<string>(),
    controllers: new Set<AbortController>(),
  })
  const [status, setStatus] = useState<Status>('idle')
  const [index, setIndex] = useState(0)
  const [preferences, setPreferences] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const saves = useRef(Promise.resolve())

  function transition(next: Status) {
    session.current.status = next
    setStatus(next)
  }

  // Cancel network consumers as well as audio. Generation checks cover responses
  // that completed just before abort, and browser play() promises still settling.
  function cancel(clearAudio = false) {
    const s = session.current
    s.generation++
    s.audio?.pause()
    s.controllers.forEach((c) => c.abort())
    s.controllers.clear()
    if (clearAudio && s.audio) {
      s.audio.removeAttribute('src'); s.audio.load(); s.loadedKey = ''
    }
  }

  useEffect(() => {
    const s = session.current
    return () => {
      s.generation++
      s.controllers.forEach((c) => c.abort())
      if (s.audio) { s.audio.pause(); s.audio.onended = null; s.audio.onerror = null; s.audio.removeAttribute('src'); s.audio.load() }
      s.urls.forEach((url) => URL.revokeObjectURL(url))
      s.urls.clear(); s.clips.clear()
    }
  }, [])

  useEffect(() => {
    const root = proseRef.current
    if (!root) return
    const id = manifest.segments[index]?.id
    const highlight = status === 'playing' || status === 'paused'
    root.querySelectorAll<HTMLElement>('[data-narration-id]').forEach((el) => {
      const active = highlight && el.dataset.narrationId === id
      el.classList.toggle('tts-active', active)
      if (!active || status !== 'playing') return
      // scrollIntoView can scroll the entire workbench. Move only the nearest
      // scrollable lesson ancestor, and only if the sentence is out of view.
      let pane = root.parentElement
      while (pane && !/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement
      if (!pane || pane === document.body || pane === document.documentElement) return
      const bounds = pane.getBoundingClientRect(), line = el.getBoundingClientRect()
      const delta = line.top < bounds.top ? line.top - bounds.top - 12
        : line.bottom > bounds.bottom ? line.bottom - bounds.bottom + 12 : 0
      if (delta) pane.scrollBy({ top: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
  }, [index, status, manifest])

  useEffect(() => {
    const root = proseRef.current
    if (!root) return
    root.querySelectorAll('.tts-chunk-active').forEach((el) => el.classList.remove('tts-chunk-active'))
    if (status !== 'playing' && status !== 'paused') return
    const segment = manifest.segments[index]
    const sentence = root.querySelector<HTMLElement>(`[data-narration-id="${segment?.id}"]`)
    const chunks = Array.from(sentence?.querySelectorAll<HTMLElement>('[data-chunk-end]') ?? [])
    const ends = chunks.map((el) => Number(el.dataset.chunkEnd))
    const audio = session.current.audio
    let frame = 0, previous = -1
    function update() {
      const loaded = session.current.loadedKey === `${session.current.voice}/${segment?.id}`
      const active = activeChunk(ends, loaded ? audio?.currentTime ?? 0 : 0, loaded ? audio?.duration ?? 0 : 0)
      if (active === previous) return
      chunks[previous]?.classList.remove('tts-chunk-active')
      chunks[active]?.classList.add('tts-chunk-active')
      previous = active
    }
    function tick() { update(); frame = requestAnimationFrame(tick) }
    update()
    if (status === 'playing') frame = requestAnimationFrame(tick)
    // Also update while paused when navigation/voice changes clear the clip.
    const events = ['timeupdate', 'durationchange', 'seeking', 'emptied'] as const
    events.forEach((event) => audio?.addEventListener(event, update))
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((event) => audio?.removeEventListener(event, update))
      chunks.forEach((el) => el.classList.remove('tts-chunk-active'))
    }
  }, [index, status, manifest])

  function clip(i: number) {
    const s = session.current
    const segment = manifest.segments[i]
    const key = `${s.voice}/${segment.id}`
    const hit = s.clips.get(key)
    if (hit) return hit
    const controller = new AbortController()
    s.controllers.add(controller)
    const promise = fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ chapter, lesson, revision: manifest.revision, segmentId: segment.id, voice: s.voice }),
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? 'Audio could not be loaded. Try again.')
      }
      const blob = await response.blob()
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const url = URL.createObjectURL(blob)
      s.urls.add(url)
      return url
    }).catch((e) => { if (s.clips.get(key) === promise) s.clips.delete(key); throw e })
      .finally(() => s.controllers.delete(controller))
    s.clips.set(key, promise)
    return promise
  }

  async function play(i = session.current.index) {
    const s = session.current
    const generation = ++s.generation
    s.index = i; setIndex(i); setError(null)
    const key = `${s.voice}/${manifest.segments[i].id}`
    const audio = s.audio ?? (s.audio = new Audio())
    audio.onended = () => {
      if (generation !== s.generation) return
      s.loadedKey = ''
      if (i + 1 < manifest.segments.length) void play(i + 1)
      else transition('ended')
    }
    audio.onerror = () => {
      if (generation !== s.generation) return
      s.loadedKey = ''; s.clips.delete(key)
      setError('Audio playback failed. Try again.'); transition('error')
    }
    transition('loading')
    try {
      if (s.loadedKey !== key) {
        const url = await clip(i)
        if (generation !== s.generation) return
        audio.src = url; s.loadedKey = key
      }
      audio.playbackRate = s.speed
      await audio.play()
      if (generation !== s.generation) return
      transition('playing')
      if (i + 1 < manifest.segments.length) void clip(i + 1).catch(() => {})
    } catch (e) {
      if (generation !== s.generation) return
      setError(e instanceof Error ? e.message : 'Audio could not be played. Try again.')
      transition('error')
    }
  }

  function pause() { cancel(); transition('paused') }
  function move(i: number, start = session.current.status === 'playing' || session.current.status === 'loading') {
    cancel(true)
    session.current.index = i; setIndex(i); setError(null)
    transition('paused')
    if (start) void play(i)
  }
  function save(next: ReaderPreferences) {
    setPreferences(next)
    // Serialize saves so rapid voice/speed changes cannot persist out of order.
    saves.current = saves.current.then(async () => {
      try {
        const response = await fetch('/api/settings', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reader: next }),
        })
        setSaveError(!response.ok)
      } catch { setSaveError(true) }
    })
  }
  function pickVoice(voice: ReaderVoice) {
    const s = session.current
    if (voice === s.voice) return
    move(s.index, false)
    s.voice = voice
    s.urls.forEach((url) => URL.revokeObjectURL(url)); s.urls.clear(); s.clips.clear()
    save({ voice, speed: s.speed })
  }
  function pickSpeed(speed: number) {
    const s = session.current
    s.speed = speed
    if (s.audio) s.audio.playbackRate = speed
    save({ voice: s.voice, speed })
  }
  const busy = status === 'playing' || status === 'loading'
  const empty = !manifest.segments.length

  return (
    <div data-testid="lesson-reader" data-status={status} data-revision={manifest.revision}>
      <div data-testid="tts-bar" role="group" aria-label="Read lesson aloud" title="Word-chunk highlighting uses estimated timing within each sentence." className="my-3 flex flex-wrap items-center gap-2 rounded-none p-2"
        style={{ border: '1px solid var(--pane-border)', background: 'var(--pane-header-bg)' }}>
        <WorkbenchButton testId="tts-play" disabled={empty} onClick={() => busy ? pause() : void play(status === 'ended' ? 0 : session.current.index)}>
          {busy ? 'Pause' : status === 'paused' ? 'Resume' : status === 'error' ? 'Retry' : 'Read aloud'}
        </WorkbenchButton>
        <WorkbenchButton variant="ghost" testId="tts-previous" disabled={empty || index === 0} onClick={() => move(index - 1)}>Previous sentence</WorkbenchButton>
        <WorkbenchButton variant="ghost" testId="tts-next" disabled={empty || index >= manifest.segments.length - 1} onClick={() => move(index + 1)}>Next sentence</WorkbenchButton>
        <WorkbenchButton variant="ghost" testId="tts-restart" disabled={empty} onClick={() => move(0, true)}>Restart</WorkbenchButton>
        <label className="text-xs">Voice{' '}
          <select aria-label="Narration voice" data-testid="tts-voice" value={preferences.voice} onChange={(e) => pickVoice(e.target.value as ReaderVoice)}
            style={{ color: 'var(--prose-fg)', background: 'var(--pane-bg)' }}>
            <option value="a">A</option><option value="b">B</option>
          </select>
        </label>
        <label className="text-xs">Speed{' '}
          <select aria-label="Narration speed" data-testid="tts-speed" value={preferences.speed} onChange={(e) => pickSpeed(Number(e.target.value))}
            style={{ color: 'var(--prose-fg)', background: 'var(--pane-bg)' }}>
            {READER_SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
        </label>
      </div>
      <p role="status" data-testid="tts-status" className="mb-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {empty ? 'No readable prose.' : status === 'loading' ? 'Loading audio…' : status === 'ended' ? 'Lesson narration finished.'
          : status === 'idle' ? 'Read the lesson aloud. Code blocks are skipped.' : `Sentence ${index + 1} of ${manifest.segments.length} · ${status}`}
      </p>
      {error && <p role="alert" data-testid="tts-error" className="mb-2 text-xs" style={{ color: 'var(--status-fail)' }}>{error}</p>}
      {saveError && <p role="alert" className="text-xs">Your listening preferences could not be saved. <button type="button" onClick={() => save(preferences)}>Retry saving</button></p>}
      <div ref={proseRef}>{children}</div>
    </div>
  )
}
