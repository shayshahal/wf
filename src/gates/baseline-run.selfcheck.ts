// baseline-run.selfcheck.ts — node baseline-run.selfcheck.ts → exit 0 when green.
// CONTRACT test for the isolated red-base scratch (#133): the real worktree seams (createWorktree,
// removalPlan) are plugged with a faithful fake, so creation, probe copy, ownership refusal, partial
// acquisition cleanup and teardown-failure reporting are exercised without a browser or a database.
// This is NOT lifecycle proof: it does not run the project's real setup/serve/DB. The real cycle is
// listed in the round report and must be run before publishing a change here.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireScratchLock, baselineBranchFor, scratchDestination, scratchLockPath, startBaselineScratch } from './baseline-run.ts';
import { slugForBranch } from '../worktrees/worktree.ts';
import { plug, seams } from '../seams.ts';
import type { RemovalStep } from '../seams.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const status = (repo: string) => git(repo, 'status', '--porcelain');
const branchExists = (repo: string, branch: string) => spawnSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;

const repo = mkdtempSync(join(tmpdir(), 'wf-baseline-run-'));
const scratchRoot = mkdtempSync(join(tmpdir(), 'wf-baseline-scratch-'));
const original = { createWorktree: seams.createWorktree, removalPlan: seams.removalPlan };
try {
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, 'product.ts'), 'FIXED\n');
	writeFileSync(join(repo, 'probe.ts'), 'probe fixture\n');
	git(repo, 'add', '.');
	git(repo, 'commit', '-qm', 'base');

	const created: string[] = [];
	const teardowns: string[] = [];
	const scratchPathFor = (branch: string) => join(scratchRoot, branch.replace(/[\\/]/g, '-'));
	plug({
		createWorktree: ({ branch, base }) => {
			const path = scratchPathFor(branch);
			// A real registered worktree, as the kit/env seams make one, so resolveWorktree can find it
			// when createWorktree fails before returning a path.
			git(repo, 'worktree', 'add', '--quiet', '-b', branch, path, base);
			writeFileSync(join(path, 'setup-ran.txt'), 'setup\n');
			created.push(`${branch}@${base}`);
			return { path, branch };
		},
		removalPlan: ({ path }): RemovalStep[] => [{ label: 'rm scratch', rm: path }, { label: 'git worktree prune', cmd: 'git', args: ['-C', repo, 'worktree', 'prune'] }, { label: 'record teardown', run: () => teardowns.push(path) }],
	});

	const liveStatus = status(repo);
	const liveBytes = readFileSync(join(repo, 'product.ts'), 'utf8');
	const branch = baselineBranchFor('round/bug');
	const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir');
	const lock = scratchLockPath(common, slugForBranch(branch));

	// M1/M4: the lock is a token'd, idempotent reservation. A release removes only the token this run
	// wrote, so a repeated release (or the outer finally after a catch) can never free a lock a later
	// run now holds; a failed write leaves no partial lock behind.
	const own = acquireScratchLock(common, 'release-other-owner');
	writeFileSync(own.path, 'someone-else\n');
	own.release();
	check('a release never unlinks a lock a later owner now holds', existsSync(own.path) && readFileSync(own.path, 'utf8') === 'someone-else\n');
	rmSync(own.path, { force: true });
	const twice = acquireScratchLock(common, 'release-twice');
	twice.release();
	const releaseOnce = !existsSync(twice.path);
	writeFileSync(twice.path, 'new-owner\n');
	twice.release();
	check('a release removes its own lock, and a repeated release is a no-op', releaseOnce && readFileSync(twice.path, 'utf8') === 'new-owner\n');
	rmSync(twice.path, { force: true });
	const failSlug = 'write-fail';
	const failedPath = scratchLockPath(common, failSlug);
	let writeError = '';
	try { acquireScratchLock(common, failSlug, () => { throw new Error('disk full'); }); } catch (e) { writeError = (e as Error).message; }
	check('a failed lock write reports the failure and removes its partial lock', /disk full/.test(writeError) && !existsSync(failedPath), writeError);
	let reacquired = false;
	try { const l = acquireScratchLock(common, failSlug); l.release(); reacquired = true; } catch (e) { writeError = (e as Error).message; }
	check('the failed acquisition left the scratch lock free for the next run', reacquired, writeError);
	const scratch = await startBaselineScratch({ toplevel: repo, branch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	check('the scratch worktree is created from the baseline ref through the project seam', created.length === 1 && created[0] === `${branch}@main`, JSON.stringify(created));
	check('the case\'s own test/fixture is copied into the scratch', existsSync(join(scratch.path, 'probe.ts')) && readFileSync(join(scratch.path, 'probe.ts'), 'utf8') === 'probe fixture\n');
	check('the scratch root has its own setup output; the live worktree does not', existsSync(join(scratch.path, 'setup-ran.txt')) && !existsSync(join(repo, 'setup-ran.txt')));
	// Concurrency: the fixed scratch branch plus the atomic lock mean a second acquisition is refused by
	// the lock, never reaching a cleanup that could delete the winner's resources.
	let loserRefused = false;
	let loserMsg = '';
	try { await startBaselineScratch({ toplevel: repo, branch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') }); } catch (e) { loserRefused = true; loserMsg = (e as Error).message; }
	check('a concurrent acquisition is refused by the lock, and the winner\'s worktree/branch are untouched', loserRefused && /in use/.test(loserMsg) && existsSync(scratch.path) && branchExists(repo, branch) && created.length === 1, loserMsg);
	const persistentLog = join(scratchRoot, 'baseline.log');
	writeFileSync(persistentLog, 'setup output stays\n');
	mkdirSync(join(scratch.path, '.wf', 'logs'), { recursive: true });
	writeFileSync(join(scratch.path, '.wf', 'logs', 'dev.log'), 'dev startup failed\n');
	writeFileSync(join(scratch.path, '.wf', 'logs', 'serve.log'), 'serve startup failed\n');
	const cleanRemove = await scratch.remove();
	const retained = readFileSync(persistentLog, 'utf8');
	check('both server logs survive with source boundaries and original setup output', retained.startsWith('setup output stays\n') && retained.includes('--- baseline scratch .wf/logs/dev.log ---\ndev startup failed') && retained.includes('--- baseline scratch .wf/logs/serve.log ---\nserve startup failed'));
	await scratch.remove();
	check('a repeated remove does not append diagnostics twice', readFileSync(persistentLog, 'utf8') === retained);

	check('a clean teardown removes the scratch, its branch, and reports no failures', cleanRemove.length === 0 && teardowns.length === 1 && !existsSync(scratch.path) && !branchExists(repo, branch));
	check('a clean teardown releases the scratch lock', !existsSync(lock));
	check('the live worktree bytes and index are untouched by a successful scratch', readFileSync(join(repo, 'product.ts'), 'utf8') === liveBytes && status(repo) === liveStatus, `status ${JSON.stringify(status(repo))}`);

	// Ownership/concurrency: a pre-existing scratch branch is refused, never deleted, and nothing is made.
	git(repo, 'branch', branch, 'main');
	let refused = false;
	try {
		await startBaselineScratch({ toplevel: repo, branch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	} catch { refused = true; }
	check('a pre-existing scratch branch is refused, not deleted, and no worktree is made', refused && branchExists(repo, branch) && !existsSync(scratchPathFor(branch)) && created.length === 1, JSON.stringify({ refused, exists: branchExists(repo, branch) }));
	check('the refused acquisition released its lock', !existsSync(lock));
	git(repo, 'branch', '-D', branch);

	// Partial acquisition: createWorktree makes the branch and the path, then fails. The cleanup must
	// release both before rethrowing, so a failed acquisition leaks nothing.
	plug({ createWorktree: ({ branch, base }) => { const path = scratchPathFor(branch); git(repo, 'worktree', 'add', '--quiet', '-b', branch, path, base); mkdirSync(join(path, '.wf', 'logs'), { recursive: true }); writeFileSync(join(path, '.wf', 'logs', 'dev.log'), 'partial setup diagnostic\n'); throw new Error('setup failed after the worktree was made'); } });
	let acquired = false;
	try {
		await startBaselineScratch({ toplevel: repo, branch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	} catch { acquired = true; }
	check('an acquisition failure after partial setup releases the worktree and branch, then rethrows', acquired && !existsSync(scratchPathFor(branch)) && !branchExists(repo, branch) && teardowns.length === 2, JSON.stringify({ acquired, teardowns: teardowns.length }));
	check('partial acquisition retains diagnostics discovered through the registered worktree', readFileSync(persistentLog, 'utf8').includes('partial setup diagnostic'));
	check('an acquisition failure releases its lock', !existsSync(lock));
	check('a failed acquisition also leaves the live worktree untouched', readFileSync(join(repo, 'product.ts'), 'utf8') === liveBytes && status(repo) === liveStatus);

	// Real I/O failures, not mocked fs: a directory cannot be read as a log or appended to.
	// An invalid owner must be refused, never guessed-killed, even when retention fails.
	for (const failureMode of ['read', 'append']) {
		const failedBranch = baselineBranchFor(`round/retain-${failureMode}`);
		const failedLog = join(scratchRoot, `retain-${failureMode}.log`);
		if (failureMode === 'append') mkdirSync(failedLog);
		else writeFileSync(failedLog, 'original setup output\n');
		plug({ createWorktree: ({ branch: b, base }) => { const path = scratchPathFor(b); git(repo, 'worktree', 'add', '--quiet', '-b', b, path, base); return { path, branch: b }; } });
		const failed = await startBaselineScratch({ toplevel: repo, branch: failedBranch, ref: 'main', probeFiles: [], log: failedLog });
		const source = join(failed.path, '.wf', 'logs', 'dev.log');
		mkdirSync(join(failed.path, '.wf', 'logs'), { recursive: true });
		if (failureMode === 'read') mkdirSync(source);
		else writeFileSync(source, 'only original diagnostic\n');
		const owner = join(failed.path, '.wf', 'serve-owner.json');
		writeFileSync(owner, 'invalid ownership retained');
		const beforePlan = teardowns.length;
		const result = await failed.remove();
		check(`${failureMode} retention failure is explicit and preserves scratch, source, branch and recovery`, result.some((f) => f.includes('baseline diagnostic retention failed')) && existsSync(source) && branchExists(repo, failedBranch) && existsSync(join(common, `wf-baseline-${failed.slug}.recovery.json`)) && teardowns.length === beforePlan, JSON.stringify(result));
		check(`${failureMode} retention failure attempts safe server release and preserves refused ownership`, result.some((f) => f.includes('baseline scratch server release failed')) && readFileSync(owner, 'utf8') === 'invalid ownership retained', JSON.stringify(result));
		check(`${failureMode} retention failure remains idempotent`, await failed.remove() === result);
		if (failureMode === 'read') check('failed retention preserves the original setup log', readFileSync(failedLog, 'utf8') === 'original setup output\n');
	}

	// M1: a removalPlan that rejects must report the failure, not throw, and must still free the lock
	// (it used to be released only at the last line, so a throwing plan leaked it forever because the
	// hand-off to the returned handle skipped the outer finally). A repeated remove() must not free a
	// lock a later run reacquired.
	const rejectBranch = baselineBranchFor('round/reject');
	const rejectLock = scratchLockPath(common, slugForBranch(rejectBranch));
	plug({
		createWorktree: ({ branch: b, base }) => { const path = scratchPathFor(b); git(repo, 'worktree', 'add', '--quiet', '-b', b, path, base); return { path, branch: b }; },
		removalPlan: () => { throw new Error('teardown exploded'); },
	});
	const reject = await startBaselineScratch({ toplevel: repo, branch: rejectBranch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	let rejectFailures: string[] = [];
	let rejectThrew: string | null = null;
	try { rejectFailures = await reject.remove(); } catch (e) { rejectThrew = (e as Error).message; }
	check('a throwing removalPlan is reported as an unconfirmed release, not thrown', rejectThrew === null && rejectFailures.some((f) => f.includes('teardown exploded')), rejectThrew ?? JSON.stringify(rejectFailures));
	check('a throwing removalPlan still releases the scratch lock', !existsSync(rejectLock));
	let nextOwner: { path: string; token: string; release: () => void } | null = null;
	try { nextOwner = acquireScratchLock(common, slugForBranch(rejectBranch)); } catch { /* a leaked lock (the pre-fix defect) makes this throw; the checks below record it */ }
	if (nextOwner) { try { await reject.remove(); } catch { /* a repeated remove must not throw either */ } }
	check('a repeated remove() does not release the next owner\'s lock', nextOwner !== null && existsSync(nextOwner.path) && readFileSync(nextOwner.path, 'utf8') === nextOwner.token);
	nextOwner?.release();

	// Teardown that does not confirm a release returns the failure line, so the caller can refuse green.
	plug({
		createWorktree: ({ branch, base }) => { const path = scratchPathFor(branch); git(repo, 'worktree', 'add', '--quiet', '-b', branch, path, base); return { path, branch }; },
		removalPlan: (): RemovalStep[] => [{ label: 'drop the baseline database', run: () => { throw new Error('no database answered'); } }],
	});
	const leaky = await startBaselineScratch({ toplevel: repo, branch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	const leakFailures = await leaky.remove();
	check('a teardown step that fails is reported, not silently called gone', leakFailures.some((f) => f.includes('no database answered')), JSON.stringify(leakFailures));
	check('an unreleased worktree is reported too, so the caller refuses green', leakFailures.some((f) => f.includes(leaky.path)) && branchExists(repo, branch), JSON.stringify(leakFailures));
	check('a teardown that could not release still frees the lock (the run owns it)', !existsSync(lock));

	// Exactly-once teardown: a returned remove() must never run the removal plan twice. The lock token
	// guards only the lock file, so a stale handle A, after B recreated the SAME stable branch/path,
	// drove removalPlan over B's live worktree (and `git branch -D` B). The handle now memoizes one
	// cleanup Promise; a repeated or simultaneous call returns the same failure lines.
	const onceBranch = baselineBranchFor('round/once');
	const onceLock = scratchLockPath(common, slugForBranch(onceBranch));
	let planCalls = 0;
	plug({
		createWorktree: ({ branch: b, base }) => { const path = scratchPathFor(b); git(repo, 'worktree', 'add', '--quiet', '-b', b, path, base); return { path, branch: b }; },
		removalPlan: ({ path: target }): RemovalStep[] => { planCalls++; return [{ label: 'rm once scratch', rm: target }, { label: 'prune', cmd: 'git', args: ['-C', repo, 'worktree', 'prune'] }]; },
	});
	const a = await startBaselineScratch({ toplevel: repo, branch: onceBranch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	const [aFirst, aSecond] = await Promise.all([a.remove(), a.remove()]);
	check('two simultaneous remove() calls share one cleanup and run the removal plan once', planCalls === 1 && aFirst === aSecond);
	check('a successful exactly-once remove() releases A\'s worktree, branch and lock', !existsSync(scratchPathFor(onceBranch)) && !branchExists(repo, onceBranch) && !existsSync(onceLock));

	// B recreates the same stable branch/path A had. The stale A.remove() must be a no-op.
	const b = await startBaselineScratch({ toplevel: repo, branch: onceBranch, ref: 'main', probeFiles: ['probe.ts'], log: join(scratchRoot, 'baseline.log') });
	writeFileSync(join(b.path, 'b-only.txt'), 'B owns this\n');
	const bProbeBytes = readFileSync(join(b.path, 'probe.ts'), 'utf8');
	const planBeforeStale = planCalls;
	await a.remove();
	check('a stale remove() after B started runs no removal plan and leaves B\'s worktree, branch, probe bytes and lock untouched', planCalls === planBeforeStale && existsSync(b.path) && branchExists(repo, onceBranch) && existsSync(onceLock) && readFileSync(join(b.path, 'probe.ts'), 'utf8') === bProbeBytes && existsSync(join(b.path, 'b-only.txt')), JSON.stringify({ planCalls, planBeforeStale }));
	const bFailures = await b.remove();
	check('B removes normally once the stale handle is ignored', bFailures.length === 0 && !existsSync(b.path) && !branchExists(repo, onceBranch) && !existsSync(onceLock));

	// Probe destinations cannot escape the scratch (#133 review): no absolute path, no `..`, no parent
	// symlink/junction. A path that stays inside is returned.
	const linkTarget = join(scratchRoot, 'outside');
	mkdirSync(linkTarget);
	try { symlinkSync(linkTarget, join(repo, 'linked'), 'junction'); } catch { /* junction creation is Windows-specific; the link arm is skipped where it is unsupported */ }
	const refuses = (file: string) => { try { scratchDestination(repo, file); return false; } catch { return true; } };
	check('scratchDestination refuses an absolute path, a .. escape and a parent link', refuses('/etc/passwd') && refuses('C:/Windows/x') && refuses('../escape.ts') && refuses('a/../../escape.ts') && (!existsSync(join(repo, 'linked')) || refuses('linked/escape.ts')) && scratchDestination(repo, 'a/b/probe.ts') === join(repo, 'a', 'b', 'probe.ts'), 'path guard');

	// M2: the destination's own leaf may be a link (a committed symlink or a setup-made junction). A
	// copy would follow it and overwrite a file outside the scratch. scratchDestination must refuse the
	// leaf too; shown against the real copy: without the guard, copyFileSync writes through.
	const leafRoot = mkdtempSync(join(scratchRoot, 'leaf-root-'));
	const outsideFile = join(scratchRoot, 'outside-leaf-target.ts');
	const sourceFile = join(scratchRoot, 'probe-source.ts');
	writeFileSync(outsideFile, 'ORIGINAL\n');
	writeFileSync(sourceFile, 'COPIED\n');
	let leafOk = true;
	try { symlinkSync(outsideFile, join(leafRoot, 'probe.ts'), 'file'); } catch { leafOk = false; /* a file symlink needs a privilege on Windows; the arm is skipped where it is unsupported */ }
	if (leafOk) {
		let wroteThrough = false;
		try {
			const dest = scratchDestination(leafRoot, 'probe.ts');
			copyFileSync(sourceFile, dest); // the copy a guarded acquisition would run
			wroteThrough = true;
		} catch { /* refused: the copy never runs */ }
		check('scratchDestination refuses a leaf link, so a copy does not write through to a file outside the scratch', !wroteThrough && readFileSync(outsideFile, 'utf8') === 'ORIGINAL\n', readFileSync(outsideFile, 'utf8'));
	}

	// M2 (dangling): a leaf link whose target does not exist yet is the same escape. existsSync follows
	// the link and reports false, so the earlier guard missed it and copyFileSync created the external
	// target. The lstat guard must refuse it and the external file must never appear.
	const danglingRoot = mkdtempSync(join(scratchRoot, 'dangling-root-'));
	const danglingTarget = join(scratchRoot, 'outside-dangling-target.ts');
	rmSync(danglingTarget, { force: true });
	let danglingOk = true;
	try { symlinkSync(danglingTarget, join(danglingRoot, 'probe.ts'), 'file'); } catch { danglingOk = false; /* file symlink unsupported here; the arm is skipped */ }
	if (danglingOk) {
		let madeTarget = false;
		try {
			const dest = scratchDestination(danglingRoot, 'probe.ts');
			copyFileSync(sourceFile, dest); // pre-fix: follows the dangling link and creates the target
			madeTarget = true;
		} catch { /* refused: the copy never runs */ }
		check('scratchDestination refuses a dangling leaf link, so the external target is never created', !madeTarget && !existsSync(danglingTarget), `made=${madeTarget} exists=${existsSync(danglingTarget)}`);
	}

	// The new leaf guard must not over-refuse: a normal file leaf and a not-yet-existing leaf are still
	// valid destinations, or every probe copy into the scratch would fail.
	const normalRoot = mkdtempSync(join(scratchRoot, 'normal-root-'));
	writeFileSync(join(normalRoot, 'probe.ts'), 'baseline\n');
	check('an existing regular file leaf and a new leaf are still accepted', scratchDestination(normalRoot, 'probe.ts') === join(normalRoot, 'probe.ts') && scratchDestination(normalRoot, 'brand/new.ts') === join(normalRoot, 'brand', 'new.ts'));
} finally {
	plug(original);
	rmSync(repo, { recursive: true, force: true });
	rmSync(scratchRoot, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
