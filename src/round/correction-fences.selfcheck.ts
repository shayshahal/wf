// Correction authority at stale handoff, brief, delivery and old-runtime boundaries.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { acquireProcessLock } from '../process-lock.ts';
import { approvalIdentity } from '../gates/content-identity.ts';
import { captureCorrection, correctionStateSha } from './corrections.ts';
import { CorruptStateError, readState, WF_STATE_VERSION, writeState } from './state.ts';
import { runBrief } from './brief.ts';
import { runStep } from './step.ts';

if (process.argv[2] === 'stale-step') {
	await runStep(['build'], { expectedCorrections: process.argv[3] });
	process.exit(process.exitCode ?? 0);
}
const root = mkdtempSync(join(tmpdir(), 'wf-correction-fences-'));
const originalCwd = process.cwd();
const folder = 'round';
const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8' }).trim();
const cli = (dir: string, ...args: string[]) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
function repo(name: string): string {
	const dir = join(root, name);
	mkdirSync(join(dir, folder), { recursive: true });
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(dir, 'product.txt'), 'product\n');
	writeFileSync(join(dir, folder, 'TICKET.md'), '# T\n## Intent\nShay: preserve the existing behavior\n## Notes\n- **T2 walk.** none — command-only fixture\n');
	git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'base');
	git(dir, 'checkout', '-qb', `fix/${name}`);
	mkdirSync(join(dir, '.wf')); writeFileSync(join(dir, '.wf/.gitignore'), '*\n');
	writeState(dir, () => ({ wf_version: 3, made_by: 'kit', round: `fix/${name}`, id: 'T', folder, class: 'A', base: 'main', step: 'assess' }));
	return dir;
}
const instruction = { kind: 'human', author: 'Shay', source: 'chat:session/message-150', relay: 'test agent', text: 'Keep the corrected row wording', scope: 'current implementation', reason: 'explicit scoped instruction' } as const;
try {
	const dir = repo('stale');
	const before = correctionStateSha(readState(dir));
	assert.equal(captureCorrection(dir, instruction).kind, 'recorded');
	assert.equal(readState(dir)?.wf_version, WF_STATE_VERSION, 'authority must upgrade before next, so an old runtime cannot ignore the new instruction');
	// #190 raised it to 5: a version-4 runtime reads a published handoff with corrections and routes
	// them to build, so the fenced state must be marked unreadable to that runtime.
	assert.equal(WF_STATE_VERSION, 5);
	const authority = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	const stale = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'stale-step', before], { cwd: dir, encoding: 'utf8' });
	assert.equal(stale.status, 2, stale.stdout + stale.stderr);
	assert.match(stale.stderr, /corrections changed since dispatch/);
	assert.equal(readFileSync(join(dir, '.wf/state.json'), 'utf8'), authority);
	for (const step of ['assess', 'review', 'pr']) {
		const refusal = cli(dir, 'step', step);
		assert.equal(refusal.status, 2, refusal.stdout + refusal.stderr);
		assert.match(refusal.stderr, /unresolved corrections/);
		assert.equal(readFileSync(join(dir, '.wf/state.json'), 'utf8'), authority);
	}
	console.log('  ok   stale transitions and direct handoffs retain the accepted instruction and version fence');
	const id = readState(dir)?.corrections?.[0]?.id;
	assert.ok(id);
	assert.equal(cli(dir, 'correct', '--block', id, '--owner', 'fixture owner', '--note', 'fixture capability unavailable').status, 0);
	assert.match(cli(dir, 'next').stdout, /wait fixture owner/);
	assert.equal(cli(dir, 'correct', '--unblock', id, '--note', 'fixture capability restored; readback confirms it').status, 0);
	const resumed = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	assert.equal(cli(dir, 'correct', '--unblock', id, '--note', 'fixture capability restored; readback confirms it').status, 0);
	assert.equal(readFileSync(join(dir, '.wf/state.json'), 'utf8'), resumed, 'repeated unblock acknowledges the original operation');
	assert.match(cli(dir, 'next').stdout, /work build/);
	const brief = cli(dir, 'brief', 'build');
	assert.equal(brief.status, 0, brief.stderr);
	assert.ok(brief.stdout.includes(instruction.text));
	assert.match(brief.stdout, /fixture capability restored/);
	assert.match(brief.stdout, /fixture capability unavailable/);
	assert.match(brief.stdout, /Previous dispositions/);
	assert.equal(readState(dir)?.corrections?.[0]?.outcome.kind, 'pending', 'unblocking/dispatch does not claim application');
	console.log('  ok   resolved capability blockers resume the original actual brief without losing their history or claiming application');

	const lockedDir = repo('inflight');
	writeState(lockedDir, (current) => ({ step: 'pr', merge_attempt: {
		url: 'https://github.com/o/r/pull/1', head: git(lockedDir, 'rev-parse', 'HEAD'),
		contentSha: approvalIdentity(lockedDir, folder, null).worktree,
		correctionsSha: correctionStateSha(current), at: new Date().toISOString(),
	} }));
	const deliveryLock = acquireProcessLock(git(lockedDir, 'rev-parse', '--path-format=absolute', '--git-path', 'wf-deliver.lock'));
	if (deliveryLock.kind !== 'acquired') throw new Error(deliveryLock.why);
	try {
		assert.equal(captureCorrection(lockedDir, instruction).kind, 'recorded', 'a delivery lock must not block instruction intake');
		const bytes = readFileSync(join(lockedDir, '.wf/state.json'), 'utf8');
		const concurrent = cli(lockedDir, 'deliver');
		assert.equal(concurrent.status, 2, concurrent.stdout + concurrent.stderr);
		assert.match(concurrent.stderr, /wf process lock: live/);
		assert.equal(readFileSync(join(lockedDir, '.wf/state.json'), 'utf8'), bytes, 'a concurrent retry cannot clear an active merge attempt');
		assert.equal(readState(lockedDir)?.step, 'pr', 'an in-flight attempt cannot prematurely route intake to build');
	} finally { deliveryLock.release(); }
	console.log('  ok   concurrent delivery cannot reconcile a live merge request; intake remains available');

	const corruptDir = repo('corrupt');
	captureCorrection(corruptDir, instruction);
	captureCorrection(corruptDir, { ...instruction, source: 'chat:session/message-151' });
	const valid = readState(corruptDir);
	assert.ok(valid?.corrections?.[0] && valid.corrections[1]);
	const [a, b] = valid.corrections;
	const at = '2026-10-18T00:00:00.000Z';
	const corruptions = [
		[{ ...a, outcome: { kind: 'superseded', by: b.id, at } }, { ...b, outcome: { kind: 'superseded', by: 'c-missing', at } }],
		[{ ...a, outcome: { kind: 'superseded', by: b.id, at } }, { ...b, outcome: { kind: 'superseded', by: a.id, at } }],
		[{ ...a, outcome: { kind: 'addressed', note: 'claimed', at, contentSha: null } }, b],
		[{ ...a, outcome: { kind: 'blocked', note: 'missing capability', owner: '', at } }, b],
		[{ ...a, outcome: { kind: 'unknown' } }, b],
	];
	for (const corrections of corruptions) {
		const bytes: string = JSON.stringify({ ...valid, corrections });
		writeFileSync(join(corruptDir, '.wf/state.json'), bytes);
		assert.throws(() => readState(corruptDir), CorruptStateError);
		assert.equal(readFileSync(join(corruptDir, '.wf/state.json'), 'utf8'), bytes);
		const refusal = cli(corruptDir, 'next');
		assert.equal(refusal.status, 1, refusal.stdout + refusal.stderr);
		assert.match(refusal.stderr, /corrupt round state/);
		assert.equal(readFileSync(join(corruptDir, '.wf/state.json'), 'utf8'), bytes);
	}
	console.log('  ok   corrupt and hybrid recovery authority is retained and refused through the real entry');

	const briefDir = repo('brief');
	process.chdir(briefDir);
	let stdout = '';
	const oldWrite = process.stdout.write;
	const oldError = console.error;
	const oldExit = process.exitCode;
	let stderr = '';
	try {
		// This is the real public stack capability of runBrief, not a module mock: admission happens
		// while the async stack owner is preparing the assessor's context in the same worktree.
		process.stdout.write = ((chunk: string | Uint8Array) => { stdout += String(chunk); return true; }) as typeof process.stdout.write;
		console.error = (...args: unknown[]) => { stderr += args.join(' '); };
		await runBrief(['assess'], { stack: async () => {
			assert.equal(captureCorrection(briefDir, { ...instruction, source: 'chat:session/during-stack' }).kind, 'recorded');
			return 'stack prepared';
		} });
		assert.equal(process.exitCode, 2);
	} finally {
		process.stdout.write = oldWrite;
		console.error = oldError;
		process.exitCode = oldExit;
		process.chdir(originalCwd);
	}
	assert.equal(stdout, '', 'a stale assessor must not receive an obsolete partial brief');
	assert.match(stderr, /corrections changed while preparing the brief/);
	assert.equal(readState(briefDir)?.corrections?.[0]?.text, instruction.text);
	console.log('  ok   actual brief refuses a correction arriving while its stack is prepared');
} finally {
	process.chdir(originalCwd);
	rmSync(root, { recursive: true, force: true });
}
console.log('all correction fence checks green');
