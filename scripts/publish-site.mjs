// Publishes the board to https://matthewhua.ch/someschedule/
// It builds this app, then replaces the someschedule/ folder on the main branch of the
// website repo (served by GitHub Pages) from a fresh clone. Nothing else in that repo changes.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'https://github.com/evoryder8-collab/Matthew-Hua-Bio-Page.git'
const FOLDER = 'someschedule'
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

run('npm', ['run', 'build'])
const dir = mkdtempSync(join(tmpdir(), 'site-'))
try {
  run('git', ['clone', '--quiet', '--depth', '1', '--branch', 'main', REPO, dir])
  const target = join(dir, FOLDER)
  if (existsSync(target)) rmSync(target, { recursive: true })
  cpSync('dist', target, { recursive: true })
  writeFileSync(join(target, 'README.md'),
    '# someschedule\n\nBuilt copy of the Healwell posts board. Source: https://github.com/evoryder8-collab/healwell-board\n\n' +
    'Do not edit by hand. Publish a new version with `npm run publish:site` in that repo.\n' +
    'Nothing here is readable without the board sign-in: every post, comment and name sits behind row level security.\n')
  run('git', ['-C', dir, 'add', FOLDER])
  const changed = execFileSync('git', ['-C', dir, 'status', '--porcelain', FOLDER]).toString().trim()
  if (!changed) { console.log('matthewhua.ch/someschedule is already up to date.'); process.exit(0) }
  run('git', ['-C', dir, 'commit', '--quiet', '-m', 'Update the posts board at /someschedule'])
  run('git', ['-C', dir, 'push', '--quiet', 'origin', 'main'])
  console.log('Published. GitHub Pages updates https://matthewhua.ch/someschedule/ in about a minute.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
