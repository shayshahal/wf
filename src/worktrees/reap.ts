#!/usr/bin/env node
// reap.ts — wf reap <branch>: tear a merged round's worktree down (LIFECYCLE.md).
// Dry by default: it prints the steps as `would: <cmd>`. WF_FORCE_REAP=1 runs them,
// and is passed through to `wt remove` — the pre-remove hook wants it too when the
// round never reached step: merged.
// A round at step merged (wf deliver merged it) is reaped for real without the flag: the dry default
// guards unfinished work, and a finished round has none. BJEW-562 (2026-09-27): wf next said
// `wf reap <branch>`, it only printed its plan, and Claude Code's auto mode refused the flag.
// Every step tolerates "already gone": a reap that is re-run is a no-op, not an error.
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { roundsDir } from '../project.ts';
import { writeCloneLaunch } from './new.ts';
import { frictionLine } from '../round/friction.ts';
import { readState } from '../round/state.ts';
import { mergedImplementationGap } from '../round/delivered-round.ts';
import type { State } from '../round/state.ts';
import type { RemovalStep } from '../seams.ts';
import { removalPlan, resolveWorktree, slugForBranch } from './worktree.ts';
import { runRemovalStep } from './removal.ts';

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
		console.error(`wf reap: cannot list ${path}'s uncommitted paperwork (git status: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}); nothing removed`);
		process.exit(1);
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

// Pure: the step that deletes the round's local branch, or null. Only a merged round's (wf deliver
// merged it and deleted the remote one): a force-reaped round that never merged keeps its work. The
// team's clone collected them, cr/TJEW-670-texts-buttons and -back-button (2026-09-28).
export function branchStep(state: State | null, branch: string, gitDir: string): Extract<RemovalStep, { cmd: string }> | null {
	return state?.step === 'merged' ? { label: `delete local branch ${branch}`, cmd: 'git', args: [`--git-dir=${gitDir}`, 'branch', '-D', branch] } : null;
}

export async function runReap(argv: string[]) {
	const branch = argv.find((a) => !a.startsWith('-'));
	if (!branch) {
		console.error('usage: wf reap <branch>   (WF_FORCE_REAP=1 to actually run)');
		refuseCaller();
	}
	let path: string;
	try {
		path = resolveWorktree(branch).path;
	} catch (e) {
		console.error((e as Error).message);
		process.exit(1);
	}
	const slug = slugForBranch(branch);
	const state = readState(path);
	const mergedGap = state ? mergedImplementationGap(path, state) : null;
	if (mergedGap && process.env.WF_FORCE_REAP !== '1') {
		console.error(`wf reap: ${mergedGap.reason}; nothing removed. WF_FORCE_REAP=1 intentionally discards the worktree and local branch`);
		process.exit(2);
	}
	if (mergedGap) console.warn(`wf reap: forcing removal despite ${mergedGap.reason}; product changes are not archived`);
	const force = reapRuns(process.env, state);
	// Paperwork first: when it cannot be listed, reap stops, and ROUNDS.md gets no line for a round
	// that is still there (2026-10-04, a broken .git: the line was written, then reap stopped).
	const kept = force ? keepRoundPaperwork(path, slug, state?.folder) : null;
	if (force && state) recordFriction(path, state);
	// Read before the worktree goes: the repository the branch lives in.
	const gitDir = execFileSync('git', ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const deleteBranch = branchStep(state, branch, gitDir);
	for (const step of [...(await removalPlan({ branch, path, slug, pid: process.pid })), ...(deleteBranch ? [deleteBranch] : [])]) {
		const shown = step.rm ? `rm -rf ${step.rm}` : step.run ? step.label : `${step.cmd} ${step.args!.join(' ')}`;
		if (!force) {
			console.log(`would: ${shown}`);
			continue;
		}
		console.log(runRemovalStep(step).say);
	}
	if (!force) {
		console.log(`would: take ${slug}'s entries out of the clone's .claude/launch.json`);
		console.log('(dry run: the round is not merged. WF_FORCE_REAP=1 wf reap does it anyway)');
		return;
	}
	writeCloneLaunch(slug, null);
	console.log('launch.json entries: ok');
	if (kept) console.log(reapSummary({ slug, dest: join(homedir(), '.cache', 'wf-reaped', slug), ...kept, folder: state?.folder, worktree: path, worktreeGone: !existsSync(path) }));
}

if (process.argv[1]?.endsWith('reap.ts')) runReap(process.argv.slice(2));
