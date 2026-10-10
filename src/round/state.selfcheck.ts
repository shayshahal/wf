// state.selfcheck.ts — node state.selfcheck.ts → exit 0 when green.
// The arms that matter, all through the real persistence interface (issue #107): competing processes
// updating different round facts keep both, including nested collections; a writer killed mid-write
// leaves the previous state whole and does not block the next command; a missing state is null while a
// corrupt one is refused, never silently replaced. The same file, spawned with an argument, is the
// competing/interrupted writer; the parent's arms only run without one.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorruptStateError, readState, roundFile, stateFile, stateLockIsStale, writeState } from './state.ts';
import type { State, StateUpdater } from './state.ts';

// Child mode: this file spawned as the writer the parent races or kills.
const [, , mode, childDir, childKey, childIters, childNapMs] = process.argv;
if (mode === 'writer' || mode === 'spam') {
	const stop = join(childDir, '.stop');
	const at = '2026-10-09T00:00:00.000Z';
	// A caller's update does work between the read and the write (critiqueFields reads files, a
	// question is closed). The nap stands in for it, so the read-modify-write is long enough that the
	// race arm's writers really overlap when the lock is there to serialize them.
	const nap = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(childNapMs ?? 1));
	// writer mode starts together, so the reads really overlap (the parent writes `go` once all are
	// ready); spam mode writes at once, so the parent can kill it mid-write.
	if (mode === 'writer') {
		writeFileSync(join(childDir, `ready.${childKey}`), '');
		while (!existsSync(join(childDir, 'go'))) nap();
	}
	for (let i = 0; (mode === 'spam' ? !existsSync(stop) : i < Number(childIters)) && i < 100_000; i++) {
		// note is padding, so a writer that lost atomicity would be read mid-file; revisions is the nested
		// collection a competing writer must not erase.
		writeState(childDir, (s) => { nap(); return { note: 'x'.repeat(1_000_000), revisions: [...(s.revisions ?? []), { text: `${childKey}${i}`, at, sha: null }] }; });
	}
	process.exit(0);
}

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const self = fileURLToPath(import.meta.url);
const tempDir = () => mkdtempSync(join(tmpdir(), 'wf-state-'));
const at = '2026-10-09T00:00:00.000Z';
const rev = (text: string) => ({ text, at, sha: null });
const spawnWriter = (m: string, dir: string, key: string, iters: number, napMs = 1) =>
	spawn(process.execPath, [self, m, dir, key, String(iters), String(napMs)], { stdio: ['ignore', 'ignore', 'pipe'] });
const stderrOf = (c: ReturnType<typeof spawnWriter>) => { const out = { text: '' }; c.stderr?.on('data', (d: Buffer) => { out.text += d; }); return out; };
const throws = (f: () => unknown): Error | null => { try { f(); return null; } catch (e) { return e as Error; } };

// ── missing vs corrupt
const missing = tempDir();
check('no state file is no round (null)', readState(missing) === null);
rmSync(missing, { recursive: true, force: true });

const bad = tempDir();
writeState(bad, () => ({ round: 'r', revisions: [rev('a')] }));
const good = readFileSync(stateFile(bad), 'utf8');
writeFileSync(stateFile(bad), '{ "round": "r", "revisions": [');
const corrupt = throws(() => readState(bad));
check('corrupt state throws and names the file', corrupt instanceof CorruptStateError && corrupt.message.startsWith('corrupt round state: ') && corrupt.message.includes(stateFile(bad)), String(corrupt));
check('corrupt state is refused, not replaced', throws(() => writeState(bad, () => ({ round: 'other' }))) instanceof CorruptStateError);
check('a refused write leaves the file exactly as it was', readFileSync(stateFile(bad), 'utf8') === '{ "round": "r", "revisions": [');
check('roundFile refuses a corrupt round too', throws(() => roundFile(bad, 'PLAN.md')) instanceof CorruptStateError);
writeFileSync(stateFile(bad), '[]');
check('a JSON array is corrupt state as well', throws(() => readState(bad)) instanceof CorruptStateError);
writeFileSync(stateFile(bad), good);
check('a restored file reads again', readState(bad)?.revisions?.[0]?.text === 'a');
rmSync(bad, { recursive: true, force: true });

// ── merge, and the updater that sees the state under the lock
const dir = tempDir();
writeState(dir, () => ({ round: 'r', revisions: [rev('a')] }));
writeState(dir, () => ({ repairs: 2 }));
check('an update keeps the fields it does not return', readState(dir)?.round === 'r' && readState(dir)?.repairs === 2);
const seen: { state?: State } = {};
writeState(dir, (s) => { seen.state = s; return { id: 'round-id' }; });
check('the updater is handed the state as it is on disk', seen.state?.repairs === 2 && seen.state?.revisions?.[0]?.text === 'a');
check('the fields it returns merge over that state', readState(dir)?.round === 'r' && readState(dir)?.id === 'round-id');
// The stale copy a caller used to hold: it read early, another write landed, and writing its map back
// would erase that write. The write shape has no parameter for that copy; an updater is handed the
// live state, and a caller that returns its own old map is the deliberate rewind the trace watches for.
const early = readState(dir)!;
writeState(dir, (s) => ({ revisions: [...(s.revisions ?? []), rev('implement')] }));
writeState(dir, (s) => ({ revisions: [...(s.revisions ?? []), rev('validate')] }));
check('an update keeps a revision that landed after the caller read', readState(dir)?.revisions?.map((r) => r.text).join() === 'a,implement,validate', JSON.stringify(readState(dir)?.revisions));
check('the read-early copy is not what the updater was given', early.revisions?.length === 1 && readState(dir)!.revisions!.length === 3);
rmSync(dir, { recursive: true, force: true });

// The updater is handed its own copy: a callback that mutates what it got must not rewrite the
// snapshot state-trace compares against, nor smuggle the mutation into the write.
const mutable = tempDir();
writeState(mutable, () => ({ round: 'keep', revisions: [rev('a')] }));
writeState(mutable, (s) => { s.round = 'MUTATED'; (s.revisions as { text: string; at: string }[]).push(rev('z')); return { repairs: 5 }; });
const kept = readState(mutable)!;
check('an updater that mutates what it was handed cannot change the write', kept.round === 'keep' && kept.revisions?.length === 1 && kept.repairs === 5, JSON.stringify(kept));
rmSync(mutable, { recursive: true, force: true });

// The old write shape: an object (a copied map) instead of an updater is refused, and the state on
// disk is left exactly as it was.
const copied = tempDir();
writeState(copied, () => ({ round: 'exact' }));
const beforeCopy = readFileSync(stateFile(copied), 'utf8');
check('a copied state object is refused', throws(() => writeState(copied, { round: 'bad' } as unknown as StateUpdater)) instanceof Error);
check('the refused copied map did not overwrite the state', readFileSync(stateFile(copied), 'utf8') === beforeCopy);
rmSync(copied, { recursive: true, force: true });

// Reentry: an updater that writes state again would meet this process's own lock and remove it from
// the outer write.
const nested = tempDir();
const nestedOutcome: { error?: Error } = {};
writeState(nested, () => { try { writeState(nested, () => ({ id: 'inner' })); } catch (e) { nestedOutcome.error = e as Error; } return { round: 'outer' }; });
check('a nested writeState is refused', nestedOutcome.error instanceof Error && /already running/.test(nestedOutcome.error.message), String(nestedOutcome.error));
check('the outer write survives the refused reentry', readState(nested)?.round === 'outer' && readState(nested)?.id === undefined);
rmSync(nested, { recursive: true, force: true });

// ── the lock: a gone writer is taken at once, a live one is waited for
const locks = tempDir();
writeState(locks, () => ({ round: 'r' }));
const lock = `${stateFile(locks)}.lock`;
const deadPid = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid!;
writeFileSync(lock, JSON.stringify({ pid: deadPid, at: new Date().toISOString() }));
check('a lock held by a gone process is stale at once', stateLockIsStale(lock) === true);
const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
const sleeperDone = once(sleeper, 'exit');
writeFileSync(lock, JSON.stringify({ pid: sleeper.pid, at: new Date().toISOString() }));
check('a fresh lock held by a live process is not stale', stateLockIsStale(lock) === false);
// The old hard bound took a live writer's lock at five minutes; no age can prove a writer dead.
const old = new Date(Date.now() - 600_000);
utimesSync(lock, old, old);
check('a live writer is never stolen on age alone', stateLockIsStale(lock) === false);
check('a live-looking pid the OS reused fails closed rather than being stolen', stateLockIsStale(lock) === false);
writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
check('a lock of our own pid is stale: a failed release cannot wedge us', stateLockIsStale(lock) === true);
sleeper.kill('SIGKILL');
await sleeperDone;
writeFileSync(lock, 'half');
check('an unreadable lock is not stale: wf publishes locks complete, so it is not ours to take', stateLockIsStale(lock) === false);
// The stale lock and the orphan temp a killed writer leaves: the next command recovers.
writeFileSync(lock, JSON.stringify({ pid: deadPid, at: new Date().toISOString() }));
writeFileSync(`${stateFile(locks)}.${deadPid}.1.tmp`, '{ partial');
const recovered = writeState(locks, (s) => ({ revisions: [...(s.revisions ?? []), rev('recovered')] }));
check('a stale lock does not block the next update', recovered.revisions?.some((r) => r.text === 'recovered') === true && readState(locks)?.round === 'r');
check('the stale lock is gone after the write', !existsSync(lock));
check('the acquisition guard is gone after the reclaim', !existsSync(`${lock}.acquiring`));
check('the orphan temp of an interrupted write is not the round', readState(locks)?.round === 'r');
// A release that lost a Windows sharing race leaves our own pid in the lock: the next write takes it
// back at once (the stale rule reads our own pid; reentry is refused separately) instead of waiting.
writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
const selfRecovered = writeState(locks, (s) => ({ revisions: [...(s.revisions ?? []), rev('selflock')] }));
check('a leftover lock of our own pid does not wedge the next write', selfRecovered.revisions?.some((r) => r.text === 'selflock') === true && !existsSync(lock));
rmSync(locks, { recursive: true, force: true });

// Waits until every named writer has opened its barrier, then lets them start together; a bounded
// wait, so a writer that dies on startup fails the arm instead of hanging the check.
const startTogether = async (dir: string, readyKeys: string[]) => {
	const deadline = Date.now() + 10_000;
	while (!readyKeys.every((k) => existsSync(join(dir, `ready.${k}`))) && Date.now() < deadline) await sleep(2);
	writeFileSync(join(dir, 'go'), '');
};

// ── competing processes: every nested key survives. Each writer makes one update whose read and
// write are 30ms apart (the updater's work); started together, they all read the same state when
// nothing serializes them, so without the lock all but one key is lost — and with it every key
// lands, because each read happens after the previous write.
const race = tempDir();
writeState(race, () => ({ round: 'race', revisions: [rev('seed')] }));
const keys = ['alpha', 'beta', 'gamma', 'delta'];
const children = keys.map((k) => {
	const c = spawnWriter('writer', race, k, 1, 30);
	return { c, err: stderrOf(c), done: once(c, 'close') };
});
await startTogether(race, keys);
await Promise.all(children.map(({ done }) => done));
const raced = readState(race);
check('every competing writer exited clean', children.every(({ c }) => c.exitCode === 0), children.map(({ c, err }) => `${c.pid}:${c.exitCode} ${err.text.slice(0, 800)}`).join(' | '));
check('four competing processes keep every nested key', keys.every((k) => raced?.revisions?.some((r) => r.text.startsWith(k))), JSON.stringify(raced?.revisions?.map((r) => r.text)));
check('the round fields survive the race', raced?.round === 'race' && raced?.revisions?.[0]?.text === 'seed');
rmSync(race, { recursive: true, force: true });

// ── the lock is published complete: a reader during a write never meets an empty or partial lock.
// The old lock was created with open('wx') and its pid written after, so a reader could catch it empty
// (issue #107). The body is now written to a temp and hard-linked, so a lock that exists has a pid.
const complete = tempDir();
writeState(complete, () => ({ round: 'complete' }));
const holder = spawnWriter('writer', complete, 'held', 1, 300);
const holderDone = once(holder, 'close');
await startTogether(complete, ['held']);
let partialLock: string | null = null;
let lockReads = 0;
while (holder.exitCode === null) {
	try {
		const text = readFileSync(`${stateFile(complete)}.lock`, 'utf8');
		lockReads++;
		if (typeof (JSON.parse(text) as { pid?: number }).pid !== 'number') partialLock = text;
	} catch (e) {
		// Absent between the read and the open is normal; any other failure while the holder runs is not.
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') partialLock = `${(e as NodeJS.ErrnoException).code}: ${(e as Error).message}`;
	}
	await sleep(1);
}
await holderDone;
check('the lock is never observed empty or partial', partialLock === null && lockReads > 0, `${lockReads} lock reads: ${partialLock ?? ''}`);
rmSync(complete, { recursive: true, force: true });

// ── a reader during writes: the rename is what makes it see a whole state, never partial JSON.
// Windows refuses a rename while a reader holds the target open, so a writer here may retry and, if
// the reader never lets go, refuse; that is not what this arm measures. Only a parse failure — the
// signature of a write that replaced the file in place — is a failure.
const atomic = tempDir();
writeState(atomic, () => ({ round: 'atomic', revisions: [rev('seed')] }));
const atomicKeys = keys.slice(0, 3);
const writerKids = atomicKeys.map((k) => spawnWriter('writer', atomic, k, 6));
const writerDone = writerKids.map((c) => once(c, 'close'));
await startTogether(atomic, atomicKeys);
let partial: string | null = null;
let reads = 0;
while (writerKids.some((c) => c.exitCode === null)) {
	try { readState(atomic); reads++; } catch (e) {
		// A sharing error from the read itself is the rename in flight, not a partial file.
		if (e instanceof CorruptStateError) partial = e.message;
	}
	await sleep(1);
}
await Promise.all(writerDone);
check('a reader during concurrent writes never sees a partial state', partial === null && reads > 0, `${reads} reads: ${partial ?? ''}`);
rmSync(atomic, { recursive: true, force: true });

// ── a writer killed mid-write: the state stays whole, the mechanism stays usable
const killed = tempDir();
writeState(killed, () => ({ round: 'killed', revisions: [rev('seed')] }));
const victim = spawnWriter('spam', killed, 'child', 0, 0);
const victimErr = stderrOf(victim);
const victimDone = once(victim, 'exit');
await sleep(250);
victim.kill('SIGKILL');
writeFileSync(join(killed, '.stop'), ''); // if the kill did not land, the loop ends anyway
await victimDone;
const afterKill = readState(killed);
check('a killed writer leaves the state whole', afterKill?.round === 'killed' && afterKill?.revisions?.[0]?.text === 'seed', JSON.stringify(afterKill?.revisions) + victimErr.text);
const afterRecovery = writeState(killed, (s) => ({ revisions: [...(s.revisions ?? []), rev('recovered')] }));
check('a killed writer does not leave the update mechanism unusable', afterRecovery.revisions?.some((r) => r.text === 'recovered') === true && !existsSync(`${stateFile(killed)}.lock`), JSON.stringify(afterRecovery.revisions));
rmSync(killed, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
