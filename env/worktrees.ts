// env/worktrees.ts — Shay's worktrees: worktrunk creates them (with wf's hooks, env/hook.ts) and
// removes them. Plugged into the kit's createWorktree and removalPlan seams by env/wf.mjs.
import { closeSync, openSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { teardown } from '../src/project.ts';
import { stragglersStep } from '../src/worktrees/serve.ts';
import { excludeWfFolder, resolveWorktree } from '../src/worktrees/worktree.ts';
import type { RemovalStep, Seams } from '../src/seams.ts';

// Created with no hooks, then only wf's (`wt hook <type> user:`) run inside it. worktrunk reads the
// project's hooks from the folder the command runs in, and 20 older checkouts still carry the
// .config/wt.toml that left JewelryX in #222: from one of them, `wt switch --create` ran those too,
// against scripts the new checkout no longer has, and the create failed (2026-09-24).
// wt's post-start tether keeps the dev servers alive in the background, and they inherit whatever
// stdout wt was given. Under a pipe (an agent harness, `wf new | tee`) that pipe never reaches EOF
// and the caller hangs on the tether (measured 40 min on 2026-09-20). A log file hands the tether a
// descriptor of its own, so this returns as soon as wt exits. Returns the worktree, or throws with
// the log.
export function createWorktree({ branch, base, log }: Parameters<NonNullable<Seams['createWorktree']>>[0]) {
	const fd = openSync(log, 'w');
	const step = (label: string, args: string[], cwd?: string) => {
		const r = spawnSync('wt', args, { stdio: ['ignore', fd, fd], cwd });
		if (r.status === 0) return;
		closeSync(fd);
		throw new Error(`${readFileSync(log, 'utf8').trimEnd()}\n${label} failed (exit ${r.status})`);
	};
	step('wt switch --create', ['switch', '--create', branch, '--base', base, '--yes', '--no-cd', '--no-hooks']);
	const tree = resolveWorktree(branch);
	excludeWfFolder(tree.path);
	step('pre-start hooks', ['hook', 'pre-start', 'user:', '--yes'], tree.path);
	step('post-start hooks', ['hook', 'post-start', 'user:', '--yes'], tree.path);
	closeSync(fd);
	return tree;
}

// Pure: the ordered steps. `rm` is done in-process (fs.rmSync), so it carries no cmd. `platform` picks
// the straggler sweep, so the selfcheck can check Windows's plan on any machine (it read
// process.platform, and was red everywhere but Windows, 2026-10-03).
export function removalPlan({ branch, path, slug, pid }: Parameters<NonNullable<Seams['removalPlan']>>[0], platform: NodeJS.Platform = process.platform): RemovalStep[] {
	// Stragglers go first: a live dev server holds the tree, and `wt remove` fails on Windows while
	// it runs, leaving git without the worktree but the folder, container, volume, network and
	// routes in place (measured 2026-09-24: 23 processes). The sweep is the kit's (serve.ts).
	// The project's teardown before the folder goes, as the kit's plan has it: dropping the database
	// runs the worktree's python. Until 2026-10-04 it came after, which was right while a container
	// per worktree needed no worktree; the first shared-mongo reap failed its drop that way.
	return [
		stragglersStep(path, pid, platform),
		...teardown({ slug, worktree: path }),
		{ label: 'wt remove', cmd: 'wt', args: ['remove', branch, '--no-delete-branch', '--force', '--foreground', '-y'] },
		{ label: 'rm -rf worktree', rm: path },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
	];
}
