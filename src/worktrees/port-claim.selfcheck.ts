// port-claim.selfcheck.ts — node port-claim.selfcheck.ts → exit 0 when green.
// A round's stack ports (P, P+10000, P+20000) can be held by another process; the hash never looked
// (2026-11-02). Each arm fails on the code before port-claim.ts: no module, no recorded port.
import { moveStack, stackPorts } from '../project.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseNewPort, claimRoundPort, firstFreeBase, portIsFree, roundPort } from './port-claim.ts';
import { hashPort } from './ports.ts';

const heldPorts = (...held: number[]) => async (port: number) => !held.includes(port);

// A listener that holds a real port on both loopback addresses, as a dev server does.
const listen = (port: number, host: string) => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
	const server = createServer();
	server.once('error', reject);
	server.listen({ port, host }, () => resolve(server));
});
const close = (server: ReturnType<typeof createServer>) => new Promise<void>((done) => server.close(() => done()));

// 1. firstFreeBase keeps a base whose ports are all free, moves past one with any port held, wraps.
assert.deepEqual(await firstFreeBase({ from: 15000, free: heldPorts() }), { base: 15000, held: [] });
assert.deepEqual(await firstFreeBase({ from: 15000, free: heldPorts(25000) }), { base: 15001, held: [25000] }, 'the API or admin port held moves the whole base');
assert.deepEqual(await firstFreeBase({ from: 15000, free: heldPorts(15000, 15001, 35002) }), { base: 15003, held: [15000] }, 'next slots are skipped while any of their ports is held');
assert.equal((await firstFreeBase({ from: 19999, free: heldPorts(19999) })).base, 10000, 'the slots wrap inside 10000-19999');
await assert.rejects(firstFreeBase({ from: 12000, free: async () => false }), /no free port slot/);
console.log('  ok   a base keeps free ports, skips a held one, wraps, and gives up when none is free');

// 2. portIsFree against a real listener, the way a foreign dev server holds a port.
const probe = await listen(0, '127.0.0.1');
const taken = (probe.address() as { port: number }).port;
assert.equal(await portIsFree(taken), false, 'a listener on 127.0.0.1 holds the port');
await close(probe);
assert.equal(await portIsFree(taken), true, 'the port is free once it closes');
console.log('  ok   portIsFree sees a real listener and its release');

// 3. wf new: a hashed base with a held port moves, says so, and a free one is left alone.
const hashed = hashPort('fix/jewelryx-seed-ports');
const keep = await chooseNewPort('fix/jewelryx-seed-ports', heldPorts());
assert.deepEqual(keep, { port: hashed, moved: false, line: null });
const moved = await chooseNewPort('fix/jewelryx-seed-ports', heldPorts(hashed + 10_000));
assert.equal(moved.moved, true);
assert.equal(moved.port, hashed === 19999 ? 10000 : hashed + 1);
assert.match(moved.line ?? '', new RegExp(`${hashed + 10_000} held by another process; this round's stack moves from base ${hashed} to ${moved.port}`));
console.log('  ok   wf new moves a hashed base whose port is held, with a line saying so, and keeps a free one');

// 4. wf serve: the recorded port is the round's, a held one is replaced and recorded, a free one is kept.
const worktree = mkdtempSync(join(tmpdir(), 'wf-port-claim-'));
try {
	mkdirSync(join(worktree, '.wf'));
	const branch = 'fix/port-claim-check';
	assert.equal(roundPort(worktree, branch), hashPort(branch), 'no record: the hash');
	writeFileSync(join(worktree, '.wf', 'state.json'), JSON.stringify({ round: branch, port: 14321 }));
	assert.equal(roundPort(worktree, branch), 14321, 'a recorded port wins over the hash');

	const rewritten: number[] = [];
	const rewrite = async ({ port }: { worktree: string; slug: string; port: number }) => { rewritten.push(port); };
	const kept = await claimRoundPort({ worktree, branch, slug: 'x', free: heldPorts(), rewrite });
	assert.deepEqual(kept, { port: 14321, line: null }, 'free recorded ports are kept');
	assert.deepEqual(rewritten, []);

	const claim = await claimRoundPort({ worktree, branch, slug: 'x', free: heldPorts(24321), rewrite });
	assert.equal(claim.port, 14322);
	assert.match(claim.line ?? '', /24321 held by another process; this round's stack moves from base 14321 to 14322 \(recorded in \.wf\/state\.json\)/);
	assert.deepEqual(rewritten, [14322]);
	assert.equal(JSON.parse(readFileSync(join(worktree, '.wf', 'state.json'), 'utf8')).port, 14322, 'the move is recorded');
	assert.equal(JSON.parse(readFileSync(join(worktree, '.wf', 'state.json'), 'utf8')).round, branch, 'the rest of the state is kept');
	assert.equal(roundPort(worktree, branch), 14322, 'and stays across restarts');
	assert.deepEqual(await claimRoundPort({ worktree, branch, slug: 'x', free: heldPorts(24321), rewrite }), { port: 14322, line: null }, 'the recorded ports are free: kept, nothing printed');

	// 5. the project's files follow the moved port.
	await moveStack({ worktree, slug: 'x', port: 14322 });
	const env = readFileSync(join(worktree, '.verify-stack.env'), 'utf8');
	assert.match(env, /14322/);
	assert.match(env, /24322/);
	assert.match(env, /34322/);
	assert.doesNotMatch(env, /14321/);
	assert.deepEqual(stackPorts(14322), [14322, 24322, 34322]);
	console.log('  ok   wf serve keeps a free recorded port, moves a held one, records it, and rewrites the stack files');

	// 6. The same against a real process holding the API port of the recorded base (no stubbed probe).
	let base = 16000;
	while (!(await Promise.all([...stackPorts(base), ...stackPorts(base + 1)].map(portIsFree))).every(Boolean)) base += 7;
	writeFileSync(join(worktree, '.wf', 'state.json'), JSON.stringify({ round: branch, port: base }));
	const squatter = await listen(base + 10_000, '127.0.0.1');
	try {
		const real = await claimRoundPort({ worktree, branch, slug: 'x', rewrite });
		assert.equal(real.port, base + 1, 'a real listener on the API port moves the round to the next slot');
		assert.match(real.line ?? '', new RegExp(`${base + 10_000} held by another process`));
		assert.equal(roundPort(worktree, branch), base + 1);
	} finally {
		await close(squatter);
	}
	console.log('  ok   a real process on the API port moves the round, recorded');
} finally {
	rmSync(worktree, { recursive: true, force: true });
}
console.log('\nall arms green');
