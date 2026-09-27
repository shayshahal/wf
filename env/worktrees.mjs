// env/worktrees.mjs — Shay's worktrees: worktrunk creates them (with wf's hooks, env/hook.mjs) and
// removes them. Plugged into the kit's createWorktree and removalPlan seams by env/wf.mjs.
import { closeSync, openSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { teardown } from '../project.mjs';
import { stragglersStep } from '../serve.mjs';
import { excludeWfFolder, resolveWorktree } from '../worktree.mjs';

// Created with no hooks, then only wf's (`wt hook <type> user:`) run inside it. worktrunk reads the
// project's hooks from the folder the command runs in, and 20 older checkouts still carry the
// .config/wt.toml that left JewelryX in #222: from one of them, `wt switch --create` ran those too,
// against scripts the new checkout no longer has, and the create failed (2026-09-24).
// wt's post-start tether keeps the dev servers alive in the background, and they inherit whatever
// stdout wt was given. Under a pipe (an agent harness, `wf new | tee`) that pipe never reaches EOF
// and the caller hangs on the tether (measured 40 min on 2026-09-20). A log file hands the tether a
// descriptor of its own, so this returns as soon as wt exits. Returns the worktree, or throws with
// the log.
export function createWorktree({ branch, base, log }) {
	const fd = openSync(log, 'w');
	const step = (label, args, cwd) => {
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

// Pure: the ordered steps. `rm` is done in-process (fs.rmSync), so it carries no cmd.
export function removalPlan({ branch, path, slug, pid }) {
	// Stragglers go first: a live dev server holds the tree, and `wt remove` fails on Windows while
	// it runs, leaving git without the worktree but the folder, container, volume, network and
	// routes in place (measured 2026-09-24: 23 processes). The sweep is the kit's (serve.mjs).
	return [
		stragglersStep(path, pid),
		{ label: 'wt remove', cmd: 'wt', args: ['remove', branch, '--no-delete-branch', '--force', '--foreground', '-y'] },
		{ label: 'rm -rf worktree', rm: path },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
		...teardown({ slug }),
	];
}
