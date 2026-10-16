// Lock retries cross the real filesystem, with identity inventory supplied at the existing seam.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from './process-lock.ts';
import { plug, seams } from './seams.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-process-lock-'));
const path = join(root, 'owner.lock');
const previous = seams.processes;
const self = { pid: process.pid, parent: 1, born: '2026-10-16T01:00:00Z' };
const dead = { pid: 2_000_000_000, parent: 1, born: '2026-10-15T01:00:00Z' };
const record = JSON.stringify({ token: 'previous-owner', processes: [dead] });
try {
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self] }), kill: () => { throw Error('a lock never kills a process'); } } });
	const first = acquireProcessLock(path);
	assert.equal(first.kind, 'acquired');
	const bytes = readFileSync(path, 'utf8');
	assert.equal(acquireProcessLock(path).kind, 'refused'); assert.equal(readFileSync(path, 'utf8'), bytes);
	first.release(); first.release(); assert.ok(!existsSync(path));
	writeFileSync(path, record);
	const retry = acquireProcessLock(path);
	assert.equal(retry.kind, 'acquired');
	// An old release handle cannot remove a later owner's record.
	writeFileSync(path, record); retry.release(); assert.equal(readFileSync(path, 'utf8'), record);
	rmSync(path);
	const legacy = `${dead.pid}:12345678-1234-1234-1234-123456789abc`;
	writeFileSync(path, legacy);
	const migrated = acquireProcessLock(path); assert.equal(migrated.kind, 'acquired'); migrated.release();
	// Every PID/creation-time combination keeps a live creator but permits a proven dead one.
	for (const sameBirth of [true, false]) {
		const live = { ...dead, born: sameBirth ? dead.born : '2026-10-16T02:00:00Z' };
		plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self, live] }), kill: previous.kill } });
		writeFileSync(path, record);
		const held = acquireProcessLock(path);
		assert.equal(held.kind, sameBirth ? 'refused' : 'acquired');
		if (held.kind === 'acquired') held.release(); else { assert.equal(readFileSync(path, 'utf8'), record); rmSync(path); }
		writeFileSync(path, legacy);
		assert.equal(acquireProcessLock(path).kind, 'refused', 'legacy PID reuse cannot establish creator death');
		assert.equal(readFileSync(path, 'utf8'), legacy); rmSync(path);
	}
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self] }), kill: previous.kill } });
	for (const bytes of ['{', '', JSON.stringify({ token: 'broken', processes: [] })]) {
		writeFileSync(path, bytes); assert.equal(acquireProcessLock(path).kind, 'refused'); assert.equal(readFileSync(path, 'utf8'), bytes); rmSync(path);
	}
	writeFileSync(path, record); writeFileSync(`${path}.acquiring`, record);
	assert.equal(acquireProcessLock(path).kind, 'refused'); assert.equal(readFileSync(path, 'utf8'), record);
	rmSync(`${path}.acquiring`);
	plug({ processes: { snapshot: () => ({ kind: 'unknown' }), kill: previous.kill } });
	assert.equal(acquireProcessLock(path).kind, 'refused'); assert.equal(readFileSync(path, 'utf8'), record);
	console.log('all live/dead/unknown/malformed lock, concurrent reclaim and stale release witnesses green');
} finally { plug({ processes: previous }); rmSync(root, { recursive: true, force: true }); }
