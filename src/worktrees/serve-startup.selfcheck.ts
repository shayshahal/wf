// A launch PID alone is not an established server ownership receipt.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug, seams } from '../seams.ts';
import { pidFile, startServers } from './serve.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-serve-startup-'));
const previous = { entry: seams.entry, processes: seams.processes };
const self = { pid: process.pid, parent: 1, born: '2026-10-16T01:00:00Z' };
let reads = 0;
try {
	mkdirSync(join(root, '.wf'));
	const entry = join(root, 'no-resources.mjs');
	// This isolated fixture exits itself and never opens listeners or creates descendants.
	writeFileSync(entry, 'setTimeout(() => process.exit(0), 100);');
	plug({ entry, processes: { snapshot: () => ++reads === 1 ? { kind: 'known', processes: [self] } : { kind: 'unknown' }, kill: () => { throw Error('unknown identity grants no kill authority'); } } });
	assert.throws(() => startServers(root), /ownership.*not.*established/, 'unavailable acquisition probe must not report a successful start');
	assert.ok(existsSync(pidFile(root)), 'retain the launch reference for diagnosis');
	const saved: unknown = JSON.parse(readFileSync(join(root, '.wf', 'serve-owner.json'), 'utf8'));
	assert.ok(typeof saved === 'object' && saved !== null && 'state' in saved && saved.state === 'starting');
	console.log('all unverified startup witnesses green; no success or kill from an unknown identity');
} finally {
	plug(previous);
	// Let the bounded fixture exit before removing its cwd on Windows.
	await new Promise((done) => setTimeout(done, 300));
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
