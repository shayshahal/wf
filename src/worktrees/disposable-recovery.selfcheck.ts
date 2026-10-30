// Native child exit leaves acquisition authority; a fresh caller uses the same public recovery path.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recoverDisposableWorkspace } from './disposable-workspace.ts';
import type { WorkspaceProject } from './workspace-project.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-native-disposable-recovery-'));
let retainedFixture: string | undefined;
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const project: WorkspaceProject = { name: 'native-restart-no-stack', setup: async () => {}, acquire: async () => ({ kind: 'ready', disposition: 'none', release: async () => null }), teardown: () => [] };
try {
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '--allow-empty', '-qm', 'base');
	const entry = pathToFileURL(fileURLToPath(new URL('./disposable-workspace.ts', import.meta.url))).href;
	const source = `
import { acquireDisposableWorkspace } from ${JSON.stringify(entry)};
const project = { name: 'native-restart-no-stack', setup: async () => {}, acquire: async () => ({kind:'ready', disposition:'none', release:async()=>null}), teardown:()=>[] };
const result = await acquireDisposableWorkspace({repository:${JSON.stringify(root)}, branch:'bench/dead-native-owner', ref:'main', project, probeFiles:[], log:${JSON.stringify(join(root, '.git', 'surviving.log'))}});
if (result.kind !== 'ready') throw new Error(JSON.stringify(result));
console.log(JSON.stringify({ receipt: result.workspace.receipt, path: result.workspace.context.worktree }));
process.exit(0); // Deliberate owner loss: do not release the acquired handle.
`;
	const result: unknown = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }));
	assert.ok(typeof result === 'object' && result !== null && 'receipt' in result && typeof result.receipt === 'string' && 'path' in result && typeof result.path === 'string');
	assert.ok(existsSync(result.receipt));
	assert.ok(existsSync(`${result.receipt}.lock`));
	assert.ok(existsSync(result.path));
	const original = readFileSync(result.receipt, 'utf8');
	writeFileSync(result.receipt, '{"version":1,"path":"corrupt authority"}');
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/dead-native-owner', project })).kind, 'refused');
	assert.equal(readFileSync(result.receipt, 'utf8'), '{"version":1,"path":"corrupt authority"}');
	assert.ok(existsSync(result.path));
	writeFileSync(result.receipt, original);
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/dead-native-owner', project: { ...project, name: 'wrong-project' } })).kind, 'refused');
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/dead-native-owner', project })).kind, 'complete');
	assert.ok(!existsSync(result.path));
	assert.ok(!existsSync(result.receipt));
	assert.equal(git('branch', '--list', 'bench/dead-native-owner'), '');
	const interruptedSource = `
import { acquireDisposableWorkspace } from ${JSON.stringify(entry)};
const project = { name: 'native-restart-no-stack', setup: async () => {}, acquire: async () => ({kind:'ready', disposition:'none', release:async()=>null}), teardown:()=>[] };
const result = await acquireDisposableWorkspace({repository:${JSON.stringify(root)}, branch:'bench/killed-diagnostic-owner', ref:'main', project, probeFiles:[], log:${JSON.stringify(join(root, '.git', 'pending.log'))}});
if (result.kind !== 'ready') throw new Error(JSON.stringify(result));
console.log(JSON.stringify({ receipt: result.workspace.receipt, path: result.workspace.context.worktree }));
await result.workspace.runDiagnostic({executable: process.execPath, args:['-e', "console.log('output before owner loss'); process.kill(" + process.pid + ", 'SIGKILL')"], env:process.env});
throw new Error('owner should have been killed');
`;
	const killed = spawnSync(process.execPath, ['--input-type=module', '-e', interruptedSource], { encoding: 'utf8', timeout: 60_000 });
	assert.notEqual(killed.status, 0, JSON.stringify(killed));
	assert.equal(killed.error, undefined, 'native child returned without timeout');
	const pending: unknown = JSON.parse(killed.stdout.trim());
	assert.ok(typeof pending === 'object' && pending !== null && 'receipt' in pending && typeof pending.receipt === 'string' && 'path' in pending && typeof pending.path === 'string');
	retainedFixture = pending.path;
	const pendingBytes = readFileSync(pending.receipt, 'utf8');
	assert.match(pendingBytes, /"kind":"pending"/);
	// Supervisor disconnect release may still be completing after the native owner has died.
	// Retry only explicit recovery; even once process ownership resolves, output remains unknown.
	let recovered = await recoverDisposableWorkspace({ repository: root, branch: 'bench/killed-diagnostic-owner', project });
	for (let attempt = 0; attempt < 20 && recovered.kind === 'refused' && !recovered.reason.includes('output is uncertain'); attempt++) {
		await new Promise((done) => setTimeout(done, 100));
		recovered = await recoverDisposableWorkspace({ repository: root, branch: 'bench/killed-diagnostic-owner', project });
	}
	assert.equal(recovered.kind, 'refused', JSON.stringify(recovered));
	if (recovered.kind === 'refused') assert.match(recovered.reason, /output is uncertain/, 'finished processes cannot certify missing output');
	assert.equal(readFileSync(pending.receipt, 'utf8'), pendingBytes);
	assert.ok(existsSync(pending.path));
	assert.ok(git('branch', '--list', 'bench/killed-diagnostic-owner'));
	assert.ok(!existsSync(join(root, '.git', 'pending.log')) || !readFileSync(join(root, '.git', 'pending.log'), 'utf8').includes('baseline diagnostic output'));
	console.log('native killed owner after command stdout leaves durable pending intent; fresh recovery refuses missing output without deleting checkout or receipt');
	console.log('native creator exit ג†’ corrupted/mismatched authority preserved ג†’ fresh-caller confirmed recovery and release green');
} finally {
	// Pending authority is deliberately not released by production recovery. Only this temporary
	// fixture owner removes its retained checkout after asserting that refusal.
	if (retainedFixture) rmSync(retainedFixture, { recursive: true, force: true });
	rmSync(root, { recursive: true, force: true });
}
