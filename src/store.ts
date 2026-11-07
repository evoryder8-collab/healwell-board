// Data: reads rows by date range, keeps them per Zurich day, applies realtime
// changes, and saves the two editable fields plus comments.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { monthKey, monthRange, monthStart, zurich } from './time'

export type PostType = 'reel' | 'carousel' | 'image' | 'story'
export interface Comment { id: string; post_id: string; author: string; body: string; created_at: string }
export interface Post {
  id: string; external_id: string; platform: string; type: PostType
  scheduled_at: string; published: boolean; media_url: string | null
  caption: string; collaborators: string[]; updated_at: string
  comments: Comment[]
  day: number; minutes: number
}
export interface Collaborator { handle: string; name: string; posts: number; latest_at: string | null }
export type Change =
  | { kind: 'days' }
  | { kind: 'posts'; days: number[] }
  | { kind: 'directory' }
  | { kind: 'comments'; postId: string }

/** "@Some Handle " -> "@somehandle", or '' when nothing valid is left. */
export function normalizeHandle(raw: string): string {
  const h = raw.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30)
  return h ? '@' + h : ''
}

const PAGE = 1000

/** Exchanges the shared username and password for the board token (null if wrong). */
export async function signIn(url: string, key: string, username: string, password: string): Promise<string | null> {
  const r = await fetch(`${url}/rest/v1/rpc/board_login`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await r.json().catch(() => null)
  if (!r.ok) throw Object.assign(new Error(body?.message ?? 'Sign-in failed'), { locked: body?.hint === 'locked' })
  return body
}

class Store {
  db!: SupabaseClient
  dayCounts = new Map<number, { posts: number; scheduled: number }>()
  firstDay: number | null = null
  lastDay: number | null = null
  directory = new Map<string, Collaborator>()
  private byDay = new Map<number, Post[]>()
  private byId = new Map<string, Post>()
  private months = new Map<number, 'loading' | 'loaded'>()
  private queue: number[] = []
  private inflight = 0
  private listeners = new Set<(c: Change) => void>()
  private timers: Record<string, number> = {}

  async connect(url: string, key: string, token: string): Promise<boolean> {
    this.db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-board-token': token } },
    })
    const { data, error } = await this.db.rpc('board_ok')
    if (error) throw error
    if (!data) return false
    await Promise.all([this.loadDays(), this.loadDirectory()])
    this.subscribe(await sha256(token))
    return true
  }

  on(fn: (c: Change) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  private emit(c: Change) { for (const fn of this.listeners) fn(c) }
  private later(key: string, ms: number, fn: () => void) {
    clearTimeout(this.timers[key]); this.timers[key] = window.setTimeout(fn, ms)
  }

  // Reads --------------------------------------------------------------------

  private async all<T>(view: string, columns: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db.from(view).select(columns).range(from, from + PAGE - 1)
      if (error) throw error
      out.push(...(data as T[]))
      if (data.length < PAGE) return out
    }
  }

  async loadDays() {
    const rows = await this.all<{ day: string; posts: number; scheduled: number }>('post_days', 'day,posts,scheduled')
    this.dayCounts.clear()
    let lo = Infinity, hi = -Infinity
    for (const r of rows) {
      const d = Math.round(Date.parse(r.day + 'T00:00:00Z') / 86_400_000)
      this.dayCounts.set(d, { posts: r.posts, scheduled: r.scheduled })
      lo = Math.min(lo, d); hi = Math.max(hi, d)
    }
    this.firstDay = rows.length ? lo : null
    this.lastDay = rows.length ? hi : null
    this.emit({ kind: 'days' })
  }

  async loadDirectory() {
    const rows = await this.all<Collaborator>('collaborator_stats', 'handle,name,posts,latest_at')
    this.directory = new Map(rows.map(r => [r.handle, r]))
    this.emit({ kind: 'directory' })
  }

  isLoaded(day: number) { return this.months.get(monthKey(day)) === 'loaded' }
  postsFor(day: number): Post[] { return this.byDay.get(day) ?? [] }
  post(id: string) { return this.byId.get(id) }
  countFor(day: number) { return this.isLoaded(day) ? this.postsFor(day).length : this.dayCounts.get(day)?.posts ?? 0 }

  /** Ask for the months covering a day range; nearest months load first. */
  want(fromDay: number, toDay: number, centerDay: number) {
    const keys: number[] = []
    for (let k = monthKey(fromDay); k <= monthKey(toDay); k++) if (!this.months.has(k)) keys.push(k)
    if (!keys.length) return
    const c = monthKey(centerDay)
    this.queue = [...new Set([...keys.sort((a, b) => Math.abs(a - c) - Math.abs(b - c)), ...this.queue])].slice(0, 8)
    this.pump()
  }

  private pump() {
    while (this.inflight < 3 && this.queue.length) {
      const key = this.queue.shift()!
      if (this.months.has(key)) continue
      this.months.set(key, 'loading')
      this.inflight++
      this.fetchMonth(key)
        .then(() => this.months.set(key, 'loaded'))
        .catch(err => { console.warn('month load failed', key, err); this.months.delete(key) })
        .finally(() => {
          this.inflight--
          const start = monthStart(key), days: number[] = []
          for (let d = start; monthKey(d) === key; d++) days.push(d)
          this.emit({ kind: 'posts', days })
          this.pump()
        })
    }
  }

  private async fetchMonth(key: number) {
    const [from, to] = monthRange(key)
    const { data, error } = await this.db.from('posts')
      .select('*, comments(id,post_id,author,body,created_at)')
      .gte('scheduled_at', from).lt('scheduled_at', to)
      .order('scheduled_at').order('created_at', { referencedTable: 'comments' })
      .limit(PAGE)
    if (error) throw error
    for (const row of data) this.upsert(row as Post)
  }

  /** Insert or replace a row; returns the days whose stacks changed. */
  private upsert(row: Omit<Post, 'day' | 'minutes' | 'comments'> & { comments?: Comment[] }): number[] {
    const prev = this.byId.get(row.id)
    const { day, minutes } = zurich(row.scheduled_at)
    const post: Post = { ...row, comments: row.comments ?? prev?.comments ?? [], day, minutes } as Post
    const days = [day]
    if (prev && prev.day !== day) { this.detach(prev); days.push(prev.day) }
    const list = this.byDay.get(day) ?? []
    const i = list.findIndex(p => p.id === row.id)
    if (i >= 0) list[i] = post; else list.push(post)
    list.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.external_id.localeCompare(b.external_id))
    this.byDay.set(day, list)
    this.byId.set(row.id, post)
    return days
  }

  private detach(p: Post) {
    const list = this.byDay.get(p.day)
    if (list) this.byDay.set(p.day, list.filter(x => x.id !== p.id))
  }

  // Writes -------------------------------------------------------------------

  async saveCaption(id: string, caption: string) {
    const { data, error } = await this.db.from('posts').update({ caption }).eq('id', id).select().single()
    if (error) throw error
    this.emit({ kind: 'posts', days: this.upsert(data) })
  }

  async saveCollaborators(id: string, handles: string[]) {
    const clean = [...new Set(handles.map(normalizeHandle).filter(Boolean))]
    const { data, error } = await this.db.from('posts').update({ collaborators: clean }).eq('id', id).select().single()
    if (error) throw error
    for (const h of clean) if (!this.directory.has(h)) this.directory.set(h, { handle: h, name: '', posts: 1, latest_at: data.scheduled_at })
    this.emit({ kind: 'posts', days: this.upsert(data) })
    this.emit({ kind: 'directory' })
    this.later('dir', 600, () => this.loadDirectory())
  }

  async saveName(handle: string, name: string) {
    const { error } = await this.db.from('collaborators').update({ name: name.trim() }).eq('handle', handle)
    if (error) throw error
    const entry = this.directory.get(handle)
    if (entry) entry.name = name.trim()
    this.emit({ kind: 'directory' })
  }

  async addComment(postId: string, author: string, body: string) {
    const { data, error } = await this.db.from('comments').insert({ post_id: postId, author, body }).select().single()
    if (error) throw error
    this.addCommentLocal(data)
  }

  private addCommentLocal(c: Comment) {
    const p = this.byId.get(c.post_id)
    if (!p || p.comments.some(x => x.id === c.id)) return
    p.comments = [...p.comments, c].sort((a, b) => a.created_at.localeCompare(b.created_at))
    this.emit({ kind: 'comments', postId: c.post_id })
    this.emit({ kind: 'posts', days: [p.day] })
  }

  // Realtime -----------------------------------------------------------------

  private subscribe(hash: string) {
    this.db.channel('board:' + hash)
      .on('broadcast', { event: 'change' }, ({ payload }) => this.apply(payload))
      .subscribe()
  }

  private apply({ table, op, row }: { table: string; op: string; row: any }) {
    if (table === 'posts') {
      if (op === 'DELETE') {
        const prev = this.byId.get(row.id)
        if (prev) { this.detach(prev); this.byId.delete(row.id); this.emit({ kind: 'posts', days: [prev.day] }) }
      } else if (this.byId.has(row.id) || this.isLoaded(zurich(row.scheduled_at).day)) {
        this.emit({ kind: 'posts', days: this.upsert(row) })
      }
      this.later('days', 400, () => this.loadDays())
      this.later('dir', 800, () => this.loadDirectory())
    } else if (table === 'collaborators') {
      const prev = this.directory.get(row.handle)
      if (op === 'DELETE') this.directory.delete(row.handle)
      else this.directory.set(row.handle, { handle: row.handle, name: row.name, posts: prev?.posts ?? 0, latest_at: prev?.latest_at ?? null })
      this.emit({ kind: 'directory' })
      if (!prev) this.later('dir', 800, () => this.loadDirectory())
    } else if (table === 'comments' && op === 'INSERT') {
      this.addCommentLocal(row)
    }
  }
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const store = new Store()
