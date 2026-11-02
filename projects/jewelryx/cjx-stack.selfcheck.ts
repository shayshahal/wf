// A worktree whose `cjx stack up` stack runs is not served beside it (cjx-stack.ts); a stale record and
// no record do not block. Real processes stand in for stack.mjs's server parents, so the check goes
// through the same command-line probe a serve does.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareServe } from './index.ts';

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
console.log('cjx-stack: ok');
