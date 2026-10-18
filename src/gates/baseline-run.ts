// baseline-run.ts — the isolated scratch environment a red-base ("before") run gets (#133).
//
// The observed failure (JX-1069): `wf check` ran a `verification/` spec's red-base by stashing the
// row's change out of the LIVE worktree and driving the LIVE stack. Vite kept serving the pre-stash
// bundle after the change was restored, so the "before" measurement was taken against code the round
// no longer had, and repair cycles went to the stale server instead of the defect.
//
// A red-base task that drives the app (`task.stack`) is therefore run in the project's own scratch
// worktree at the baseline commit, through the same seams `wf new`/`wf reap` use (worktrees/worktree.ts:
// createWorktree, removalPlan). The live worktree, its index and the live stack are never touched.
//
// Unlike the in-place path (`withFixReverted`, which takes ONLY the row's named implementation files
// back), the isolated before side is the WHOLE baseline tree at `ref`, with the case's current test
// inputs copied in. That is what the issue needs: the live round keeps its fixed code, index and
// serving app, while the before measurement runs against a full baseline checkout on the baseline
// branch's own stack and database. `isTestInput` decides which declared files are copied (the test plus
// its helpers/fixtures/config); the fence already requires every changed file to be declared, so a new
// transitive test dependency is declared too. The row's fixed implementation is never copied.
//
// The scratch is at the baseline, so the case's own test and the helpers/fixtures/config it loads are
// copied in — not the row's implementation, which must stay at the baseline. The scratch is torn down
// in a finally, and `remove()` returns the steps that did NOT confirm the resource released, so the
// caller can refuse a green rather than silently claim the scratch is gone (#133 review).
//
// Ownership and concurrency are explicit: the scratch branch is a fixed name per round, so a run
// refuses when it already exists (a concurrent `wf check` or a crash's leftover) instead of deleting a
// ref it did not make. `remove()` deletes only the branch and worktree this run created.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createWorktree, listWorktrees, removalPlan, resolveWorktree, slugForBranch } from '../worktrees/worktree.ts';
import { runRemovalStep } from '../worktrees/removal.ts';
import { stopWorktreeServers } from '../worktrees/serve.ts';

/** A scratch and its teardown: `remove()` returns the failure lines (empty when everything released). */
export type BaselineScratch = { path: string; branch: string; slug: string; remove: () => Promise<string[]> };

/** A scratch's reservation: the lock file this run created, its content token, and a release that is
 * idempotent and will not unlink a lock a later run now holds. */
export type ScratchLock = { path: string; token: string; release: () => void };

/** Writes the lock's token to its fd; a test may inject a writer that fails, to exercise cleanup. */
type TokenWriter = (fd: number, token: string) => void;

/** The scratch branch for a live round's branch: a stable name, so its port and stack env are pure
 * functions of the live branch and a proof can bind them before the worktree exists. */
export const baselineBranchFor = (liveBranch: string) => `wf-baseline/${slugForBranch(liveBranch)}`;

/** The scratch branch for the round at `toplevel`: its branch name, or a commit-scoped id when HEAD is
 * detached, so two detached rounds at different commits do not share one scratch ref. */
export function scratchBranchFor(toplevel: string): string {
	const head = execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
	const id = head === 'HEAD' ? `detached-${execFileSync('git', ['-C', toplevel, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()}` : head;
	return baselineBranchFor(id);
}

/** The failure line a step did not confirm; `ok` true is silent. Never throws. Always releases the
 * lock, on every path (a clean teardown, a throwing removalPlan, a repeated `remove()`). */
async function removeScratch({ toplevel, branch, path, slug, lock, log }: { toplevel: string; branch: string; path: string | null; slug: string; lock: ScratchLock; log: string }): Promise<string[]> {
	const failures: string[] = [];
	const recovery = join(commonGitDir(toplevel), `wf-baseline-${slug}.recovery.json`);
	try {
		let worktree = path;
		if (!worktree) {
			try { worktree = resolveWorktree(branch, listWorktrees(toplevel)).path; } catch { /* createWorktree never made one: nothing on disk to remove */ }
		}
		if (worktree) {
			// #146: deletion used to erase readiness diagnostics. Save before any destructive plan step;
			// a failed save must leave the original checkout and branch available for recovery.
			try {
				writeFileSync(recovery, JSON.stringify({ branch, path: worktree, token: lock.token }));
				retainScratchLogs(worktree, log);
			} catch (e) {
				failures.push(`baseline diagnostic retention failed into ${log}; scratch retained at ${worktree}: ${e instanceof Error ? e.message : String(e)}`);
				const stopped = await stopWorktreeServers(worktree);
				if (stopped.kind === 'refused') failures.push(`baseline scratch server release failed: ${stopped.why}`);
			}
			try {
				for (const step of failures.length ? [] : await removalPlan({ branch, path: worktree, slug, pid: process.pid })) {
					const outcome = await runRemovalStep(step);
					if (!outcome.ok) { failures.push(outcome.say); break; }
					console.error(`baseline scratch: ${outcome.say}`);
				}
			} catch (e) {
				// A plan that does not even build (the project's teardown threw) leaves the resources
				// unconfirmed. Report it as a failure instead of throwing, so the caller still refuses green
				// and the finally below still releases the lock (#133 review).
				failures.push(`the scratch teardown could not run: ${(e as Error).message}`);
			}
			if (existsSync(worktree)) failures.push(`the scratch worktree ${worktree} is still there`);
		}
		// The branch did not exist before this run (startBaselineScratch refused otherwise, under the lock),
		// so it is ours.
		if (!failures.length) spawnSync('git', ['-C', toplevel, 'branch', '-D', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		if (spawnSync('git', ['-C', toplevel, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) failures.push(`the scratch branch ${branch} is still there`);
	} finally {
		// Exactly once, and only this run's lock: a second release (the caller's outer finally repeats it
		// after the catch) or a release after another run reacquired the lock is a no-op.
		lock.release();
	}
	if (!failures.length) rmSync(recovery, { force: true });
	else if (existsSync(recovery)) failures.push(`scratch recovery path retained in ${recovery}`);
	return failures;
}

// Keep source boundaries and setup output in the caller's surviving log, not another archive.
function retainScratchLogs(worktree: string, log: string): void {
	for (const source of ['dev.log', 'serve.log']) {
		let bytes: Buffer;
		try { bytes = readFileSync(join(worktree, '.wf', 'logs', source)); } catch (e) {
			if (e instanceof Error && 'code' in e && e.code === 'ENOENT') continue;
			throw e; // The teardown boundary reports the failed retention and keeps the original.
		}
		appendFileSync(log, Buffer.concat([Buffer.from(`\n--- baseline scratch .wf/logs/${source} ---\n`), bytes, Buffer.from(`\n--- end baseline scratch .wf/logs/${source} ---\n`)]));
	}
}

/** The common git dir, shared by every worktree of the repository: the scratch lock lives there. */
function commonGitDir(toplevel: string): string {
	return execFileSync('git', ['-C', toplevel, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
}

/** Pure: the lock file a scratch's exclusive reservation uses, in the common git dir (not the tree). */
export const scratchLockPath = (common: string, slug: string) => join(common, `wf-baseline-${slug}.lock`);

/**
 * Atomically reserves the scratch for `slug`: `open(..., 'wx')` is the one filesystem create-or-fail,
 * so two concurrent `wf check`s cannot both believe the scratch is free (the loser's blind cleanup
 * used to delete the winner's worktree — #133 review). Held from before the worktree is made through
 * teardown. A lock left by a crash is NOT removed here: the caller is told to remove it after checking.
 */
export function acquireScratchLock(common: string, slug: string, writeToken: TokenWriter = (fd, token) => writeSync(fd, token)): ScratchLock {
	const path = scratchLockPath(common, slug);
	const token = `${process.pid}:${randomUUID()}`;
	try {
		createLockFile(path, token, writeToken);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`the baseline scratch for ${slug} is in use by another wf check (lock ${path}). Wait for it; if no wf check is running, remove the stale lock and retry`);
		throw e;
	}
	let released = false;
	return {
		path,
		token,
		release: () => {
			if (released) return;
			released = true;
			// Remove the lock only if this run still wrote it. Between two releases the lock may be gone and
			// reacquired; an unconditional rm would free the new owner's run (#133 review).
			try {
				if (readFileSync(path, 'utf8') !== token) return;
			} catch {
				// The lock is already gone; nothing owns it now.
				return;
			}
			try { rmSync(path, { force: true }); } catch { /* already gone; nothing owns it now */ }
		},
	};
}

/**
 * Creates the lock exclusively and writes its token. If the write (or the close) fails, the fd is
 * closed and this run's own partial file removed, so a failed acquisition does not leave a lock that
 * makes every later run believe a wf check is running (#133 review).
 */
function createLockFile(path: string, token: string, writeToken: TokenWriter): void {
	const fd = openSync(path, 'wx');
	let failure: unknown = null;
	try { writeToken(fd, token); } catch (e) { failure = e; }
	try { closeSync(fd); } catch (e) { if (failure === null) failure = e; }
	if (failure === null) return;
	let cleanup: string | null = null;
	try { rmSync(path, { force: true }); } catch (e) { cleanup = (e as Error).message; }
	const message = `could not write the baseline scratch lock ${path}: ${(failure as Error).message}`;
	if (cleanup) throw new Error(`${message}; removing the partial lock also failed: ${cleanup}`, { cause: failure });
	throw new Error(message, { cause: failure });
}

/**
 * Pure: the destination a probe may be copied to inside `root`, or a refusal. A copied path is a
 * repo-relative path with no `..`; its resolved destination must stay under `root`; and no existing
 * parent may be a symlink/junction, so a write cannot escape into the live worktree or a shared
 * dependency folder (#133 review).
 */
export function scratchDestination(root: string, file: string): string {
	const f = file.replace(/\\/g, '/');
	if (f.startsWith('/') || /^[A-Za-z]:/.test(f)) throw new Error(`the probe path ${file} is absolute; only repo-relative paths are copied into the scratch`);
	if (f.split('/').includes('..')) throw new Error(`the probe path ${file} has a .. segment; it is not copied into the scratch`);
	const dest = resolve(root, f);
	const rel = relative(root, dest);
	if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`the probe path ${file} resolves outside the scratch worktree; it is not copied`);
	// The leaf itself may already be a link (a committed symlink, a setup-made junction): copyFileSync
	// would write through it to its target outside the scratch. Refuse, exactly as for a parent link
	// (#133 review). lstat, with no throwIfNoEntry, also catches a DANGLING link, which existsSync misses
	// (it follows the link and reports false when the target does not exist yet): copyFileSync would then
	// create the external target (#133 review).
	if (lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`the probe path ${file} is a link at ${dest}; it is not copied into the scratch`);
	let dir = root;
	for (const segment of rel.split(/[\\/]/).slice(0, -1)) {
		dir = join(dir, segment);
		if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`the probe path ${file} goes through a link at ${dir}; it is not copied into the scratch`);
	}
	return dest;
}

/**
 * Creates the scratch worktree at `ref`, copies the case's probe/test inputs into it, and returns the
 * handle. Throws (after cleaning any partially created resource) when the branch already exists. The
 * caller MUST call `remove()` in a finally and refuse a green if it returns failures.
 */
export async function startBaselineScratch({ toplevel, branch, ref, probeFiles, log }: { toplevel: string; branch: string; ref: string; probeFiles: readonly string[]; log: string }): Promise<BaselineScratch> {
	const slug = slugForBranch(branch);
	// Atomic reservation first: the loser of a concurrent race must never reach a blind cleanup that
	// could remove the winner's worktree.
	const lock = acquireScratchLock(commonGitDir(toplevel), slug);
	let handedOff = false;
	try {
		// Under the lock, a branch that already exists is a crash's leftover, not a concurrent run's.
		// Never delete a ref this run did not make; refuse and name it with the recovery.
		if (spawnSync('git', ['-C', toplevel, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
			let at = '';
			const recovery = join(commonGitDir(toplevel), `wf-baseline-${slug}.recovery.json`);
			if (existsSync(recovery)) at = ` (recovery record ${recovery})`;
			try { at = ` at ${resolveWorktree(branch, listWorktrees(toplevel)).path}`; } catch { /* the branch exists with no worktree on disk */ }
			const recover = at.startsWith(' at ') ? `git worktree remove --force${at.slice(3)} && ` : '';
			throw new Error(`the baseline scratch branch ${branch} already exists${at} — a crash's leftover. wf will not delete a ref it did not make; inspect it (git worktree list) and remove it yourself (${recover}git branch -D ${branch}) before retrying`);
		}
		mkdirSync(dirname(log), { recursive: true });
		let path: string | null = null;
		try {
			({ path } = await createWorktree({ branch, base: ref, log }));
			for (const file of probeFiles) {
				const dest = scratchDestination(path, file);
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(join(toplevel, file), dest);
			}
		} catch (e) {
			// createWorktree runs the project's setup: it may fail after part of it (a worktree, a database),
			// before it returns a path. Tear down whatever this run made, then rethrow. removeScratch frees
			// the lock; the finally below repeats it harmlessly.
			const failures = await removeScratch({ toplevel, branch, path, slug, lock, log });
			for (const failure of failures) console.error(`baseline scratch: cleanup could not confirm: ${failure}`);
			throw e;
		}
		// Ownership passes to the returned handle; its `remove()` frees the lock at teardown.
		handedOff = true;
		// Exactly-once teardown: the handle memoizes one cleanup Promise, so a repeated or simultaneous
		// `remove()` returns the same failure lines instead of running the removal plan again. The lock
		// token only guards the lock file; a stale handle whose branch/path were recreated by a later run
		// must not drive that run's worktree, stack or database through `git branch -D`/the removal plan
		// (#133 review).
		let cleanup: Promise<string[]> | null = null;
		const remove = () => (cleanup ??= removeScratch({ toplevel, branch, path, slug, lock, log }));
		return { path, branch, slug, remove };
	} finally {
		// The handle's remove() owns the lock after hand-off; before it, release here. Idempotent and
		// token-guarded, so the catch's release above and this one cannot free a later owner's lock.
		if (!handedOff) lock.release();
	}
}
