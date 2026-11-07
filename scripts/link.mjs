// Creates a new private board link. Prints the link and the SQL that lets the
// database accept it. Running it again and applying the SQL revokes the old link.
import { randomBytes } from 'node:crypto'

const base = process.argv[2] || 'https://<user>.github.io/<repo>/'
const token = randomBytes(32).toString('base64url')

console.log(`\nBoard link (keep it private):\n\n  ${base.replace(/#.*$/, '')}#${token}\n`)
console.log('Run this once in the Supabase SQL editor:\n')
console.log(`insert into private.access (token) values ('${token}')
on conflict (id) do update set token = excluded.token;\n`)
console.log(`For scripts (seed, tests), add to .env.local:\n\n  BOARD_TOKEN=${token}\n`)
