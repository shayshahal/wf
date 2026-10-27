// #173: a runner that exits with a live child must retain the refusal diagnosis, not just a dead supervisor.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckProcess } from './check-process.ts';
import { snapshotProcesses, killOwnedProcesses } from '../process-tree.ts';
import type { ProcessIdentity } from '../process-tree.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-check-orphan-'));
const ready = join(root, 'ready.json');
const release = join(root, 'release');
const childCode = `require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000);`;
const runner = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore',detached:true,windowsHide:true}).unref();setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(release)}))process.exit(0)},10);`;
const abort = new AbortController();
const pending = runCheckProcess(process.execPath, ['-e', runner], { cwd: root, worktree: root, env: process.env, shell: false, maxBuffer: 100_000, timeoutMs: 30_000, signal: abort.signal });
let owner: ProcessIdentity | undefined;
let passed = false;
try {
	const until = Date.now() + 20_000;
	while (!existsSync(ready) && Date.now() < until) await new Promise(done => setTimeout(done, 25));
	assert.ok(existsSync(ready), `fixture readiness: ${root}`);
	const pid = JSON.parse(readFileSync(ready, 'utf8')).pid;
	const snapshot = snapshotProcesses();
	assert.equal(snapshot.kind, 'known');
	owner = snapshot.processes.find(p => p.pid === pid);
	assert.ok(owner, 'establish child identity before allowing its parent to exit');
	writeFileSync(release, 'ready');
	const result = await pending;
	assert.equal(result.status, null);
	assert.match(result.stderr, /orphaned runner YES/);
	const folder = join(root, '.wf', 'check-processes');
	const records = readdirSync(folder);
	assert.equal(records.length, 1, 'uncertain cleanup must retain ownership');
	const saved = JSON.parse(readFileSync(join(folder, records[0]), 'utf8'));
	assert.equal(saved.state, 'unverified-orphans');
	assert.equal(saved.diagnosis.orphanedRunner, true);
	assert.equal(saved.diagnosis.orphanCount, 1);
	assert.deepEqual(saved.diagnosis.orphans, [owner], 'retain observed orphan identity as evidence, not kill authority');
	assert.doesNotMatch(JSON.stringify(saved), /commandLine|command/i);
	passed = true;
	console.log('all native orphan refusal and retained identity diagnosis witnesses green');
} finally {
	abort.abort();
	await pending;
	if (owner) assert.ok(killOwnedProcesses([owner]), 'clean up only the fixture identity established before parent exit');
	if (passed) rmSync(root, { recursive: true, force: true });
	else console.error(`failed fixture evidence retained: ${root}`);
}
