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
import { resolveWorktree } from './resolve-worktree.mjs';
import { slugForBranch } from './scripts/worktree-ports.mjs';

// Pure: the ordered steps. `rm` is done in-process (fs.rmSync), so it carries no cmd.
export function reapPlan({ branch, path, slug, pid }) {
	// git reports the path with forward slashes, a process command line carries backslashes:
	// match either spelling or the sweep finds nothing.
	const fwd = path.replace(/\\/g, '/').replace(/'/g, "''");
	const bck = fwd.replace(/\//g, '\\');
	const ps = `$ProgressPreference = 'SilentlyContinue'; Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='python.exe'" | Where-Object { ($_.CommandLine -like '*${fwd}*' -or $_.CommandLine -like '*${bck}*') -and $_.ProcessId -ne ${pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
	// Stragglers go first: a live dev server holds the tree, so `wt remove` failed while it ran.
	// -EncodedCommand, not -Command: the steps run through cmd.exe on Windows, which cut the
	// script at its first `|` ("'Where-Object' is not recognized") and killed nothing (BJEW-454 reap).
	return [
		{ label: 'kill stragglers', cmd: 'powershell', args: ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')] },
		{ label: 'wt remove', cmd: 'wt', args: ['remove', branch, '--no-delete-branch', '--force', '--foreground', '-y'] },
		{ label: 'rm -rf worktree', rm: path },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
		{ label: 'docker rm mongo', cmd: 'docker', args: ['rm', '-f', `jewelryx-mongo-${slug}`] },
		{ label: 'docker volume rm', cmd: 'docker', args: ['volume', 'rm', `jewelryx-wt-mongo-${slug}`] },
		// The compose network outlives its container; 23 of them exhausted docker's address pools and
		// the next `wf new` failed: "all predefined address pools have been fully subnetted" (3187601171).
		{ label: 'docker network rm', cmd: 'docker', args: ['network', 'rm', `jewelryx-wt-${slug}_default`] },
		{ label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } },
	];
}

// Pure: the uncommitted round paperwork in `git status --porcelain --untracked-files=all` output.
// The root REVIEW.md is written after deliver commits the round folder, so it is uncommitted on
// every round; reap deleted it and any unfinished SPEC/notes without a word (TJEW-700).
export function paperworkToKeep(porcelain) {
	return porcelain.split('\n').filter((l) => l.length > 3 && !l.startsWith(' D') && !l.startsWith('D '))
		.map((l) => l.slice(3).split(' -> ').at(-1).replace(/^"|"$/g, ''))
		.filter((f) => /^bug-reports\//.test(f) || /^(SPEC|SPEC-REVIEW|REVIEW)\.md$/.test(f));
}

function keepPaperwork(path, slug) {
	let porcelain = '';
	try { porcelain = execFileSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }); } catch { return; }
	const files = paperworkToKeep(porcelain);
	if (!files.length) return;
	const dest = join(homedir(), '.cache', 'jewelryx-reaped', slug);
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
	for (const step of reapPlan({ branch, path, slug, pid: process.pid })) {
		const shown = step.rm ? `rm -rf ${step.rm}` : `${step.cmd} ${step.args.join(' ')}`;
		if (!force) {
			console.log(`would: ${shown}`);
			continue;
		}
		if (step.rm) {
			try {
				// The dev server just killed holds packages/backend for a few seconds (EBUSY on Windows):
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
