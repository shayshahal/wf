// Parent loss with an unavailable native probe must not erase the last established identity.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { snapshotProcesses, killOwnedProcesses } from '../process-tree.ts';
import type { ProcessIdentity } from '../process-tree.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-check-disconnect-'));
const record = join(root, 'execution.json');
const wrapper = join(root, 'supervisor.mjs');
writeFileSync(wrapper, `await import(${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/gates/check-supervisor.ts')).href)}); process.send({ready:true});`);
// A real child runtime with no native inventory command: no module mock or test-only production flag.
const child = spawn(process.execPath, [wrapper, record], { cwd: root, env: { ...process.env, PATH: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
let owner: ProcessIdentity | undefined;
let stderr = '';
child.stdout?.resume();
child.stderr?.on('data', (data) => { stderr += data; });
const closed = new Promise<void>((done) => child.once('exit', () => done()));
try {
	await new Promise<void>((done, reject) => {
		const timeout = setTimeout(() => reject(Error('fixture supervisor did not initialize')), 15_000);
		child.once('message', () => { clearTimeout(timeout); done(); });
		child.once('error', (error) => { clearTimeout(timeout); reject(error); });
	});
	const snapshot = snapshotProcesses();
	assert.equal(snapshot.kind, 'known');
	owner = snapshot.processes.find((p) => p.pid === child.pid);
	assert.ok(owner, 'the parent established the supervisor identity before loss');
	writeFileSync(record, JSON.stringify({ state: 'running', processes: [owner] }));
	child.disconnect();
	await closed;
	assert.equal(child.exitCode, 1, stderr);
	const saved = JSON.parse(readFileSync(record, 'utf8'));
	assert.deepEqual(saved.processes, [owner], 'unknown disconnect probe cannot erase the last recovery authority');
	assert.equal(saved.state, 'unverified-disconnect');
	console.log('all real supervisor parent-loss/unknown-inventory authority witnesses green');
} finally {
	if (child.exitCode === null && owner) { assert.ok(killOwnedProcesses([owner])); await closed; }
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
