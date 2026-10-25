// git-head.selfcheck.ts — node src/git-head.selfcheck.ts → exit 0 when green.
// currentBranch / headSha (read from the .git files) answer what `git rev-parse` answers, in every layout
// a round meets: branches (with a slash), detached HEAD, packed refs, a linked worktree, an unborn branch.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentBranch, headSha } from './git-head.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-head-'));
const main = join(root, 'main');
const linked = join(root, 'linked');
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ask = (fn: () => string): string => { try { return fn(); } catch { return '<throws>'; } };
let failures = 0;
const check = (name: string, fn: () => void) => { try { fn(); console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name} — ${e instanceof Error ? e.message : String(e)}`); } };
const same = (dir: string) => {
	assert.equal(ask(() => currentBranch(dir)), ask(() => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')));
	assert.equal(ask(() => headSha(dir)), ask(() => git(dir, 'rev-parse', 'HEAD')));
};
try {
	mkdirSync(main);
	git(main, 'init', '-q', '-b', 'main');
	check('an unborn branch answers as git does (both fail, for the branch and for HEAD)', () => { same(main); assert.equal(ask(() => headSha(main)), '<throws>'); assert.equal(ask(() => currentBranch(main)), '<throws>'); });
	writeFileSync(join(main, 'a.txt'), 'a\n'); git(main, 'add', '-A'); git(main, 'commit', '-qm', 'base');
	check('main, loose ref', () => same(main));
	git(main, 'checkout', '-qb', 'fix/jx-1/deep-name');
	check('a branch with slashes', () => { same(main); assert.equal(currentBranch(main), 'fix/jx-1/deep-name'); });
	writeFileSync(join(main, 'b.txt'), 'b\n'); git(main, 'add', '-A'); git(main, 'commit', '-qm', 'second');
	check('HEAD moves with a new commit (read fresh each time)', () => { const before = headSha(main); writeFileSync(join(main, 'c.txt'), 'c\n'); git(main, 'add', '-A'); git(main, 'commit', '-qm', 'third'); assert.notEqual(headSha(main), before); same(main); });
	git(main, 'pack-refs', '--all');
	check('packed refs (no loose ref file)', () => same(main));
	git(main, 'checkout', '-q', '--detach', 'HEAD~1');
	check('detached HEAD: branch is HEAD, sha is the commit', () => { same(main); assert.equal(currentBranch(main), 'HEAD'); });
	git(main, 'checkout', '-q', 'main');
	git(main, 'worktree', 'add', '-q', '-b', 'feat/linked', linked);
	check('a linked worktree: its own branch and HEAD, not the main checkout\'s', () => { same(linked); assert.equal(currentBranch(linked), 'feat/linked'); assert.equal(currentBranch(main), 'main'); assert.notEqual(currentBranch(linked), currentBranch(main)); });
	check('a linked worktree with packed refs', () => { git(main, 'pack-refs', '--all'); same(linked); same(main); });
	check('not a checkout: falls back to git, which fails the same way', () => { assert.equal(ask(() => currentBranch(root)), ask(() => git(root, 'rev-parse', '--abbrev-ref', 'HEAD'))); });
} finally {
	rmSync(root, { recursive: true, force: true });
}
console.log(failures ? `${failures} FAILURE(S)` : 'git-head selfcheck: ok');
process.exit(failures ? 1 : 0);
