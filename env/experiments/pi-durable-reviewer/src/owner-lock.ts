// owner-lock.ts — one owning process per storage directory (issue #116: one process owns the
// database at a time; inspection and steering go through that owner).
//
// This is this prototype's own advisory guard, not the library's: pi-durable documents that its
// storage has no cross-process locking. Acquisition uses two files:
//
//   owner.lock             the long-lived ownership lock, held for the whole run;
//   owner.lock.acquiring   a short-lived exclusive guard around the read-decide-publish critical
//                          section, released before the review starts.
//
// Without the guard, two contenders could both read a dead owner and the slower one could delete the
// winner's fresh lock and publish its own (2026-10-09, stale-observer race). The guard is never
// stolen automatically: an existing guard (live, dead or corrupt) fails closed with a manual-recovery
// instruction, because a process inside the critical section cannot be told apart from one that
// crashed in it. An abrupt kill during the long review leaves only the main lock, which the next
// start reclaims; an abrupt kill during acquisition leaves the guard and needs manual removal.
import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/** A held owner lock; call `release` to remove the lock file. */
export type OwnerLock = {
	readonly path: string;
	readonly pid: number;
	release(): void;
};

type HeldLock = { pid: number; startedAt: string; token: string };

type LockRead =
	| { readonly kind: 'held'; readonly held: HeldLock }
	| { readonly kind: 'missing' }
	| { readonly kind: 'unreadable'; readonly detail: string };

/** The acquisition-guard path for `directory`; remove it by hand after an acquisition crash. */
export function acquireGuardPath(directory: string): string {
	return join(directory, 'owner.lock.acquiring');
}

function readLock(path: string): LockRead {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
		return { kind: 'unreadable', detail: error instanceof Error ? error.message : String(error) };
	}
	try {
		const parsed = JSON.parse(text) as Partial<HeldLock>;
		if (typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0) {
			return { kind: 'unreadable', detail: 'lock has no valid pid' };
		}
		return { kind: 'held', held: { pid: parsed.pid, startedAt: String(parsed.startedAt ?? ''), token: typeof parsed.token === 'string' ? parsed.token : '' } };
	} catch (error) {
		return { kind: 'unreadable', detail: error instanceof Error ? error.message : String(error) };
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to another user; anything else means it is gone.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** Write a complete lock to a unique temporary file in `directory`; return its path. */
function writeLockFile(directory: string, token: string): string {
	const temp = join(directory, `owner.lock.${process.pid}.${randomUUID()}.tmp`);
	const fd = openSync(temp, 'wx');
	try {
		writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), token } satisfies HeldLock));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	return temp;
}

/** Publish a complete lock at `path` by hard-linking a unique temp file; throws `EEXIST` if it exists. */
function publishLock(path: string, directory: string, token: string): void {
	const temp = writeLockFile(directory, token);
	try {
		linkSync(temp, path);
	} finally {
		try {
			unlinkSync(temp);
		} catch (error) {
			// The temp file is gone or was never published; either is fine.
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
}

function removeGuard(guard: string): void {
	try {
		unlinkSync(guard);
	} catch (error) {
		// The guard is this acquisition's; a missing one means it was already removed.
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

/**
 * Acquire the owner lock for `directory`, or throw when a live owner already holds it.
 *
 * @returns The held lock; call `release` to remove it.
 * @throws When another live owner holds the lock, this process already holds it, the existing lock
 * is unreadable, or an acquisition guard exists (recovery is manual: confirm no owner runs, then
 * remove the named file).
 */
export function acquireOwnerLock(directory: string): OwnerLock {
	const path = join(directory, 'owner.lock');
	const guard = acquireGuardPath(directory);
	const token = randomUUID();
	try {
		publishLock(guard, directory, randomUUID());
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
			throw new Error(
				`owner acquisition guard ${guard} exists; another start may be acquiring, or a previous acquisition crashed. Confirm no owner is running and remove the guard file`,
			);
		}
		throw error;
	}
	try {
		const existing = readLock(path);
		if (existing.kind === 'unreadable') {
			throw new Error(`owner lock ${path} is unreadable (${existing.detail}); confirm no owner is running and remove the file`);
		}
		if (existing.kind === 'held') {
			if (existing.held.pid === process.pid) {
				throw new Error(`this process already holds the owner lock at ${path}; release it before acquiring again`);
			}
			if (isAlive(existing.held.pid)) {
				throw new Error(`another owner (pid ${existing.held.pid}) holds ${path}; stop it or wait for it to exit`);
			}
			// The holder is dead, and this guard serializes the whole read-decide-publish section, so no
			// other contender can publish between this unlink and the publish below.
			unlinkSync(path);
		}
		publishLock(path, directory, token);
	} finally {
		removeGuard(guard);
	}
	return {
		path,
		pid: process.pid,
		release() {
			const current = readLock(path);
			// Only remove the exact lock this acquisition published. PID alone would let an old released
			// handle delete a newer acquisition by the same process (2026-10-09).
			if (current.kind !== 'held' || current.held.pid !== process.pid || current.held.token !== token) return;
			try {
				unlinkSync(path);
			} catch (error) {
				// Releasing a lock that is already gone is fine.
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}
		},
	};
}
