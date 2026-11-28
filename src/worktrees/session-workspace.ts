// session-workspace.ts — a native chat's workspace cannot be rebound by changing the shell's cwd.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { seams } from '../seams.ts';

/**
 * A session the host gave a checkout of its own (T3's subagent worktree) can run a round there:
 * `wf new <branch> --here` adopts it. Named in every refusal such a session gets, because a separate
 * `wf new` checkout can never be bound to it (2026-11-28: T3's delegate_task offers only the project
 * root or a fresh T3 worktree, so a subagent that ran plain `wf new` was refused by every next step).
 */
export const adoptGuidance = (bound: string) => `this session has its own host checkout (${bound}): to run the round in it, run wf new <branch> --here --class A|B|C [--id <id>] from that checkout instead of a separate wf new`;

/**
 * Refuse round work outside the native session's bound workspace; ordinary terminals have no gap.
 * `adopted` (state.adopted): `wf new --here` renamed the host's branch `from` to the round's `branch`.
 * The host keeps reporting the old name (T3, measured 2026-11-28: still the old name 20 s after
 * `git branch -m`), so at the adopted path that one stale name is accepted while Git is on the
 * round's branch; any other difference still refuses. The path match is what JX-1426 needed.
 */
export async function roundWorkspaceGap(worktree: string, { adopted }: { adopted?: { from: string; branch: string } | null } = {}): Promise<string | null> {
	const binding = await seams.sessionWorkspace?.();
	if (!binding) return null;
	const guidance = `open or resume a session bound to this exact round path: ${worktree}. Changing the shell directory does not rebind the chat workspace`;
	if (binding.kind === 'unavailable') return `native session workspace unavailable — cannot verify the round workspace; ${guidance}`;
	// The route for a round not yet started: a subagent the host gives its own checkout adopts it.
	const subagent = binding.attached ? adoptGuidance(binding.path) : 'for a round not started yet, a subagent the host gives its own checkout (T3: delegate_task with isolation "worktree") can instead run it there with wf new <branch> --here';
	let target: string;
	let bound: string;
	try {
		target = realpathSync.native(worktree);
		bound = realpathSync.native(binding.path);
	} catch {
		// Filesystem errors can expose unrelated paths; only the required round path is diagnostic.
		return `cannot verify the round workspace: canonical path unavailable; ${guidance}`;
	}
	if (process.platform === 'win32') {
		target = target.toLowerCase();
		bound = bound.toLowerCase();
	}
	if (target !== bound) return `native session workspace does not match the round workspace (session: ${binding.path}); ${guidance}; ${subagent}`;
	const branch = spawnSync('git', ['-C', worktree, 'branch', '--show-current'], { encoding: 'utf8' });
	if (branch.status !== 0) return `cannot verify the round workspace: Git branch unavailable; ${guidance}`;
	const actual = branch.stdout.trim();
	const renamed = Boolean(adopted) && binding.attached === true && binding.branch === adopted?.from && actual === adopted?.branch;
	if (binding.branch !== null && binding.branch !== actual && !renamed) return `native session branch does not match the round's actual Git branch; ${guidance}`;
	return null;
}

/**
 * Refuse cleanup of the calling native session's bound workspace or any ancestor, including on a
 * reap retry; ordinary terminals have no gap, and an unverifiable binding never authorizes removal.
 */
export async function reapWorkspaceGap(worktree: string, { recovering = false }: { recovering?: boolean } = {}): Promise<string | null> {
	const binding = await seams.sessionWorkspace?.();
	if (!binding) return null;
	const guidance = `leave or archive the bound session and run wf reap from a surviving checkout/session; target: ${worktree}. Changing the shell directory or forcing reap does not rebind the native session`;
	if (binding.kind === 'unavailable') return `native session workspace unavailable — cannot authorize cleanup; ${guidance}`;
	let bound: string;
	try {
		bound = realpathSync.native(binding.path);
	} catch {
		// A missing native workspace is not absence of a native session; never echo reader paths/errors.
		return `cannot verify the native session workspace: canonical path unavailable; ${guidance}`;
	}
	let target: string;
	try {
		target = realpathSync.native(worktree);
	} catch (error) {
		// Recovery may finish after removal only when the bound workspace above verifiably survives.
		if (recovering && error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
		return `cannot verify the reap target: canonical path unavailable; ${guidance}`;
	}
	// The reader names this process's session only: sibling chats cannot be enumerated, so this is a
	// containment guard, never a claim that no other live thread uses the target.
	if (process.platform === 'win32') {
		target = target.toLowerCase();
		bound = bound.toLowerCase();
	}
	const inside = relative(target, bound);
	if (inside === '' || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`))) {
		return `reap target contains the calling native session's bound workspace; ${guidance}`;
	}
	return null;
}
