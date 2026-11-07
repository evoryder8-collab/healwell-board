// The view onto the ribbon: which day sits at the center, how wide a day is,
// and how far the stacks are scrolled. Handles every way of moving it.

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4)
const easeInOut = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2)
const FRICTION_MS = 325 // decay time constant for momentum, close to iOS scroll views

interface Tween { from: View; to: View; t0: number; ms: number; dip: number }
export interface View { day: number; dw: number; y: number }

export class Camera {
  day = 0          // day index at the horizontal center (fractional)
  dw = 40          // px per day
  y = 0            // vertical scroll of the stacks, px
  vw = innerWidth
  vh = innerHeight
  baseline = 112   // screen y where stacks begin
  minDay = -Infinity
  maxDay = Infinity
  minDw = 1
  maxDw = 420
  maxY = 0
  travel = 0       // accumulated horizontal screen motion, drives the parallax light

  private vx = 0
  private vy = 0
  private tween: Tween | null = null
  private lastZoom = 0
  private pinching = false
  private last = 0

  constructor(private onChange: () => void) {}

  get zooming() { return this.pinching || performance.now() - this.lastZoom < 160 || !!(this.tween && this.tween.from.dw !== this.tween.to.dw) }
  get animating() { return !!this.tween || Math.abs(this.vx) + Math.abs(this.vy) > 0.004 }

  /** Screen x of the left edge of a day. */
  x(day: number) { return (day - this.day) * this.dw + this.vw / 2 }
  /** Day under a screen x (fractional). */
  dayAt(x: number) { return this.day + (x - this.vw / 2) / this.dw }

  set(v: Partial<View>) {
    if (v.dw !== undefined) this.dw = clamp(v.dw, this.minDw, this.maxDw)
    if (v.day !== undefined) this.day = v.day
    if (v.y !== undefined) this.y = v.y
    this.clamp()
    this.onChange()
  }

  stop() { this.vx = this.vy = 0; this.tween = null }

  panBy(dx: number, dy: number) {
    this.day -= dx / this.dw
    this.y -= dy
    this.travel += dx
    this.clamp()
    this.onChange()
  }

  zoomAt(fx: number, fy: number, k: number) {
    const dw = clamp(this.dw * k, this.minDw, this.maxDw)
    k = dw / this.dw
    if (k === 1) return
    const anchor = this.dayAt(fx)
    const rel = Math.max(0, fy - this.baseline)
    this.dw = dw
    this.day = anchor - (fx - this.vw / 2) / dw
    this.y = (this.y + rel) * k - rel
    this.lastZoom = performance.now()
    this.clamp()
    this.onChange()
  }

  /** Optional: where a fling should come to rest, given where momentum would take it. */
  snap: ((endDay: number) => number | null) | null = null

  fling(vx: number, vy: number) {
    const max = 6
    vx = clamp(vx, -max, max)
    vy = clamp(vy, -max, max)
    const target = this.snap?.(this.day - (vx * FRICTION_MS) / this.dw)
    if (target != null && !reducedMotion.matches) {
      const ms = clamp(280 + Math.abs(target - this.day) * this.dw * 0.5, 280, 560)
      this.animateTo({ day: target, y: clamp(this.y - vy * FRICTION_MS, 0, this.maxY) }, ms)
      return
    }
    this.vx = vx
    this.vy = vy
    this.last = performance.now()
    this.onChange()
  }

  /** Animate to a view. Long trips rise to an overview and come back down. */
  animateTo(to: Partial<View>, ms = 420) {
    const target: View = {
      day: to.day ?? this.day,
      dw: clamp(to.dw ?? this.dw, this.minDw, this.maxDw),
      y: to.y ?? this.y,
    }
    this.vx = this.vy = 0
    if (reducedMotion.matches) { this.tween = null; this.set(target); return }
    const span = Math.abs(target.day - this.day)
    const fit = (this.vw * 0.7) / Math.max(span, 1)
    const low = Math.min(this.dw, target.dw)
    const dip = span * low > this.vw * 2.5 ? Math.max(0, Math.log(low / Math.max(fit, this.minDw))) : 0
    if (dip) ms = Math.min(1100, ms + 260 * dip)
    this.tween = { from: { day: this.day, dw: this.dw, y: this.y }, to: target, t0: performance.now(), ms, dip }
    this.onChange()
  }

  /** Advance momentum or tween. Returns true while still moving. */
  step(now: number): boolean {
    if (this.tween) {
      const { from, to, t0, ms, dip } = this.tween
      const t = clamp((now - t0) / ms, 0, 1)
      const e = dip ? easeInOut(t) : easeOut(t)
      const logDw = Math.log(from.dw) + (Math.log(to.dw) - Math.log(from.dw)) * e - dip * Math.sin(Math.PI * t)
      const prevX = this.day * this.dw
      this.dw = Math.exp(logDw)
      this.day = from.day + (to.day - from.day) * e
      this.y = from.y + (to.y - from.y) * e
      this.travel -= this.day * this.dw - prevX
      if (from.dw !== to.dw) this.lastZoom = now
      this.clamp()
      if (t >= 1) { this.tween = null; this.dw = to.dw; this.clamp() }
      return true
    }
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.004) {
      const dt = Math.min(48, now - this.last)
      this.last = now
      const decay = Math.exp(-dt / FRICTION_MS)
      const before = { day: this.day, y: this.y }
      this.panBy(this.vx * dt, this.vy * dt)
      if (this.day === before.day) this.vx = 0
      if (this.y === before.y) this.vy = 0
      this.vx *= decay
      this.vy *= decay
      return true
    }
    this.vx = this.vy = 0
    return false
  }

  clamp() {
    this.dw = clamp(this.dw, this.minDw, this.maxDw)
    const half = this.vw / 2 / this.dw
    const lo = this.minDay + half * 0.3, hi = this.maxDay - half * 0.3
    this.day = lo > hi ? (this.minDay + this.maxDay) / 2 : clamp(this.day, lo, hi)
    this.y = clamp(this.y, 0, Math.max(0, this.maxY))
  }

  // Input ----------------------------------------------------------------------

  /** Wire pointer, wheel, gesture and keyboard input on the board element. */
  bind(el: HTMLElement, hooks: { doubleTap: (x: number, y: number) => void; key: (e: KeyboardEvent) => boolean }) {
    // Pointers are tracked on the whole document so a pinch counts wherever the fingers land:
    // on cards, link chips, captions or the floating controls. Sheets and dialogs keep their own touch.
    const pts = new Map<number, { x: number; y: number }>()
    let drag: { id: number; x0: number; y0: number; moved: boolean; afterPinch?: boolean; samples: { t: number; x: number; y: number }[] } | null = null
    let pinch: { d: number; mx: number; my: number } | null = null
    let pair: number[] = [] // the two pointers driving the current pinch
    let lastTap = { t: 0, x: 0, y: 0 }
    let suppressClick = false

    const interactive = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('input, textarea, button, a, select, [contenteditable], .no-pan')
    const ownTouch = (t: EventTarget | null) => t instanceof Element && !!t.closest('.panel, .modal, .scrim, .suggest')
    const reset = () => { pts.clear(); pinch = null; drag = null; pair = []; this.pinching = false; el.classList.remove('is-dragging') }

    const pinchState = () => {
      const a = pts.get(pair[0])!, b = pts.get(pair[1])!
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }

    document.addEventListener('pointerdown', e => {
      if (e.button !== 0 || ownTouch(e.target)) return
      const touch = e.pointerType === 'touch'
      // A primary touch starts a fresh gesture. iOS can drop "pointerup" when the touched card
      // is removed mid-gesture (zooming swaps layers), which would otherwise leave a ghost finger.
      if (e.isPrimary) { suppressClick = false; if (touch) reset() }
      const free = el.contains(e.target as Node) && !interactive(e.target)
      if (!touch && !free) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touch && pts.size >= 2) {
        pair = [...pts.keys()].slice(-2)
        for (const id of pair) { try { el.setPointerCapture(id) } catch { /* pointer already gone */ } }
        this.stop()
        pinch = pinchState()
        this.pinching = true
        suppressClick = true // lifting a pinch finger never taps the link or button under it
        drag = null
      } else if (pts.size === 1 && free) {
        this.stop()
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] }
      }
    }, true)

    document.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      if (pinch) {
        if (!pair.includes(e.pointerId) || !pts.has(pair[0]) || !pts.has(pair[1])) return
        const s = pinchState()
        this.panBy(s.mx - pinch.mx, s.my - pinch.my)
        if (pinch.d > 8 && s.d > 8) this.zoomAt(s.mx, s.my, s.d / pinch.d)
        pinch = s
        return
      }
      if (!drag || drag.id !== e.pointerId) return
      if (!drag.moved) {
        const slop = e.pointerType === 'mouse' ? 4 : 8
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < slop) return
        drag.moved = true
        try { el.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        el.classList.add('is-dragging')
      }
      this.panBy(dx, dy)
      drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
      if (drag.samples.length > 8) drag.samples.shift()
    }, true)

    const end = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.delete(e.pointerId)
      if (pinch) {
        if (pair.includes(e.pointerId)) {
          pinch = null
          pair = []
          this.pinching = false
          this.lastZoom = performance.now()
          const [id, rest] = [...pts.entries()][0] ?? []
          drag = rest ? { id: id!, x0: rest.x, y0: rest.y, moved: true, afterPinch: true, samples: [{ t: e.timeStamp, ...rest }] } : null
          this.onChange()
        }
        return
      }
      if (!drag || drag.id !== e.pointerId) return
      el.classList.remove('is-dragging')
      if (drag.moved) {
        suppressClick = true
        const s = drag.samples.filter(s => e.timeStamp - s.t < 90)
        // The finger left over from a pinch is not a swipe: settle without momentum.
        if (s.length >= 2 && e.type === 'pointerup' && !drag.afterPinch) {
          const a = s[0], b = s[s.length - 1], dt = Math.max(8, b.t - a.t)
          this.fling((b.x - a.x) / dt, (b.y - a.y) / dt)
        } else this.fling(0, 0)
      } else if (e.type === 'pointerup') {
        if (e.pointerType !== 'mouse' && e.timeStamp - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          lastTap.t = 0
          suppressClick = true
          hooks.doubleTap(e.clientX, e.clientY)
        } else {
          lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY }
        }
      }
      drag = null
    }
    document.addEventListener('pointerup', end, true)
    document.addEventListener('pointercancel', end, true)
    document.addEventListener('click', e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false } }, true)
    el.addEventListener('dblclick', e => { if (!interactive(e.target)) hooks.doubleTap(e.clientX, e.clientY) })

    el.addEventListener('wheel', e => {
      if (interactive(e.target) && !e.ctrlKey && (e.target as Element).closest('textarea')) return
      e.preventDefault()
      this.tween = null
      this.vx = this.vy = 0
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.vh : 1
      let dx = e.deltaX * unit, dy = e.deltaY * unit
      if (e.ctrlKey || e.metaKey) {
        const k = Math.exp(-clamp(dy, -60, 60) * 0.01)
        this.zoomAt(e.clientX, e.clientY, k)
        return
      }
      if (e.shiftKey && !dx) { dx = dy; dy = 0 }
      if (this.maxY <= 0 && Math.abs(dy) > Math.abs(dx)) { dx = dy; dy = 0 }
      this.panBy(-dx, -dy)
    }, { passive: false })

    // Safari trackpad pinch arrives as gesture events; iOS page zoom must be blocked.
    let gScale = 1
    const gesture = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
      e.preventDefault()
      if (pts.size) return
      if (e.type === 'gesturestart') gScale = 1
      else if (e.type === 'gesturechange' && e.scale) {
        this.zoomAt(e.clientX ?? this.vw / 2, e.clientY ?? this.vh / 2, e.scale / gScale)
        gScale = e.scale
      }
    }
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) el.addEventListener(t, gesture as EventListener, { passive: false })
    // Never let Safari zoom the page itself, even when a pinch starts over a floating control.
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault(), { passive: false })

    addEventListener('keydown', e => {
      const t = e.target as HTMLElement
      if (t.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (hooks.key(e)) e.preventDefault()
    })
  }
}
