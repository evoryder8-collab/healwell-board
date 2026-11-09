// The video player: reels open above the board, never inside it. Cards are pooled, re-rendered,
// moved and zoomed under the camera, and the floating controls sit on top of them, which leaves no
// safe home for a playing video (covered controls, black fullscreen, audio outliving its picture).

const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

let current: { close(): void } | null = null

export interface ViewerOptions {
  src: string
  poster: string | null
  /** Says which post this is, e.g. "Mon 9 Nov, 12:00". */
  when: string
  /** Where to send the viewer when the file cannot be played (the original post), if anywhere. */
  fallback: string | null
}

export function openViewer(o: ViewerOptions) {
  current?.close()
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const el = document.createElement('div')
  el.className = 'viewer'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', `Video, ${o.when}`)

  const stage = document.createElement('figure')
  stage.className = 'viewer-stage'
  const v = document.createElement('video')
  v.className = 'viewer-video'
  v.controls = true
  v.playsInline = true
  v.preload = 'auto'
  if (o.poster) v.poster = o.poster
  v.src = o.src
  // Frame the video at its own shape once known (reels are 9:16, some posts 4:5).
  v.addEventListener('loadedmetadata', () => { if (v.videoWidth && v.videoHeight) stage.style.setProperty('--ratio', `${v.videoWidth} / ${v.videoHeight}`) })
  const when = document.createElement('figcaption')
  when.className = 'viewer-when'
  when.textContent = o.when
  stage.append(v, when)

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'viewer-close'
  close.setAttribute('aria-label', 'Close video')
  close.title = 'Close'
  close.innerHTML = CLOSE

  el.append(stage, close)
  document.body.append(el)

  let alive = true
  const shut = () => {
    if (!alive) return
    alive = false
    if (current === handle) current = null
    // Stop the sound for good: a paused element can still be resumed by the system (lock screen,
    // headphones), and one that leaves the page with a source can keep its audio pipeline alive.
    v.pause()
    v.removeAttribute('src')
    v.load()
    if (document.fullscreenElement === v) document.exitFullscreen().catch(() => {})
    removeEventListener('keydown', onKey, true)
    el.classList.add('is-leaving')
    setTimeout(() => el.remove(), 160)
    back?.focus({ preventScroll: true })
  }
  const handle = { close: shut }
  current = handle

  // Keys belong to the player while it is open: Escape closes it, and nothing reaches the board
  // (arrows, +/−, letters would otherwise move the calendar underneath).
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); return }
    if (!el.contains(e.target as Node)) { e.stopPropagation(); e.preventDefault() }
  }
  addEventListener('keydown', onKey, true)
  el.addEventListener('keydown', e => e.stopPropagation())

  close.addEventListener('click', shut)
  // A tap beside the video closes it; taps on the video belong to its controls.
  el.addEventListener('click', e => { if (e.target === el || e.target === stage) shut() })
  v.addEventListener('error', () => {
    if (!v.getAttribute('src')) return // cleared on close, not a failure
    shut()
    if (o.fallback) window.open(o.fallback, '_blank', 'noopener')
  }, { once: true })

  v.focus({ preventScroll: true })
  v.play().catch(() => { /* the controls stay up; a tap starts it */ })
  return handle
}
