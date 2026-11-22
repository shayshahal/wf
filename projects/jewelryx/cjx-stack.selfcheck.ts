// A worktree whose `cjx stack up` stack runs is not served beside it (cjx-stack.ts); a stale record and
// no record do not block. Real processes stand in for stack.mjs's server parents, so the check goes
// through the same command-line probe a serve does.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareServe } from './index.ts';
import { removalPlan } from '../../src/worktrees/git-worktree.ts';

const worktree = mkdtempSync(join(tmpdir(), 'wf-cjx-stack-'));
const log = join(worktree, '.verify', 'stack.log').replace(/\\/g, '/');
const record = (pids: number[]) => writeFileSync(join(worktree, '.verify', 'stack.json'), JSON.stringify({ port: 5173, log, pids, previousStackFile: null }, null, 2));
// stack.mjs's SERVER_PARENT starts with this comment and takes the log as its first argument.
const parent = (marker: string) => spawn(process.execPath, ['-e', `// ${marker}\nsetInterval(() => {}, 1000);`, log, 'b2b', 'pnpm dev:frontend'], { stdio: 'ignore', windowsHide: true });
const refusal = () => { try { prepareServe(worktree); return null; } catch (e) { return (e as Error).message; } };

const running = parent('cjx-stack-server-parent');
const stranger = parent('not-a-server-parent');
try {
	mkdirSync(join(worktree, '.verify'), { recursive: true });
	assert.equal(refusal(), null, 'none: no stack.json serves');

	assert(running.pid && stranger.pid);
	record([running.pid]);
	const alive = refusal();
	assert(alive, 'alive: a running server parent refuses');
	for (const said of ['http://localhost:5173', 'http://127.0.0.1:15173/api/v1', 'http://localhost:25173', 'cjx stack down', 'node docs/agents/verify-jewelryx/control-jewelryx.mjs stack down', worktree]) assert(alive.includes(said), `the refusal names ${said}: ${alive}`);

	running.kill();
	await new Promise((done) => running.once('exit', done));
	record([running.pid]);
	assert.equal(refusal(), null, 'stale: a recorded pid that no longer runs serves');

	record([stranger.pid]);
	assert.equal(refusal(), null, 'stale: a recorded pid reused by another process serves');

	writeFileSync(join(worktree, '.verify', 'stack.json'), 'not json');
	assert.equal(refusal(), null, 'an unreadable record serves');
} finally {
	running.kill();
	stranger.kill();
	rmSync(worktree, { recursive: true, force: true });
}

// Reap (2026-11-19, JX-1266): `wf reap` could not delete a worktree whose `cjx stack up` stack still ran.
// The stack's server parents and their dev servers keep the folder as their working folder, wf did not
// own them, and `rm -rf worktree` failed with EPERM until the agent killed them by hand. After reap's
// first step, "stop owned servers", the folder must delete, while a server parent of another checkout's
// stack keeps running.
{
	const tree = mkdtempSync(join(tmpdir(), 'wf-cjx-reap-'));
	const other = mkdtempSync(join(tmpdir(), 'wf-cjx-other-'));
	mkdirSync(join(tree, '.verify'), { recursive: true });
	mkdirSync(join(tree, 'packages', 'b2b'), { recursive: true });
	const treeLog = join(tree, '.verify', 'stack.log').replace(/\\/g, '/');
	const childPid = join(tree, '.verify', 'child.pid');
	// stack.mjs's server parent: started in the checkout, it starts the dev server in a package folder.
	const server = spawn(process.execPath, ['-e', `// cjx-stack-server-parent
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: ${JSON.stringify(join(tree, 'packages', 'b2b'))}, stdio: 'ignore' });
require('node:fs').writeFileSync(${JSON.stringify(childPid)}, String(child.pid));
setInterval(() => {}, 1000);`, treeLog, 'b2b', 'pnpm dev:frontend'], { cwd: tree, stdio: 'ignore', windowsHide: true });
	const foreign = spawn(process.execPath, ['-e', '// cjx-stack-server-parent\nsetInterval(() => {}, 1000);', join(other, '.verify', 'stack.log').replace(/\\/g, '/'), 'b2b', 'pnpm dev:frontend'], { cwd: other, stdio: 'ignore', windowsHide: true });
	const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; /* ESRCH: gone */ } };
	let child = 0;
	try {
		for (let i = 0; i < 100 && !existsSync(childPid); i++) await new Promise((done) => setTimeout(done, 100));
		child = Number(readFileSync(childPid, 'utf8'));
		assert(server.pid && foreign.pid && alive(child), 'the stack runs');
		writeFileSync(join(tree, '.verify', 'stack.json'), JSON.stringify({ port: 5173, log: treeLog, pids: [server.pid, foreign.pid], previousStackFile: null }, null, 2));
		const [stop] = removalPlan({ path: tree, slug: 'fix-cjx-reap', pid: process.pid });
		assert.equal(stop.label, 'stop owned servers');
		await stop.run!();
		let removed: string | null = null;
		try { rmSync(tree, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (e) { removed = (e as Error).message; }
		assert.equal(removed, null, `reap: the worktree deletes after reap stopped its servers; the cjx stack held it: ${removed}`);
		assert(!alive(server.pid) && !alive(child), 'reap: the stack\'s server parent and its dev server are stopped');
		assert(alive(foreign.pid), 'reap: a server parent writing to another checkout\'s log keeps running, even when this record names its pid');
	} finally {
		server.kill();
		foreign.kill();
		if (child && alive(child)) process.kill(child);
		rmSync(tree, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
		rmSync(other, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
	}
}
console.log('cjx-stack: ok');
