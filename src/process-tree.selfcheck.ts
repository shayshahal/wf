import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ownedProcessTree, parseProcessIdentities, snapshotProcesses, killOwnedProcesses } from './process-tree.ts';
import type { ProcessIdentity } from './process-tree.ts';

const parent = { pid: 41, parent: 1, born: '2026-10-15T10:00:00Z' };
const child = { pid: 42, parent: 41, born: '2026-10-15T10:00:01Z' };
const grandchild = { pid: 43, parent: 42, born: '2026-10-15T10:00:02Z' };
for (const processes of [[parent, child, grandchild], [grandchild, child, parent]]) {
	assert.deepEqual(new Set(ownedProcessTree([parent], processes).map((p) => p.pid)), new Set([41, 42, 43]));
}
assert.equal(ownedProcessTree([parent], [{ ...parent, born: '2026-10-15T11:00:00Z' }, child]).length, 1);
assert.equal(ownedProcessTree([parent], [parent, { ...child, born: '2026-10-15T09:00:00Z' }]).length, 1);
for (const raw of [null, {}, [null], [{ ...parent, pid: -1 }], [{ ...parent, born: 'unknown' }]]) assert.equal(parseProcessIdentities(raw), null);
assert.deepEqual(parseProcessIdentities([parent]), [parent]);
console.log('all process identity, reused parent and descendant ordering arms green');

// #173: a real identity mismatch must name its predicate without authorizing a kill.
const evidence = mkdtempSync(join(tmpdir(), 'wf-native-kill-'));
const record = join(evidence, 'owner.json');
const fixture = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
const closed = once(fixture, 'exit');
let owner: ProcessIdentity | undefined;
try {
	writeFileSync(record, JSON.stringify({ state: 'unverified', pid: fixture.pid }));
	const snapshot = snapshotProcesses();
	assert.equal(snapshot.kind, 'known');
	owner = snapshot.processes.find(p => p.pid === fixture.pid);
	assert.ok(owner, 'fixture creation identity established');
	writeFileSync(record, JSON.stringify({ state: 'running', processes: [owner] }));
	const failures: unknown[] = [];
	assert.equal(killOwnedProcesses([{ ...owner, born: new Date(Date.parse(owner.born) - 1000).toISOString() }], failure => failures.push(failure)), false);
	assert.deepEqual(failures.map(failure => typeof failure === 'object' && failure !== null && 'kind' in failure ? failure.kind : null), ['identity-mismatch']);
	const after = snapshotProcesses();
	assert.equal(after.kind, 'known');
	const { pid, born } = owner;
	assert.ok(after.processes.some(p => p.pid === pid && p.born === born), 'a mismatched identity cannot kill the fixture');
	const selfFailures: unknown[] = [];
	assert.equal(killOwnedProcesses([{ ...owner, pid: process.pid }], failure => selfFailures.push(failure)), false);
	assert.deepEqual(selfFailures, [{ kind: 'self', pid: process.pid }]);
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
	const probe = `import {killOwnedProcesses} from ${JSON.stringify(new URL('./process-tree.ts', import.meta.url).href)}; const failures=[]; console.log(JSON.stringify({ok:killOwnedProcesses([${JSON.stringify(owner)}], failure=>failures.push(failure)),failures}));`;
	const unavailable = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { env: { ...env, PATH: '' }, encoding: 'utf8' });
	assert.equal(unavailable.status, 0, unavailable.stderr);
	const unavailableResult = JSON.parse(unavailable.stdout);
	assert.equal(unavailableResult.ok, false);
	assert.equal(unavailableResult.failures[0].kind, process.platform === 'win32' ? 'native-command' : 'inventory-unavailable');
	if (process.platform === 'win32') assert.equal(unavailableResult.failures[0].code, 'ENOENT');
	console.log('all native mismatched-identity diagnostics and self-protection witnesses green');
} finally {
	if (owner && killOwnedProcesses([owner])) {
		await closed;
		rmSync(evidence, { recursive: true, force: true });
	} else {
		// An unavailable probe grants no PID-only kill authority. Keep recovery evidence and do not hang the check.
		fixture.unref();
		console.error(`native fixture cleanup unconfirmed; ownership retained: ${record}`);
		assert.fail('native fixture cleanup not confirmed');
	}
}
