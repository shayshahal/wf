// worktree.selfcheck.ts — node worktree.selfcheck.ts → exit 0 when green.
// Pure arms only: parsing the worktree list, resolving a name, the url lines. Nothing is run,
// created or removed. Shay's removal plan: env/worktrees.selfcheck.ts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorktree, excludeWfFolder, listWorktrees, mainCheckout, parseWorktreeList, resolveWorktree, slugForBranch, urlLines, worktreesHome } from './worktree.ts';
import { addWorktree } from './git-worktree.ts';
import { plug, seams } from '../seams.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';

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

// JX-1239 and JX-1350 share the Git exclude file. One worker toggling the shared rule must
// not expose the other round's metadata or invalidate a check's implementation identity.
const fixture = mkdtempSync(join(tmpdir(), 'wf-local-exclude-'));
try {
	const git = (...args: string[]) => execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'main');
	writeFileSync(join(fixture, 'source.txt'), 'source\n');
	git('add', 'source.txt');
	git('-c', 'user.name=wf test', '-c', 'user.email=wf@example.invalid', 'commit', '-qm', 'base');
	const round = join(fixture, 'round');
	git('worktree', 'add', '-q', '-b', 'round', round);
	const exclude = join(fixture, '.git', 'info', 'exclude');
	const before = readFileSync(exclude, 'utf8');
	excludeWfFolder(fixture);
	excludeWfFolder(round);
	check('wf ignores round metadata without mutating shared Git configuration', readFileSync(exclude, 'utf8') === before);
	check('each worktree owns its metadata ignore rule', existsSync(join(fixture, '.wf', '.gitignore')) && existsSync(join(round, '.wf', '.gitignore')));
	mkdirSync(join(round, '.wf'), { recursive: true });
	writeFileSync(join(round, '.wf', 'state.json'), '{}\n');
	writeFileSync(exclude, `${before}\n.wf/\n`);
	const identity = worktreeContentSha(round, null, null, 'row');
	writeFileSync(exclude, `${before}\n#.wf/\n`);
	check('another round toggling the shared exclude cannot change this round\'s identity', worktreeContentSha(round, null, null, 'row') === identity);
	const status = execFileSync('git', ['-C', round, 'status', '--short'], { encoding: 'utf8' });
	check('metadata stays untracked-and-ignored when the shared rule is disabled', !status.includes('.wf'), status);
	writeFileSync(join(round, '.wf', 'evil.sh'), 'source\n');
	check('local metadata ignores do not hide unowned executable files from identity', worktreeContentSha(round, null, null, 'row') !== identity);
} finally { rmSync(fixture, { recursive: true, force: true }); }

// Allocation policy belongs to the shared wrapper, including when invoked inside a linked
// checkout or for baseline scratch. The seam makes real registered Git worktrees at its input.
const allocation = mkdtempSync(join(tmpdir(), "wf allocation ' "));
const originalCwd = process.cwd();
const originalAllocator = seams.createWorktree;
try {
	const git = (...args: string[]) => execFileSync('git', args, { cwd: allocation, encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@test', 'commit', '-qm', 'base', '--allow-empty');
	const inputs: { branch: string; base: string; log: string; path: string }[] = [];
	plug({ createWorktree: (o) => { inputs.push(o); addWorktree(o); return { path: o.path, branch: o.branch }; } });
	process.chdir(allocation);
	for (const branch of ['round/shared', 'wf-baseline/round-shared']) {
		const log = join(allocation, 'allocation.log');
		const tree = await createWorktree({ branch, base: 'HEAD', log });
		const expected = `${allocation.replace(/\\/g, '/')}/.claude/worktrees/${slugForBranch(branch)}`;
		check(`${branch}: shared wrapper owns exact destination and preserves allocator inputs`, tree.path === expected && inputs.at(-1)?.path === expected && inputs.at(-1)?.base === 'HEAD' && inputs.at(-1)?.log === log && listWorktrees().some((t) => t.branch === branch && t.path === expected));
		process.chdir(tree.path);
	}
	process.chdir(allocation);
	const bare = join(allocation, 'bare-repo', '.bare');
	git('clone', '--quiet', '--bare', allocation, bare);
	process.chdir(bare);
	const tree = await createWorktree({ branch: 'round/bare', base: 'HEAD', log: join(allocation, 'bare.log') });
	check('a bare repository uses its containing folder, not the invoking checkout or a machine default', tree.path === `${allocation.replace(/\\/g, '/')}/bare-repo/.claude/worktrees/round-bare` && existsSync(join(tree.path, '.git')));
} finally {
	process.chdir(originalCwd);
	plug({ createWorktree: originalAllocator });
	rmSync(allocation, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
