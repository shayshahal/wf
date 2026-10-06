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
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { roundsDir } from '../project.ts';
import { writeCloneLaunch } from './new.ts';
import { frictionLine } from '../round/friction.ts';
import { readState } from '../round/state.ts';
import type { State } from '../round/state.ts';
import type { RemovalStep } from '../seams.ts';
import { removalPlan, resolveWorktree, slugForBranch } from './worktree.ts';

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

function keepPaperwork(path: string, slug: string) {
	let porcelain = '';
	try { porcelain = execFileSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }); } catch (e) {
		// Reap removes the worktree next: without the list, its uncommitted paperwork went with it, unsaid.
		console.error(`wf reap: cannot list ${path}'s uncommitted paperwork (git status: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}); nothing removed`);
		process.exit(1);
	}
	const files = [...paperworkToKeep(porcelain), ...ROUND_RECORD.map((f) => `.wf/${f}`).filter((f) => existsSync(join(path, f)))];
	if (!files.length) return;
	const dest = join(homedir(), '.cache', 'wf-reaped', slug);
	for (const f of files) {
		mkdirSync(dirname(join(dest, f)), { recursive: true });
		copyFileSync(join(path, f), join(dest, f));
	}
	console.log(`kept ${files.length} uncommitted paperwork file(s) in ${dest}: ${files.join(', ')}`);
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
		process.exit(2);
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
	const force = reapRuns(process.env, state);
	// Paperwork first: when it cannot be listed, reap stops, and ROUNDS.md gets no line for a round
	// that is still there (2026-10-04, a broken .git: the line was written, then reap stopped).
	if (force) keepPaperwork(path, slug);
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
		if (step.rm) {
			let failed: string | null = null;
			try {
				// A dev server just killed holds its folder for a few seconds (EBUSY on Windows):
				// rmSync retries EBUSY/EPERM itself. BJEW-603 left the folder behind twice without this.
				rmSync(step.rm, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
			} catch (e) {
				// Each step tolerates what is already gone; the next steps still run, and the line says which failed.
				failed = (e as NodeJS.ErrnoException).code ?? 'failed';
			}
			// Judged by the folder, not the error: a process still running in it keeps it (2026-10-06: a
			// proxy started from BJEW-461's stack kept its folder, EBUSY), and that is not "already gone".
			console.log(!existsSync(step.rm) ? `${step.label}: ok` : `${step.label}: ${failed ?? 'failed'}, ${step.rm} is still there: a process still runs in it or holds a file in it`);
			continue;
		}
		// A step done in-process: its arguments never pass through the shell (the database drop's
		// python source would not survive cmd.exe).
		if (step.run) {
			try {
				step.run();
				console.log(`${step.label}: ok`);
			} catch (e) {
				// As above: printed, and the remaining steps run.
				console.log(`${step.label}: already gone or failed (${(e as Error).message})`);
			}
			continue;
		}
		const run = spawnSync(step.cmd!, step.args!, { encoding: 'utf8', env: { ...process.env, WF_FORCE_REAP: '1', ...(step as { env?: Record<string, string> }).env }, shell: process.platform === 'win32' });
		console.log(`${step.label}: ${run.status === 0 ? 'ok' : `already gone or failed (${(run.stderr ?? '').trim().split('\n').at(-1) || `exit ${run.status}`})`}`);
	}
	if (!force) {
		console.log(`would: take ${slug}'s entries out of the clone's .claude/launch.json`);
		console.log('(dry run: the round is not merged. WF_FORCE_REAP=1 wf reap does it anyway)');
		return;
	}
	writeCloneLaunch(slug, null);
	console.log('launch.json entries: ok');
}

if (process.argv[1]?.endsWith('reap.ts')) runReap(process.argv.slice(2));
