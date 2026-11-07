// Seeds the board with ~1,050 realistic posts across 14 months (70–80 a month),
// ~40 collaborators and a few comment threads. Thumbnails are drawn here and
// uploaded to Storage as small WebP files: <uuid>.webp (640 px) and <uuid>.sm.webp (160 px).
//
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run seed
//
// Safe to re-run: posts are upserted on external_id, and the database keeps
// captions, collaborators and names that were edited on the board.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

// Environment --------------------------------------------------------------------
for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const DIR = '.seed'
mkdirSync(DIR, { recursive: true })

// Deterministic randomness so re-runs produce the same board -------------------
let s = 20261107
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = arr => arr[Math.floor(rnd() * arr.length)]
const chance = p => rnd() < p
const weighted = (items, weights) => { let r = rnd() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) if ((r -= weights[i]) < 0) return items[i]; return items.at(-1) }

// Content ------------------------------------------------------------------------
const COLLABORATORS = [
  ['@1iconstantine', 'Constantin Barbu'], ['@chutima.nuad', 'Chutima Srisuk'], ['@wimhofmethod', 'Wim Hof Method'],
  ['@lena.moves.zh', 'Lena Keller'], ['@studio.limmat', 'Studio Limmat'], ['@karin.breathwork', 'Karin Vogt'],
  ['@ggmc.official', 'GGMC'], ['@swissnuadthai', 'Swiss Nuad Thai Association'], ['@antonio.bodywork', 'Antonio Russo'],
  ['@zurich.wellness.club', ''], ['@june.lixuan', 'June Li Xuan'], ['@al.poliarco', 'Al Poliarco'],
  ['@thefasciaroom', ''], ['@sarah.somatic', 'Sarah Brunner'], ['@kaltbad.zurich', 'Kaltbad Zürich'],
  ['@europeanmassagecup', 'European Massage Championship'], ['@yoga.seefeld', 'Yoga Seefeld'], ['@mira.sound', 'Mira Haas'],
  ['@physio.oerlikon', ''], ['@nadine.nutrition', 'Nadine Frei'], ['@coldwater.collective', ''],
  ['@tpin.roller', 'T-Pin Body Roller'], ['@ausmc.official', 'Australian Massage Championship'], ['@daniel.coach.zh', 'Daniel Meier'],
  ['@rooftop.retreats', ''], ['@zekisworld', 'Zeki'], ['@helena.photo.ch', 'Helena Graf'], ['@matcha.and.mind', ''],
  ['@pilates.wiedikon', 'Pilates Wiedikon'], ['@lukas.runs', 'Lukas Steiner'], ['@thai.temple.bkk', ''],
  ['@anna.osteo', 'Anna Weber'], ['@mindful.mornings.ch', ''], ['@sauna.seebad', 'Seebad Enge'],
  ['@vault.zurich', 'Vault Zürich'], ['@reto.films', 'Reto Schmid'], ['@ilaria.dance', ''],
  ['@breath.lab.basel', 'Breath Lab Basel'], ['@tobias.acupuncture', 'Tobias Huber'], ['@krabi.retreat', ''],
]
const HANDLE_WEIGHTS = COLLABORATORS.map((_, i) => 1 / Math.pow(i + 1, 0.9))

const HOOKS = [
  'Your shoulders are not earrings.', 'Tension is a story your body is still telling.', 'Slow is a speed too.',
  'Rest is not a reward. It is a requirement.', 'Let the exhale be longer than the inhale.', 'Soft belly, steady mind.',
  'Three minutes. One breath pattern. A calmer afternoon.', 'What your jaw is holding on to.',
  'The Transformation Therapy Method, explained in 60 seconds.', 'A client asked me why she cries on the table.',
  'Stress lives in the body before it reaches the mind.', 'Behind the scenes at the Swiss Nuad Thai Championship.',
  'Judging a championship taught me this about touch.', 'Sunday reset by the lake.', 'Your nervous system loves rhythm.',
  'When was the last time you felt your feet?', 'Five signs your body is asking for a pause.',
  'Healing is not linear. Neither is a Zurich tram line.', 'This is what 20 years of bodywork looks like.',
  'Before and after one session.', 'The pause between two breaths is where change begins.',
  'Cold water, warm heart.', 'You do not need to earn your rest.', 'One question I ask every new client.',
  'Hips hold more than you think.', 'Workshop recap: 24 people, one long exhale.', 'Grounding, the simple version.',
  'Why I start every session with silence.', 'A Thai stretch you can do at your desk.', 'Your posture is a habit, not a verdict.',
]
const BODIES = [
  'Most of us carry the day in our upper back. Notice it, breathe into it, and give it permission to soften.',
  'In my practice I work with the body first. The mind follows when it feels safe enough to let go.',
  'Try this tonight: lie down, place one hand on your chest and one on your belly, and let the lower hand rise first.',
  'Transformation Therapy is not about fixing you. It is about remembering how it feels to be at home in your body.',
  'This week I worked with a runner, a CEO and a new mother. Different stories, the same tight diaphragm.',
  'Nuad Thai taught me patience. Pressure is only helpful when the body is ready to receive it.',
  'Every session starts with a conversation and ends with a breath. Everything in between is listening.',
  'Small, repeated signals of safety change more than one big breakthrough.',
  'Movement does not have to be intense to be meaningful. Gentle counts.',
  'If you sit for most of the day, your hip flexors are working overtime. Here is how to give them a break.',
  'We spent the morning by the lake: breathwork, cold water and a lot of laughter.',
  'Swipe through for the full sequence. Save it for the evening you need it.',
  'Clients often notice the change a day later. The body integrates in its own time.',
  'Competing in Bangkok reminded me why I started: to help people feel lighter.',
  'Your breath is the only part of the nervous system you can steer directly. Use it.',
]
const CTAS = [
  'New appointments for December are open. Link in bio.', 'Save this for later.', 'Send this to someone who needs a pause.',
  'Questions? Ask me in the comments.', 'Workshop places are limited. Details in bio.', 'Book a session in Zurich via the link in bio.',
  'Tell me how it felt.', '',
]
const GERMAN = [
  'Atmen. Loslassen. Ankommen.\n\nNeue Termine im Dezember sind offen. Link in der Bio.',
  'Workshop in Zürich am Samstag, 10 bis 13 Uhr. Wir arbeiten mit Atem, Berührung und Ruhe.\n\nAnmeldung über den Link in der Bio.',
  'Dein Nervensystem braucht keine Perfektion, sondern Wiederholung.',
  'Ein ruhiger Sonntag am See. Mehr braucht es manchmal nicht.',
  'Spannung im Kiefer? Probiere diese einfache Übung für zwei Minuten.',
  'Danke an alle, die beim Workshop dabei waren. Was für eine Energie!',
]
const TAGS = ['#zurich', '#zürich', '#healwell', '#transformationtherapy', '#nervoussystem', '#bodywork', '#nuadthai',
  '#thaimassage', '#stressrelief', '#breathwork', '#wellnesszurich', '#somatichealing', '#selfcare', '#massagetherapy', '#restisproductive']
const QUOTES = [
  ['Slow is', 'a speed too.'], ['Soft belly,', 'steady mind.'], ['Rest is', 'a requirement.'], ['Exhale', 'longer.'],
  ['Your body', 'is listening.'], ['Feel your', 'feet today.'], ['Safety', 'before change.'], ['Gentle', 'counts.'],
  ['Unclench', 'your jaw.'], ['Breathe like', 'no one is', 'timing you.'], ['Home is', 'a feeling', 'in the body.'],
]
const TITLES = [
  ['5 signs your', 'body needs', 'a pause'], ['3 breaths for', 'a busy day'], ['Desk stretches', 'from Thai', 'massage'],
  ['What is the', 'Transformation', 'Therapy Method?'], ['Myths about', 'deep tissue'], ['Your evening', 'reset'],
  ['Workshop', 'Zürich', 'Sat 10–13'], ['Jaw tension,', 'explained'], ['How to rest', 'without guilt'],
]
const COMMENTS = [
  ['Matthew', 'Can we use the second frame as the cover?'], ['Constantin', 'Love this one. Keeping the caption as it is.'],
  ['Constantin', 'Should we move this to Thursday evening? The 18:30 slot did well last week.'],
  ['Matthew', 'Please tag Chutima here as well.'], ['Constantin', 'Added the collaborators.'],
  ['Matthew', 'The first line feels long. Can we shorten it?'], ['Constantin', 'Shortened. Have a look.'],
  ['Matthew', 'Perfect, thank you!'], ['Constantin', 'Music is licensed, all good.'],
  ['Matthew', 'This is the clip from the championship. Make sure the judges are not in frame.'],
  ['Constantin', 'Swapped the hashtags for the German audience.'], ['Matthew', 'Beautiful.'],
]

function caption(type) {
  if (chance(0.13)) return pick(GERMAN)
  const parts = [pick(HOOKS)]
  if (chance(0.82)) parts.push(pick(BODIES))
  if (chance(0.35)) parts.push(pick(BODIES))
  const cta = pick(CTAS)
  if (cta) parts.push(cta)
  if (chance(0.7)) {
    const tags = new Set(); const n = int(3, 8)
    while (tags.size < n) tags.add(pick(TAGS))
    parts.push([...tags].join(' '))
  }
  if (type === 'story') return parts[0]
  return [...new Set(parts)].join('\n\n')
}

// Thumbnails -------------------------------------------------------------------
const PALETTES = [
  ['#eadbc8', '#d9c2a7', '#b88a64', '#3a2e26'], ['#cfe0e1', '#9fc1c4', '#4e7f86', '#1d3b40'],
  ['#dde3d3', '#b9c7a9', '#7d9471', '#2f3a2a'], ['#ebd3c4', '#d9a88e', '#a8644a', '#3b2219'],
  ['#e6e6ea', '#c9cbd6', '#8c8fa8', '#2a2b3a'], ['#f1d9cf', '#d9a7b0', '#8e5d78', '#2f1e2b'],
  ['#e4dfd8', '#c2b9ae', '#8a7f73', '#2e2a26'], ['#f6e3c1', '#f0c287', '#d98e4a', '#3e2a17'],
  ['#d5e0da', '#93b1a4', '#3f6b5c', '#15291f'], ['#f3eee7', '#e2d6c6', '#b9a58c', '#3a3128'],
  ['#f3dde7', '#e2a6c0', '#b0457a', '#3a1428'], ['#2a3438', '#3f5257', '#9bb7b5', '#eef2f0'],
]
const W = 640, H = 800
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const f = n => n.toFixed(1)

function art(type) {
  const [bg, mid, acc, ink] = pick(PALETTES)
  const defs = `<defs><filter id="b"><feGaussianBlur stdDeviation="${int(18, 40)}"/></filter><filter id="s"><feGaussianBlur stdDeviation="6"/></filter>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>`
  let body = ''
  const kind = type === 'carousel' ? pick(['quote', 'title', 'title', 'arcs']) : type === 'reel' ? pick(['horizon', 'stones', 'bokeh', 'ripples', 'arcs']) : type === 'story' ? pick(['bokeh', 'horizon']) : pick(['horizon', 'stones', 'quote', 'ripples', 'bokeh', 'arcs'])
  if (kind === 'horizon') {
    const hy = int(430, 560), sx = int(140, 500), r = int(60, 120)
    body = `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="${sx}" cy="${hy - int(60, 160)}" r="${r}" fill="${acc}" opacity=".85" filter="url(#s)"/>
      <rect y="${hy}" width="${W}" height="${H - hy}" fill="${acc}" opacity=".55"/><rect y="${hy}" width="${W}" height="${H - hy}" fill="${ink}" opacity=".18"/>
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${int(0, 400)}" y="${hy + 24 + i * int(26, 40)}" width="${int(80, 260)}" height="2" fill="${bg}" opacity=".35"/>`).join('')}`
  } else if (kind === 'stones') {
    let y = int(560, 640), x = int(260, 380)
    body = `<rect width="${W}" height="${H}" fill="${bg}"/><rect y="${y + 30}" width="${W}" height="${H}" fill="${mid}" opacity=".6"/>`
    for (let i = 0; i < int(3, 5); i++) {
      const rx = int(130, 190) - i * 22, ry = int(34, 52) - i * 4
      body += `<ellipse cx="${x + 6}" cy="${y + 10}" rx="${rx}" ry="${ry}" fill="${ink}" opacity=".18" filter="url(#s)"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${pick([acc, ink, mid])}" opacity=".9"/>`
      y -= ry * 2 - 6; x += int(-14, 14)
    }
  } else if (kind === 'ripples') {
    const cx = int(160, 480), cy = int(260, 560)
    body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>` + Array.from({ length: 9 }, (_, i) =>
      `<circle cx="${cx}" cy="${cy}" r="${30 + i * int(38, 52)}" fill="none" stroke="${i % 2 ? acc : ink}" stroke-width="${f(3 - i * 0.25)}" opacity="${f(0.7 - i * 0.07)}"/>`).join('')
  } else if (kind === 'bokeh') {
    body = `<rect width="${W}" height="${H}" fill="${ink}"/><rect width="${W}" height="${H}" fill="url(#sky)" opacity=".55"/>` + Array.from({ length: 12 }, () =>
      `<circle cx="${int(-40, 680)}" cy="${int(-40, 840)}" r="${int(40, 170)}" fill="${pick([bg, mid, acc])}" opacity="${f(0.25 + rnd() * 0.5)}" filter="url(#b)"/>`).join('')
  } else if (kind === 'arcs') {
    body = `<rect width="${W}" height="${H}" fill="${bg}"/>` + Array.from({ length: 4 }, (_, i) =>
      `<circle cx="${int(80, 560)}" cy="${int(120, 700)}" r="${int(120, 300)}" fill="${[mid, acc, ink, mid][i]}" opacity="${f(0.25 + rnd() * 0.45)}"/>`).join('')
  } else {
    const lines = kind === 'quote' ? pick(QUOTES) : pick(TITLES)
    const size = kind === 'quote' ? 66 : 58, y0 = kind === 'quote' ? 300 : 200
    const font = kind === 'quote' ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif"
    body = `<rect width="${W}" height="${H}" fill="${bg}"/><circle cx="${int(420, 620)}" cy="${int(560, 760)}" r="${int(140, 260)}" fill="${mid}" opacity=".7"/>
      ${lines.map((l, i) => `<text x="64" y="${y0 + i * size * 1.15}" font-family="${font}" font-size="${size}" font-weight="${kind === 'quote' ? 400 : 600}" fill="${ink}" letter-spacing="-1">${esc(l)}</text>`).join('')}
      <rect x="64" y="${y0 + lines.length * size * 1.15 + 6}" width="56" height="4" fill="${acc}"/>
      <text x="64" y="736" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="22" fill="${ink}" opacity=".7">@healwell.ch</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}${body}</svg>`
}

// Plan -------------------------------------------------------------------------
const START = Date.UTC(2025, 11, 1)   // December 2025
const MONTHS = 14                      // through January 2027
const SLOTS = [435, 480, 570, 660, 735, 810, 900, 1020, 1095, 1170, 1245]
const DAY_MIX = [0.05, 0.14, 0.31, 0.28, 0.13, 0.05, 0.04] // share of days with 0..6 posts

function zurichToUtc(y, m, d, minutes) {
  // Europe/Zurich: UTC+2 from the last Sunday of March to the last Sunday of October, else UTC+1.
  const lastSunday = mo => { const t = new Date(Date.UTC(y, mo + 1, 0)); return t.getUTCDate() - t.getUTCDay() }
  const summer = (m > 2 && m < 9) || (m === 2 && d >= lastSunday(2)) || (m === 9 && d < lastSunday(9))
  return new Date(Date.UTC(y, m, d) + (minutes - (summer ? 120 : 60)) * 60_000)
}

function plan() {
  const posts = []
  for (let k = 0; k < MONTHS; k++) {
    const first = new Date(START); first.setUTCMonth(first.getUTCMonth() + k)
    const y = first.getUTCFullYear(), m = first.getUTCMonth(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    // Most days hold 2–4 posts, some are quiet, some hit 6; Sundays run lighter.
    const counts = Array.from({ length: days }, (_, i) => {
      const wd = new Date(Date.UTC(y, m, i + 1)).getUTCDay()
      const n = weighted([0, 1, 2, 3, 4, 5, 6], DAY_MIX)
      return Math.max(0, Math.min(6, n + (wd === 0 && chance(0.5) ? -1 : 0) + ((wd === 1 || wd === 3) && chance(0.2) ? 1 : 0)))
    })
    const target = int(70, 80)
    let sum = counts.reduce((a, b) => a + b, 0)
    while (sum !== target) {
      const i = int(0, days - 1)
      if (sum > target && counts[i] > 1) { counts[i]--; sum-- }
      else if (sum < target && counts[i] > 0 && counts[i] < 6) { counts[i]++; sum++ }
    }
    counts.forEach((c, i) => {
      const slots = [...SLOTS].sort(() => rnd() - 0.5).slice(0, c).sort((a, b) => a - b)
      slots.forEach((slot, j) => {
        const minutes = slot + int(-2, 2) * 5
        const at = zurichToUtc(y, m, i + 1, minutes)
        const evening = minutes >= 1020
        const type = weighted(['reel', 'carousel', 'image', 'story'], evening ? [0.58, 0.22, 0.17, 0.03] : [0.36, 0.36, 0.25, 0.03])
        const nCollab = weighted([0, 1, 2, 3], [0.45, 0.35, 0.15, 0.05])
        const collaborators = new Set()
        while (collaborators.size < nCollab) collaborators.add(weighted(COLLABORATORS.map(c => c[0]), HANDLE_WEIGHTS))
        posts.push({
          external_id: `ig_${y}${String(m + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}_${j + 1}`,
          platform: 'instagram', type, scheduled_at: at.toISOString(), published: at.getTime() < Date.now(),
          caption: caption(type), collaborators: [...collaborators],
        })
      })
    })
  }
  return posts
}

// Run --------------------------------------------------------------------------
if (process.argv.includes('--preview')) {
  mkdirSync(`${DIR}/preview`, { recursive: true })
  for (const [i, type] of ['reel', 'reel', 'carousel', 'carousel', 'image', 'image', 'story', 'reel', 'carousel', 'image', 'reel', 'carousel'].entries())
    await sharp(Buffer.from(art(type))).webp({ quality: 72 }).toFile(`${DIR}/preview/${i}-${type}.webp`)
  console.log(`Wrote samples to ${DIR}/preview`)
  process.exit(0)
}
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), e.g. in .env.local')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })
async function pool(items, size, fn) {
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const j = i++; await fn(items[j], j) } }))
}

const planFile = `${DIR}/plan.json`
const posts = existsSync(planFile) ? JSON.parse(readFileSync(planFile, 'utf8')) : plan().map(p => ({ ...p, file: randomUUID() }))
writeFileSync(planFile, JSON.stringify(posts))
const months = new Map()
for (const p of posts) months.set(p.scheduled_at.slice(0, 7), (months.get(p.scheduled_at.slice(0, 7)) ?? 0) + 1)
console.log(`${posts.length} posts:`, [...months].map(([k, v]) => `${k} ${v}`).join(', '))

const uploadedFile = `${DIR}/uploaded.json`
const uploaded = new Set(existsSync(uploadedFile) ? JSON.parse(readFileSync(uploadedFile, 'utf8')) : [])
let done = 0
await pool(posts, 8, async p => {
  if (!uploaded.has(p.file)) {
    s = [...p.file].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) // stable art per post
    const png = await sharp(Buffer.from(art(p.type))).toBuffer()
    const full = await sharp(png).webp({ quality: 72 }).toBuffer()
    const small = await sharp(png).resize(160, 200).webp({ quality: 68 }).toBuffer()
    for (const [name, buf] of [[`${p.file}.webp`, full], [`${p.file}.sm.webp`, small]]) {
      const { error } = await db.storage.from('thumbs').upload(name, buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (error) throw new Error(`upload ${name}: ${error.message}`)
    }
    uploaded.add(p.file)
    if (++done % 50 === 0) { writeFileSync(uploadedFile, JSON.stringify([...uploaded])); console.log(`thumbnails ${uploaded.size}/${posts.length}`) }
  }
  p.media_url = db.storage.from('thumbs').getPublicUrl(`${p.file}.webp`).data.publicUrl
})
writeFileSync(uploadedFile, JSON.stringify([...uploaded]))
console.log(`thumbnails ${uploaded.size}/${posts.length}`)

// Names first, so the directory starts with them (names belong to the board after that).
const { error: cErr } = await db.from('collaborators')
  .upsert(COLLABORATORS.map(([handle, name]) => ({ handle, name })), { onConflict: 'handle', ignoreDuplicates: true })
if (cErr) throw cErr

const ids = new Map()
for (let i = 0; i < posts.length; i += 200) {
  const batch = posts.slice(i, i + 200).map(({ file, ...p }) => p)
  const { data, error } = await db.from('posts').upsert(batch, { onConflict: 'external_id' }).select('id, external_id, scheduled_at')
  if (error) throw error
  for (const r of data) ids.set(r.external_id, r)
}
console.log(`posts upserted: ${ids.size}`)

const { count } = await db.from('comments').select('id', { count: 'exact', head: true })
if (!count) {
  s = 99
  const rows = []
  for (const p of posts) {
    if (!chance(0.16)) continue
    const row = ids.get(p.external_id)
    const at = Math.min(Date.parse(row.scheduled_at) - int(1, 72) * 3600_000, Date.now() - int(1, 600) * 60_000)
    const start = int(0, COMMENTS.length - 1)
    for (let i = 0; i < int(1, 4); i++) {
      const [author, body] = COMMENTS[(start + i) % COMMENTS.length]
      rows.push({ post_id: row.id, author, body, created_at: new Date(at + i * int(5, 240) * 60_000).toISOString() })
    }
  }
  const { error } = await db.from('comments').insert(rows)
  if (error) throw error
  console.log(`comments: ${rows.length}`)
}
console.log('Done.')
