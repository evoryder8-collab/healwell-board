import './theme.css'
import './styles.css'
import { Board } from './board'
import type { CardHooks } from './card'
import { store } from './store'
import { today } from './time'
import { UI, askLogin, askName, getName, readToken, unreachable, writeToken } from './ui'

async function main() {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_KEY
  const fromLink = decodeURIComponent(location.hash.slice(1))
  let token = fromLink || readToken()
  let note = ''
  for (;;) {
    if (!token) token = await askLogin(note)
    let ok: boolean
    try {
      ok = await store.connect(url, key, token)
    } catch (err) {
      console.error(err)
      return unreachable()
    }
    if (ok) break
    writeToken(null)
    token = null
    note = fromLink ? 'This link no longer opens the board. Sign in with the board login.' : 'Please sign in again.'
  }
  writeToken(token)
  if (fromLink && fromLink !== token) history.replaceState(null, '', location.pathname + location.search)

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
