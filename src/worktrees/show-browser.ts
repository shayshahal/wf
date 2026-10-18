// show-browser.ts — the headed browser `wf show` opens is a resource of the round (#180).
//
// The failure (JX-1399, 2026-10-18): `wf show` opens playwright-cli's headed window for T2. Its
// daemon (and the browser it drives) keeps the worktree as its working folder after T2 ends, and
// Windows refuses to delete a folder a process still runs in — so `wf reap` failed with EPERM and
// left its recovery journal while `wf show`'s window sat there, untouched by `wf review --done`,
// `wf deliver` or the stack release.
//
// Why nothing stopped it: the removal plan stops the RECORDED, identity-verified server tree
// (serve.ts). Until #180 nothing recorded the browser, and the older broad "kill stragglers" step
// was deleted on purpose (dea735c, #161). So `wf show` records what it starts here, and reap
// releases it before `rm -rf` — the same ownership rules as a server: an identity is PID plus
// creation time, never a path or a command substring, and a browser wf did not start is never killed.
//
// The pid comes from playwright-cli's own first output line, measured 2026-10-18 (@playwright/cli
// 0.1.21, control-jewelryx show): `### Browser \`show\` opened with pid 24324.` — printed on every
// `open`, including one that reuses an open session (it opened a new browser anyway), on stdout,
// before the window is usable. A CLI that stops printing it is caught by the selfcheck's fixture,
// and the project's own `cleanup` (close-all) still closes the checkout's browsers at teardown.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ownedProcessTree, parseProcessIdentities } from '../process-tree.ts';
import type { ProcessIdentity } from '../process-tree.ts';
import { seams } from '../seams.ts';

/** The record `wf show` writes and `wf reap` releases, beside serve.pid and checks.log in .wf/. */
export const SHOW_OWNER_FILE = 'show-owner.json';
export const showOwnerPath = (worktree: string) => join(worktree, '.wf', SHOW_OWNER_FILE);

/** What `wf show` opened this round: the browser's process tree, by identity. */
export type ShowOwner = { token: string; state: 'running' | 'releasing'; processes: ProcessIdentity[] };

/** Pure: the pid of the browser `open` reported, or null. Line one of its output; never a guess. */
export function browserPidFromOutput(text: string | null | undefined): number | null {
	const m = /^### Browser `[^`]*` opened with pid (\d+)\.$/m.exec((text ?? '').replace(/\r\n/g, '\n'));
	const pid = m ? Number(m[1]) : NaN;
	return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/** Pure: a stored record, or null when it cannot authorize a kill (format, identities, token). */
export function parseShowOwner(raw: unknown): ShowOwner | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.token !== 'string' || !record.token) return null;
	if (record.state !== 'running' && record.state !== 'releasing') return null;
	const processes = parseProcessIdentities(record.processes);
	return processes && processes.length ? { token: record.token, state: record.state, processes } : null;
}

/** Publish complete bytes atomically: a release never reads a half-written record. */
function writeOwner(worktree: string, record: ShowOwner): void {
	mkdirSync(join(worktree, '.wf'), { recursive: true });
	const file = showOwnerPath(worktree);
	const temp = `${file}.${randomUUID()}.tmp`;
	writeFileSync(temp, JSON.stringify(record));
	renameSync(temp, file);
}

/**
 * Record the browser `wf show` just opened, under the identities it has now. `pids` are the browser
 * processes the CLI reported (never a scan of "what looks like a browser"): each must be alive, so a
 * failed launch records nothing. The tree is expanded to its observed descendants — the browser's
 * renderer and helper processes hold the folder too — and merged with an earlier record, because a
 * second `wf show` can leave an earlier window open and only one of them may be reaped later.
 * Returns how many identities the record holds afterwards, or 0 when nothing is recorded at all.
 */
export function recordShowBrowser(worktree: string, pids: readonly number[]): number {
	const readPrevious = (): ShowOwner | null => {
		try { return existsSync(showOwnerPath(worktree)) ? parseShowOwner(JSON.parse(readFileSync(showOwnerPath(worktree), 'utf8'))) : null; }
		catch { return null; /* a record this runtime cannot read is replaced only by a live attribution */ }
	};
	const previous = readPrevious();
	const wanted = [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
	if (!wanted.length) return previous?.processes.length ?? 0;
	const snapshot = seams.processes.snapshot();
	if (snapshot.kind === 'unknown') return previous?.processes.length ?? 0;
	const roots = snapshot.processes.filter((p) => wanted.includes(p.pid));
	// A pid this run cannot see is not a browser wf opened: record nothing rather than a guess.
	if (!roots.length) return previous?.processes.length ?? 0;
	const merged = new Map<number, ProcessIdentity>((previous?.processes ?? []).map((p) => [p.pid, p]));
	// The live snapshot wins for an identity we already hold: a pid whose creation time moved is
	// another process now, and keeping the stale bytes would make the release refuse on reuse.
	for (const p of ownedProcessTree(roots, snapshot.processes)) merged.set(p.pid, p);
	writeOwner(worktree, { token: previous?.token ?? randomUUID(), state: 'running', processes: [...merged.values()] });
	return merged.size;
}

export type ShowStopResult = { kind: 'absent' | 'stopped' | 'refused'; why?: string; stopped?: number };

const alive = (owners: readonly ProcessIdentity[], processes: readonly ProcessIdentity[]) =>
	owners.filter((owner) => processes.some((p) => p.pid === owner.pid && p.born === owner.born));

/**
 * Release the recorded browser before the worktree goes: kill only identities whose PID and creation
 * time still match, wait until none of them (or their descendants) remains, then delete the record.
 * A recorded PID that is gone, or alive as a different process (reused), is pruned and never killed —
 * that is the "never kill a browser wf did not start" rule, mechanically. Anything unconfirmed is
 * refused with the record retained, exactly as the server release does, so reap keeps its journal
 * instead of deleting a folder something still holds.
 */
export async function stopShowBrowser(worktree: string, { timeoutMs = 5000, pollMs = 100 }: { timeoutMs?: number; pollMs?: number } = {}): Promise<ShowStopResult> {
	const file = showOwnerPath(worktree);
	if (!existsSync(file)) return { kind: 'absent' };
	let record: ShowOwner | null;
	try { record = parseShowOwner(JSON.parse(readFileSync(file, 'utf8'))); }
	catch { record = null; /* unreadable or malformed: refused below, never guessed at */ }
	if (!record) return { kind: 'refused', why: `wf show: ${file} cannot authorize a kill; the record is retained for recovery` };
	const first = seams.processes.snapshot();
	if (first.kind === 'unknown') return { kind: 'refused', why: 'wf show: process inventory unavailable; browser ownership retained' };
	const ours = alive(record.processes, first.processes);
	const releasing: ShowOwner = { token: record.token, state: 'releasing', processes: record.processes };
	writeOwner(worktree, releasing);
	const releasingBytes = JSON.stringify(releasing);
	if (!ours.length) {
		// Every recorded identity is gone or was reused: nothing to stop, and nothing of ours is left.
		finish(file, releasingBytes);
		return { kind: 'stopped', stopped: 0 };
	}
	let targets = ours;
	const until = Date.now() + timeoutMs;
	for (;;) {
		if (!seams.processes.kill(targets)) return { kind: 'refused', why: 'wf show: could not stop the recorded browser processes; ownership retained for retry' };
		const remaining = seams.processes.snapshot();
		if (remaining.kind === 'unknown') return { kind: 'refused', why: 'wf show: shutdown probe unavailable; browser ownership retained' };
		const left = alive(targets, remaining.processes);
		if (!left.length) {
			finish(file, releasingBytes);
			return { kind: 'stopped', stopped: targets.length };
		}
		// A killed browser can restart a helper process; expand again rather than declare success.
		targets = ownedProcessTree(left, remaining.processes);
		if (Date.now() >= until) return { kind: 'refused', why: `wf show: ${left.length} browser process(es) still hold ${worktree}; ownership retained for retry` };
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
}

/** Delete the record only if it is still ours: a concurrent `wf show` keeps what it recorded. */
function finish(file: string, ours: string): void {
	try { if (readFileSync(file, 'utf8') === ours) unlinkSync(file); }
	catch {
		// A record that cannot be read back or removed is the next release's problem, not a reason to
		// report the browser as still running: the identities it holds were just confirmed absent.
		console.error(`wf show: could not remove ${file}; retained for recovery`);
	}
}
