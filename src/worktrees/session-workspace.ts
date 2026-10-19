// session-workspace.ts — a native chat's workspace cannot be rebound by changing the shell's cwd.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { seams } from '../seams.ts';

/** Refuse round work outside the native session's bound workspace; ordinary terminals have no gap. */
export async function roundWorkspaceGap(worktree: string): Promise<string | null> {
	const binding = await seams.sessionWorkspace?.();
	if (!binding) return null;
	const guidance = `open or resume a session bound to this exact round path: ${worktree}. Changing the shell directory does not rebind the chat workspace`;
	if (binding.kind === 'unavailable') return `native session workspace unavailable — cannot verify the round workspace; ${guidance}`;
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
	if (target !== bound) return `native session workspace does not match the round workspace (session: ${binding.path}); ${guidance}`;
	const branch = spawnSync('git', ['-C', worktree, 'branch', '--show-current'], { encoding: 'utf8' });
	if (branch.status !== 0) return `cannot verify the round workspace: Git branch unavailable; ${guidance}`;
	if (binding.branch !== null && binding.branch !== branch.stdout.trim()) return `native session branch does not match the round's actual Git branch; ${guidance}`;
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
