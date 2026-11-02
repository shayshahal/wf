// merged-base-check.ts — run the project's merged-base check (merged-base.ts says why, 2026-11-02).
// The check runs in a temporary detached worktree of the fetched base, removed afterwards even on a
// failure: the round's worktree holds the untracked paperwork reap keeps (REVIEW.md, the tracker note),
// and checking the base out there would disturb it. It needs no stack or database, so a plain
// `git worktree add` is enough (disposable-workspace.ts allocates those). Commands run through
// runCheckProcess, so a timeout takes the command's whole process tree with it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckProcess } from './check-process.ts';
import { shellArgv, RUN_MAX_BUFFER } from './check.ts';
import { lastLines } from './merged-base.ts';
import type { MergedBaseCheck, MergedBaseCommand, MergedBaseResult } from './merged-base.ts';

const sha40 = /^[a-f0-9]{40}$/;
const label = (c: MergedBaseCommand) => (c.cwd && c.cwd !== '.' ? `${c.label} (in ${c.cwd})` : c.label);
const git = (cwd: string, args: string[]) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 120_000 });
const said = (r: ReturnType<typeof git>) => `${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim().split('\n').slice(-3).join(' / ');

// The runner supervisor's own Node warning about shell argv on Windows (DEP0190) lands in the
// command's stderr; it is wf's noise, and it pushed the command's own last line out of the report.
const withoutRunnerWarning = (output: string) => output.replace(/^.*\[DEP0190\].*\r?\n(?:\(Use `node --trace-deprecation.*\r?\n)?/gm, '');

/** Fetch `baseBranch`, check it out detached in a temporary worktree, run `spec` there, remove it. */
export async function checkMergedBase(o: { toplevel: string; baseBranch: string; delivered: string; spec: MergedBaseCheck; env: Record<string, string> }): Promise<MergedBaseResult> {
	const base = `origin/${o.baseBranch}`;
	const stamp = { base, delivered: o.delivered, at: new Date().toISOString() };
	const fetched = git(o.toplevel, ['fetch', '-q', 'origin', `+refs/heads/${o.baseBranch}:refs/remotes/${base}`]);
	if (fetched.status !== 0) return { ...stamp, sha: '', result: 'not-checked', why: `could not fetch ${o.baseBranch} (${said(fetched)})` };
	const sha = (git(o.toplevel, ['rev-parse', '--verify', `refs/remotes/${base}^{commit}`]).stdout ?? '').trim();
	if (!sha40.test(sha)) return { ...stamp, sha: '', result: 'not-checked', why: `${base} does not resolve` };
	const dir = mkdtempSync(join(tmpdir(), 'wf-merged-base-'));
	const tree = join(dir, 'tree');
	try {
		const added = git(o.toplevel, ['worktree', 'add', '-q', '--detach', tree, sha]);
		if (added.status !== 0) return { ...stamp, sha, result: 'not-checked', why: `could not check out ${sha.slice(0, 12)} in a temporary worktree (${said(added)})` };
		const deadline = Date.now() + o.spec.timeoutMs;
		const run = async (c: MergedBaseCommand) => {
			const left = deadline - Date.now();
			if (left <= 0) return { status: null, output: '', timedOut: true };
			const r = await runCheckProcess(c.cmd, shellArgv(c.args), { cwd: join(tree, c.cwd), worktree: tree, env: o.env, shell: process.platform === 'win32', maxBuffer: RUN_MAX_BUFFER, timeoutMs: left });
			return { status: r.status, output: withoutRunnerWarning(`${r.stdout}${r.stderr}`), timedOut: Date.now() >= deadline };
		};
		const minutes = `${Math.round(o.spec.timeoutMs / 60_000)} min`;
		for (const c of o.spec.prepare) {
			const r = await run(c);
			if (r.status !== 0) return { ...stamp, sha, result: 'not-checked', why: r.timedOut ? `${label(c)} ran out of the ${minutes} bound` : `${label(c)} failed: ${lastLines(r.output, 3).replace(/\n/g, ' / ')}` };
		}
		for (const c of o.spec.checks) {
			const r = await run(c);
			// A null status is no measurement (a timeout, or a runner that could not be released): unknown, not red.
			if (r.status === null) return { ...stamp, sha, result: 'not-checked', why: r.timedOut ? `${label(c)} ran out of the ${minutes} bound` : `${label(c)} gave no exit status: ${lastLines(r.output, 3).replace(/\n/g, ' / ')}` };
			if (r.status !== 0) return { ...stamp, sha, result: 'red', command: label(c), tail: lastLines(r.output) };
		}
		return { ...stamp, sha, result: 'green' };
	} finally {
		// The checkout goes even when a command failed or threw; prune drops the registration if the
		// folder removal had to fall back to rmSync (a Windows file still held open).
		git(o.toplevel, ['worktree', 'remove', '--force', '--force', tree]);
		rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		git(o.toplevel, ['worktree', 'prune']);
	}
}
