#!/usr/bin/env node
// reap.mjs — wf reap <branch>: tear a merged round's worktree down (LIFECYCLE.md).
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
import { roundsDir } from './project.mjs';
import { writeCloneLaunch } from './new.mjs';
import { frictionLine } from './friction.mjs';
import { readState } from './state.mjs';
import { removalPlan, resolveWorktree, slugForBranch } from './worktree.mjs';

// Pure: the uncommitted round paperwork in `git status --porcelain --untracked-files=all` output.
// The root REVIEW.md is written after deliver commits the round folder, so it is uncommitted on
// every round; reap deleted it and any unfinished SPEC/notes without a word (TJEW-700).
export function paperworkToKeep(porcelain) {
	return porcelain.split('\n').filter((l) => l.length > 3 && !l.startsWith(' D') && !l.startsWith('D '))
		.map((l) => l.slice(3).split(' -> ').at(-1).replace(/^"|"$/g, ''))
		.filter((f) => f.startsWith(`${roundsDir}/`) || /^(SPEC|SPEC-REVIEW|REVIEW)\.md$/.test(f));
}

function keepPaperwork(path, slug) {
	let porcelain = '';
	try { porcelain = execFileSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }); } catch { return; }
	const files = paperworkToKeep(porcelain);
	if (!files.length) return;
	const dest = join(homedir(), '.cache', 'wf-reaped', slug);
	for (const f of files) {
		mkdirSync(dirname(join(dest, f)), { recursive: true });
		copyFileSync(join(path, f), join(dest, f));
	}
	console.log(`kept ${files.length} uncommitted paperwork file(s) in ${dest}: ${files.join(', ')}`);
}

// The round's friction line (friction.mjs), printed and added to ~/.cache/wf-reaped/ROUNDS.md, one
// line per round, before the worktree and its .wf/ go.
function recordFriction(path, state) {
	const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
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
export function reapRuns(env, state) {
	return env.WF_FORCE_REAP === '1' || state?.step === 'merged';
}

// Pure: the step that deletes the round's local branch, or null. Only a merged round's (wf deliver
// merged it and deleted the remote one): a force-reaped round that never merged keeps its work. The
// team's clone collected them, cr/TJEW-670-texts-buttons and -back-button (2026-09-28).
export function branchStep(state, branch, gitDir) {
	return state?.step === 'merged' ? { label: `delete local branch ${branch}`, cmd: 'git', args: [`--git-dir=${gitDir}`, 'branch', '-D', branch] } : null;
}

export async function runReap(argv) {
	const branch = argv.find((a) => !a.startsWith('-'));
	if (!branch) {
		console.error('usage: wf reap <branch>   (WF_FORCE_REAP=1 to actually run)');
		process.exit(2);
	}
	let path;
	try {
		path = resolveWorktree(branch).path;
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
	const slug = slugForBranch(branch);
	const state = readState(path);
	const force = reapRuns(process.env, state);
	if (force && state) recordFriction(path, state);
	if (force) keepPaperwork(path, slug);
	// Read before the worktree goes: the repository the branch lives in.
	const gitDir = execFileSync('git', ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const deleteBranch = branchStep(state, branch, gitDir);
	for (const step of [...(await removalPlan({ branch, path, slug, pid: process.pid })), ...(deleteBranch ? [deleteBranch] : [])]) {
		const shown = step.rm ? `rm -rf ${step.rm}` : step.run ? step.label : `${step.cmd} ${step.args.join(' ')}`;
		if (!force) {
			console.log(`would: ${shown}`);
			continue;
		}
		if (step.rm) {
			try {
				// A dev server just killed holds its folder for a few seconds (EBUSY on Windows):
				// rmSync retries EBUSY/EPERM itself. BJEW-603 left the folder behind twice without this.
				rmSync(step.rm, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
				console.log(`${step.label}: ok`);
			} catch (e) {
				console.log(`${step.label}: ${e.code ?? 'failed'} (already gone?)`);
			}
			continue;
		}
		// A step done in-process: its arguments never pass through the shell (the database drop's
		// python source would not survive cmd.exe).
		if (step.run) {
			try {
				step.run();
				console.log(`${step.label}: ok`);
			} catch (e) {
				console.log(`${step.label}: already gone or failed (${e.message})`);
			}
			continue;
		}
		const run = spawnSync(step.cmd, step.args, { encoding: 'utf8', env: { ...process.env, WF_FORCE_REAP: '1', ...step.env }, shell: process.platform === 'win32' });
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

if (process.argv[1]?.endsWith('reap.mjs')) runReap(process.argv.slice(2));
