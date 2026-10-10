// owner-lock.ts — concurrent, stale-observer and abrupt-kill acquisition evidence for the #116 owner
// lock.
//
// Run from this folder: node test/owner-lock.ts
// The same file doubles as the children:
//   node test/owner-lock.ts child <dir> <holdMs>
//   node test/owner-lock.ts racer <dir> <pausePid> <coordDir>
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireGuardPath, acquireOwnerLock } from '../src/owner-lock.ts';

const SELF = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {
	const directory = process.argv[3] ?? '';
	const holdMs = Number(process.argv[4] ?? '0');
	try {
		const lock = acquireOwnerLock(directory);
		process.stdout.write(`acquired ${lock.pid}\n`);
		if (holdMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, holdMs));
		lock.release();
	} catch (error) {
		// The child reports a refusal on stdout and exits 0 so the parent can count winners and losers.
		process.stdout.write(`refused ${error instanceof Error ? error.message : String(error)}\n`);
	}
	process.exit(0);
}

if (process.argv[2] === 'racer') {
	const directory = process.argv[3] ?? '';
	const pausePid = Number(process.argv[4] ?? '0');
	const coord = process.argv[5] ?? '';
	const originalKill = process.kill.bind(process);
	// SAFETY: this test wraps process.kill to schedule the real liveness syscall; the wrapper keeps the
	// same signature and delegates to the original, so production liveness behavior is unchanged.
	process.kill = ((pid: number, signal?: number | NodeJS.Signals) => {
		if (signal === 0 && pid === pausePid) {
			writeFileSync(join(coord, 'paused'), String(process.pid));
			const deadline = Date.now() + 20_000;
			while (!existsSync(join(coord, 'go')) && Date.now() < deadline) {
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
			}
		}
		return originalKill(pid, signal);
	}) as typeof process.kill;
	try {
		const lock = acquireOwnerLock(directory);
		process.stdout.write(`acquired ${lock.pid}\n`);
		lock.release();
	} catch (error) {
		// The racer reports a refusal on stdout so the parent can count winners and losers.
		process.stdout.write(`refused ${error instanceof Error ? error.message : String(error)}\n`);
	}
	process.exit(0);
}

let failures = 0;
function check(name: string, condition: boolean, detail = ''): void {
	console.log(condition ? `  ok   ${name}` : `  FAIL ${name}${detail === '' ? '' : ` — ${detail}`}`);
	if (!condition) failures++;
}

function refusedBy(fn: () => unknown, pattern: RegExp): boolean {
	try {
		fn();
		return false;
	} catch (error) {
		return pattern.test(error instanceof Error ? error.message : String(error));
	}
}

const directory = mkdtempSync(join(tmpdir(), 'wf-owner-lock-'));

type Child = { child: ReturnType<typeof spawn>; out(): string; done: Promise<{ code: number | null; signal: string | null }> };
function spawnSelf(args: string[]): Child {
	const child = spawn(process.execPath, [SELF, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
	let out = '';
	child.stdout!.setEncoding('utf8');
	child.stdout!.on('data', (chunk: string) => (out += chunk));
	const done = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
		child.once('exit', (code, signal) => resolve({ code, signal })),
	);
	return { child, out: () => out, done };
}

const runChild = (work: string, holdMs: number): Child => spawnSelf(['child', work, String(holdMs)]);
const spawnRacer = (work: string, pausePid: number, coord: string): Child => spawnSelf(['racer', work, String(pausePid), coord]);

async function waitForLine(child: Child, pattern: RegExp, timeoutMs = 15_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const line = child.out().split('\n').find((entry) => pattern.test(entry));
		if (line !== undefined) return line;
		if (Date.now() > deadline) throw new Error(`timeout waiting for ${pattern} in ${JSON.stringify(child.out())}`);
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
	}
}

async function waitForFile(path: string, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() > deadline) throw new Error(`timeout waiting for ${path}`);
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
	}
}

function deadPid(): number {
	const probe = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { encoding: 'utf8' });
	if (probe.pid === undefined || probe.pid <= 0) throw new Error('could not obtain a dead pid');
	return probe.pid;
}

try {
	// A lock left empty (the window the old `open(..., 'wx')`-then-write code exposed) must fail
	// closed, not be deleted and re-acquired while its owner is still writing.
	const incomplete = join(directory, 'incomplete');
	mkdirSync(incomplete, { recursive: true });
	writeFileSync(join(incomplete, 'owner.lock'), '');
	check(
		'an empty lock fails closed with a recovery instruction',
		refusedBy(() => acquireOwnerLock(incomplete), /unreadable/),
		'acquireOwnerLock accepted an incomplete lock',
	);
	check('a failed acquire releases the acquisition guard', !existsSync(acquireGuardPath(incomplete)));

	// An existing acquisition guard is never stolen: a crashed acquisition needs manual recovery.
	const guarded = join(directory, 'guarded');
	mkdirSync(guarded, { recursive: true });
	writeFileSync(acquireGuardPath(guarded), JSON.stringify({ pid: 999_999, startedAt: '' }));
	check('an existing acquisition guard fails closed', refusedBy(() => acquireOwnerLock(guarded), /acquisition guard/));

	// A second acquire handle in the same process must not delete the first handle's lock.
	const ownPid = join(directory, 'own-pid');
	mkdirSync(ownPid, { recursive: true });
	const first = acquireOwnerLock(ownPid);
	check('a second acquire in the same process is refused, not silently re-acquired', refusedBy(() => acquireOwnerLock(ownPid), /already holds/));
	first.release();

	// A released handle must not delete a newer acquisition by the same process.
	const sequential = join(directory, 'sequential');
	mkdirSync(sequential, { recursive: true });
	const releasedHandle = acquireOwnerLock(sequential);
	releasedHandle.release();
	const newer = acquireOwnerLock(sequential);
	releasedHandle.release();
	check('a released handle cannot delete a newer same-process acquisition', existsSync(newer.path), newer.path);
	newer.release();
	check('the newer handle releases its own lock', !existsSync(newer.path));

	// Genuine concurrency: several processes race to publish the lock; exactly one wins.
	for (let round = 0; round < 3; round++) {
		const work = join(directory, `race-${round}`);
		mkdirSync(work, { recursive: true });
		const children = Array.from({ length: 6 }, () => runChild(work, 2000));
		await Promise.all(children.map((child) => child.done));
		const acquired = children.filter((child) => child.out().startsWith('acquired'));
		const refused = children.filter((child) => child.out().startsWith('refused'));
		check(
			`round ${round}: exactly one of six concurrent owners acquires (${refused.length} refused)`,
			acquired.length === 1 && refused.length === 5,
			JSON.stringify(children.map((child) => child.out().trim())),
		);
		check(
			`round ${round}: every refusal names the live owner or the acquisition guard`,
			refused.every((child) => /another owner|acquisition guard/.test(child.out())),
			JSON.stringify(refused.map((child) => child.out().trim())),
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 200));
	}

	// Stale-observer race: A reads a dead owner and pauses at the real liveness syscall; B tries to
	// take over in that window. The guard makes B refuse, so only A ever acquires and B's live lock is
	// never deleted.
	const staleObserver = join(directory, 'stale-observer');
	mkdirSync(staleObserver, { recursive: true });
	const coord = join(directory, 'coord');
	mkdirSync(coord, { recursive: true });
	const dead = deadPid();
	writeFileSync(join(staleObserver, 'owner.lock'), JSON.stringify({ pid: dead, startedAt: new Date().toISOString() }));
	const observer = spawnRacer(staleObserver, dead, coord);
	await waitForFile(join(coord, 'paused'));
	const taker = runChild(staleObserver, 0);
	await taker.done;
	writeFileSync(join(coord, 'go'), 'go');
	await observer.done;
	const winnerCount = [observer, taker].filter((child) => child.out().startsWith('acquired')).length;
	check('stale-observer race: exactly one contender acquires', winnerCount === 1, JSON.stringify({ observer: observer.out().trim(), taker: taker.out().trim() }));
	check(
		'stale-observer race: the second contender refuses while the guard is held',
		/acquisition guard/.test(taker.out()),
		taker.out().trim(),
	);
	check('stale-observer race: the guard is released after acquisition', !existsSync(acquireGuardPath(staleObserver)));
	const reclaimed = acquireOwnerLock(staleObserver);
	check('stale-observer race: the lock can be acquired again after the race', reclaimed.pid === process.pid, `pid ${reclaimed.pid}`);
	reclaimed.release();

	// Abrupt kill: the winner is SIGKILLed while holding; the next acquisition takes over the stale lock.
	const killed = join(directory, 'killed');
	mkdirSync(killed, { recursive: true });
	const holder = runChild(killed, 60_000);
	await waitForLine(holder, /^acquired /);
	holder.child.kill('SIGKILL');
	await holder.done;
	check('an abrupt kill during the review leaves no acquisition guard', !existsSync(acquireGuardPath(killed)));
	const recovered = acquireOwnerLock(killed);
	check('an abrupt kill leaves a stale lock the next owner takes over', recovered.pid === process.pid, `pid ${recovered.pid}`);
	recovered.release();
	const reacquired = acquireOwnerLock(killed);
	check('a released lock can be acquired again', reacquired.pid === process.pid, `pid ${reacquired.pid}`);
	reacquired.release();
} catch (error) {
	failures++;
	console.error(`\nUNCAUGHT: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
	if (failures === 0) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	else console.log(`\nkept test directory for inspection: ${directory}`);
}

console.log(failures === 0 ? '\nall owner-lock checks green' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
