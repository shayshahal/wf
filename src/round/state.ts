#!/usr/bin/env node
// state.ts — <git-toplevel>/.wf/state.json, the one file a round's commands share.
// step.ts owns wf_version/round/class/base/step/waiting_on/since; `wf new --id` adds id + folder;
// `wf ask`/`wf decide` own questions/answered/revisions; `wf next` owns repairs.
// writeState serializes every read-modify-write against the other wf processes on this worktree and
// replaces the file with one rename; readState tells a missing round (null) from a corrupt one (it
// throws). See the comments on writeState and CorruptStateError (issue #107).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { roundsDir } from '../project.ts';

export type RoundClass = 'A' | 'B' | 'C';
// A question `wf ask` opened; `wf decide` moves it to `answered` with its answer (ask.ts).
export type Question = { n: number; to: string; text: string; default?: string; source?: string; asked: string; answer?: string | null; answered?: string };
// .wf/state.json. Every field is optional: each command writes only its own (writeState merges),
// and a hand-cut worktree has only what `wf step` wrote.
// `wf_version` is the runtime that wrote the state (2 = the smaller route, #110/#111). A state from
// an older runtime is refused before mutation, never silently reinterpreted (finish-before-release).
export type State = {
	wf_version?: number;
	round?: string;
	class?: RoundClass | null;
	base?: string | null;
	step?: string;
	waiting_on?: string | null;
	since?: string;
	history?: { step: string; at: string }[];
	id?: string;
	ids?: string[];
	folder?: string;
	made_by?: string;
	// Who opened the worktree (seams.opener, at `wf new`), so a tool beside wf can show which agent it belongs to.
	opened_by?: Record<string, string>;
	entry?: string;
	check?: boolean;
	// How many autonomous repairs an assessment has already sent back to build (#113.3): bounded by
	// MAX_REPAIRS in next.ts. Reset is not needed — the assessment's `head:` names the tree it judged.
	repairs?: number;
	// The step a round-worker was sent back for by `wf handoff check` (handoff-hook.ts): one hand-back
	// per step, so a hook loop cannot burn the agent.
	handoff_sent_back?: string;
	questions?: Question[];
	answered?: Question[];
	// Answers that say the agreement must change (`wf decide --revise`, ask.ts): each carries the
	// agreement material sha at the moment it was recorded, so it is open until that sha moves. `wf next`
	// sends the round back to agree while any is open (agree.ts).
	revisions?: { text: string; at: string; sha?: string | null }[];
	// The BLOCKED.md question whose `## Answer` a build has already resumed from, so a build that comes
	// back still blocked asks the person again instead of looping (next.ts).
	blocked_answered?: number;
	last_question?: number;
	// The validation token whose T2 setup `wf show` already ran (projects/jewelryx/show.ts).
	t2_setup?: string;
	// The tracker note `wf deliver` wrote, from the worktree's top: `wf next` reads which of its
	// sections are posted (src/round/next.ts, unpostedSections).
	note?: string;
};

export function toplevelOf(cwd = process.cwd()): string {
	return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd }).trim();
}

// The runtime that reads and writes a round's state. A state from an older one is refused before any
// command mutates it (finish-before-release, #110): the new route cannot read the old fields, and a
// silent reinterpretation would corrupt a half-finished round. A genuine read-only inspection may
// still report it; every mutating command refuses (run.ts).
export const WF_STATE_VERSION = 2;
// The steps the smaller route removed (#111/#112/#113). A round parked at one is an old round: it must
// finish on the installed wf that made it, and this wf refuses to reinterpret it.
const OLD_ROUTE_STEPS = ['research', 'plan', 'design', 'implement'];
export function legacyStateGap(state: State | null): string | null {
	if (!state) return null;
	if (state.wf_version === WF_STATE_VERSION) return null;
	// Any state this runtime did not write is refused before a mutating command touches it: an unknown
	// version, a versionless old round (even parked at a step the two routes share, like classify or
	// review), or a hand-edited file. Fresh/absent state is allowed to initialize version 2; a
	// read-only inspection may still report an old round (run.ts).
	if (typeof state.wf_version === 'number') return `this round's state names wf version ${state.wf_version}, not ${WF_STATE_VERSION} — finish it on that wf, then start a new round`;
	const at = state.step && OLD_ROUTE_STEPS.includes(state.step) ? ` (step "${state.step}")` : '';
	return `this round's state is from an older wf (no wf_version${at}): finish it on the installed wf that made it, then start a new round — this wf refuses to reinterpret old state (finish-before-release, #110)`;
}

export function stateFile(toplevel: string) {
	return join(toplevel, '.wf', 'state.json');
}

const sleepMs = (ms: number): void => {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

// A sleep jittered a little, so two processes polling on a fixed interval cannot phase-lock — a fixed
// 20ms rename retry against a process reading state.json on a fixed 1ms timer collided on every
// attempt for over a second on Windows (2026-10-09), and the write never landed.
const jitteredSleepMs = (min: number, spread: number): void => sleepMs(min + Math.floor(Math.random() * spread));

// A round's state.json that exists but is not the round's state: empty, half-written, or hand-edited.
// It is not "no round here" — treating it that way let a later command write a partial object over a
// round that was only one bad write away from whole (issue #107). wf refuses and says which file.
export class CorruptStateError extends Error {
	constructor(file: string, reason: string) {
		super(`corrupt round state: ${file} is not the round's state (${reason}) — restore it from git, or delete it and run \`wf step <step>\` to start the round over`);
		this.name = 'CorruptStateError';
	}
}

// Null only when there is no state file here (ENOENT). A file that does not parse throws
// CorruptStateError, so a command reports the round instead of replacing it (issue #107). A read a
// concurrent rename briefly refuses (EPERM/EACCES/EBUSY on Windows) is retried: the file is there and
// complete — the writer never truncates it — so a reader waits the rename out rather than report a
// round it could not see.
export function readState(toplevel: string): State | null {
	const file = stateFile(toplevel);
	const deadline = Date.now() + 500;
	let text: string;
	for (;;) {
		try {
			text = readFileSync(file, 'utf8');
			break;
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === 'ENOENT') return null; // no round here yet
			if ((code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') || Date.now() >= deadline) throw e;
			jitteredSleepMs(1, 4);
		}
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		throw new CorruptStateError(file, e instanceof Error ? e.message : String(e));
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CorruptStateError(file, 'it is not a JSON object');
	return parsed as State;
}

// Every file a person reads (SPEC, SPEC-REVIEW, REVIEW, BLOCKED…) lives in the round folder and is
// committed with the fix. Until 2026-09-23 SPEC, SPEC-REVIEW and REVIEW sat at the worktree root,
// where they were rarely committed and reap lost them.
export function roundFile(toplevel: string, name: string) {
	return join(toplevel, readState(toplevel)?.folder ?? '', name);
}

// An updater is handed the state as it is under the write lock and returns the fields to write. A
// nested collection is built from `current` inside it, never from a map copied before the lock: a
// concurrent brief's `briefs` key, or a concurrent `wf ask`'s question, still lands (issue #107).
// There is no patch parameter a caller could put an old copied map in — the old shape let a later
// write replace a whole collection from a read that predated it, which is the lost update this fixes.
// `writeState` refuses a copied `State` object outright, so that shape cannot come back by accident.
// The updater is handed its own copy of `current`: a callback that mutates it cannot rewrite the
// snapshot state.ts keeps, and cannot smuggle the mutation into the write.
// An updater still replaces the field it returns whole.
//
// A write is serialized against every other wf process on this worktree with .wf/state.json.lock, and
// the new state replaces the old with one rename: a reader sees the old state or the new one, never a
// half-written file (issue #107).
export type StateUpdater = (current: State) => State;

// How long a command waits for a live writer's lock before refusing with the lock's path.
const LOCK_WAIT_MS = 15_000;

// Pure: whether `pid` is a live process. process.kill(pid, 0) sends nothing and reports the process
// table: ESRCH is gone, EPERM is alive but not ours (the check works on Windows too).
function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return (e as NodeJS.ErrnoException).code === 'EPERM';
	}
}

// Pure: whether the process holding `lock` is gone. The lock names its owner's pid, and the process
// table decides: only a pid that is provably not alive makes a lock stale. Elapsed time never does — a
// clock step, or a live writer paused for five minutes, cannot be told from a dead one by age, and
// taking its lock puts two writers on the state (2026-10-09, issue #107). The old hard bound did
// exactly that to a live writer five minutes into an update. A lock whose content will not read is not
// stale either: writeState publishes the lock complete (publishLock below), so a partial lock is not a
// writer of ours and is not ours to take. A pid the OS reused after a writer died therefore fails
// closed: the command refuses after LOCK_WAIT_MS and names the file, and a person removes it.
// Our own pid is stale: reentry is refused in writeState, so this process is not inside another write,
// and the lock is the leftover of a release that lost a Windows sharing race (release never throws).
// Exported for state.selfcheck.ts: the interruption arms assert this before a write recovers.
export function stateLockIsStale(lock: string): boolean {
	let owner: { pid?: number } | null;
	try {
		owner = JSON.parse(readFileSync(lock, 'utf8')) as { pid?: number } | null;
	} catch {
		// Gone (the acquire loop takes it), or unreadable under a sharing race: neither proves an owner
		// is gone. Waiting the race out is the caller's job; stealing is not an option worth an owner.
		return false;
	}
	if (typeof owner?.pid !== 'number') return false;
	if (owner.pid === process.pid) return true;
	return !processIsAlive(owner.pid);
}

// The lock for one worktree's state, held for one read-modify-write. Its name is created by the atomic
// link in publishLock and its body names the writer whose death makes it stale (stateLockIsStale);
// release removes it, which a killed writer cannot do, so a lock whose pid is gone is reclaimed.
//
// Reclaim is serialized by a second file, the acquisition guard (`.lock.acquiring`). Without it two
// commands could both read the same gone pid and both remove its lock: the slower then removed the
// faster's fresh LIVE lock and published its own, and two live writers held the state (2026-10-09,
// issue #107). A reclaimer takes the guard, re-reads the state lock, and removes it only if it is
// still gone — the decision made before the guard is discarded. No reclaim can touch another command's
// lock, because a lock is only removed while its owner is provably gone. The guard is never stolen:
// a holder paused inside reclaim cannot be told from one killed inside it, so an abandoned guard fails
// closed and is named for manual removal (see the LOCK_WAIT_MS error). That window is only a process
// killed between taking the guard and removing the stale lock; once the lock is gone, an abandoned
// guard blocks nothing, because the next command creates the lock without needing the guard. A writer
// killed mid-update holds only the state lock, whose gone pid is reclaimed automatically.
const LOCK_CONTENDED = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);

let tempSeq = 0;

// Write a complete lock body to a unique temp beside `path`; publishLock links that temp at `path`.
// The lock's name never exists before its content does, so no reader can meet an empty lock and have
// to guess between a writer about to publish its pid and one killed before it (issue #107).
function writeLockBody(path: string, body: object): string {
	const temp = `${path}.${process.pid}.${++tempSeq}.tmp`;
	writeFileSync(temp, JSON.stringify(body));
	return temp;
}

// Atomic create-if-absent of a complete body at `path`: false when the name is taken (or deleted under
// a Windows sharing race), never a partial `path`. Any other error is real and thrown.
function tryLink(temp: string, path: string): boolean {
	try {
		linkSync(temp, path);
		return true;
	} catch (e) {
		if (LOCK_CONTENDED.has((e as NodeJS.ErrnoException).code ?? '')) return false;
		throw e;
	}
}

// Publish a complete body at `path`; false on contention. Windows reports a lost create race as
// EPERM/EACCES/EBUSY as well as EEXIST — a writer loop threw EPERM on 4 of 40 runs of the state
// selfcheck's race arm before this (2026-10-09) and lost that writer's update — so all four are
// contention here, not a verdict.
function publishLock(path: string, body: object): boolean {
	const temp = writeLockBody(path, body);
	try {
		return tryLink(temp, path);
	} finally {
		try { rmSync(temp, { force: true }); } catch { /* a temp is never the lock it was linked at */ }
	}
}

// Pure: whether `path` is still this acquisition's lock — its pid and its token. Release that finds a
// newer owner's lock must leave it alone: PID alone would let a handle delete a lock it no longer
// holds (2026-10-09, issue #116's owner-lock).
function lockIsOurs(path: string, token: string): boolean {
	try {
		const held = JSON.parse(readFileSync(path, 'utf8')) as { pid?: number; token?: string } | null;
		return held?.pid === process.pid && held?.token === token;
	} catch {
		// Gone, or unreadable under a sharing race: nothing this acquisition can prove it still owns.
		return false;
	}
}

// Remove a lock file, retrying the Windows sharing races a reader or creator causes. Never throws: a
// release that fails is retried by the stale rule (our own pid), not by failing the write it released.
function removeFile(path: string): void {
	for (let i = 0; i < 30; i++) {
		try { rmSync(path, { force: true }); return; } catch (e) {
			// A gone file is not an error (force covers it); a sharing race is retried; anything else says
			// this process may not remove it, which the next command's stale rule handles.
			if (!LOCK_CONTENDED.has((e as NodeJS.ErrnoException).code ?? '')) return;
			jitteredSleepMs(2, 13);
		}
	}
}

function acquireStateLock(toplevel: string): () => void {
	const lock = `${stateFile(toplevel)}.lock`;
	const guard = `${lock}.acquiring`;
	const owner = { pid: process.pid, at: new Date().toISOString(), token: randomUUID() };
	// One complete body for this acquisition; every link of it is the atomic create the name needs.
	const temp = writeLockBody(lock, owner);
	const deadline = Date.now() + LOCK_WAIT_MS;
	const release = () => { if (lockIsOurs(lock, owner.token)) removeFile(lock); };
	try {
		for (;;) {
			if (tryLink(temp, lock)) return release;
			// Another command holds it. A gone owner is reclaimed under the guard; a live one is waited
			// for, and the command refuses rather than block the round forever.
			if (stateLockIsStale(lock) && publishLock(guard, { pid: process.pid, at: owner.at })) {
				try {
					// Re-read under the guard: only a lock that is still gone is removed. A live lock another
					// reclaimer just published is left for its owner (the stale-observer race, issue #107).
					if (stateLockIsStale(lock)) removeFile(lock);
				} finally {
					removeFile(guard);
				}
				// Publish outside the guard: the link above is atomic, so it alone decides the owner. A
				// process killed here leaves no lock (the caller takes it), not a lock that blocks a later one.
				continue;
			}
			if (Date.now() >= deadline) throw new Error(`wf: another command is writing .wf/state.json (${lock}); waited ${LOCK_WAIT_MS / 1000}s — if that command is gone, delete ${lock}, and any ${guard} left by a killed acquisition`);
			jitteredSleepMs(1, 4);
		}
	} finally {
		removeFile(temp);
	}
}

// A rename replaces the old state in one step on every supported platform (MoveFileEx on Windows), so
// a reader never sees a partial file. Windows refuses the rename while another process holds the
// target open (a concurrent read), sometimes for hundreds of ms; retry with a jittered backoff until
// a deadline instead of losing the write (a fixed interval phase-locks with a fixed-interval reader
// and never lands; measured on Windows, 2026-10-09).
const RENAME_DEADLINE_MS = 3_000;

function replaceStateFile(temp: string, target: string): void {
	const deadline = Date.now() + RENAME_DEADLINE_MS;
	for (;;) {
		try {
			renameSync(temp, target);
			return;
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if ((code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') || Date.now() >= deadline) throw e;
			jitteredSleepMs(2, 18);
		}
	}
}

function writeStateFileAtomically(toplevel: string, state: State): void {
	const target = stateFile(toplevel);
	const temp = `${target}.${process.pid}.${++tempSeq}.tmp`;
	try {
		writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
		replaceStateFile(temp, target);
	} catch (e) {
		try { rmSync(temp, { force: true }); } catch { /* the temp of a failed write is never the round's state */ }
		throw e;
	}
}

// The worktrees this process is inside a writeState for. writeState is synchronous and an updater
// must not write state again: the inner call would meet this process's own lock, read our own pid as
// stale (stateLockIsStale), remove the outer write's lock, and land its patch on an old read
// (2026-10-09, issue #107). Keyed by the state file, so two worktrees in one process are still fine.
const writing = new Set<string>();

// Merge: every writer keeps the fields it does not own, read and written under the state lock.
export function writeState(toplevel: string, update: StateUpdater): State {
	// The updater is the only write shape; the old copied-`State` patch is refused here rather than
	// written over newer nested state it cannot see (issue #107).
	if (typeof update !== 'function') throw new Error('wf: writeState takes an updater function(current), not a copied state object (issue #107)');
	// Reentry: an updater that writes state again would take the outer write's own lock and remove it
	// (the stale rule reads our pid), and the outer patch would land on an old read. Refuse it.
	const key = stateFile(toplevel);
	if (writing.has(key)) throw new Error(`wf: writeState is already running for ${toplevel}; an updater must not write state (issue #107)`);
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	writing.add(key);
	try {
		const release = acquireStateLock(toplevel);
		try {
			// The updater gets its own copy of `current`: a callback that mutates it cannot rewrite the
			// snapshot state.ts keeps, and cannot smuggle the mutation into the write.
			const before = readState(toplevel);
			const current = before ?? {};
			const patch = update(structuredClone(current));
			const state: State = { ...current, ...patch };
			writeStateFileAtomically(toplevel, state);

			return state;
		} finally {
			release();
		}
	} finally {
		writing.delete(key);
	}
}

// The round id and folder a prompt substitutes. Falls back to the branch when
// `wf new --id` did not run (a hand-cut worktree).
export function roundOf(state: State | null, toplevel: string) {
	const id = state?.id ?? state?.round ?? null;
	return { id, folder: state?.folder ?? (id ? `${roundsDir}/${id}` : null), toplevel };
}

// Pure: why `entry` may not run in this round, or null. A round records which wf made it (`wf new`:
// made_by, entry), and the other refuses: on Shay's machine ~/bin/wf (his env) is on the PATH of a
// Desktop session too, and a bare `wf` there would carry a team round into his env's URLs and
// review UI (kit and env plan, step 6). Rounds from before the field run anywhere.
export function entryGap(state: State | null, madeBy: string) {
	if (!state?.made_by || state.made_by === madeBy) return null;
	return `this round was made by the ${state.made_by}'s wf, and this is the ${madeBy}'s: run it as node "${state.entry}"${state.made_by === 'kit' ? ' (in the Claude Code plugin: node "${CLAUDE_PLUGIN_ROOT}/wf.mjs")' : ''}`;
}
