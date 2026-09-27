// worktree.selfcheck.mjs — node worktree.selfcheck.mjs → exit 0 when green.
// Pure arms only: parsing the worktree list, resolving a name, the url lines. Nothing is run,
// created or removed. Shay's removal plan: env/worktrees.selfcheck.mjs.
import { parseWorktreeList, resolveWorktree, urlLines } from './worktree.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const porcelain = 'worktree C:/r/.bare\r\nbare\r\n\r\nworktree C:/wt/dev\r\nHEAD abc\r\nbranch refs/heads/dev\r\n\r\nworktree C:/wt/qa\r\nHEAD def\r\ndetached\r\n\r\nworktree C:/wt/fix-bjew-1\r\nHEAD 123\r\nbranch refs/heads/fix/bjew-1\r\n';
const trees = parseWorktreeList(porcelain);
check('the list parses CRLF porcelain: bare, branch, detached', JSON.stringify(trees) === JSON.stringify([
  { path: 'C:/r/.bare', branch: null, detached: false, bare: true },
  { path: 'C:/wt/dev', branch: 'dev', detached: false, bare: false },
  { path: 'C:/wt/qa', branch: null, detached: true, bare: false },
  { path: 'C:/wt/fix-bjew-1', branch: 'fix/bjew-1', detached: false, bare: false },
]), JSON.stringify(trees));
check('resolve by branch', resolveWorktree('fix/bjew-1', trees).path === 'C:/wt/fix-bjew-1');
check('resolve by folder name', resolveWorktree('qa', trees).path === 'C:/wt/qa');
check('resolve by absolute path, either slash', resolveWorktree('C:\\wt\\dev\\', trees).branch === 'dev');
let err = '';
try { resolveWorktree('nope', trees); } catch (e) { err = e.message; }
check('an unknown name throws with the candidates', err.startsWith('no worktree for "nope"') && err.includes('fix/bjew-1  C:/wt/fix-bjew-1'), err);

check('url lines: one `<app>: <url>` per app, aligned', urlLines({ b2b: 'http://a', admin: 'http://b' }) === 'b2b:   http://a\nadmin: http://b', urlLines({ b2b: 'http://a', admin: 'http://b' }));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
