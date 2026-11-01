// Public executor witnesses use isolated real repositories, never real project teardown/hooks.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readWorkspaceCleanup, runWorkspaceCleanup, workspaceDirectoryIdentity } from './workspace-cleanup.ts';
import type { WorkspaceCleanupInput } from './workspace-cleanup.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-workspace-cleanup-'));
const caller = process.cwd();
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
let sequence = 0;
function allocate(): WorkspaceCleanupInput {
	const branch = `disposable/${++sequence}`;
	const path = join(root, `workspace-${sequence}`);
	git('worktree', 'add', '-qb', branch, path);
	const journal = join(root, '.git', `cleanup-${sequence}.json`);
	return { branch, path, journal, directory: workspaceDirectoryIdentity(path), common: join(root, '.git'), survivor: root, recovery: { kind: 'absent' }, merged: false,
		steps: [{ label: 'remove worktree directory', rm: path }, { label: 'prune worktree', run: () => { git('worktree', 'prune'); } }] };
}
function recovery(input: WorkspaceCleanupInput): WorkspaceCleanupInput {
	const read = readWorkspaceCleanup(input.journal, input.branch);
	assert.notEqual(read.kind, 'refused');
	if (read.kind === 'refused') throw new Error(read.reason);
	return { ...input, recovery: read };
}
try {
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '--allow-empty', '-qm', 'base');
	const complete = allocate();
	process.chdir(complete.path);
	assert.equal((await runWorkspaceCleanup(complete)).kind, 'complete');
	assert.equal(resolve(process.cwd()), resolve(root));
	assert.ok(!existsSync(complete.path) && !existsSync(complete.journal));
	assert.equal((await runWorkspaceCleanup(complete)).kind, 'complete', 'repeat-safe already gone steps');

	// Failed step is retried rather than memoized; completed work is not repeated after reconstruction.
	const partial = allocate();
	let blocked = true;
	let calls = 0;
	const interrupted = { ...partial, steps: [{ label: 'release dependency', run: () => { calls++; } }, { label: 'remove worktree directory', run: () => { if (blocked) throw new Error('busy'); rmSync(partial.path, { recursive: true }); } }, partial.steps[1]] };
	assert.equal((await runWorkspaceCleanup(interrupted)).kind, 'incomplete');
	const bytes = readFileSync(partial.journal, 'utf8');
	assert.equal(JSON.parse(bytes).next, 1);
	const resumed = recovery(interrupted);
	const changedPlan = await runWorkspaceCleanup({ ...resumed, steps: [...resumed.steps].reverse() });
	assert.equal(changedPlan.kind, 'refused');
	assert.equal(readFileSync(partial.journal, 'utf8'), bytes);
	const original = `${partial.path}-original`;
	renameSync(partial.path, original); mkdirSync(partial.path);
	assert.equal((await runWorkspaceCleanup(resumed)).kind, 'refused');
	assert.ok(existsSync(original) && existsSync(partial.path));
	rmSync(partial.path, { recursive: true }); renameSync(original, partial.path);
	blocked = false;
	assert.equal((await runWorkspaceCleanup(recovery(interrupted))).kind, 'complete');
	assert.equal(calls, 1, 'committed progress survives reconstruction');

	// Policy bookkeeping can fail after directory removal; recovery is readable without that path.
	const gone = allocate();
	assert.equal((await runWorkspaceCleanup({ ...gone, beforeForget: () => { throw new Error('bookkeeping unavailable'); } })).kind, 'incomplete');
	assert.ok(!existsSync(gone.path));
	const prior = recovery(gone);
	assert.equal(prior.recovery.kind, 'recovery');
	assert.equal((await runWorkspaceCleanup(prior)).kind, 'complete');

	// Acquisition-time identity prevents a stale fresh handle adopting a replacement.
	const stale = allocate();
	renameSync(stale.path, `${stale.path}-original`); mkdirSync(stale.path);
	assert.equal((await runWorkspaceCleanup(stale)).kind, 'refused');
	assert.ok(!existsSync(stale.journal));
	assert.equal((await runWorkspaceCleanup({ ...stale, survivor: stale.path })).kind, 'refused');

	// A recovery read is not authority to overwrite a newer journal when the executor acquires its lock.
	const changed = allocate();
	const record = { branch: changed.branch, path: changed.path, token: 'owner', directory: changed.directory, next: 0, merged: false, plan: changed.steps.map((step) => step.label) };
	writeFileSync(changed.journal, JSON.stringify(record));
	const snapshot = recovery(changed);
	writeFileSync(changed.journal, JSON.stringify({ ...record, token: 'new-owner' }));
	assert.equal((await runWorkspaceCleanup(snapshot)).kind, 'refused');
	assert.equal(JSON.parse(readFileSync(changed.journal, 'utf8')).token, 'new-owner');
	assert.equal((await runWorkspaceCleanup({ ...recovery(changed), directory: 'other-acquisition' })).kind, 'refused');
	writeFileSync(changed.journal, '{broken');
	assert.equal(readWorkspaceCleanup(changed.journal, changed.branch).kind, 'refused');
	assert.equal(readFileSync(changed.journal, 'utf8'), '{broken');

	// Branch re-registration must be refused even when this journal's directory identity still matches.
	const registered = allocate();
	const moved = `${registered.path}-moved`;
	git('worktree', 'move', registered.path, moved); mkdirSync(registered.path);
	const rerecorded = { ...registered, directory: workspaceDirectoryIdentity(registered.path) };
	const refusal = await runWorkspaceCleanup(rerecorded);
	assert.equal(refusal.kind, 'refused');
	assert.match(refusal.reason, /branch is now owned/);
	assert.ok(existsSync(moved) && existsSync(registered.journal));
	assert.ok(!existsSync(`${registered.journal}.lock`));
	// Recheck registration after each provider effect, not only before cleanup starts.
	const switched = allocate();
	const switchStep = { label: 'provider step switches checkout', run: () => {
		git('-C', switched.path, 'switch', '-qc', 'replacement-work');
		writeFileSync(join(switched.path, 'keep-user-work.txt'), 'must survive');
	} };
	assert.equal((await runWorkspaceCleanup({ ...switched, steps: [switchStep, ...switched.steps] })).kind, 'refused');
	assert.equal(readFileSync(join(switched.path, 'keep-user-work.txt'), 'utf8'), 'must survive');
	assert.equal(JSON.parse(readFileSync(switched.journal, 'utf8')).next, 1);
	// Git may register the physical directory while the caller uses a parent junction (#194 real cycle).
	const aliasHome = join(root, 'parent-alias');
	symlinkSync(root, aliasHome, 'junction');
	const aliased = allocate();
	const aliasTarget = join(aliasHome, basename(aliased.path));
	assert.equal((await runWorkspaceCleanup({ ...aliased, path: aliasTarget, steps: [{ label: 'remove worktree directory', rm: aliasTarget }, aliased.steps[1]] })).kind, 'complete');
	assert.ok(!existsSync(aliased.path), 'physical registered checkout was removed through parent alias');

	// A leaf junction pointing to the moved original must not disguise a replacement root.
	const leaf = allocate();
	const movedLeaf = `${leaf.path}-original`;
	renameSync(leaf.path, movedLeaf);
	symlinkSync(movedLeaf, leaf.path, 'junction');
	assert.equal((await runWorkspaceCleanup(leaf)).kind, 'refused');
	assert.ok(existsSync(movedLeaf));
	console.log('shared cleanup public interface: progress/retry, absent-path recovery, stale identity, changed plan/journal, registration and safe cwd green');
} finally {
	process.chdir(caller);
	rmSync(root, { recursive: true, force: true });
}
