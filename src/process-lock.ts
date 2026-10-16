// Process-owned locks serialize server acquisition/release and reap recovery. Like state.ts,
// publish complete bytes atomically and serialize stale-lock reclaim: two reclaimers must not
// remove each other's new live lock (#154, interrupted cleanup, 2026-10-16).
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, linkSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { parseProcessIdentities } from './process-tree.ts';
import { seams } from './seams.ts';

/** A process lock grants one release handle; refused acquisition preserves the existing authority. */
export type ProcessLockResult = { readonly kind: 'acquired'; readonly release: () => void } | { readonly kind: 'refused'; readonly why: string };

/** Acquire a process lock, reclaiming only an identity-proven dead creator, never by elapsed time. */
export function acquireProcessLock(path: string): ProcessLockResult {
	const snapshot = seams.processes.snapshot();
	const self = snapshot.kind === 'known' ? snapshot.processes.find((p) => p.pid === process.pid) : undefined;
	if (!self) return { kind: 'refused', why: `wf process lock: creator identity unavailable; ${path} retained` };
	const bytes = JSON.stringify({ token: randomUUID(), processes: [self] });
	const temp = `${path}.${randomUUID()}.tmp`;
	const guard = `${path}.acquiring`;
	const removeOurs = (file: string) => {
		try { if (existsSync(file) && readFileSync(file, 'utf8') === bytes) unlinkSync(file); }
		catch {
			// Keep the authority for the next creator to reconcile; a release failure must not
			// replace the operation's result or pretend the lock was removed (#154).
			console.error(`wf process lock: could not release ${file}; retained for recovery`);
		}
	};
	const publish = (file: string) => {
		try { linkSync(temp, file); return true; }
		catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false; throw error; }
	};
	const stale = () => {
		if (!existsSync(path)) return true;
		const saved = readFileSync(path, 'utf8');
		const current = seams.processes.snapshot();
		if (current.kind === 'unknown') return false;
		// The shipped reap lock predates creation identities. Only complete UUID-bearing
		// legacy bytes and an absent PID can establish its creator's death; reuse stays held.
		const legacy = /^([1-9]\d*):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.exec(saved);
		if (legacy) return Number.isSafeInteger(Number(legacy[1])) && !current.processes.some((p) => p.pid === Number(legacy[1]));
		const raw: unknown = JSON.parse(saved);
		const owners = typeof raw === 'object' && raw !== null && 'token' in raw && typeof raw.token === 'string' && raw.token.length > 0 && 'processes' in raw ? parseProcessIdentities(raw.processes) : null;
		return owners?.length === 1 && !current.processes.some((p) => p.pid === owners[0].pid && p.born === owners[0].born);
	};
	try {
		const fd = openSync(temp, 'wx');
		try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
		if (!publish(path)) {
			if (!stale()) return { kind: 'refused', why: `wf process lock: live, unknown or malformed creator owns ${path}; retained` };
			// As in state.ts, an abandoned acquisition guard is not stolen. It is an explicit,
			// bounded recovery failure, never grounds for racing another reclaimer.
			if (!publish(guard)) return { kind: 'refused', why: `wf process lock: interrupted or concurrent recovery owns ${guard}; inspect before retrying` };
			try {
				if (!stale()) return { kind: 'refused', why: `wf process lock: creator changed during recovery; ${path} retained` };
				if (existsSync(path)) unlinkSync(path);
				if (!publish(path)) return { kind: 'refused', why: `wf process lock: another creator acquired ${path}; retry` };
			} finally { removeOurs(guard); }
		}
		return { kind: 'acquired', release: () => removeOurs(path) };
	} catch {
		return { kind: 'refused', why: `wf process lock: could not establish exclusive ownership of ${path}; existing records retained` };
	} finally {
		try { if (existsSync(temp)) unlinkSync(temp); }
		catch {
			// This private temp is not a published lock. Failure to remove it cannot release or
			// steal authority, and must not replace the acquired/refused result (#154).
			console.error(`wf process lock: could not remove temporary ${temp}; it grants no authority`);
		}
	}
}
