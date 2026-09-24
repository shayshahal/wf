#!/usr/bin/env node
// reap.mjs — wf reap <branch>: tear a merged round's worktree down (LIFECYCLE.md).
// Dry by default: it prints the steps as `would: <cmd>`. WF_FORCE_REAP=1 runs them,
// and is passed through to `wt remove` — the pre-remove hook wants it too when the
// round never reached step: merged.
// Every step tolerates "already gone": a reap that is re-run is a no-op, not an error.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { roundsDir } from './project.mjs';
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

export function runReap(argv) {
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
	const force = process.env.WF_FORCE_REAP === '1';
	if (force) keepPaperwork(path, slug);
	for (const step of removalPlan({ branch, path, slug, pid: process.pid })) {
		const shown = step.rm ? `rm -rf ${step.rm}` : `${step.cmd} ${step.args.join(' ')}`;
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
		const run = spawnSync(step.cmd, step.args, { encoding: 'utf8', env: { ...process.env, WF_FORCE_REAP: '1', ...step.env }, shell: process.platform === 'win32' });
		console.log(`${step.label}: ${run.status === 0 ? 'ok' : `already gone or failed (${(run.stderr ?? '').trim().split('\n').at(-1) || `exit ${run.status}`})`}`);
	}
	if (!force) console.log('(dry run — WF_FORCE_REAP=1 wf reap to do it)');
}

if (process.argv[1]?.endsWith('reap.mjs')) runReap(process.argv.slice(2));
