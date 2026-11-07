// Calendar math in Zurich time. A "day" is an integer: days since 1970-01-01
// for the Zurich calendar date. Columns, stacks and labels all use it.

export const TZ = 'Europe/Zurich'
const DAY_MS = 86_400_000

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
})

/** Zurich calendar day and minute-of-day for an instant. */
export function zurich(ts: string | number | Date): { day: number; minutes: number } {
  const p: Record<string, number> = {}
  for (const { type, value } of partsFmt.formatToParts(new Date(ts))) p[type] = +value
  return { day: Date.UTC(p.year, p.month - 1, p.day) / DAY_MS, minutes: p.hour * 60 + p.minute }
}

export const today = () => zurich(Date.now()).day
export const dayDate = (day: number) => new Date(day * DAY_MS)
export const dayOf = (y: number, m0: number, d: number) => Date.UTC(y, m0, d) / DAY_MS
export const ymd = (day: number) => {
  const d = dayDate(day)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7 }
}
export const isoDate = (day: number) => dayDate(day).toISOString().slice(0, 10)
export const parseIsoDate = (s: string) => Math.round(Date.parse(s + 'T00:00:00Z') / DAY_MS)

/** Month key: months since January 1970. */
export const monthKey = (day: number) => { const { y, m } = ymd(day); return y * 12 + m }
export const monthStart = (key: number) => dayOf(Math.floor(key / 12), key % 12, 1)

/** UTC range that safely covers a Zurich month (overlap is deduplicated by id). */
export function monthRange(key: number): [string, string] {
  const y = Math.floor(key / 12), m = key % 12
  return [new Date(Date.UTC(y, m, 1) - 3 * 3600_000).toISOString(), new Date(Date.UTC(y, m + 1, 1)).toISOString()]
}

export function isoWeek(day: number): number {
  const wd = ymd(day).wd
  const thursday = day - wd + 3
  const jan1 = dayOf(ymd(thursday).y, 0, 1)
  return Math.floor((thursday - jan1) / 7) + 1
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o })
const F = {
  month: fmt({ month: 'long' }),
  monthShort: fmt({ month: 'short' }),
  wdShort: fmt({ weekday: 'short' }),
  wdLong: fmt({ weekday: 'long' }),
  dayMonth: fmt({ day: 'numeric', month: 'short' }),
  long: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
}
export const monthName = (day: number) => F.month.format(dayDate(day))
export const monthShort = (day: number) => F.monthShort.format(dayDate(day)).replace('Sept', 'Sep')
export const weekdayShort = (day: number) => F.wdShort.format(dayDate(day))
export const weekdayLong = (day: number) => F.wdLong.format(dayDate(day))
export const dayMonth = (day: number) => F.dayMonth.format(dayDate(day)).replace('Sept', 'Sep')
export const longDate = (day: number) => F.long.format(dayDate(day))
export const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const commentFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** "just now", "12 minutes ago", then "4 Nov, 18:30". */
export function commentTime(ts: string): string {
  const s = (Date.now() - Date.parse(ts)) / 1000
  if (s < 45) return 'just now'
  if (s < 3600) return rel.format(-Math.round(s / 60), 'minute')
  if (s < 6 * 3600) return rel.format(-Math.round(s / 3600), 'hour')
  return commentFmt.format(new Date(ts))
}
