// worktree.selfcheck.mts — node worktree.selfcheck.mts → exit 0 when green.
// Pure arms only: parsing the worktree list, resolving a name, the url lines. Nothing is run,
// created or removed. Shay's removal plan: env/worktrees.selfcheck.mts.
import { mainCheckout, parseWorktreeList, resolveWorktree, urlLines, worktreesHome } from './worktree.mts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

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
try { resolveWorktree('nope', trees); } catch (e) { err = (e as Error).message; }
check('an unknown name throws with the candidates', err.startsWith('no worktree for "nope"') && err.includes('fix/bjew-1  C:/wt/fix-bjew-1'), err);

const clone = [{ path: 'C:/work/jx', branch: 'dev', bare: false }, { path: 'C:/work/jx/.claude/worktrees/fix-a', branch: 'fix/a', bare: false }];
const bareRepo = [{ path: 'C:/work/jx/.bare', branch: null, bare: true }, { path: 'C:/wt/dev', branch: 'dev', bare: false }];
check('a clone: the main checkout is the first worktree, whatever it has checked out', mainCheckout(clone) === 'C:/work/jx');
check('a bare repository has no main checkout', mainCheckout(bareRepo) === null);
check('the kit\'s worktrees go in <repo>/.claude/worktrees', worktreesHome(clone) === 'C:/work/jx/.claude/worktrees' && worktreesHome([{ path: 'C:\\work\\jx\\', bare: false }]) === 'C:/work/jx/.claude/worktrees');
check('beside a bare repository, in the folder holding it', worktreesHome(bareRepo) === 'C:/work/jx/.claude/worktrees');
check('url lines: one `<app>: <url>` per app, aligned', urlLines({ b2b: 'http://a', admin: 'http://b' }) === 'b2b:   http://a\nadmin: http://b', urlLines({ b2b: 'http://a', admin: 'http://b' }));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
