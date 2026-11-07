// The canvas: one horizontal ribbon of days. Each level of detail is a layer of
// virtualized day columns; zoom gestures scale a layer on the GPU and re-lay it
// out at native size when the gesture settles, so cards stay sharp.
import { Camera, reducedMotion } from './camera'
import { h, makeCard, type Card, type CardHooks, type Lod } from './card'
import { store, type Change } from './store'
import * as T from './time'

const LODS: Lod[] = ['year', 'month', 'week', 'day']
const THRESHOLDS = [18, 76, 230]
const STICKY_PAD = 16
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function lodFor(dw: number, current?: Lod): Lod {
  const ci = current ? LODS.indexOf(current) : -1
  let i = 0
  THRESHOLDS.forEach((t, k) => { if (dw >= t * (ci > k ? 0.96 : 1.04)) i = k + 1 })
  return LODS[i]
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

interface Col { el: HTMLElement; day: number; cards: Card[]; height: number }

class Layer {
  el: HTMLElement
  cols = new Map<number, Col>()
  dw = 1
  origin = 0
  private gap = 0

  constructor(readonly lod: Exclude<Lod, 'year'>, private hooks: CardHooks, private ro: ResizeObserver) {
    this.el = h('div', `layer lod-${lod}`)
  }

  commit(dw: number, day: number) {
    this.dw = dw
    this.origin = Math.round(day)
    const g = this.lod === 'month' ? clamp(dw * 0.12, 2, 7) : this.lod === 'week' ? clamp(dw * 0.08, 8, 16) : clamp(dw * 0.07, 16, 28)
    this.gap = g
    const w = dw - g
    const s = this.el.style
    s.setProperty('--w', `${w}px`)
    s.setProperty('--gap', `${this.lod === 'month' ? g : Math.round(g * 0.9)}px`)
    s.setProperty('--r', `${this.lod === 'month' ? clamp(w * 0.09, 2, 7) : this.lod === 'week' ? 12 : 16}px`)
    for (const c of this.cols.values()) this.position(c)
  }

  position(c: Col) {
    c.el.style.transform = `translate3d(${(c.day - this.origin) * this.dw + this.gap / 2}px,0,0)`
  }

  place(cam: Camera) {
    const s = cam.dw / this.dw
    const tx = (this.origin - cam.day) * cam.dw + cam.vw / 2
    this.el.style.transform = `translate3d(${tx}px,${cam.baseline - cam.y}px,0) scale(${s})`
  }

  sync(cam: Camera) {
    const margin = cam.vw * 0.5, keep = cam.vw * 0.9
    const a = Math.floor(cam.dayAt(-margin)), b = Math.ceil(cam.dayAt(cam.vw + margin))
    const ka = cam.dayAt(-keep), kb = cam.dayAt(cam.vw + keep)
    for (const [d, c] of this.cols) if (d < ka - 1 || d > kb + 1) this.drop(c)
    for (let d = a; d <= b; d++) {
      if (this.cols.has(d)) continue
      const el = h('div', 'col')
      el.dataset.day = String(d)
      const c: Col = { el, day: d, cards: [], height: 0 }
      this.cols.set(d, c)
      this.position(c)
      this.render(c)
      let next: HTMLElement | null = null
      for (let k = d + 1; k <= b + 1; k++) { const n = this.cols.get(k); if (n) { next = n.el; break } }
      this.el.insertBefore(el, next)
      this.ro.observe(el)
    }
  }

  render(c: Col) {
    const posts = store.isLoaded(c.day) ? store.postsFor(c.day) : null
    const n = posts ? posts.length : store.countFor(c.day)
    while (c.cards.length < n) {
      const card = makeCard(this.lod, this.hooks)
      c.cards.push(card)
      c.el.append(card.el)
    }
    while (c.cards.length > n) this.dispose(c.cards.pop()!)
    c.cards.forEach((card, i) => card.update(posts ? posts[i] : null))
    c.el.classList.toggle('is-empty', n === 0)
  }

  private dispose(card: Card) {
    card.el.querySelector('img')?.removeAttribute('src')
    card.el.remove()
  }

  private drop(c: Col) {
    this.ro.unobserve(c.el)
    for (const card of c.cards) card.el.querySelector('img')?.removeAttribute('src')
    c.el.remove()
    this.cols.delete(c.day)
  }

  destroy() { for (const c of [...this.cols.values()]) this.drop(c); this.el.remove() }
}

/** Year view: months as strips, each day a bar sized by its post count. */
class YearLayer {
  readonly lod = 'year' as const
  el = h('canvas', 'layer year')
  private ctx = this.el.getContext('2d')!
  hover: number | null = null

  draw(cam: Camera) {
    const dpr = Math.min(devicePixelRatio || 1, 3)
    const w = cam.vw, hgt = cam.vh - cam.baseline
    if (this.el.width !== Math.round(w * dpr) || this.el.height !== Math.round(hgt * dpr)) {
      this.el.width = Math.round(w * dpr); this.el.height = Math.round(hgt * dpr)
      this.el.style.width = w + 'px'; this.el.style.height = hgt + 'px'
    }
    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, hgt)
    const unit = clamp((hgt - 220) / 9, 5, 11)
    const top = 14, stripH = unit * 8 + 14
    const a = Math.floor(cam.dayAt(0)) - 1, b = Math.ceil(cam.dayAt(w)) + 1
    const dw = cam.dw
    const pub = css('--bar-published'), sch = css('--bar-scheduled'), strip = css('--strip'), ink2 = css('--ink-2')

    // Month strips and totals
    ctx.font = `500 12px ${css('--font').split(',')[0]}, sans-serif`
    ctx.textBaseline = 'top'
    for (let k = T.monthKey(a); T.monthStart(k) <= b; k++) {
      const s = T.monthStart(k), e = T.monthStart(k + 1)
      const x0 = cam.x(s) + 1, x1 = cam.x(e) - 1
      ctx.fillStyle = strip
      roundRect(ctx, x0, top - 6, x1 - x0, stripH, Math.min(10, (x1 - x0) / 4))
      let total = 0
      for (let d = s; d < e; d++) total += store.dayCounts.get(d)?.posts ?? 0
      if (x1 - x0 > 46 && total) {
        ctx.fillStyle = ink2
        ctx.fillText(x1 - x0 > 80 ? `${total} posts` : String(total), x0 + 6, top + stripH)
      }
    }
    // Day bars, hanging from the baseline
    const bw = dw > 3 ? dw - Math.min(2, dw * 0.25) : Math.max(0.75, dw * 0.85)
    for (let d = a; d <= b; d++) {
      const c = store.dayCounts.get(d)
      if (!c) continue
      const x = cam.x(d) + (dw - bw) / 2
      const published = c.posts - c.scheduled
      const r = Math.min(bw / 2, 2)
      if (published) { ctx.fillStyle = this.hover === d ? ink2 : pub; roundRect(ctx, x, top, bw, published * unit - 1, r) }
      if (c.scheduled) { ctx.fillStyle = sch; ctx.globalAlpha = this.hover === d ? 1 : 0.82; roundRect(ctx, x, top + published * unit, bw, c.scheduled * unit - 1, r); ctx.globalAlpha = 1 }
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number) {
  if (w <= 0 || hh <= 0) return
  ctx.beginPath()
  if (r > 0.5 && ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh)
  ctx.fill()
}

export interface Presets { day: number; week: number; month: number; year: number }

export class Board {
  cam: Camera
  lod: Lod = 'month'
  presets!: Presets
  private layers: (Layer | YearLayer)[] = []
  private fading: { layer: Layer | YearLayer; until: number }[] = []
  private ro: ResizeObserver
  private raf = 0
  private ribbon = h('div', 'ribbon')
  private labels = new Map<string, HTMLElement>()
  private labelWidths = new WeakMap<HTMLElement, number>()
  private todayEl = h('div', 'today-mark')
  private glow = h('div', 'glow')
  private stage = h('div', 'stage')
  private introPending = false
  private listeners = new Set<(b: Board) => void>()

  constructor(readonly el: HTMLElement, private hooks: CardHooks) {
    this.cam = new Camera(() => this.schedule())
    // On phones the day view rests on whole days, like paging.
    this.cam.snap = end => (this.lod === 'day' && this.cam.vw < 720 ? Math.floor(end) + 0.5 : null)
    this.ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const day = Number((e.target as HTMLElement).dataset.day)
        for (const l of this.layers) if (l instanceof Layer) { const c = l.cols.get(day); if (c?.el === e.target) c.height = e.contentRect.height }
      }
      this.schedule()
    })
    el.append(this.glow, h('div', 'baseline'), this.todayEl, this.stage, this.ribbon)
    this.resize()
    addEventListener('resize', () => { this.resize(); this.schedule() })
    store.on(c => this.onStore(c))
    this.bindInput()
  }

  onRender(fn: (b: Board) => void) { this.listeners.add(fn) }

  /** Play the entrance once the board is first shown. */
  begin() { this.introPending = true; this.el.classList.add('is-live'); this.schedule() }

  resize() {
    const cam = this.cam
    const r = this.el.getBoundingClientRect()
    cam.vw = r.width; cam.vh = r.height
    const small = cam.vw < 720
    cam.baseline = small ? 112 : 120
    document.documentElement.style.setProperty('--baseline', `${cam.baseline}px`)
    this.presets = {
      day: Math.min(cam.vw - 32, 400),
      week: clamp(cam.vw / 7.5, 110, 210),
      month: small ? 44 : clamp(cam.vw / 33, 24, 60),
      year: Math.max(cam.vw / 400, 1),
    }
    cam.minDw = Math.min(this.presets.year, cam.vw / 520)
    cam.maxDw = this.presets.day * 1.12
    this.bounds()
  }

  private bounds() {
    const t = T.today()
    this.cam.minDay = Math.min(store.firstDay ?? t, t) - 120
    this.cam.maxDay = Math.max(store.lastDay ?? t, t) + 420
    this.cam.clamp()
  }

  schedule() { if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t)) }

  private frame(now: number) {
    this.raf = 0
    const moving = this.cam.step(now)
    this.render(now)
    if (moving || this.fading.length || this.cam.zooming || this.needsCommit()) this.schedule()
  }

  private needsCommit() {
    return this.layers.some(l => l instanceof Layer && Math.abs(this.cam.dw / l.dw - 1) > 0.001)
  }

  private render(now: number) {
    const cam = this.cam
    const lod = lodFor(cam.dw, this.lod)
    const top = this.layers[this.layers.length - 1]
    if (!top || top.lod !== lod) this.swap(lod, now)
    this.lod = lod
    this.el.dataset.lod = lod

    for (const f of this.fading) if (now >= f.until) this.dropLayer(f.layer)
    this.fading = this.fading.filter(f => now < f.until)

    let tallest = 0
    for (const l of this.layers) {
      if (l instanceof Layer) {
        const s = cam.dw / l.dw
        const far = Math.abs((l.origin - cam.day) * cam.dw) > 60_000
        if ((Math.abs(s - 1) > 0.001 && (!cam.zooming || s < 0.62 || s > 1.6)) || far) l.commit(cam.dw, cam.day)
        l.place(cam)
        if (l === this.layers[this.layers.length - 1]) {
          l.sync(cam)
          const a = cam.dayAt(0), b = cam.dayAt(cam.vw)
          for (const c of l.cols.values()) if (c.day >= a - 1 && c.day <= b) tallest = Math.max(tallest, c.height)
          tallest *= cam.dw / l.dw
        }
      } else l.draw(cam)
    }
    cam.maxY = Math.max(0, tallest + 150 - (cam.vh - cam.baseline))
    if (cam.y > cam.maxY) cam.clamp()

    if (lod !== 'year') store.want(Math.floor(cam.dayAt(-cam.vw * 0.3)), Math.ceil(cam.dayAt(cam.vw * 1.3)), cam.day)
    this.renderRibbon()
    const tx = cam.x(T.today())
    this.todayEl.style.transform = `translate3d(${tx}px,0,0)`
    this.todayEl.style.width = `${Math.max(2, cam.dw)}px`
    if (!reducedMotion.matches) this.glow.style.transform = `translate3d(${-(((cam.travel * 0.12) % 2400) + 2400) % 2400 - 2400}px,0,0)`
    for (const fn of this.listeners) fn(this)
    if (this.introPending && this.layers[0] instanceof Layer) { this.introPending = false; this.playIntro() }
  }

  private swap(lod: Lod, now: number) {
    const old = this.layers[this.layers.length - 1]
    for (const f of this.fading) this.dropLayer(f.layer)
    this.fading = []
    const layer = lod === 'year' ? new YearLayer() : new Layer(lod, this.hooks, this.ro)
    if (layer instanceof Layer) layer.commit(this.cam.dw, this.cam.day)
    this.stage.append(layer.el)
    this.layers = old ? [old, layer] : [layer]
    if (old) {
      const ms = reducedMotion.matches ? 0 : 220
      old.el.classList.add('is-leaving')
      layer.el.classList.add('is-entering')
      requestAnimationFrame(() => layer.el.classList.remove('is-entering'))
      this.fading.push({ layer: old, until: now + ms })
    }
  }

  private dropLayer(l: Layer | YearLayer) {
    if (l instanceof Layer) l.destroy(); else l.el.remove()
    this.layers = this.layers.filter(x => x !== l)
  }

  private onStore(c: Change) {
    if (c.kind === 'days') { this.bounds(); this.rerenderAll() }
    else if (c.kind === 'posts') {
      for (const l of this.layers) if (l instanceof Layer) for (const d of c.days) { const col = l.cols.get(d); if (col) l.render(col) }
    } else if (c.kind === 'directory') this.rerenderAll()
    this.schedule()
  }

  private rerenderAll() { for (const l of this.layers) if (l instanceof Layer) for (const col of l.cols.values()) l.render(col) }

  // Ribbon labels ------------------------------------------------------------

  private renderRibbon() {
    const cam = this.cam, dw = cam.dw, lod = this.lod
    const seen = new Set<string>()
    const put = (key: string, cls: string, text: string, x: number) => {
      let el = this.labels.get(key)
      if (!el) { el = h('span', cls, text); this.labels.set(key, el); this.ribbon.append(el) }
      el.style.transform = `translate3d(${x}px,0,0)`
      seen.add(key)
      return el
    }
    const a = Math.floor(cam.dayAt(-40)), b = Math.ceil(cam.dayAt(cam.vw + 40))
    const t = T.today()
    const monthEdges: number[] = []

    for (let k = T.monthKey(a - 31); T.monthStart(k) <= b; k++) {
      const s = T.monthStart(k), x = cam.x(s)
      if (x > cam.vw + 40 || cam.x(T.monthStart(k + 1)) < -40) continue
      const { y, m } = T.ymd(s)
      if (lod === 'year') {
        const width = (T.monthStart(k + 1) - s) * dw
        const label = width > 34 ? T.monthShort(s) : T.monthShort(s)[0]
        put(`ym${k}|${label}`, 'r-month is-year', label, x + 4)
        if (m === 0) put(`yy${y}`, 'r-day r-year', String(y), x + 4)
      } else {
        // Sticky: the month under the left edge stays pinned there until the next month pushes it out.
        const el = put(`m${k}`, 'r-month', `${T.monthName(s)} ${y}`, x)
        let w = this.labelWidths.get(el)
        if (w === undefined) { w = el.offsetWidth; this.labelWidths.set(el, w) }
        const pinned = Math.min(Math.max(x, STICKY_PAD), cam.x(T.monthStart(k + 1)) - w - 16)
        if (pinned !== x) el.style.transform = `translate3d(${pinned}px,0,0)`
        el.classList.toggle('is-stuck', pinned > x + 0.5)
        monthEdges.push(pinned)
      }
    }

    if (lod !== 'year') {
      if (dw >= 20) {
        for (let d = a - ((T.ymd(a).wd + 7) % 7); d <= b; d += 7) {
          const x = cam.x(d)
          if (monthEdges.some(e => x >= e - 40 && x < e + 150)) continue
          put(`w${d}`, 'r-week', `Week ${T.isoWeek(d)}`, x)
        }
      }
      const fmt = dw >= 230 ? 'long' : dw >= 56 ? 'short' : dw >= 21 ? 'num' : 'monday'
      for (let d = a; d <= b; d++) {
        const { d: dd, wd } = T.ymd(d)
        if (fmt === 'monday' && wd !== 0 && d !== t) continue
        const text = fmt === 'long' ? `${T.weekdayLong(d)} ${dd}` : fmt === 'short' ? `${T.weekdayShort(d)} ${dd}` : String(dd)
        const centered = fmt === 'num' || fmt === 'monday'
        const el = put(`d${d}|${fmt}`, `r-day${centered ? ' is-centered' : ''}${wd > 4 ? ' is-weekend' : ''}${d === t ? ' is-today' : ''}`, text,
          centered ? cam.x(d) + dw / 2 : cam.x(d) + clamp(dw * 0.04, 4, 14))
        if (fmt === 'long') {
          const n = store.countFor(d)
          const count = n ? `${n} post${n === 1 ? '' : 's'}` : 'No posts'
          if (el.dataset.count !== count) { el.dataset.count = count }
        }
      }
    } else {
      put('today', 'r-day r-today-year is-today', 'Today', cam.x(t) + dw / 2)
    }

    for (const [key, el] of this.labels) if (!seen.has(key)) { el.remove(); this.labels.delete(key) }
  }

  // Entrance -----------------------------------------------------------------

  private playIntro() {
    if (reducedMotion.matches) return
    const layer = this.layers[0] as Layer
    const cam = this.cam
    requestAnimationFrame(() => {
      const cols = [...layer.cols.values()].filter(c => cam.x(c.day) > -cam.dw && cam.x(c.day) < cam.vw).sort((a, b) => a.day - b.day)
      cols.forEach(c => {
        const lead = clamp(cam.x(c.day) / cam.vw, 0, 1) * 480
        c.cards.forEach((card, i) => {
          card.el.animate(
            [{ opacity: 0, transform: 'translateY(-12px) scale(0.97)' }, { opacity: 1, transform: 'none' }],
            { duration: 380, delay: lead + Math.min(i, 5) * 40, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' },
          )
        })
      })
    })
  }

  // Navigation ---------------------------------------------------------------

  goTo(day: number, dw?: number, y = 0) {
    this.cam.animateTo({ day: day + 0.5, dw: dw ?? this.cam.dw, y })
  }

  /** Jump to a level of detail. On wide screens week and month frame the whole week or month. */
  showLod(lod: Lod) {
    const cam = this.cam, c = Math.floor(cam.day), wide = cam.vw >= 720
    let day = c + 0.5
    if (wide && lod === 'week') day = c - T.ymd(c).wd + 3.5
    if (wide && lod === 'month') { const { y, m } = T.ymd(c); day = (T.dayOf(y, m, 1) + T.dayOf(y, m + 1, 1)) / 2 }
    cam.animateTo({ day, dw: this.presets[lod], y: 0 }, 460)
  }

  zoomStep(dir: 1 | -1) {
    const cam = this.cam
    this.cam.animateTo({ dw: cam.dw * (dir > 0 ? 1.8 : 1 / 1.8) }, 300)
  }

  zoomIntoDay(x: number) {
    const day = Math.floor(this.cam.dayAt(x))
    if (this.cam.dw >= THRESHOLDS[2]) this.goTo(day, this.presets.week)
    else this.goTo(day, this.presets.day)
  }

  /** Fly to a post's day, scroll its card into view and mark it briefly. */
  reveal(postId: string, day: number) {
    this.goTo(day, Math.max(this.cam.dw, this.presets.day))
    const find = (tries: number) => {
      const el = this.stage.querySelector<HTMLElement>(`.layer.lod-day:not(.is-leaving) [data-post="${postId}"]`)
      if (!el) { if (tries) setTimeout(() => find(tries - 1), 150); return }
      const col = el.closest<HTMLElement>('.col')!
      const y = el.offsetTop - col.offsetTop - 24
      this.cam.animateTo({ y: Math.max(0, y) }, 360)
      el.classList.remove('is-marked'); void el.offsetWidth; el.classList.add('is-marked')
    }
    setTimeout(() => find(20), reducedMotion.matches ? 50 : 480)
  }

  private bindInput() {
    this.cam.bind(this.el, {
      doubleTap: x => this.zoomIntoDay(x),
      key: e => {
        const cam = this.cam
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const dir = e.key === 'ArrowLeft' ? -1 : 1
          let day = Math.floor(cam.day) + dir * 7
          if (e.shiftKey) { const { y, m, d } = T.ymd(Math.floor(cam.day)); day = T.dayOf(y, m + dir, Math.min(d, 28)) }
          cam.animateTo({ day: day + (cam.day % 1) }, 380)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          cam.animateTo({ y: cam.y + (e.key === 'ArrowDown' ? 1 : -1) * cam.vh * 0.4 }, 260)
        } else if (e.key === '+' || e.key === '=') this.zoomStep(1)
        else if (e.key === '-' || e.key === '_') this.zoomStep(-1)
        else if (e.key === 't' || e.key === 'T') this.goTo(T.today())
        else if ('ymwd'.includes(e.key.toLowerCase()) && e.key.length === 1) this.showLod(LODS['ymwd'.indexOf(e.key.toLowerCase())])
        else return false
        return true
      },
    })
    this.el.addEventListener('click', e => {
      const t = e.target as HTMLElement
      const card = t.closest<HTMLElement>('.card[data-post]')
      const col = t.closest<HTMLElement>('.col')
      if (card && col && (this.lod === 'month' || this.lod === 'week')) {
        const day = Number(col.dataset.day)
        if (this.lod === 'month') this.goTo(day, this.presets.week)
        else this.reveal(card.dataset.post!, day)
      } else if (this.lod === 'year' && t.closest('.year')) {
        this.goTo(Math.floor(this.cam.dayAt(e.clientX)), this.presets.month)
      }
    })
    this.el.addEventListener('keydown', e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.card[data-post]')
      if (card && e.key === 'Enter' && card === e.target) card.click()
    })
    this.el.addEventListener('pointermove', e => {
      const year = this.layers.find(l => l instanceof YearLayer) as YearLayer | undefined
      if (!year || e.pointerType !== 'mouse') return
      const d = Math.floor(this.cam.dayAt(e.clientX))
      const hover = e.clientY > this.cam.baseline && store.dayCounts.has(d) ? d : null
      if (hover !== year.hover) { year.hover = hover; this.schedule(); this.hooks.hoverDay?.(hover, e.clientX, e.clientY) }
      else if (hover !== null) this.hooks.hoverDay?.(hover, e.clientX, e.clientY)
    })
    this.el.addEventListener('pointerleave', () => this.hooks.hoverDay?.(null, 0, 0))
  }
}
