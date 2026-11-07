import './theme.css'
import './styles.css'
import { Board } from './board'
import type { CardHooks } from './card'
import { store } from './store'
import { today } from './time'
import { UI, askName, getName, locked } from './ui'

const TOKEN_KEY = 'healwell-board:token'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* private mode */ } }

async function main() {
  const fromLink = decodeURIComponent(location.hash.slice(1))
  const token = fromLink || read(TOKEN_KEY)
  if (!token) return locked('missing')

  let ok: boolean
  try {
    ok = await store.connect(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, token)
  } catch (err) {
    console.error(err)
    return locked('error')
  }
  if (!ok) { write(TOKEN_KEY, null); return locked('invalid') }
  write(TOKEN_KEY, token)

  // The board and the floating UI need each other; hooks bridge them.
  let ui: UI
  const hooks: CardHooks = {
    openComments: id => ui.hooks.openComments(id),
    openEditor: id => ui.hooks.openEditor(id),
    hoverDay: (d, x, y) => ui.hooks.hoverDay(d, x, y),
  }
  const board = new Board(document.getElementById('board')!, hooks)
  ui = new UI(board)
  board.cam.set({ day: today() + 0.5, dw: board.presets.month })
  if (!getName()) { await askName(); ui.renderName() }
  board.begin()
  if (import.meta.env.DEV) Object.assign(window, { board, store })
}

main()
