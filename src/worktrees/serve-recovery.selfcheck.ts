import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug, seams } from '../seams.ts';
import { pidFile, stopWorktreeServers } from './serve.ts';

const worktree = mkdtempSync(join(tmpdir(), 'wf-stop-recovery-'));
const previous = seams.processes;
const self = { pid: process.pid, parent: 1, born: new Date().toISOString() };
const owner = { pid: 2_000_000_000, parent: 1, born: '2026-10-15T10:00:00Z' };
const file = join(worktree, '.wf', 'serve-owner.json');
const record = (token: string, state = 'running') => JSON.stringify({ token, state, processes: [owner] });
let killCalls = 0;
try {
	execFileSync('git', ['init', '-q', '-b', 'bench/stop-recovery'], { cwd: worktree });
	execFileSync('git', ['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base', '--allow-empty'], { cwd: worktree });
	mkdirSync(join(worktree, '.wf'));
	writeFileSync(pidFile(worktree), String(owner.pid)); writeFileSync(file, record('first'));
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self, owner] }), kill: () => { killCalls++; return false; } } });
	assert.equal((await stopWorktreeServers(worktree)).kind, 'refused');
	assert.equal(killCalls, 1); assert.ok(existsSync(file)); assert.ok(existsSync(pidFile(worktree)));
	plug({ processes: { snapshot: () => ({ kind: 'unknown' }), kill: () => { throw new Error('must not kill without probe'); } } });
	const retained = readFileSync(file, 'utf8');
	assert.equal((await stopWorktreeServers(worktree)).kind, 'refused'); assert.equal(readFileSync(file, 'utf8'), retained);
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self, { ...owner, born: '2026-10-15T11:00:00Z' }] }), kill: () => { throw new Error('must not kill reused PID'); } } });
	assert.equal((await stopWorktreeServers(worktree)).kind, 'refused'); assert.equal(readFileSync(file, 'utf8'), retained);
	writeFileSync(file, record('replacement'));
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self, owner] }), kill: () => { throw new Error('must not kill replacement run'); } } });
	assert.equal((await stopWorktreeServers(worktree, 'first')).kind, 'refused'); assert.equal(readFileSync(file, 'utf8'), record('replacement'));
	// An interrupted release saved its descendants before signalling; a fresh worker can confirm absence.
	writeFileSync(file, record('replacement', 'releasing'));
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [self] }), kill: () => true } });
	assert.equal((await stopWorktreeServers(worktree)).kind, 'stopped'); assert.ok(!existsSync(file)); assert.ok(!existsSync(pidFile(worktree)));
	console.log('all failed release, unknown probe, reused PID, stale handle and interrupted release witnesses green');
} finally { plug({ processes: previous }); rmSync(worktree, { recursive: true, force: true }); }
