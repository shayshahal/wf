// Public diagnostic entrypoint, native runner and recovery; no application services or round state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBaselineDiagnostic } from './baseline-diagnostic.ts';
import type { BaselineDiagnosticInput, BaselineDiagnosticResult } from './baseline-diagnostic.ts';
import { acquireDisposableWorkspace, recoverDisposableWorkspace } from '../worktrees/disposable-workspace.ts';
import type { WorkspaceProject } from '../worktrees/workspace-project.ts';

const root = mkdtempSync(join(tmpdir(), 'wf diagnostic with spaces '));
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
let teardowns = 0, dependencyReleases = 0;
const project: WorkspaceProject = { name: 'native-no-stack', setup: async () => {}, acquire: async () => ({ kind: 'ready', disposition: 'none', release: async () => { dependencyReleases++; return null; } }), teardown: () => [{ label: 'record teardown', run: () => { teardowns++; } }] };
const diagnostic: (input: BaselineDiagnosticInput) => Promise<BaselineDiagnosticResult> = runBaselineDiagnostic;
try {
	git('init', '-q', '-b', 'main');
	writeFileSync(join(root, 'probe.mjs'), "console.log('observed:', process.env.DIAGNOSTIC_MARKER); process.exitCode = 7;\n");
	git('add', '.');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');
	const log = join(root, '.git', 'diagnostic.log');
	const result = await diagnostic({ repository: root, branch: 'bench/native-diagnostic', ref: 'main', project, probeFiles: ['probe.mjs'], log,
		command: { executable: process.execPath, args: ['probe.mjs'], env: { ...process.env, DIAGNOSTIC_MARKER: 'explicit environment' } },
	});
	assert.equal(result.kind, 'observed', JSON.stringify(result));
	if (result.kind !== 'observed') throw new Error('native diagnostic unavailable');
	assert.equal(result.execution.status, 7, JSON.stringify(result));
	assert.match(result.execution.stdout, /observed: explicit environment/);
	assert.equal(result.retention.kind, 'retained');
	assert.equal(result.disposition, 'none');
	assert.equal(result.cleanup.kind, 'complete', JSON.stringify(result.cleanup));
	assert.ok(!existsSync(result.path));
	assert.ok(!existsSync(result.receipt));
	assert.match(readFileSync(log, 'utf8'), /observed: explicit environment/);
	assert.match(readFileSync(log, 'utf8'), /exit 7/);
	assert.equal(git('status', '--porcelain'), '');
	assert.equal(git('branch', '--list', 'bench/native-diagnostic'), '');
	assert.equal(teardowns, 1);

	const blockedLog = join(root, '.git', 'blocked-diagnostic.log');
	const blocked = await diagnostic({ repository: root, branch: 'bench/retention-fails', ref: 'main', project, probeFiles: [], log: blockedLog,
		command: { executable: process.execPath, args: ['-e', "const fs = require('node:fs'); fs.rmSync(process.env.BLOCKED_LOG, {force:true}); fs.mkdirSync(process.env.BLOCKED_LOG); console.log('actual stdout survives retention failure');"], env: { ...process.env, BLOCKED_LOG: blockedLog } },
	});
	assert.equal(blocked.kind, 'observed', JSON.stringify(blocked));
	if (blocked.kind !== 'observed') throw new Error('retention failure lost execution');
	assert.equal(blocked.execution.status, 0);
	assert.match(blocked.execution.stdout, /actual stdout survives retention failure/);
	assert.equal(blocked.retention.kind, 'failed');
	assert.equal(blocked.cleanup.kind, 'incomplete');
	assert.ok(existsSync(blocked.path));
	assert.ok(existsSync(blocked.receipt));
	assert.equal(teardowns, 1, 'retention failure cannot start project teardown');
	const confirmed = readFileSync(blocked.receipt, 'utf8');
	assert.match(confirmed, /"kind":"confirmed"/);
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/retention-fails', project })).kind, 'refused');
	assert.equal(readFileSync(blocked.receipt, 'utf8'), confirmed);
	const saved: unknown = JSON.parse(confirmed);
	assert.ok(typeof saved === 'object' && saved !== null && 'diagnostic' in saved);
	const retainedDiagnostic = saved.diagnostic;
	assert.ok(typeof retainedDiagnostic === 'object' && retainedDiagnostic !== null && 'id' in retainedDiagnostic && typeof retainedDiagnostic.id === 'string');
	for (const malformed of [null, { kind: 'confirmed', id: retainedDiagnostic.id }, { kind: 'pending', id: retainedDiagnostic.id, digest: 'a'.repeat(64) }, { kind: 'retained', id: '../outside', digest: 'a'.repeat(64) }, { kind: 'unknown', id: retainedDiagnostic.id }]) {
		const bytes: string = JSON.stringify({ ...saved, diagnostic: malformed });
		writeFileSync(blocked.receipt, bytes);
		assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/retention-fails', project })).kind, 'refused');
		assert.equal(readFileSync(blocked.receipt, 'utf8'), bytes, 'malformed added authority is never dropped');
		assert.ok(existsSync(blocked.path));
	}
	writeFileSync(blocked.receipt, confirmed);
	const fallback = join(blocked.path, '.wf', `baseline-diagnostic-${retainedDiagnostic.id}.output`);
	const originalOutput = readFileSync(fallback, 'utf8');
	writeFileSync(fallback, 'replacement output');
	const changed = await recoverDisposableWorkspace({ repository: root, branch: 'bench/retention-fails', project });
	assert.equal(changed.kind, 'refused');
	if (changed.kind === 'refused') assert.match(changed.reason, /output changed/);
	assert.equal(readFileSync(blocked.receipt, 'utf8'), confirmed);
	writeFileSync(fallback, originalOutput);
	rmSync(blockedLog, { recursive: true });
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/retention-fails', project })).kind, 'complete');
	assert.match(readFileSync(blockedLog, 'utf8'), /actual stdout survives retention failure/);
	assert.ok(!existsSync(blocked.path));
	assert.ok(!existsSync(blocked.receipt));
	assert.equal(git('branch', '--list', 'bench/retention-fails'), '');
	assert.equal(teardowns, 2);
	assert.equal(dependencyReleases, 1, 'failed retention does not release dependencies');
	const concurrent = await acquireDisposableWorkspace({ repository: root, branch: 'bench/wait-diagnostic', ref: 'main', project, probeFiles: [], log });
	assert.equal(concurrent.kind, 'ready');
	if (concurrent.kind !== 'ready') throw new Error('concurrency fixture unavailable');
	const running = concurrent.workspace.runDiagnostic({ executable: process.execPath, args: ['-e', "setTimeout(() => console.log('active diagnostic finished'), 200)"], env: process.env });
	const releasing = concurrent.workspace.release();
	assert.equal(dependencyReleases, 1, 'release waits before dependency teardown');
	assert.equal((await concurrent.workspace.runDiagnostic({ executable: process.execPath, args: [], env: process.env })).kind, 'unavailable', 'no second owned diagnostic');
	assert.equal((await running).kind, 'retained');
	assert.equal((await releasing).kind, 'complete');
	assert.equal(dependencyReleases, 2);
	assert.match(readFileSync(log, 'utf8'), /active diagnostic finished/);
	const unresolved = await diagnostic({ repository: root, branch: 'bench/unresolved-execution', ref: 'main', project, probeFiles: [], log,
		command: { executable: process.execPath, args: ['-e', "require('node:fs').writeFileSync('.wf/check-processes/unresolved.json', '{}'); console.log('observed output with uncertain process authority')"], env: process.env },
	});
	assert.equal(unresolved.kind, 'observed', JSON.stringify(unresolved));
	if (unresolved.kind !== 'observed') throw new Error('unresolved fixture unavailable');
	assert.equal(unresolved.retention.kind, 'retained');
	assert.equal(unresolved.cleanup.kind, 'refused');
	assert.equal(dependencyReleases, 2, 'uncertain execution ownership also blocks dependency teardown');
	rmSync(join(unresolved.path, '.wf', 'check-processes', 'unresolved.json'));
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/unresolved-execution', project })).kind, 'complete');
	console.log('real non-round red exit and successful release; native directory-log retention failure retains checkout/receipt; repaired public recovery preserves actual stdout');
} finally { rmSync(root, { recursive: true, force: true }); }
