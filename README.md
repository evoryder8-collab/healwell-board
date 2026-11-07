# Healwell posts board

One canvas for every post [@healwell.ch](https://instagram.com/healwell.ch) has published or scheduled. Time runs left to right, one column per day, posts stacked in posting order. Zoom changes how much a card shows (year, month, week, day), never where it sits. Two people open the same private link, edit captions and collaborators, and leave comments.

Posts arrive from outside: an agent writes rows into Supabase ([AGENT.md](AGENT.md)). The app has no import, scheduler or platform connection.

- Frontend: TypeScript + Vite, no framework, static build on GitHub Pages
- Backend: Supabase only (Postgres, Storage, Realtime, row level security)

## Setup

You need Node 22+ and a free Supabase project.

1. **Database.** In the Supabase SQL editor, run [`supabase/migrations/20261107000000_board.sql`](supabase/migrations/20261107000000_board.sql). It creates the three tables, two read-only views, the access rules, the realtime triggers and the public `thumbs` bucket.

2. **Board link.** Create the private link and register it with the database:

   ```bash
   npm install
   npm run link -- https://<github-user>.github.io/<repo>/
   ```

   Run the SQL it prints in the SQL editor. Keep the printed link private: anyone who has it can read and edit the board. Running `npm run link` again and applying its SQL replaces the link; the old one stops working at once.

3. **Frontend config.** Put the project URL and the publishable key (Project Settings → API Keys) in `.env`. Both are public by design: without the link token, row level security returns nothing.

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ```

4. **Sample data (optional).** Add the secret key to `.env.local` (never committed), then seed about 1,000 posts across 14 months:

   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

   ```bash
   npm run seed
   ```

   `npm run seed -- --preview` only draws twelve sample thumbnails into `.seed/preview`.

5. **Deploy.** Push to GitHub, then in the repository open Settings → Pages and set Source to **GitHub Actions**. Every push to `main` builds and deploys. Open the link from step 2.

**Local development:** `npm run dev`, then open `http://localhost:5173/#<token>` (the part of the link after `#`).

## Using the board

- Pan: drag, one finger, two-finger trackpad, mouse wheel, or the minimap and scrollbar.
- Zoom: pinch, trackpad pinch, ctrl + scroll, the − and + buttons, or `+` and `-`. Double-click or double-tap zooms into a day.
- Keyboard: ← → move a week, Shift + ← → move a month, ↑ ↓ scroll the stacks, `T` jumps to today.
- Click a thumbnail to zoom in; at day level, click a caption to edit it. It saves when the field loses focus.
- Collaborators: type a handle; suggestions come from the directory. Names are edited in the directory panel.

## How access works

The link carries a 256-bit random token after `#`, so it never reaches a server log. The app sends it as the `x-board-token` header. Row level security compares its SHA-256 with the hash stored in `private.board_token_hash()`; without a match the publishable key can read and write nothing. The board may only update `caption` and `collaborators` on posts, `name` on collaborators, and add comments.

Realtime changes are broadcast by database triggers on a channel named after the token hash, so only link holders know which channel to join.

Thumbnails sit in a public bucket under random UUID names: they can only be found by reading a post first, which needs the token.

## Theming

Every color is in [`src/theme.css`](src/theme.css). Replace the values there to apply Matthew's brand; nothing else needs to change.

## Files

```
src/theme.css      colors
src/styles.css     layout and components
src/main.ts        boot: link token, name prompt
src/store.ts       data by date range, realtime, saves
src/camera.ts      pan, zoom, momentum, input
src/board.ts       ribbon, virtualized day columns, year view
src/card.ts        cards and the caption/collaborator editors
src/ui.ts          compass, bar, minimap, directory, comments, sheets
supabase/          migration
scripts/           link token and seed
AGENT.md           how the agent writes posts
```
