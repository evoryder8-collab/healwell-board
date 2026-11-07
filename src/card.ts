// Cards at each level of detail, plus the caption and collaborator editors.
import { byNetworkOrder, networkInfo, networkKey } from './networks'
import { normalizeHandle, store, type Channel, type Post } from './store'
import { clock, longDate, weekdayShort, dayMonth } from './time'

export type Lod = 'year' | 'month' | 'week' | 'day'

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text) el.textContent = text
  return el
}

const TYPE_LABEL: Record<Post['type'], string> = { reel: 'Reel', carousel: 'Carousel', image: 'Image', story: 'Story' }
const PLAY_BIG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 10v80a7 7 0 0 0 10.6 6l66-40a7 7 0 0 0 0-12l-66-40A7 7 0 0 0 14 10Z"/></svg>'
export const ICON = {
  comment: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.6 2.7a.5.5 0 0 1-.8-.4V14.5H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
}

/** Thumbnail URL. Month view asks for the small variant when the agent provided one. */
export function thumb(url: string, small: boolean) {
  return small ? url.replace(/\.webp(\?|$)/, '.sm.webp$1') : url
}

export const compact = matchMedia('(max-width: 720px), (pointer: coarse)')

export interface Card { el: HTMLElement; postId: string | null; update(p: Post | null): void }
export interface CardHooks {
  openComments(id: string): void
  openEditor(id: string): void
  hoverDay?(day: number | null, x: number, y: number): void
}

/** A card shell that starts as a skeleton and fills in when its post arrives. */
export function makeCard(lod: Exclude<Lod, 'year'>, hooks: CardHooks): Card {
  const el = h('article', `card lod-${lod} is-skeleton`)
  const media = h('div', 'media')
  const img = h('img')
  img.decoding = 'async'
  img.draggable = false
  img.alt = ''
  img.addEventListener('load', () => media.classList.add('ok'))
  img.addEventListener('error', () => {
    const full = img.dataset.full
    if (full && img.src !== full) img.src = full
  })
  media.append(img)
  el.append(media)

  let meta: HTMLElement | null = null, line: HTMLElement | null = null
  let detail: ReturnType<typeof dayDetail> | null = null
  if (lod === 'week' || lod === 'day') {
    meta = h('div', 'meta')
    el.append(meta)
  }
  if (lod === 'week') { line = h('p', 'line'); el.append(line) }
  if (lod === 'day') { detail = dayDetail(hooks); el.append(detail.el) }

  let key = ''
  const card: Card = {
    el, postId: null,
    update(p) {
      const k = p ? `${p.id}|${p.updated_at}|${p.comments.length}|${dirVersion}` : 'skeleton'
      if (k === key) return
      key = k
      card.postId = p?.id ?? null
      el.classList.toggle('is-skeleton', !p)
      if (!p) {
        delete el.dataset.post
        el.removeAttribute('tabindex')
        img.removeAttribute('src')
        media.classList.remove('ok')
        return
      }
      el.dataset.post = p.id
      el.tabIndex = lod === 'day' ? -1 : 0
      el.setAttribute('aria-label', `${TYPE_LABEL[p.type]}, ${longDate(p.day)} ${clock(p.minutes)}, ${p.published ? 'published' : 'scheduled'}`)
      media.className = `media type-${p.type}${p.published ? '' : ' is-scheduled'}${media.classList.contains('ok') ? ' ok' : ''}`
      if (p.media_url) {
        const src = thumb(p.media_url, lod === 'month')
        img.dataset.full = p.media_url
        if (img.getAttribute('src') !== src) {
          media.classList.remove('ok')
          img.src = src
          if (img.complete && img.naturalWidth) media.classList.add('ok')
        }
      } else img.removeAttribute('src')
      media.classList.toggle('is-blank', !p.media_url)
      decorate(media, p, lod)
      if (meta) {
        meta.innerHTML = ''
        meta.append(h('time', 'time', clock(p.minutes)), h('span', 'date', `${weekdayShort(p.day)} ${dayMonth(p.day)}`),
          h('span', `state ${p.published ? 'is-published' : 'is-scheduled'}`, p.published ? 'Published' : 'Scheduled'))
      }
      if (line) {
        line.textContent = p.caption.split('\n').find(s => s.trim()) ?? ''
        line.classList.toggle('is-empty', !p.caption.trim())
        if (!p.caption.trim()) line.textContent = 'No caption yet'
      }
      detail?.update(p)
    },
  }
  return card
}

const channelsOf = (p: Post): Channel[] => [...(p.channels ?? [])].sort(byNetworkOrder)
const statusOf = (c: Channel) => (c.status ?? 'published').toLowerCase()
/** The original post on Instagram, if the agent recorded one. */
export const instagramUrl = (p: Post) => p.channels?.find(c => networkKey(c.network) === 'instagram' && c.url)?.url ?? null

let playing: HTMLVideoElement | null = null

/** Plays the reel inside the card, or opens the original post when no file is playable. */
function play(media: HTMLElement, p: Post) {
  const original = instagramUrl(p)
  if (!p.video_url) { if (original) open(original, '_blank', 'noopener'); return }
  playing?.pause()
  const v = h('video', 'player no-pan')
  v.src = p.video_url
  v.controls = true
  v.playsInline = true
  v.poster = p.media_url ?? ''
  v.addEventListener('error', () => { v.remove(); media.classList.remove('is-playing'); if (original) open(original, '_blank', 'noopener') }, { once: true })
  media.append(v)
  media.classList.add('is-playing')
  media.dataset.playing = p.id
  playing = v
  v.play().catch(() => { /* controls stay visible; a tap starts it */ })
}

function decorate(media: HTMLElement, p: Post, lod: Exclude<Lod, 'year'>) {
  if (media.dataset.playing && media.dataset.playing !== p.id) {
    media.querySelector('video')?.remove()
    media.classList.remove('is-playing')
    delete media.dataset.playing
  }
  media.querySelectorAll(':scope > .play-big, :scope > .dots, :scope > .nets').forEach(n => n.remove())
  const actionable = lod !== 'month' && (!!p.video_url || !!instagramUrl(p))
  if (p.type === 'reel' || p.video_url) {
    // A large see-through triangle in the middle of every video, at every zoom level.
    const b = h(actionable ? 'button' : 'span', 'play-big')
    b.innerHTML = PLAY_BIG
    if (b instanceof HTMLButtonElement) {
      b.type = 'button'
      b.setAttribute('aria-label', p.video_url ? 'Play video' : 'Open the reel on Instagram')
      b.title = p.video_url ? 'Play' : 'Open on Instagram'
      b.addEventListener('click', e => { e.stopPropagation(); play(media, p) })
    }
    media.append(b)
  } else if (p.type === 'carousel') {
    const d = h('span', 'dots'); d.innerHTML = '<i></i><i></i><i></i><i></i>'; media.append(d)
  }
  const chans = channelsOf(p)
  if (lod === 'week' && chans.length) {
    const nets = h('span', 'nets')
    nets.setAttribute('aria-label', 'Posted to ' + chans.map(c => networkInfo(c.network).label).join(', '))
    for (const c of chans.slice(0, 6)) {
      const i = h('span', `net net-${networkKey(c.network)} is-${statusOf(c)}`)
      i.innerHTML = networkInfo(c.network).icon
      nets.append(i)
    }
    if (chans.length > 6) nets.append(h('span', 'net-more', `+${chans.length - 6}`))
    media.append(nets)
  }
}

/** Day view: one chip per network, linking to the post there. */
function channelRow(p: Post): HTMLElement | null {
  const chans = channelsOf(p)
  if (!chans.length) return null
  const row = h('div', 'channels')
  for (const c of chans) {
    const info = networkInfo(c.network)
    const status = statusOf(c)
    const cls = `channel net-${networkKey(c.network)} is-${status}`
    const chip = c.url ? h('a', cls) : h('span', cls)
    if (chip instanceof HTMLAnchorElement) { chip.href = c.url!; chip.target = '_blank'; chip.rel = 'noopener' }
    chip.title = c.url ? `Open on ${info.label}` : `${info.label}, ${status}`
    chip.innerHTML = info.icon
    chip.append(h('span', '', info.label))
    if (status !== 'published') chip.append(h('span', 'channel-status', status))
    row.append(chip)
  }
  return row
}

// Day detail: caption, collaborators, comments --------------------------------

let dirVersion = 0
store.on(c => { if (c.kind === 'directory') dirVersion++ })

function dayDetail(hooks: CardHooks) {
  const el = h('div', 'detail')
  let post: Post | null = null
  const caption = captionInline(() => post, id => hooks.openEditor(id))
  const collabs = collabEditor(() => post, id => hooks.openEditor(id))
  const talk = h('button', 'talk')
  talk.type = 'button'
  talk.addEventListener('click', () => post && hooks.openComments(post.id))
  let chans: HTMLElement | null = null
  el.append(caption.el, collabs.el, talk)
  return {
    el,
    update(p: Post) {
      post = p
      chans?.remove()
      chans = channelRow(p)
      if (chans) el.prepend(chans)
      caption.update()
      collabs.update()
      const n = p.comments.length
      const last = p.comments[n - 1]
      talk.innerHTML = ICON.comment
      talk.append(h('span', 'talk-count', n ? `${n} comment${n === 1 ? '' : 's'}` : 'Comment'))
      if (last) {
        const preview = h('span', 'talk-last')
        preview.append(h('b', '', last.author), document.createTextNode(' ' + last.body))
        talk.append(preview)
      }
    },
  }
}

/** Shows a small confirmation next to a field. */
export function flash(host: HTMLElement, ok: boolean, text = ok ? 'Saved' : 'Couldn’t save. Try again.') {
  let tag = host.querySelector<HTMLElement>(':scope > .flash')
  if (!tag) { tag = h('span', 'flash'); host.append(tag) }
  tag.className = `flash ${ok ? 'is-ok' : 'is-error'} is-on`
  tag.innerHTML = ok ? ICON.check : ''
  tag.append(text)
  clearTimeout(Number(tag.dataset.t))
  if (ok) tag.dataset.t = String(setTimeout(() => tag!.classList.remove('is-on'), 1600))
}

/** Caption shown as text; becomes a textarea on click. Saves on blur. */
function captionInline(get: () => Post | null, openEditor: (id: string) => void) {
  const el = h('div', 'caption-wrap')
  const view = h('div', 'caption')
  view.tabIndex = 0
  view.setAttribute('role', 'button')
  el.append(view)
  let editing: HTMLTextAreaElement | null = null

  const start = () => {
    const p = get()
    if (!p || editing) return
    if (compact.matches) return openEditor(p.id)
    const ta = captionField(p, el)
    ta.style.height = view.offsetHeight + 'px'
    view.replaceWith(ta)
    editing = ta
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
    ta.addEventListener('blur', () => { ta.replaceWith(view); editing = null; render() }, { once: true })
  }
  view.addEventListener('click', start)
  view.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); start() } })

  const render = () => {
    const p = get()
    if (!p) return
    view.textContent = p.caption || 'Add a caption'
    view.classList.toggle('is-empty', !p.caption)
  }
  return { el, update: () => { if (!editing) render() } }
}

/** Auto-growing caption textarea that saves when it loses focus. */
export function captionField(p: Post, flashHost: HTMLElement): HTMLTextAreaElement {
  const ta = h('textarea', 'caption-field')
  ta.value = p.caption
  ta.maxLength = 2200
  ta.placeholder = 'Add a caption'
  ta.setAttribute('aria-label', 'Caption')
  const counter = h('span', 'counter')
  const grow = () => {
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
    const n = ta.value.length
    counter.textContent = n > 2000 ? `${n.toLocaleString('en-GB')} / 2,200` : ''
    if (counter.textContent && !counter.isConnected) flashHost.append(counter)
  }
  let original = p.caption
  ta.addEventListener('input', grow)
  ta.addEventListener('focus', () => requestAnimationFrame(grow))
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { ta.value = original; ta.blur() }
  })
  ta.addEventListener('blur', async () => {
    counter.remove()
    const value = ta.value
    if (value === original) return
    try {
      await store.saveCaption(p.id, value)
      original = value
      flash(flashHost, true)
    } catch {
      flash(flashHost, false)
    }
  })
  return ta
}

/** Collaborator chips with autocomplete from the directory. */
export function collabEditor(get: () => Post | null, openEditor?: (id: string) => void, inSheet = false) {
  const el = h('div', 'collabs')
  const list = h('div', 'chips')
  const add = h('button', 'chip-add')
  add.type = 'button'
  add.innerHTML = ICON.plus + '<span>Collaborator</span>'
  el.append(list, add)

  let input: HTMLInputElement | null = null
  let menu: HTMLElement | null = null
  let options: string[] = []
  let active = 0

  const save = async (handles: string[]) => {
    const p = get()
    if (!p) return
    try { await store.saveCollaborators(p.id, handles); flash(el, true) } catch { flash(el, false) }
  }

  const render = () => {
    const p = get()
    list.innerHTML = ''
    for (const handle of p?.collaborators ?? []) {
      const chip = h('span', 'chip')
      chip.append(h('span', 'chip-handle', handle))
      const name = store.directory.get(handle)?.name
      if (name) chip.append(h('span', 'chip-name', name))
      const x = h('button', 'chip-x')
      x.type = 'button'
      x.innerHTML = ICON.close
      x.setAttribute('aria-label', `Remove ${handle}`)
      x.addEventListener('click', () => save(p!.collaborators.filter(c => c !== handle)))
      chip.append(x)
      list.append(chip)
    }
  }

  const close = () => { input?.remove(); menu?.remove(); input = menu = null; add.hidden = false }

  const suggest = () => {
    if (!input || !menu) return
    const q = input.value.trim().toLowerCase().replace(/^@/, '')
    const taken = new Set(get()?.collaborators ?? [])
    const typed = normalizeHandle(input.value)
    const matches = [...store.directory.values()]
      .filter(c => !taken.has(c.handle) && (!q || c.handle.includes(q) || c.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.handle.startsWith('@' + q)) - Number(a.handle.startsWith('@' + q)) || b.posts - a.posts)
      .slice(0, 6)
    options = matches.map(m => m.handle)
    if (typed && !taken.has(typed) && !options.includes(typed)) options.push(typed)
    active = Math.min(active, Math.max(0, options.length - 1))
    menu.innerHTML = ''
    menu.hidden = !options.length
    options.forEach((handle, i) => {
      const o = h('button', 'option' + (i === active ? ' is-active' : ''))
      o.type = 'button'
      o.setAttribute('role', 'option')
      const entry = store.directory.get(handle)
      o.append(h('span', 'option-handle', entry ? handle : `Add ${handle}`))
      if (entry?.name) o.append(h('span', 'option-name', entry.name))
      if (entry) o.append(h('span', 'option-count', String(entry.posts)))
      o.addEventListener('pointerdown', e => e.preventDefault())
      o.addEventListener('click', () => pick(handle))
      menu!.append(o)
    })
  }

  const pick = (handle: string) => {
    const p = get()
    if (!p || !handle) return
    if (!p.collaborators.includes(handle)) save([...p.collaborators, handle])
    if (input) { input.value = ''; active = 0; suggest() }
  }

  add.addEventListener('click', () => {
    const p = get()
    if (!p) return
    if (compact.matches && !inSheet && openEditor) return openEditor(p.id)
    add.hidden = true
    input = h('input', 'chip-input')
    input.placeholder = '@handle'
    input.autocapitalize = 'off'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('aria-label', 'Add collaborator')
    menu = h('div', 'suggest no-pan')
    menu.setAttribute('role', 'listbox')
    el.append(input, menu)
    input.focus()
    suggest()
    input.addEventListener('input', () => { active = 0; suggest() })
    input.addEventListener('blur', () => setTimeout(close, 120))
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(1, options.length)
        suggest()
      } else if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && input!.value)) {
        e.preventDefault()
        pick(options[active] ?? normalizeHandle(input!.value))
      } else if (e.key === 'Backspace' && !input!.value) {
        const p = get()
        if (p?.collaborators.length) save(p.collaborators.slice(0, -1))
      } else if (e.key === 'Escape') {
        input!.blur()
      }
    })
  })

  return { el, update: () => render() }
}
