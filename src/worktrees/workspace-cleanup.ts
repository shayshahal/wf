// Shared guarded cleanup: round policy and disposable-workspace authority belong to callers.
// #194 extracts reap's journal unchanged; removal.ts and process-lock.ts remain the effect owners.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { acquireProcessLock } from '../process-lock.ts';
import type { RemovalStep } from '../seams.ts';
import { listWorktrees, worktreePathKey } from './worktree-registry.ts';
import { runRemovalStep } from './removal.ts';

/** Existing reap journal wire format; merged is caller policy, never inferred by the executor. */
export type WorkspaceCleanupRecord = {
	readonly branch: string;
	readonly path: string;
	readonly token: string;
	readonly directory: string | null;
	readonly next: number;
	readonly merged: boolean;
	readonly plan?: readonly string[];
};

/** A recovery read precedes plan construction; bytes also detect a changed journal at lock acquisition. */
export type WorkspaceCleanupRead =
	| { readonly kind: 'absent' }
	| { readonly kind: 'recovery'; readonly record: WorkspaceCleanupRecord; readonly bytes: string }
	| { readonly kind: 'refused'; readonly reason: string };

/** Read prior recovery even when its worktree is absent; malformed authority is never overwritten. */
export function readWorkspaceCleanup(journal: string, branch: string): WorkspaceCleanupRead {
	if (!existsSync(journal)) return { kind: 'absent' };
	try {
		const bytes = readFileSync(journal, 'utf8');
		const saved: unknown = JSON.parse(bytes);
		if (typeof saved !== 'object' || saved === null || !('branch' in saved) || saved.branch !== branch || !('path' in saved) || typeof saved.path !== 'string' || !isAbsolute(saved.path) || !('next' in saved) || typeof saved.next !== 'number' || !Number.isSafeInteger(saved.next) || saved.next < 0 || !('merged' in saved) || typeof saved.merged !== 'boolean' || !('token' in saved) || typeof saved.token !== 'string' || !('directory' in saved) || (saved.directory !== null && typeof saved.directory !== 'string')) return { kind: 'refused', reason: 'invalid recovery journal; nothing removed' };
		let plan: string[] | undefined;
		if ('plan' in saved) {
			if (!Array.isArray(saved.plan) || !saved.plan.every((label): label is string => typeof label === 'string' && label.length > 0)) return { kind: 'refused', reason: 'invalid recovery plan identity; recovery journal retained' };
			plan = saved.plan;
		}
		return { kind: 'recovery', bytes, record: { branch, path: saved.path, next: saved.next, merged: saved.merged, token: saved.token, directory: saved.directory, ...(plan ? { plan } : {}) } };
	} catch (error) {
		return { kind: 'refused', reason: `cannot read recovery journal; retained (${error instanceof Error ? error.message : String(error)})` };
	}
}

/** Capture acquisition-time directory identity; a missing target has no authority over a replacement. */
export function workspaceDirectoryIdentity(path: string): string | null {
	// Leaf links are replacements, not aliases of the acquired directory. Parent junctions are valid.
	const stat = lstatSync(path, { bigint: true, throwIfNoEntry: false });
	if (!stat) return null;
	return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

/** Expected cleanup failures retain the journal; complete means the path and journal are gone. */
export type WorkspaceCleanupResult =
	| { readonly kind: 'complete'; readonly journal: string }
	| { readonly kind: 'incomplete' | 'refused'; readonly journal: string; readonly reason: string };

/** Caller-owned authority and plan, not a grant to adopt an arbitrary existing worktree. */
export type WorkspaceCleanupInput = {
	readonly branch: string;
	readonly path: string;
	/** Stable exclusive journal location outside the target; use the same location on every retry. */
	readonly journal: string;
	readonly common: string;
	readonly survivor: string;
	readonly recovery: Exclude<WorkspaceCleanupRead, { kind: 'refused' }>;
	readonly steps: readonly RemovalStep[];
	readonly merged: boolean;
	/** Neutral callers supply acquisition identity. Round reap captures current identity under its lock. */
	readonly directory?: string | null;
	/** Fresh-only policy work (round archive/friction), under lock before publishing removal intent. */
	readonly beforeStart?: () => void;
	/** Repeat-safe caller bookkeeping after path removal, before clearing the journal, under lock. */
	readonly beforeForget?: () => void;
	readonly say?: (message: string) => void;
};

/**
 * Run guarded journaled cleanup, retaining progress for explicit retries; never exits the process.
 * Read recovery first, then reconstruct exactly the same ordered step labels using saved policy.
 * Caller supplies disposal authority, safe surviving repository/cwd, immutable acquisition identity
 * (neutral use), and a durable journal location; it must not delete that authority on incomplete.
 * Repeated effects must tolerate already-gone resources: progress commits after each confirmed step.
 * This owns process.chdir(survivor), partial wt removal and replacement/ref registration guards.
 */
export async function runWorkspaceCleanup(input: WorkspaceCleanupInput): Promise<WorkspaceCleanupResult> {
	const { branch, journal, steps, recovery, common, survivor } = input;
	const path = resolve(input.path);
	const result = (kind: 'incomplete' | 'refused', reason: string): WorkspaceCleanupResult => ({ kind, journal, reason });
	const saved = recovery.kind === 'recovery' ? recovery.record : null;
	const plan = steps.map((step) => step.label);
	const progress = saved?.next ?? 0;
	if (saved && (resolve(saved.path) !== path || saved.branch !== branch || (input.directory !== undefined && input.directory !== saved.directory))) return result('refused', 'recovery target changed; journal retained');
	if (saved && ((!saved.plan && progress > 0) || (saved.plan && JSON.stringify(saved.plan) !== JSON.stringify(plan)) || progress > steps.length)) return result('refused', 'recovery plan identity is missing or changed, or progress is out of range; recovery journal retained. Inspect the saved cleanup evidence before reconciling; no steps run');
	let targetKey: string;
	try {
		targetKey = worktreePathKey(path);
		const withinTarget = (candidate: string) => {
			const key = worktreePathKey(candidate);
			return key === targetKey || key.startsWith(`${targetKey}/`);
		};
		if (withinTarget(common) || withinTarget(survivor)) return result('refused', 'target contains the surviving repository; nothing removed');
	} catch {
		return result('refused', 'workspace cleanup: canonical path identity unavailable; nothing removed');
	}
	const lock = acquireProcessLock(`${journal}.lock`);
	if (lock.kind === 'refused') return result('refused', lock.why);
	try {
		const currentRecovery = readWorkspaceCleanup(journal, branch);
		if (currentRecovery.kind === 'refused') return result('refused', currentRecovery.reason);
		if (currentRecovery.kind !== recovery.kind || (currentRecovery.kind === 'recovery' && recovery.kind === 'recovery' && currentRecovery.bytes !== recovery.bytes)) return result('refused', 'recovery journal changed during acquisition; retry without discarding it');
		let directory = saved ? saved.directory : input.directory;
		const current = workspaceDirectoryIdentity(path);
		if (directory !== undefined && current !== null && current !== directory) return result('refused', directory === null ? 'recovery journal has no target identity and the target now exists; nothing removed' : 'recovery target ownership changed; nothing removed');
		if (directory === undefined) directory = current;
		if (!saved) input.beforeStart?.();
		const save = (next: number) => {
			const temp = `${journal}.${process.pid}.tmp`;
			writeFileSync(temp, JSON.stringify({ branch, path, token: saved?.token ?? token, directory, next, merged: saved?.merged || input.merged, plan }));
			renameSync(temp, journal);
		};
		const token = randomUUID();
		save(progress);
		process.chdir(survivor);
		for (let index = progress; index < steps.length; index++) {
			if (existsSync(path) && workspaceDirectoryIdentity(path) !== directory) return result('refused', 'target ownership changed during cleanup; recovery journal retained');
			const trees = listWorktrees(survivor);
			if (trees.some((tree) => worktreePathKey(tree.path) === targetKey && tree.branch !== branch)) return result('refused', 'target checkout changed branch or became detached; recovery journal retained');
			const registered = trees.filter((tree) => tree.branch === branch);
			if (registered.some((tree) => worktreePathKey(tree.path) !== targetKey)) return result('refused', 'branch is now owned by another worktree; recovery journal retained');
			const step = steps[index];
			const outcome = await runRemovalStep(step);
			input.say?.(outcome.say);
			// wt unregisters before deleting; its directory failure must still reach the explicit rm.
			const unregistered = step.label === 'wt remove' && !listWorktrees(survivor).some((tree) => worktreePathKey(tree.path) === targetKey);
			if (!outcome.ok && !unregistered) {
				const where = existsSync(path) ? `the worktree is still at ${path}` : 'the worktree itself is gone — only this step is outstanding';
				return result('incomplete', `incomplete (${where}); recovery journal ${journal}. Retry cleanup from ${survivor}`);
			}
			save(index + 1);
		}
		if (existsSync(path)) return result('incomplete', `${path} remains; recovery journal retained`);
		input.beforeForget?.();
		unlinkSync(journal);
		return { kind: 'complete', journal };
	} catch (error) {
		// I/O and caller bookkeeping may fail; retain the last committed intent and release the lock.
		return result('incomplete', error instanceof Error ? error.message : String(error));
	} finally { lock.release(); }
}
