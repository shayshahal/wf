// Interrupted release must remain retryable without discarding its persisted authority.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug, seams } from '../seams.ts';
import { pidFile, stopWorktreeServers } from './serve.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-serve-interruption-'));
const previous = seams.processes;
const self = { pid: process.pid, parent: 1, born: '2026-10-16T01:00:00Z' };
const dead = { pid: 2_000_000_000, parent: 1, born: '2026-10-15T01:00:00Z' };
const record = join(root, '.wf', 'serve-owner.json');
const lock = join(root, '.wf', 'serve.lock');
const bytes = JSON.stringify({ token: 'interrupted-release', state: 'releasing', processes: [dead] });
try {
	execFileSync('git', ['init', '-q', '-b', 'bench/serve-interruption'], { cwd: root });
	execFileSync('git', ['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base', '--allow-empty'], { cwd: root });
	mkdirSync(join(root, '.wf'));
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self] }), kill: () => true } });
	writeFileSync(pidFile(root), String(dead.pid)); writeFileSync(record, bytes);
	writeFileSync(lock, JSON.stringify({ token: 'dead-lock', processes: [dead] }));
	assert.equal((await stopWorktreeServers(root)).kind, 'stopped', 'a provably dead stop owner must not permanently block retry');
	assert.ok(!existsSync(lock)); assert.ok(!existsSync(record)); assert.ok(!existsSync(pidFile(root)));

	// The first unlink committed, but the process ended before removing the identity record.
	writeFileSync(record, bytes);
	const stale = await stopWorktreeServers(root, 'older-release');
	assert.equal(stale.kind, 'refused', 'an old handle cannot consume another release receipt');
	assert.equal(readFileSync(record, 'utf8'), bytes);
	assert.equal((await stopWorktreeServers(root, 'interrupted-release')).kind, 'stopped', 'the saved release identity survives a missing PID file');
	assert.ok(!existsSync(record));
	console.log('all dead-lock and interrupted-unlink release witnesses green');
} finally { plug({ processes: previous }); rmSync(root, { recursive: true, force: true }); }
