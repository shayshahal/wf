// reap-interruption.selfcheck.ts — node reap-interruption.selfcheck.ts → exit 0 when green.
// #154 (2026-10-16): a reap interrupted between its lock and its journal left the next reap unable
// to recover: the lock was a raw `${pid}:${uuid}` opened `wx`, so a stale one only raised EEXIST,
// keepRoundPaperwork called process.exit(1) with the lock held (a finally never runs), and a journal
// written before the target's directory identity existed (directory:null) was refused on retry.
// The lock owner is now process-lock.ts; this file witnesses reap's use of it, the legacy-format
// migration, and the journal's null identity. Isolated temp git repos; the removal plan is a
// faithful rm + prune, never a real setup/teardown or a process kill.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug, seams } from '../seams.ts';
import { keepRoundPaperwork, runReap } from './reap.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-reap-interruption-'));
const caller = process.cwd();
const previousRemoval = seams.removalPlan;
const previousProcesses = seams.processes;
const savedForce = process.env.WF_FORCE_REAP;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const journalFor = (branch: string) => join(root, '.git', `wf-reap-${createHash('sha256').update(branch).digest('hex')}.json`);
// A known inventory in which only this selfcheck runs: the dead PID is provably absent.
const self = { pid: process.pid, parent: 1, born: '2026-10-16T00:00:00Z' };
const knownSelf = { snapshot: () => ({ kind: 'known' as const, processes: [self] }), kill: () => { throw new Error('reap never kills'); } };
const deadPid = 2_000_000_000;
let sequence = 0;
function newTarget() {
	const branch = `bench/interrupt-${++sequence}`;
	const path = join(root, `round-${sequence}`);
	git('worktree', 'add', '-qb', branch, path);
	return { branch, path, journal: journalFor(branch) };
}
try {
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '--allow-empty', '-qm', 'base');
	// A faithful teardown of one target: remove its folder, then unregister it.
	plug({ removalPlan: (o) => [{ label: 'rm -rf worktree', rm: o.path }, { label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] }] });
	plug({ processes: knownSelf });
	process.env.WF_FORCE_REAP = '1';
	process.chdir(root);

	// A stale lock naming a provably dead creator is reclaimed (process-lock.ts), and reap completes.
	const stale = newTarget();
	writeFileSync(`${stale.journal}.lock`, JSON.stringify({ token: 'dead-owner', processes: [{ pid: deadPid, parent: 1, born: '2026-10-15T00:00:00Z' }] }));
	await runReap([stale.branch]);
	assert.equal(process.exitCode ?? 0, 0);
	assert.ok(!existsSync(stale.path), 'stale-lock reap removes the target');
	assert.ok(!existsSync(stale.journal) && !existsSync(`${stale.journal}.lock`), 'stale-lock reap clears journal and lock');

	// A legacy raw lock (pre-process-lock) with a provably dead creator is migrated, not refused.
	const legacy = newTarget();
	writeFileSync(`${legacy.journal}.lock`, `${deadPid}:${randomUUID()}`);
	await runReap([legacy.branch]);
	assert.equal(process.exitCode ?? 0, 0);
	assert.ok(!existsSync(legacy.path) && !existsSync(`${legacy.journal}.lock`), 'legacy stale lock is recovered');

	// A live owner in the new format is refused and retained, target untouched.
	const liveJson = newTarget();
	const liveJsonBytes = JSON.stringify({ token: 'live-owner', processes: [self] });
	writeFileSync(`${liveJson.journal}.lock`, liveJsonBytes);
	process.exitCode = 0;
	await runReap([liveJson.branch]);
	assert.equal(process.exitCode, 1);
	assert.equal(readFileSync(`${liveJson.journal}.lock`, 'utf8'), liveJsonBytes);
	assert.ok(existsSync(liveJson.path), 'live process lock retains the target');
	process.exitCode = 0;

	// A legacy raw lock naming a live creator is refused and retained, target untouched.
	const live = newTarget();
	const liveBytes = `${process.pid}:${randomUUID()}`;
	writeFileSync(`${live.journal}.lock`, liveBytes);
	process.exitCode = 0;
	await runReap([live.branch]);
	assert.equal(process.exitCode, 1);
	assert.ok(existsSync(live.path) && readFileSync(`${live.journal}.lock`, 'utf8') === liveBytes, 'live legacy lock is retained');
	assert.ok(!existsSync(live.journal), 'refused reap writes no journal');
	process.exitCode = 0;

	// A malformed lock is never reclaimed.
	const malformed = newTarget();
	writeFileSync(`${malformed.journal}.lock`, 'garbage');
	process.exitCode = 0;
	await runReap([malformed.branch]);
	assert.equal(process.exitCode, 1);
	assert.equal(readFileSync(`${malformed.journal}.lock`, 'utf8'), 'garbage');
	assert.ok(existsSync(malformed.path), 'malformed lock retains the target');
	process.exitCode = 0;

	// An unavailable process inventory cannot establish absence: the legacy lock is retained.
	const unknown = newTarget();
	writeFileSync(`${unknown.journal}.lock`, `${deadPid}:${randomUUID()}`);
	plug({ processes: { snapshot: () => ({ kind: 'unknown' as const }), kill: previousProcesses.kill } });
	process.exitCode = 0;
	await runReap([unknown.branch]);
	assert.equal(process.exitCode, 1);
	assert.ok(existsSync(unknown.path), 'unknown inventory retains the target');
	plug({ processes: knownSelf });
	process.exitCode = 0;

	// A journal written before the target's directory identity existed (directory:null) is a valid
	// recovery record when the target is still gone: a retry finishes instead of refusing the record.
	const nullJournal = newTarget();
	rmSync(nullJournal.path, { recursive: true, force: true });
	writeFileSync(nullJournal.journal, JSON.stringify({ branch: nullJournal.branch, path: nullJournal.path, token: randomUUID(), directory: null, next: 0, merged: false }));
	await runReap([nullJournal.branch]);
	assert.equal(process.exitCode ?? 0, 0);
	assert.ok(!existsSync(nullJournal.path) && !existsSync(nullJournal.journal), 'directory:null journal recovers a gone target');

	// The same record must not authorize deleting a replacement that appeared at the target path.
	const replacement = newTarget();
	const replacementRecord = JSON.stringify({ branch: replacement.branch, path: replacement.path, token: randomUUID(), directory: null, next: 0, merged: false });
	writeFileSync(replacement.journal, replacementRecord);
	process.exitCode = 0;
	await assert.rejects(runReap([replacement.branch]), /has no target identity/);
	assert.ok(existsSync(replacement.path), 'a stale null-identity journal cannot delete a replacement checkout');
	assert.equal(readFileSync(replacement.journal, 'utf8'), replacementRecord, 'the refused journal is retained');
	rmSync(replacement.journal);
	process.exitCode = 0;

	// Paperwork that cannot be listed stops reap, but must release its lock: process.exit would
	// bypass the finally, leaving the (then dead) creator's lock for every later reap. A broken
	// worktree pointer makes git status fail while the registration survives.
	const unlistable = newTarget();
	// git marks the linked worktree's .git file so it cannot be overwritten in place; move it first.
	const unlistableGit = join(unlistable.path, '.git');
	renameSync(unlistableGit, `${unlistableGit}.keep`);
	writeFileSync(unlistableGit, 'gitdir: /nonexistent-wf-selfcheck\n');
	process.exitCode = 0;
	await runReap([unlistable.branch]);
	assert.equal(process.exitCode, 1);
	assert.ok(existsSync(unlistable.path), 'unlistable paperwork leaves the target');
	assert.ok(!existsSync(`${unlistable.journal}.lock`), 'the lock is released when paperwork cannot be listed');
	assert.ok(!existsSync(unlistable.journal), 'no journal is written when paperwork cannot be listed');
	const notGit = mkdtempSync(join(tmpdir(), 'wf-reap-not-git-'));
	try { assert.throws(() => keepRoundPaperwork(notGit, 'x', undefined, join(notGit, 'cache')), /cannot list/); }
	finally { rmSync(notGit, { recursive: true, force: true }); }
	process.exitCode = 0;
	console.log('all stale/live JSON, legacy live/dead/unknown/malformed lock, null-identity journal (gone target vs replacement) and paperwork-failure witnesses green');
} finally {
	process.chdir(caller);
	plug({ removalPlan: previousRemoval, processes: previousProcesses });
	if (savedForce === undefined) delete process.env.WF_FORCE_REAP; else process.env.WF_FORCE_REAP = savedForce;
	process.exitCode = 0;
	rmSync(root, { recursive: true, force: true });
}
