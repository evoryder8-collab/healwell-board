// Everything that floats over the canvas.
import type { Board } from './board'
import { captionField, collabEditor, compact, flash, h, ICON, thumb } from './card'
import { store, type Post } from './store'
import * as T from './time'

const NAME_KEY = 'healwell-board:name'
export const getName = () => { try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } }
const setName = (n: string) => { try { localStorage.setItem(NAME_KEY, n) } catch { /* private mode */ } }

const SVG = {
  minus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  today: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.2" fill="currentColor"/></svg>',
  chevron: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 8.5h13M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  people: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="7" r="2.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 16c.6-2.6 2.5-4 4.7-4s4.1 1.4 4.7 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.6 12.3c1.4.5 2.3 1.8 2.6 3.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m13 13 3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
}

function button(cls: string, label: string, icon: string, text = '') {
  const b = h('button', cls)
  b.type = 'button'
  b.setAttribute('aria-label', label)
  b.title = label
  b.innerHTML = icon
  if (text) b.append(h('span', 'btn-text', text))
  return b
}

// Panels: side drawers on desktop, bottom sheets on phones ---------------------

const scrim = h('div', 'scrim')
const openPanels = new Set<Panel>()
scrim.addEventListener('click', () => { for (const p of [...openPanels]) p.close() })

class Panel {
  el: HTMLElement
  body: HTMLElement
  head: HTMLElement
  onClose?: () => void
  constructor(cls: string, title: string) {
    this.el = h('section', `panel glass ${cls}`)
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-label', title)
    this.head = h('header', 'panel-head')
    const grip = h('div', 'grip')
    const close = button('icon-btn panel-close', 'Close', ICON.close)
    close.addEventListener('click', () => this.close())
    this.head.append(grip, h('h2', 'panel-title', title), close)
    this.body = h('div', 'panel-body')
    this.el.append(this.head, this.body)
    this.el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); this.close() } })
    this.swipeToClose()
    document.body.append(this.el)
  }
  get isOpen() { return openPanels.has(this) }
  open() {
    if (compact.matches) for (const p of [...openPanels]) if (p !== this) p.close()
    openPanels.add(this)
    this.el.classList.add('is-open')
    scrim.classList.toggle('is-on', compact.matches)
  }
  close() {
    if (!this.isOpen) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    openPanels.delete(this)
    this.el.classList.remove('is-open')
    this.el.style.transform = ''
    if (!openPanels.size) scrim.classList.remove('is-on')
    this.onClose?.()
  }
  private swipeToClose() {
    let y0 = 0, dy = 0, on = false
    this.head.addEventListener('pointerdown', e => {
      if (!compact.matches || (e.target as Element).closest('button')) return
      on = true; y0 = e.clientY; dy = 0
      this.head.setPointerCapture(e.pointerId)
      this.el.classList.add('is-dragging')
    })
    this.head.addEventListener('pointermove', e => {
      if (!on) return
      dy = Math.max(0, e.clientY - y0)
      this.el.style.transform = `translate3d(0,${dy}px,0)`
    })
    const end = () => {
      if (!on) return
      on = false
      this.el.classList.remove('is-dragging')
      this.el.style.transform = ''
      if (dy > 90) this.close()
    }
    this.head.addEventListener('pointerup', end)
    this.head.addEventListener('pointercancel', end)
  }
}

/** Small post context used at the top of the comments and edit sheets. */
function postContext(p: Post) {
  const el = h('div', 'context')
  const img = h('img')
  img.alt = ''
  if (p.media_url) img.src = thumb(p.media_url, true)
  img.onerror = () => { if (p.media_url && img.src !== p.media_url) img.src = p.media_url }
  const text = h('div', 'context-text')
  text.append(h('strong', '', `${T.longDate(p.day)}, ${T.clock(p.minutes)}`),
    h('span', '', `${p.type[0].toUpperCase()}${p.type.slice(1)}, ${p.published ? 'published' : 'scheduled'}`))
  el.append(img, text)
  return el
}

// The UI ------------------------------------------------------------------------

export class UI {
  private compassMonth = h('strong', 'compass-month')
  private compassWeek = h('span', 'compass-week')
  private needle!: SVGGElement
  private todayBtn!: HTMLButtonElement
  private mini = h('div', 'minimap glass no-pan')
  private miniCanvas = h('canvas')
  private miniWindow = h('div', 'minimap-window')
  private miniDirty = true
  private vbar = h('div', 'vbar no-pan')
  private vthumb = h('div', 'vbar-thumb')
  private tip = h('div', 'tip glass')
  private lastCompass = ''
  private directory = new Panel('directory', 'Collaborators')
  private comments = new Panel('comments', 'Comments')
  private editor = new Panel('editor', 'Edit post')
  private commentsFor: string | null = null
  private dirList = h('ul', 'dir-list')
  private dirQuery = ''
  private dirCount = h('p', 'dir-count')
  private dirStale = false
  private nameChip = h('button', 'name-chip')
  private views = h('div', 'views glass no-pan')
  private viewsThumb = h('span', 'views-thumb')
  private lastLod = ''

  constructor(private board: Board) {
    document.body.append(scrim)
    this.buildTop()
    this.buildBar()
    this.buildMinimap()
    this.buildScrollbar()
    this.buildDirectory()
    document.body.append(this.tip)
    board.onRender(b => this.update(b))
    store.on(c => {
      if (c.kind === 'days') this.miniDirty = true
      if (c.kind === 'directory') this.renderDirectory()
      if (c.kind === 'comments' && c.postId === this.commentsFor) this.renderThread()
    })
    compact.addEventListener('change', () => { for (const p of [...openPanels]) p.close() })
    addEventListener('keydown', e => {
      if (e.key === 'Escape') for (const p of [...openPanels]) p.close()
    })
  }

  hooks = {
    openComments: (id: string) => this.openComments(id),
    openEditor: (id: string) => this.openEditor(id),
    hoverDay: (day: number | null, x: number, y: number) => {
      if (day === null) { this.tip.classList.remove('is-on'); return }
      const c = store.dayCounts.get(day)!
      this.tip.textContent = `${T.weekdayShort(day)} ${T.dayMonth(day)}, ${c.posts} post${c.posts === 1 ? '' : 's'}${c.scheduled ? `, ${c.scheduled} scheduled` : ''}`
      this.tip.style.transform = `translate3d(${x + 14}px,${y + 14}px,0)`
      this.tip.classList.add('is-on')
    },
  }

  // Top ----------------------------------------------------------------------

  private buildTop() {
    const top = h('div', 'topbar')
    const brand = h('div', 'brand')
    brand.append(h('span', 'brand-handle', '@healwell.ch'), h('span', 'brand-sub', 'Matthew Hua'))
    this.nameChip.type = 'button'
    this.nameChip.title = 'Change your name'
    this.nameChip.addEventListener('click', () => askName(true).then(() => this.renderName()))
    this.renderName()
    this.views.setAttribute('role', 'group')
    this.views.setAttribute('aria-label', 'View')
    this.views.append(this.viewsThumb)
    for (const [lod, label] of [['year', 'Year'], ['month', 'Month'], ['week', 'Week'], ['day', 'Day']] as const) {
      const b = h('button', 'view-btn', label)
      b.type = 'button'
      b.dataset.lod = lod
      b.title = `${label} view (${label[0]})`
      b.setAttribute('aria-pressed', 'false')
      b.addEventListener('click', () => this.board.showLod(lod))
      this.views.append(b)
    }
    top.append(brand, this.views, this.nameChip)
    document.body.append(top)
  }

  renderName() {
    const n = getName()
    this.nameChip.innerHTML = ''
    this.nameChip.append(h('span', 'avatar', n.trim()[0]?.toUpperCase() ?? '?'), h('span', 'name-text', n))
  }

  // Floating bar with the compass ------------------------------------------------

  private buildBar() {
    const bar = h('nav', 'bar glass no-pan')
    bar.setAttribute('aria-label', 'Board navigation')
    const out = button('icon-btn', 'Zoom out', SVG.minus)
    const inn = button('icon-btn', 'Zoom in', SVG.plus)
    out.addEventListener('click', () => this.board.zoomStep(-1))
    inn.addEventListener('click', () => this.board.zoomStep(1))

    const compass = h('div', 'compass')
    compass.setAttribute('aria-live', 'polite')
    const dial = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    dial.setAttribute('viewBox', '-16 -16 32 32')
    dial.setAttribute('class', 'dial')
    dial.setAttribute('aria-hidden', 'true')
    let ticks = '<circle r="13.5" class="dial-ring"/>'
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2
      const r0 = i % 3 ? 11.2 : 10.2
      ticks += `<line x1="${(Math.cos(a) * r0).toFixed(2)}" y1="${(Math.sin(a) * r0).toFixed(2)}" x2="${(Math.cos(a) * 13).toFixed(2)}" y2="${(Math.sin(a) * 13).toFixed(2)}" class="dial-tick"/>`
    }
    const t = T.today(), { y } = T.ymd(t)
    const ta = ((t - T.dayOf(y, 0, 1)) / 365.25) * Math.PI * 2 - Math.PI / 2
    ticks += `<circle cx="${(Math.cos(ta) * 13.5).toFixed(2)}" cy="${(Math.sin(ta) * 13.5).toFixed(2)}" r="2" class="dial-today"/>`
    ticks += '<g class="dial-needle"><line x1="0" y1="2.5" x2="0" y2="-9.5"/><circle r="1.8"/></g>'
    dial.innerHTML = ticks
    this.needle = dial.querySelector('.dial-needle')!
    const text = h('div', 'compass-text')
    text.append(this.compassMonth, this.compassWeek)
    compass.append(dial, text)

    this.todayBtn = button('pill-btn today-btn', 'Jump to today', SVG.today, 'Today')
    this.todayBtn.append(h('span', 'today-dir'))
    this.todayBtn.querySelector('.today-dir')!.innerHTML = SVG.chevron
    this.todayBtn.addEventListener('click', () => this.board.goTo(T.today(), Math.max(this.board.cam.dw, this.board.presets.year * 4)))

    const date = h('label', 'icon-btn date-btn')
    date.title = 'Jump to date'
    date.innerHTML = SVG.calendar
    const input = h('input')
    input.type = 'date'
    input.setAttribute('aria-label', 'Jump to date')
    input.addEventListener('change', () => {
      if (!input.value) return
      const day = T.parseIsoDate(input.value)
      const b = this.board
      b.goTo(day, b.lod === 'year' ? b.presets.month : b.cam.dw)
      input.blur()
    })
    input.addEventListener('focus', () => { input.value = T.isoDate(Math.floor(this.board.cam.day)) })
    date.append(input)

    const people = button('pill-btn', 'Collaborators', SVG.people, 'Collaborators')
    people.addEventListener('click', () => this.directory.isOpen ? this.directory.close() : this.openDirectory())

    bar.append(out, compass, inn, h('span', 'sep'), this.todayBtn, date, people)
    document.body.append(bar)
  }

  private update(b: Board) {
    const cam = b.cam
    if (b.lod !== this.lastLod) {
      this.lastLod = b.lod
      for (const btn of this.views.querySelectorAll<HTMLElement>('.view-btn')) {
        const on = btn.dataset.lod === b.lod
        btn.setAttribute('aria-pressed', String(on))
        if (on) { this.viewsThumb.style.width = `${btn.offsetWidth}px`; this.viewsThumb.style.transform = `translate3d(${btn.offsetLeft}px,0,0)` }
      }
    }
    const center = Math.floor(cam.day)
    const { y, m } = T.ymd(center)
    const wd = T.ymd(center).wd
    const mon = center - wd, sun = mon + 6
    const range = T.ymd(mon).m === T.ymd(sun).m
      ? `${T.ymd(mon).d}–${T.ymd(sun).d} ${T.monthShort(sun)}`
      : `${T.dayMonth(mon)} – ${T.dayMonth(sun)}`
    const key = `${y}-${m}-${mon}`
    if (key !== this.lastCompass) {
      this.lastCompass = key
      this.compassMonth.textContent = `${T.monthName(center)} ${y}`
      this.compassWeek.textContent = `Week ${T.isoWeek(center)}, ${range}`
    }
    const angle = ((cam.day - T.dayOf(y, 0, 1)) / 365.25) * 360
    this.needle.style.transform = `rotate(${angle}deg)`

    const tx = cam.x(T.today()) + cam.dw / 2
    const off = tx < 0 ? -1 : tx > cam.vw ? 1 : 0
    this.todayBtn.dataset.dir = String(off)

    // Minimap
    const showMini = b.lod !== 'year'
    this.mini.classList.toggle('is-on', showMini)
    if (showMini) this.drawMinimap(b)

    // Vertical scrollbar
    const track = cam.vh - cam.baseline - (compact.matches ? 150 : 110)
    if (cam.maxY > 4 && track > 60) {
      const content = cam.maxY + track
      const th = Math.max(36, (track * track) / content)
      this.vbar.classList.add('is-on')
      this.vbar.style.height = `${track}px`
      this.vthumb.style.height = `${th}px`
      this.vthumb.style.transform = `translate3d(0,${(cam.y / cam.maxY) * (track - th)}px,0)`
    } else this.vbar.classList.remove('is-on')
  }

  // Minimap ------------------------------------------------------------------------

  private buildMinimap() {
    this.mini.append(this.miniCanvas, this.miniWindow)
    this.mini.setAttribute('aria-hidden', 'true')
    const seek = (e: PointerEvent) => {
      const r = this.mini.getBoundingClientRect()
      const cam = this.board.cam
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      cam.stop()
      cam.set({ day: cam.minDay + f * (cam.maxDay - cam.minDay) })
    }
    let dragging = false
    this.mini.addEventListener('pointerdown', e => { dragging = true; this.mini.setPointerCapture(e.pointerId); seek(e) })
    this.mini.addEventListener('pointermove', e => { if (dragging) seek(e) })
    this.mini.addEventListener('pointerup', () => { dragging = false })
    this.mini.addEventListener('pointercancel', () => { dragging = false })
    document.body.append(this.mini)
  }

  private drawMinimap(b: Board) {
    const cam = b.cam
    const w = this.mini.clientWidth, hh = this.mini.clientHeight
    if (!w) return
    const span = cam.maxDay - cam.minDay
    const sx = (d: number) => ((d - cam.minDay) / span) * w
    if (this.miniDirty || this.miniCanvas.width !== Math.round(w * devicePixelRatio)) {
      this.miniDirty = false
      const dpr = devicePixelRatio || 1
      const c = this.miniCanvas
      c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr)
      c.style.width = w + 'px'; c.style.height = hh + 'px'
      const ctx = c.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, hh)
      const style = getComputedStyle(document.documentElement)
      const cols = new Float32Array(Math.ceil(w))
      let max = 1
      for (const [d, c2] of store.dayCounts) {
        const i = Math.floor(sx(d))
        if (i >= 0 && i < cols.length) { cols[i] += c2.posts; max = Math.max(max, cols[i]) }
      }
      ctx.fillStyle = style.getPropertyValue('--bar-published')
      const base = hh - 7
      for (let i = 0; i < cols.length; i++) if (cols[i]) {
        const bh = Math.max(1, (cols[i] / max) * (hh - 14))
        ctx.fillRect(i, base - bh, 1, bh)
      }
      ctx.fillStyle = style.getPropertyValue('--line-strong')
      for (let k = T.monthKey(cam.minDay); T.monthStart(k) < cam.maxDay; k++) {
        const x = sx(T.monthStart(k))
        ctx.fillRect(Math.round(x), base + 2, 1, k % 12 === 0 ? 5 : 2)
      }
      ctx.fillStyle = style.getPropertyValue('--accent')
      ctx.fillRect(Math.round(sx(T.today())), 3, 1.5, hh - 6)
    }
    const x0 = sx(cam.dayAt(0)), x1 = sx(cam.dayAt(cam.vw))
    this.miniWindow.style.transform = `translate3d(${Math.max(0, x0)}px,0,0)`
    this.miniWindow.style.width = `${Math.max(4, Math.min(w, x1) - Math.max(0, x0))}px`
  }

  // Vertical scrollbar --------------------------------------------------------------

  private buildScrollbar() {
    this.vbar.append(this.vthumb)
    let start: { y: number; camY: number } | null = null
    this.vthumb.addEventListener('pointerdown', e => {
      start = { y: e.clientY, camY: this.board.cam.y }
      this.vthumb.setPointerCapture(e.pointerId)
      this.board.cam.stop()
    })
    this.vthumb.addEventListener('pointermove', e => {
      if (!start) return
      const cam = this.board.cam
      const track = this.vbar.clientHeight, th = this.vthumb.clientHeight
      cam.set({ y: start.camY + ((e.clientY - start.y) / Math.max(1, track - th)) * cam.maxY })
    })
    const end = () => { start = null }
    this.vthumb.addEventListener('pointerup', end)
    this.vthumb.addEventListener('pointercancel', end)
    document.body.append(this.vbar)
  }

  // Collaborators directory ------------------------------------------------------------

  private buildDirectory() {
    const search = h('label', 'search')
    search.innerHTML = SVG.search
    const input = h('input')
    input.type = 'search'
    input.placeholder = 'Search handles or names'
    input.autocapitalize = 'off'
    input.spellcheck = false
    input.addEventListener('input', () => { this.dirQuery = input.value.trim().toLowerCase(); this.renderDirectory(true) })
    search.append(input)
    this.directory.body.append(search, this.dirCount, this.dirList)
    this.dirList.addEventListener('focusout', () => setTimeout(() => { if (this.dirStale && !this.dirList.contains(document.activeElement)) this.renderDirectory() }, 0))
  }

  private openDirectory() {
    this.renderDirectory(true)
    this.directory.open()
  }

  private renderDirectory(force = false) {
    if (!this.directory.isOpen && !force) return
    if (!force && this.dirList.contains(document.activeElement)) { this.dirStale = true; return }
    this.dirStale = false
    const q = this.dirQuery.replace(/^@/, '')
    const all = [...store.directory.values()].sort((a, b) => b.posts - a.posts || a.handle.localeCompare(b.handle))
    const rows = q ? all.filter(c => c.handle.includes(q) || c.name.toLowerCase().includes(q)) : all
    this.dirCount.textContent = q
      ? `${rows.length} of ${all.length} collaborators`
      : `${all.length} collaborator${all.length === 1 ? '' : 's'}`
    this.dirList.innerHTML = ''
    if (!all.length) {
      this.dirList.append(h('li', 'empty', 'No collaborators yet. Add a handle to any post and it appears here.'))
      return
    }
    if (!rows.length) {
      this.dirList.append(h('li', 'empty', `No handle or name matches “${this.dirQuery}”.`))
      return
    }
    for (const c of rows) {
      const li = h('li', 'dir-row')
      const name = h('input', 'dir-name')
      name.value = c.name
      name.placeholder = 'Add a name'
      name.maxLength = 80
      name.setAttribute('aria-label', `Name for ${c.handle}`)
      let saved = c.name
      const commit = async () => {
        const v = name.value.trim()
        if (v === saved) return
        try { await store.saveName(c.handle, v); saved = v; flash(li, true) } catch { flash(li, false) }
      }
      name.addEventListener('blur', commit)
      name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); if (e.key === 'Escape') { name.value = saved; name.blur() } })
      const jump = h('button', 'dir-jump')
      jump.type = 'button'
      jump.disabled = !c.posts
      jump.title = c.posts ? 'Show the latest post' : 'Not on any post right now'
      jump.append(h('span', '', `${c.posts} post${c.posts === 1 ? '' : 's'}`))
      if (c.posts) jump.insertAdjacentHTML('beforeend', SVG.chevron)
      jump.addEventListener('click', () => this.jumpToLatest(c.handle, c.latest_at))
      li.append(h('span', 'dir-handle', c.handle), name, jump)
      this.dirList.append(li)
    }
  }

  private jumpToLatest(handle: string, latest: string | null) {
    if (!latest) return
    if (compact.matches) this.directory.close()
    const day = T.zurich(latest).day
    this.board.goTo(day, Math.max(this.board.cam.dw, this.board.presets.day))
    const tryFind = (n: number) => {
      const post = store.postsFor(day).find(p => p.collaborators.includes(handle))
      if (post) this.board.reveal(post.id, day)
      else if (n) setTimeout(() => tryFind(n - 1), 200)
    }
    tryFind(25)
  }

  // Comments ---------------------------------------------------------------------------

  private openComments(id: string) {
    const p = store.post(id)
    if (!p) return
    this.commentsFor = id
    const body = this.comments.body
    body.innerHTML = ''
    body.append(postContext(p), h('ol', 'thread'))
    const form = h('form', 'composer')
    const ta = h('textarea')
    ta.placeholder = 'Write a comment'
    ta.rows = 1
    ta.maxLength = 4000
    ta.setAttribute('aria-label', 'Comment')
    const send = h('button', 'send-btn', 'Send')
    send.type = 'submit'
    send.disabled = true
    const who = h('p', 'composer-who')
    const change = h('button', 'link-btn', 'Change')
    change.type = 'button'
    change.addEventListener('click', () => askName(true).then(() => { who.firstChild!.textContent = `Commenting as ${getName()} `; this.renderName() }))
    who.append(document.createTextNode(`Commenting as ${getName()} `), change)
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; send.disabled = !ta.value.trim() }
    ta.addEventListener('input', grow)
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() } })
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const text = ta.value.trim()
      if (!text) return
      send.disabled = true
      try {
        await store.addComment(id, getName(), text)
        ta.value = ''
        grow()
      } catch {
        flash(form, false, 'Couldn’t send. Try again.')
        send.disabled = false
      }
    })
    form.append(ta, send)
    body.append(form, who)
    this.renderThread()
    this.comments.onClose = () => { this.commentsFor = null }
    this.comments.open()
    if (!compact.matches) ta.focus()
  }

  private renderThread() {
    const p = this.commentsFor ? store.post(this.commentsFor) : null
    const list = this.comments.body.querySelector('.thread')
    if (!p || !list) return
    list.innerHTML = ''
    if (!p.comments.length) list.append(h('li', 'empty', 'No comments yet. Start the thread.'))
    for (const c of p.comments) {
      const li = h('li', 'comment')
      const head = h('div', 'comment-head')
      const time = h('time', '', T.commentTime(c.created_at))
      time.dateTime = c.created_at
      head.append(h('strong', '', c.author), time)
      li.append(head, h('p', 'comment-body', c.body))
      list.append(li)
    }
    list.scrollTop = list.scrollHeight
  }

  // Edit sheet for phones -----------------------------------------------------------

  private openEditor(id: string) {
    const p = store.post(id)
    if (!p) return
    const body = this.editor.body
    body.innerHTML = ''
    const capWrap = h('div', 'field')
    capWrap.append(h('span', 'field-label', 'Caption'), captionField(p, capWrap))
    const collabWrap = h('div', 'field')
    const ed = collabEditor(() => store.post(id) ?? null, undefined, true)
    ed.update()
    const off = store.on(c => { if (c.kind === 'posts' || c.kind === 'directory') ed.update() })
    collabWrap.append(h('span', 'field-label', 'Collaborators'), ed.el)
    const done = h('button', 'primary-btn', 'Done')
    done.type = 'button'
    done.addEventListener('click', () => this.editor.close())
    body.append(postContext(p), capWrap, collabWrap, done)
    this.editor.onClose = () => off()
    this.editor.open()
    requestAnimationFrame(() => body.querySelector<HTMLTextAreaElement>('textarea')?.dispatchEvent(new Event('input')))
  }
}

// Name prompt and locked screen ------------------------------------------------------------

export function askName(changing = false): Promise<string> {
  return new Promise(resolve => {
    const wrap = h('div', 'modal')
    const card = h('form', 'modal-card glass')
    const input = h('input', 'modal-input')
    input.value = getName()
    input.maxLength = 60
    input.autocomplete = 'name'
    input.placeholder = 'Your name'
    input.setAttribute('aria-label', 'Your name')
    const go = h('button', 'primary-btn', changing ? 'Save name' : 'Continue')
    go.type = 'submit'
    go.disabled = !input.value.trim()
    input.addEventListener('input', () => { go.disabled = !input.value.trim() })
    card.append(
      h('h1', 'modal-title', changing ? 'Change your name' : 'What’s your name?'),
      h('p', 'modal-text', 'It appears next to your comments. This browser remembers it.'),
      input, go,
    )
    if (changing) {
      const cancel = h('button', 'link-btn', 'Cancel')
      cancel.type = 'button'
      cancel.addEventListener('click', () => { wrap.remove(); resolve(getName()) })
      card.append(cancel)
    }
    card.addEventListener('submit', e => {
      e.preventDefault()
      const n = input.value.trim()
      if (!n) return
      setName(n)
      wrap.classList.add('is-leaving')
      setTimeout(() => wrap.remove(), 200)
      resolve(n)
    })
    wrap.append(card)
    document.body.append(wrap)
    requestAnimationFrame(() => input.focus())
  })
}

export function locked(kind: 'missing' | 'invalid' | 'error') {
  const wrap = h('div', 'modal is-locked')
  const card = h('div', 'modal-card glass')
  const copy = {
    missing: ['This board opens from its private link', 'Open the full link you were sent. It ends with a long code after the # sign.'],
    invalid: ['This link no longer opens the board', 'The board link has changed. Ask for the current one.'],
    error: ['The board can’t be reached right now', 'Check your connection, then reload the page.'],
  }[kind]
  card.append(h('h1', 'modal-title', copy[0]), h('p', 'modal-text', copy[1]))
  wrap.append(card)
  document.body.append(wrap)
}
