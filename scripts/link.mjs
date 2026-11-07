// Creates a new private board link. Prints the link and the SQL that lets the
// database accept it. Running it again and applying the SQL revokes the old link.
import { randomBytes, createHash } from 'node:crypto'

const base = process.argv[2] || 'https://<user>.github.io/<repo>/'
const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')

console.log(`\nBoard link (keep it private):\n\n  ${base.replace(/#.*$/, '')}#${token}\n`)
console.log('Run this once in the Supabase SQL editor:\n')
console.log(`create or replace function private.board_token_hash() returns text
language sql immutable set search_path = '' as $$ select '${hash}'::text $$;
revoke all on function private.board_token_hash() from public, anon, authenticated;\n`)
console.log(`For scripts (seed, tests), add to .env.local:\n\n  BOARD_TOKEN=${token}\n`)
