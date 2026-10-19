#!/usr/bin/env node
// reap.ts — wf reap <branch>: tear a merged round's worktree down (LIFECYCLE.md).
// Dry by default: it prints the steps as `would: <cmd>`. WF_FORCE_REAP=1 runs them,
// and is passed through to `wt remove` — the pre-remove hook wants it too when the
// round never reached step: merged.
// A round at step merged (wf deliver merged it) is reaped for real without the flag: the dry default
// guards unfinished work, and a finished round has none. BJEW-562 (2026-09-27): wf next said
// `wf reap <branch>`, it only printed its plan, and Claude Code's auto mode refused the flag.
// Every step tolerates "already gone": a reap that is re-run is a no-op, not an error.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { roundsDir } from '../project.ts';
import { writeCloneLaunch } from './new.ts';
import { frictionLine } from '../round/friction.ts';
import { readState } from '../round/state.ts';
import { mergedImplementationGap } from '../round/delivered-round.ts';
import { acquireProcessLock } from '../process-lock.ts';
import type { State } from '../round/state.ts';
import type { RemovalStep } from '../seams.ts';
import { listWorktrees, removalPlan, resolveWorktree, slugForBranch } from './worktree.ts';
import { runRemovalStep } from './removal.ts';
import { reapWorkspaceGap } from './session-workspace.ts';

// Pure: the uncommitted round paperwork in `git status --porcelain --untracked-files=all` output.
// The root REVIEW.md is written after deliver commits the round folder, so it is uncommitted on
// every round; reap deleted it and any unfinished SPEC/notes without a word (TJEW-700).
export function paperworkToKeep(porcelain: string) {
	return porcelain.split('\n').filter((l) => l.length > 3 && !l.startsWith(' D') && !l.startsWith('D '))
		.map((l) => l.slice(3).split(' -> ').at(-1)!.replace(/^"|"$/g, ''))
		.filter((f) => f.startsWith(`${roundsDir}/`) || /^(SPEC|SPEC-REVIEW|REVIEW)\.md$/.test(f));
}

// The round's own record in .wf/, which git never lists (wf excludes the folder): its state, with the
// time it spent in each step, and the logs friction.ts reads. Reap dropped them, so no past round could
// be measured but by its ROUNDS.md line (2026-10-03: the five reaped rounds had none). Not logs/: the
// dev servers' output.
export const ROUND_RECORD = ['state.json', 'checks.log', 'events.log'];

// Pure: everything in the round's proof/ folder, which the project may gitignore, so git status never
// lists it. JX-268 (BJEW-562, 2026-10-07): the note was posted without the pictures (no JIRA_TOKEN in the
// session), the user was told to attach them by hand, and reap deleted the folder they were in. JX-1239
// (2026-10-12): reap kept only the numbered before/after pairs, and a round's named screenshots, traces
// and nested run folders went with the worktree. Whatever proof/ holds is evidence: `names` are its files
// relative to proof/ (nested ones with their folder), and all of them are kept.
export const proofToKeep = (folder: string, names: string[]) => names.map((n) => `${folder}/proof/${n}`);

// The files under `dir`, relative to it with `/`, nested folders included.
function filesUnder(dir: string, within = ''): string[] {
	return readdirSync(join(dir, within), { withFileTypes: true }).flatMap((e) => {
		const rel = within ? `${within}/${e.name}` : e.name;
		return e.isDirectory() ? filesUnder(dir, rel) : [rel];
	});
}

// Pure: what reap says when it is done, for the person who reads it later: where the kept copy is and what
// is in it, what stayed in git instead (the round folder's commits are in the history, not in the copy), and
// whether the worktree is gone. `committed` is null when git could not list them.
export function reapSummary({ slug, dest, files, committed, folder, worktree, worktreeGone }: { slug: string; dest: string; files: string[]; committed: string[] | null; folder: string | undefined; worktree: string; worktreeGone: boolean }): string {
	const proof = files.filter((f) => folder && f.startsWith(`${folder}/proof/`)).length;
	return [
		`reaped ${slug}: worktree ${worktree}: ${worktreeGone ? 'deleted' : 'NOT deleted (still there)'}`,
		files.length ? `kept copy: ${dest} — ${files.length} file(s): ${proof} proof artifact(s), ${files.length - proof} other (uncommitted paperwork, round record)` : 'kept copy: none (nothing uncommitted or ignored to keep)',
		committed === null ? 'in git: could not list the committed round files (git ls-files failed)' : `in git, not copied: ${committed.length} committed file(s) under ${folder ?? '(no round folder)'}/ — they stay in the branch's commits, not in the kept copy`,
	].join('\n');
}

// Copies what git will not keep once the worktree is gone: the uncommitted round paperwork, all of proof/
// and the round's record, into `<cacheRoot>/<slug>`. Returns the files kept, and the committed ones under the
// round folder (git has those) or null when git could not list them.
export function keepRoundPaperwork(path: string, slug: string, folder: string | undefined, cacheRoot = join(homedir(), '.cache', 'wf-reaped')): { files: string[]; committed: string[] | null } {
	let porcelain = '';
	try { porcelain = execFileSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }); } catch (e) {
		// Reap removes the worktree next: without the list, its uncommitted paperwork went with it, unsaid.
		// A thrown value, not process.exit: reap holds its lock here, and exit would bypass the finally
		// that releases it (#154, 2026-10-16), stranding every later reap.
		throw new Error(`wf reap: cannot list ${path}'s uncommitted paperwork (git status: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}); nothing removed`);
	}
	const proofDir = folder ? join(path, folder, 'proof') : null;
	const pictures = folder && proofDir && existsSync(proofDir) ? proofToKeep(folder, filesUnder(proofDir)) : [];
	const files = [...new Set([...paperworkToKeep(porcelain), ...pictures, ...ROUND_RECORD.map((f) => `.wf/${f}`).filter((f) => existsSync(join(path, f)))])];
	const dest = join(cacheRoot, slug);
	for (const f of files) {
		mkdirSync(dirname(join(dest, f)), { recursive: true });
		copyFileSync(join(path, f), join(dest, f));
	}
	if (files.length) console.log(`kept ${files.length} uncommitted paperwork file(s) in ${dest}: ${files.join(', ')}`);
	let committed: string[] | null = null;
	if (folder) {
		try {
			const tracked = execFileSync('git', ['-C', path, 'ls-files', '-z', '--', folder], { encoding: 'utf8' }).split('\0').filter(Boolean);
			committed = tracked.filter((f) => !files.includes(f));
		} catch {
			// The summary says the committed files could not be listed; the copy above is already made.
			committed = null;
		}
	} else committed = [];
	return { files, committed };
}

// The round's friction line (friction.ts), printed and added to ~/.cache/wf-reaped/ROUNDS.md, one
// line per round, before the worktree and its .wf/ go.
function recordFriction(path: string, state: State) {
	const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
	const line = frictionLine({
		state,
		checksLog: read(join(path, '.wf', 'checks.log')),
		eventsLog: read(join(path, '.wf', 'events.log')),
		reviewText: read(join(path, state?.folder ?? '', 'REVIEW.md')),
		end: new Date().toISOString(),
	});
	const ledger = join(homedir(), '.cache', 'wf-reaped', 'ROUNDS.md');
	mkdirSync(dirname(ledger), { recursive: true });
	if (!existsSync(ledger)) appendFileSync(ledger, '# Rounds, one line each: time per step, agents per phase, checks, refusals, questions, T2s\n\n');
	appendFileSync(ledger, `${line}\n`);
	console.log(`round ${line.slice(2)}\n(added to ${ledger})`);
}

// Pure: whether reap runs its steps, or only prints them.
export function reapRuns(env: NodeJS.ProcessEnv, state: State | null) {
	return env.WF_FORCE_REAP === '1' || state?.step === 'merged';
}

// Pure: the argv that deletes a local branch in the repository the round's branch lives in.
export const branchDeleteArgs = (gitDir: string, branch: string) => [`--git-dir=${gitDir}`, 'branch', '-D', branch];

// Pure: the step that deletes the round's local branch, or null. Only a merged round's (wf deliver
// merged it and deleted the remote one): a force-reaped round that never merged keeps its work. The
// team's clone collected them, cr/TJEW-670-texts-buttons and -back-button (2026-09-28).
// A branch already deleted by hand is "already gone", not a failure: `git branch -D` exits 1 on a
// missing branch, and reap re-runs its last step from the journal, so that exit 1 repeated forever —
// the folder deleted, the journal never cleared (2026-10-18, #180's neighbouring report).
export function branchStep(state: State | null, branch: string, gitDir: string): RemovalStep | null {
	if (state?.step !== 'merged') return null;
	return { label: `delete local branch ${branch}`, run: () => {
		const ref = `refs/heads/${branch}`;
		if (spawnSync('git', [`--git-dir=${gitDir}`, 'show-ref', '--verify', '--quiet', ref]).status !== 0) return;
		const removed = spawnSync('git', branchDeleteArgs(gitDir, branch), { encoding: 'utf8' });
		if (removed.status !== 0) throw new Error(`${removed.stderr.trim().split('\n').at(-1) || `git branch -D exited ${removed.status}`}`);
	} };
}

// Pure: what reap says about the local branch. A merged round's was deleted by its own step; anything
// else keeps it on purpose (an unmerged round's work is not ours to delete), and a reap that silently
// leaves a branch behind reads as a failure to the person running it (2026-10-18, #180: two worktrees
// whose branches were deleted by hand after reap said nothing about them).
export function branchKeptLine(state: State | null, branch: string, deleted: boolean): string {
	if (deleted) return `local branch ${branch}: deleted (the round merged)`;
	return state
		? `local branch ${branch}: kept — this round never reached step merged, so its work stays`
		: `local branch ${branch}: kept — this worktree was not a round`;
}

// Directory identity survives a partially deleted .wf folder; a replacement gets another file ID.
function reapDirectoryIdentity(path: string): string {
	const stat = statSync(path, { bigint: true });
	return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

export async function runReap(argv: string[]) {
	const branch = argv.find((a) => !a.startsWith('-'));
	if (!branch) {
		console.error('usage: wf reap <branch>   (WF_FORCE_REAP=1 to actually run)');
		refuseCaller();
	}
	const trees = listWorktrees();
	const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const journal = join(common, `wf-reap-${createHash('sha256').update(branch).digest('hex')}.json`);
	let progress = 0;
	let rememberedMerged = false;
	let token: string = randomUUID();
	let directory: string | null = null;
	let path: string;
	if (existsSync(journal)) {
		const saved: unknown = JSON.parse(readFileSync(journal, 'utf8'));
		// A null identity is valid only while the target remains gone. Never adopt a replacement
		// directory from an interrupted journal that recorded no authority to remove it (#154).
		if (typeof saved !== 'object' || saved === null || !('branch' in saved) || saved.branch !== branch || !('path' in saved) || typeof saved.path !== 'string' || !isAbsolute(saved.path) || !('next' in saved) || typeof saved.next !== 'number' || !Number.isSafeInteger(saved.next) || saved.next < 0 || !('merged' in saved) || typeof saved.merged !== 'boolean' || !('token' in saved) || typeof saved.token !== 'string' || !('directory' in saved) || (saved.directory !== null && typeof saved.directory !== 'string')) throw new Error('wf reap: invalid recovery journal; nothing removed');
		path = saved.path; progress = saved.next; rememberedMerged = saved.merged; token = saved.token; directory = saved.directory;
	} else {
		path = resolveWorktree(branch, trees).path;
	}
	// Never delete an ancestor of the surviving repository or its metadata. Resolve before rm.
	path = resolve(path);
	const recovering = existsSync(journal);
	// A shell cd/force flag cannot free a native chat's workspace. Check the resolved recovery
	// path too, before even constructing teardown steps or acquiring/reclaiming a cleanup lock.
	const workspaceGap = await reapWorkspaceGap(path, { recovering });
	if (workspaceGap) {
		console.error(`wf reap: ${workspaceGap}; nothing removed`);
		process.exitCode = 1;
		return;
	}
	const survivor = trees.find((tree) => resolve(tree.path) !== path && !tree.bare)?.path ?? common;
	const withinTarget = (candidate: string) => resolve(candidate).toLowerCase() === path.toLowerCase() || resolve(candidate).toLowerCase().startsWith(`${path.toLowerCase()}\\` ) || resolve(candidate).startsWith(`${path}/`);
	const slug = slugForBranch(branch);
	const state = readState(path);
	const mergedGap = state ? mergedImplementationGap(path, state) : null;
	if (mergedGap && process.env.WF_FORCE_REAP !== '1') {
		console.error(`wf reap: ${mergedGap.reason}; nothing removed. WF_FORCE_REAP=1 intentionally discards the worktree and local branch`);
		process.exit(2);
	}
	if (mergedGap) console.warn(`wf reap: forcing removal despite ${mergedGap.reason}; product changes are not archived`);
	const force = recovering || reapRuns(process.env, state);
	// Paperwork first: when it cannot be listed, reap stops, and ROUNDS.md gets no line for a round
	// that is still there (2026-10-04, a broken .git: the line was written, then reap stopped).
	// Read before the worktree goes: the repository the branch lives in.
	const gitDir = common;
	const deleteBranch = rememberedMerged ? { label: `delete local branch ${branch}`, cmd: 'git', args: [`--git-dir=${gitDir}`, 'branch', '-D', branch] } : branchStep(state, branch, gitDir);
	const steps = [...(await removalPlan({ branch, path, slug, pid: process.pid })), ...(deleteBranch ? [deleteBranch] : [])];
	if (withinTarget(common) || withinTarget(survivor)) throw new Error('wf reap: target contains the surviving repository; nothing removed');
	const reapLock = force ? acquireProcessLock(`${journal}.lock`) : null;
	if (reapLock && reapLock.kind === 'refused') {
		console.error(reapLock.why);
		process.exitCode = 1;
		return;
	}
	try {
		if (force && existsSync(path)) {
			const current = reapDirectoryIdentity(path);
			if (directory !== null) {
				if (current !== directory) throw new Error('wf reap: recovery target ownership changed; nothing removed');
			} else if (recovering) {
				// The journal recorded no identity because the target had already gone when it was written;
				// a path there now is a replacement this stale record may not delete.
				throw new Error('wf reap: recovery journal has no target identity and the target now exists; nothing removed');
			} else {
				directory = current;
			}
		}
		let kept: { files: string[]; committed: string[] | null } | null = null;
		if (force && !existsSync(journal)) {
			// A thrown value is handled here so the finally still releases the lock.
			try { kept = keepRoundPaperwork(path, slug, state?.folder); }
			catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; return; }
		}
		if (force && state && !existsSync(journal)) recordFriction(path, state);
		const save = (next: number) => {
			const temp = `${journal}.${process.pid}.tmp`;
			writeFileSync(temp, JSON.stringify({ branch, path, token, directory, next, merged: rememberedMerged || state?.step === 'merged' }));
			renameSync(temp, journal);
		};
		if (force) {
			save(progress);
			// The invoking process must not hold the directory it is about to remove (Windows EBUSY).
			process.chdir(survivor);
		}
		for (let index = progress; index < steps.length; index++) {
			const step = steps[index];
			const shown = step.rm ? `rm -rf ${step.rm}` : step.run ? step.label : `${step.cmd} ${step.args!.join(' ')}`;
			if (!force) { console.log(`would: ${shown}`); continue; }
			if (existsSync(path) && reapDirectoryIdentity(path) !== directory) throw new Error('wf reap: target ownership changed during cleanup; recovery journal retained');
			const registered = listWorktrees(survivor).filter((tree) => tree.branch === branch);
			if (registered.some((tree) => resolve(tree.path) !== path)) throw new Error('wf reap: branch is now owned by another worktree; recovery journal retained');
			const outcome = await runRemovalStep(step);
			console.log(outcome.say);
			// wt may unregister first, then fail deleting an open directory. The journal still owns it;
			// continue to the explicit directory removal, which will preserve progress if that fails too.
			const unregistered = step.label === 'wt remove' && !listWorktrees(survivor).some((tree) => resolve(tree.path) === path);
			if (!outcome.ok && !unregistered) {
				const where = existsSync(path) ? `the worktree is still at ${path}` : 'the worktree itself is gone — only this step is outstanding';
				console.error(`wf reap: incomplete (${where}); recovery journal ${journal}. Retry wf reap ${branch} from ${survivor}`);
				process.exitCode = 1;
				return;
			}
			save(index + 1);
		}
		if (!force) {
			console.log(`would: take ${slug}'s entries out of the clone's .claude/launch.json`);
			console.log('(dry run: the round is not merged. WF_FORCE_REAP=1 wf reap does it anyway)');
			return;
		}
		if (existsSync(path)) { console.error(`wf reap: ${path} remains; recovery journal retained`); process.exitCode = 1; return; }
		writeCloneLaunch(slug, null);
		unlinkSync(journal);
		console.log('launch.json entries: ok');
		console.log(branchKeptLine(state, branch, deleteBranch !== null));
		if (kept) console.log(reapSummary({ slug, dest: join(homedir(), '.cache', 'wf-reaped', slug), ...kept, folder: state?.folder, worktree: path, worktreeGone: !existsSync(path) }));
	} finally { reapLock?.release(); }
}

if (process.argv[1]?.endsWith('reap.ts')) runReap(process.argv.slice(2));
