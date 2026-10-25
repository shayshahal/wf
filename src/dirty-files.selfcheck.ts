// dirty-files.selfcheck.ts — node src/dirty-files.selfcheck.ts → exit 0 when green.
// dirtyFiles (one `git status`) lists every path the three-call union it replaced listed
// (`diff --name-only HEAD`, `diff --name-only --cached`, `ls-files --others --exclude-standard`),
// plus only a rename's old path.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirtyFiles } from './dirty-files.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-dirty-'));
const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'core.autocrlf=false', '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' });
const lines = (out: string) => out.split('\n').map((l) => l.trim()).filter(Boolean);
const old = () => [...new Set([...lines(git('diff', '--name-only', 'HEAD')), ...lines(git('diff', '--name-only', '--cached')), ...lines(git('ls-files', '--others', '--exclude-standard'))])].sort();
const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
let failures = 0;
const check = (name: string, fn: () => void) => { try { fn(); console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name} — ${e instanceof Error ? e.message : String(e)}`); } };
try {
	git('init', '-q');
	for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt', 'sub/f.txt', 'rename-me.txt']) put(f, `${f}\n`);
	put('.gitignore', 'ignored.log\n');
	git('add', '-A'); git('commit', '-qm', 'base');

	check('a clean tree lists nothing, as before', () => { assert.deepEqual(dirtyFiles(root), []); assert.deepEqual(old(), []); });

	put('a.txt', 'changed\n'); // unstaged edit
	put('b.txt', 'staged\n'); git('add', 'b.txt'); // staged edit
	put('c.txt', 'staged then restored\n'); git('add', 'c.txt'); put('c.txt', 'c.txt\n'); // index-only change: working file back to HEAD
	rmSync(join(root, 'd.txt')); // deleted, unstaged
	put('new.txt', 'n\n'); // untracked
	put('deep/er/untracked.txt', 'u\n'); // untracked in a new folder: the file, not the folder
	put('sub/g.txt', 'g\n'); // untracked in an existing folder
	put('ignored.log', 'x\n'); // ignored: never listed
	put('added.txt', 'a\n'); git('add', 'added.txt'); // staged new file
	git('mv', 'rename-me.txt', 'renamed.txt'); // staged rename
	put('spaces and עברית.txt', 's\n'); // path git would quote without -z

	const now = dirtyFiles(root).sort();
	// Without -z git octal-escapes a non-ASCII path ("spaces and ×¢..."): the old calls never returned its real name.
	const before = old().filter((p) => !/\\[0-7]{3}/.test(p));
	check('every path the three-call union listed (ASCII names) is listed', () => { for (const p of before) assert.ok(now.includes(p), `${p} missing from ${JSON.stringify(now)}`); });
	check('the only extras are the renamed file\'s old path and the non-ASCII name, unescaped', () => assert.deepEqual(now.filter((p) => !before.includes(p)).sort(), ['rename-me.txt', 'spaces and \u05e2\u05d1\u05e8\u05d9\u05ea.txt']));
	check('a staged edit hidden by a restored working file is listed', () => assert.ok(now.includes('c.txt')));
	check('an untracked file in a new folder is listed as the file', () => assert.ok(now.includes('deep/er/untracked.txt') && !now.includes('deep/')));
	check('an ignored file is not listed', () => assert.ok(!now.includes('ignored.log')));
	check('a path with spaces and non-ASCII letters is listed verbatim, which the old calls escaped', () => assert.ok(now.includes('spaces and עברית.txt')));
	check('a failing git stops the call', () => assert.throws(() => dirtyFiles(join(root, 'does-not-exist'))));
} finally {
	rmSync(root, { recursive: true, force: true });
}
console.log(failures ? `${failures} FAILURE(S)` : 'dirty-files selfcheck: ok');
process.exit(failures ? 1 : 0);
