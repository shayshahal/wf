// serve-stale-owner.selfcheck.ts — node serve-stale-owner.selfcheck.ts → exit 0 when green.
// A serve owner whose servers stopped by themselves (2026-11-22, fix/jx-1085-search-icon-placement): the
// stack exited 3 s after it started, .wf/serve-owner.json still said "running" for a root pid that was
// gone, and `wf serve --stop`, deliver and reap all refused with "owner disappeared before release;
// possible orphan descendants require inspection" until the orchestrator inspected by hand and deleted
// the record. wf does that inspection itself now. Real processes stand in for the stack, so the check
// goes through the same process inventory a stop does.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seams } from '../seams.ts';
import { pidFile, stopWorktreeServers } from './serve.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; /* ESRCH: gone */ } };
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
// Free when this process can bind it and nothing answers on it: a connect probe alone passed a port
// that listen then refused with EADDRINUSE (1 run in 8, 2026-11-22).
const free = (port: number) => new Promise<boolean>((done) => {
	const server = createServer();
	server.once('error', () => done(false));
	server.listen(port, '127.0.0.1', () => {
		server.close(() => {
			const socket = connect({ host: 'localhost', port });
			socket.once('connect', () => { socket.destroy(); done(false); });
			socket.once('error', () => done(true));
		});
	});
});
// The round's ports are the project's triple on the base port .wf/state.json records: pick one whose
// three are all free here, so another round's stack on this machine cannot colour the check.
async function freeBase(): Promise<number> {
	for (let base = 30_000 + (process.pid % 5000); ; base += 7) {
		if ((await Promise.all([base, base + 10_000, base + 20_000].map(free))).every(Boolean)) return base;
	}
}

const outside = mkdtempSync(join(tmpdir(), 'wf-stale-outside-'));
const worktree = mkdtempSync(join(tmpdir(), 'wf-stale-owner-'));
const record = join(worktree, '.wf', 'serve-owner.json');
const base = await freeBase();
const owner = (root: { pid: number; parent: number; born: string }) => {
	writeFileSync(pidFile(worktree), String(root.pid));
	writeFileSync(record, JSON.stringify({ token: 'stale', state: 'running', processes: [root] }));
};
const started: number[] = [];
let failures = 0;
// Each arm reports on its own, so a red one does not hide the others.
async function arm(name: string, run: () => Promise<void>) {
	try { await run(); console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name} — ${(e as Error).message}`); }
	rmSync(record, { force: true }); rmSync(pidFile(worktree), { force: true });
}
try {
	execFileSync('git', ['init', '-q', '-b', 'fix/stale-owner'], { cwd: worktree });
	execFileSync('git', ['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base', '--allow-empty'], { cwd: worktree });
	mkdirSync(join(worktree, '.wf'));
	writeFileSync(join(worktree, '.wf', 'state.json'), JSON.stringify({ port: base }));

	// 1. The incident: the recorded root is gone and nothing of its stack is left.
	const dead = { pid: 2_000_000_000, parent: 1, born: '2026-11-22T11:27:51.5712380Z' };
	await arm('a dead root with nothing left: the record is released', async () => {
		owner(dead);
		const released = await stopWorktreeServers(worktree);
		assert.equal(released.kind, 'stopped', JSON.stringify(released));
		assert(!existsSync(record) && !existsSync(pidFile(worktree)), 'the stale record and serve.pid are gone');
	});

	// 2. A round port still answers, and no process in the worktree explains it: refuse, naming the port.
	await arm('a dead root, a round port still answers: refused, naming the port', async () => {
		owner(dead);
		const listener = createServer().listen(base + 10_000, '127.0.0.1');
		await new Promise((done) => listener.once('listening', done));
		try {
			const held = await stopWorktreeServers(worktree);
			assert(held.kind === 'refused' && held.why.includes(String(base + 10_000)), JSON.stringify(held));
			console.log(`       ${held.kind === "refused" ? held.why : ""}`);
			assert(existsSync(record), 'the record is retained for inspection');
		} finally { listener.close(); }
	});

	// 3. The root is gone and part of its stack survives, as it can on Windows, where an orphan keeps its
	// parent's pid. The root (cwd: the worktree, like `wf serve --foreground`) starts
	//   a: a direct child, cwd outside: found by its parent pid
	//   a hop, which starts b and c and exits, so their parent pid names no recorded process:
	//     b: a dev server whose script is in the worktree's node_modules, cwd outside
	//     c: a server with its cwd in the worktree (cmd.exe running `pnpm dev`)
	// Beside them, and never touched: a process parked in the worktree by a live parent (this check
	// stands in for an agent's shell), and one whose script and cwd are both outside.
	const script = join(worktree, 'node_modules', 'dev-server', 'bin', 'dev.js');
	mkdirSync(join(worktree, 'node_modules', 'dev-server', 'bin'), { recursive: true });
	writeFileSync(script, 'setInterval(() => {}, 1000);\n');
	writeFileSync(join(outside, 'other.js'), 'setInterval(() => {}, 1000);\n');
	const pids = join(outside, 'pids.json');
	const go = join(outside, 'go');
	const detach = { detached: true, stdio: 'ignore', windowsHide: true } as const;
	const hop = `const { spawn } = require('node:child_process');
const d = { detached: true, stdio: 'ignore', windowsHide: true };
const b = spawn(process.execPath, [${JSON.stringify(script)}], { ...d, cwd: ${JSON.stringify(outside)} });
const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...d, cwd: ${JSON.stringify(worktree)} });
b.unref(); c.unref();
require('node:fs').writeFileSync(${JSON.stringify(join(outside, 'hop.json'))}, JSON.stringify({ b: b.pid, c: c.pid }));`;
	const root = spawn(process.execPath, ['-e', `const { spawn } = require('node:child_process');
const fs = require('node:fs');
const d = { detached: true, stdio: 'ignore', windowsHide: true };
const a = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { ...d, cwd: ${JSON.stringify(outside)} });
a.unref();
const hop = spawn(process.execPath, ['-e', ${JSON.stringify(hop)}], { ...d, cwd: ${JSON.stringify(worktree)} });
hop.on('exit', () => {
	const { b, c } = JSON.parse(fs.readFileSync(${JSON.stringify(join(outside, 'hop.json'))}, 'utf8'));
	fs.writeFileSync(${JSON.stringify(pids)}, JSON.stringify({ a: a.pid, b, c }));
	const wait = setInterval(() => { if (fs.existsSync(${JSON.stringify(go)})) { clearInterval(wait); process.exit(1); } }, 50);
});`], { ...detach, cwd: worktree });
	root.unref();
	assert(root.pid);
	started.push(root.pid);
	for (let i = 0; i < 200 && !existsSync(pids); i++) await sleep(50);
	const left: { a: number; b: number; c: number } = JSON.parse(readFileSync(pids, 'utf8'));
	started.push(left.a, left.b, left.c);
	const snapshot = seams.processes.snapshot();
	assert(snapshot.kind === 'known');
	const recorded = snapshot.processes.find((p) => p.pid === root.pid);
	assert(recorded, 'the root runs while its identity is recorded');
	owner(recorded);
	const parked = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: worktree, stdio: 'ignore', windowsHide: true });
	const stranger = spawn(process.execPath, [join(outside, 'other.js')], { cwd: outside, stdio: 'ignore', windowsHide: true });
	assert(parked.pid && stranger.pid);
	started.push(parked.pid, stranger.pid);
	writeFileSync(go, '');
	for (let i = 0; i < 100 && alive(root.pid); i++) await sleep(50);
	assert(!alive(root.pid) && alive(left.a) && alive(left.b) && alive(left.c), 'the root exited; its stack survives');

	await arm('a dead root whose stack survives in the worktree: the survivors are stopped, nothing else', async () => {
		const stopped = await stopWorktreeServers(worktree);
		assert.equal(stopped.kind, 'stopped', JSON.stringify(stopped));
		assert(!existsSync(record) && !existsSync(pidFile(worktree)), 'the record and serve.pid are gone');
		await sleep(200);
		assert(!alive(left.a), 'a: the dead root\'s direct child is stopped');
		assert(!alive(left.b), 'b: the server whose script is in the worktree is stopped');
		assert(!alive(left.c), 'c: the orphan whose cwd is the worktree is stopped');
		assert(alive(parked.pid!), 'a process parked in the worktree by a live parent is not touched');
		assert(alive(stranger.pid!), 'a process outside the worktree is not touched');
	});
} finally {
	for (const pid of started) if (alive(pid)) process.kill(pid);
	await sleep(300);
	rmSync(worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
