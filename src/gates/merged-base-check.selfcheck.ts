// merged-base-check.selfcheck.ts — node merged-base-check.selfcheck.ts → exit 0 when green.
// checkMergedBase against a temporary bare origin, with node commands standing in for a project's
// install and typecheck: green, red with its error lines, a failed prepare and a timeout as not
// checked, and the temporary worktree gone afterwards with the round's paperwork untouched.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkMergedBase } from './merged-base-check.ts';
import type { MergedBaseCommand } from './merged-base.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-merged-base-check-'));
// Its own temp folder: other checks running beside this one create wf-merged-base-* folders too.
const TEMP = join(ROOT, 'tmp');
mkdirSync(TEMP);
process.env.TEMP = process.env.TMP = process.env.TMPDIR = TEMP;
process.env.GIT_CONFIG_GLOBAL = join(ROOT, 'gitconfig');
process.env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_GLOBAL;
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_') && !key.startsWith('GIT_CONFIG_')) delete process.env[key];
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = wf\n\temail = wf@selfcheck\n[core]\n\tautocrlf = false\n');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const git = (cwd: string, ...args: string[]) => {
	const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
	return r.stdout.trim();
};

const origin = join(ROOT, 'origin.git');
const work = join(ROOT, 'work');
mkdirSync(join(work, 'pkg'), { recursive: true });
git(ROOT, 'init', '-q', '--bare', origin);
git(work, 'init', '-q', '-b', 'dev');
writeFileSync(join(work, 'pkg', 'typed.txt'), 'ok\n');
git(work, 'add', '-A');
git(work, 'commit', '-qm', 'base');
git(work, 'remote', 'add', 'origin', pathToFileURL(origin).href);
git(work, 'push', '-q', 'origin', 'dev');
git(work, 'checkout', '-qb', 'fix/x');
// The round's paperwork, which reap keeps: the check must not touch it.
writeFileSync(join(work, 'REVIEW.md'), 'verdict: approved\n');
// dev moves on after the round branched (the merge, as GitHub would make it).
writeFileSync(join(ROOT, 'merged.txt'), 'broken\n');
const peer = join(ROOT, 'peer');
git(ROOT, 'clone', '-q', '-b', 'dev', pathToFileURL(origin).href, peer);
writeFileSync(join(peer, 'pkg', 'typed.txt'), 'broken\n');
git(peer, 'commit', '-qam', 'merge #662');
git(peer, 'push', '-q', 'origin', 'dev');
const merged = git(peer, 'rev-parse', 'HEAD');

const node = (label: string, script: string, cwd = '.'): MergedBaseCommand => ({ label, cmd: process.execPath, args: ['-e', script], cwd });
// A typecheck stand-in: reads the checked-out base, fails with error lines when it says "broken".
const typecheck = node('typecheck', "const t=require('fs').readFileSync('typed.txt','utf8');if(t.includes('broken')){console.log('noise');console.error(\"typed.txt:1:1 Error: Module './support' has no exported member 'CartRequest'.\");process.exit(1)}console.log('0 errors')", 'pkg');
const worktrees = () => git(work, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
const leftovers = () => readdirSync(TEMP).filter((n) => n.startsWith('wf-merged-base-'));
const run = (prepare: MergedBaseCommand[], checks: MergedBaseCommand[], timeoutMs = 60_000) =>
	checkMergedBase({ toplevel: work, baseBranch: 'dev', delivered: 'b'.repeat(40), spec: { prepare, checks, timeoutMs }, env: process.env as Record<string, string> });

try {
	const before = leftovers();
	const red = await run([node('install', "console.log('installed')")], [typecheck]);
	check('red: the merged tip is checked and the failing command named', red.result === 'red' && red.sha === merged && red.base === 'origin/dev' && red.command === 'typecheck (in pkg)', JSON.stringify(red));
	check('…with its error lines', red.result === 'red' && red.tail.includes("no exported member 'CartRequest'"), JSON.stringify(red));
	check('…the temporary worktree is gone and the round untouched', worktrees() === 1 && leftovers().length === before.length && readFileSync(join(work, 'REVIEW.md'), 'utf8') === 'verdict: approved\n' && git(work, 'rev-parse', '--abbrev-ref', 'HEAD') === 'fix/x', `${worktrees()} worktrees; ${leftovers().join(',')}`);

	const green = await run([], [node('typecheck', "process.exit(0)", 'pkg')]);
	check('green: every check passed', green.result === 'green' && green.sha === merged, JSON.stringify(green));

	const install = await run([node('install', "console.error('ERR_PNPM_OUTDATED_LOCKFILE');process.exit(1)")], [typecheck]);
	check('a failed prepare is not checked, not red or green', install.result === 'not-checked' && /install failed: ERR_PNPM_OUTDATED_LOCKFILE/.test(install.why), JSON.stringify(install));

	const slow = await run([], [node('typecheck', 'setTimeout(()=>{},60000)', 'pkg')], 3000);
	check('a check over the bound is not checked', slow.result === 'not-checked' && /ran out of the/.test(slow.why), JSON.stringify(slow));
	check('…and its worktree is gone too', worktrees() === 1 && leftovers().length === before.length, leftovers().join(','));

	git(work, 'remote', 'set-url', 'origin', pathToFileURL(join(ROOT, 'missing.git')).href);
	const offline = await run([], [typecheck]);
	check('a failed fetch is not checked', offline.result === 'not-checked' && /could not fetch dev/.test(offline.why), JSON.stringify(offline));
	check('no worktree is left behind by any run', !existsSync(join(work, '.git', 'worktrees')) || readdirSync(join(work, '.git', 'worktrees')).length === 0);
} finally {
	rmSync(ROOT, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
