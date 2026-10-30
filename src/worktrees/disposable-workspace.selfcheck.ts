// Real temporary Git repositories and the public lifecycle interface; dependency failures use explicit adapters.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDisposableWorkspace, recoverDisposableWorkspace } from './disposable-workspace.ts';
import type { WorkspaceProject } from './workspace-project.ts';
import { plug, seams } from '../seams.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-disposable-contract-'));
const before = { processes: seams.processes, createWorktree: seams.createWorktree, sessionWorkspace: seams.sessionWorkspace };
const knownSelf = { pid: process.pid, parent: 1, born: '2026-10-29T00:00:00Z' };
const records: string[] = [];
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
let failSetup = false, failCleanup = false, refuseDependencies = false;
const project: WorkspaceProject = {
	name: 'recording-no-stack',
	async setup(context) {
		records.push(`setup:${context.branch}`);
		writeFileSync(join(context.worktree, 'setup-owned.txt'), 'owned\n');
		if (failSetup) throw new Error('fixture: failed setup');
	},
	async acquire(context) {
		records.push(`admit:${context.branch}`);
		if (refuseDependencies) return { kind: 'refused', why: 'fixture: unavailable dependency' };
		return { kind: 'ready', disposition: 'none', release: async () => null };
	},
	teardown(context) {
		return [{ label: 'release recording project', run: () => {
			records.push(`teardown:${context.branch}`);
			if (failCleanup) throw new Error('fixture: interrupted teardown');
		} }];
	},
};
const input = (branch: string) => ({ repository: root, branch, ref: 'main', project, probeFiles: ['probe.txt'], log: join(root, '.git', `${branch.replaceAll('/', '-')}.log`) });
const acquire = async (branch: string) => {
	const result = await acquireDisposableWorkspace(input(branch));
	assert.equal(result.kind, 'ready', JSON.stringify(result));
	if (result.kind !== 'ready') throw new Error('fixture acquisition failed');
	return result.workspace;
};
try {
	git('init', '-q', '-b', 'main');
	writeFileSync(join(root, 'probe.txt'), 'base probe\n');
	git('add', '.');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');
	writeFileSync(join(root, 'probe.txt'), 'explicit current probe\n');
	const live = git('status', '--porcelain');
	plug({ processes: { snapshot: () => ({ kind: 'known', processes: [knownSelf] }), kill: () => { throw new Error('no-stack adapter never kills'); } }, createWorktree: null, sessionWorkspace: null });

	const happy = await acquire('bench/happy');
	assert.equal(readFileSync(join(happy.context.worktree, 'probe.txt'), 'utf8'), 'explicit current probe\n');
	assert.equal(happy.dependencies.disposition, 'none');
	assert.ok(!existsSync(join(happy.context.worktree, '.wf', 'state.json')));
	assert.ok(!existsSync(join(happy.context.worktree, 'bug-reports')));
	assert.ok(existsSync(happy.receipt));
	assert.equal((await acquireDisposableWorkspace(input('bench/happy'))).kind, 'refused', 'one live owner');
	const release = happy.release();
	assert.equal(happy.release(), release, 'release is exactly one memoized promise');
	assert.equal((await release).kind, 'complete');
	assert.ok(!existsSync(happy.context.worktree));
	assert.ok(!existsSync(happy.receipt));
	assert.equal(git('branch', '--list', 'bench/happy'), '');
	assert.equal(git('status', '--porcelain'), live, 'caller source/index remain unchanged');

	failSetup = true;
	const setupFailed = await acquireDisposableWorkspace(input('bench/setup-fails'));
	assert.equal(setupFailed.kind, 'refused');
	if (setupFailed.kind === 'refused') assert.equal(setupFailed.cleanup?.kind, 'complete');
	assert.equal(git('branch', '--list', 'bench/setup-fails'), '');
	failSetup = false;
	refuseDependencies = true;
	const dependenciesFailed = await acquireDisposableWorkspace(input('bench/dependency-fails'));
	assert.equal(dependenciesFailed.kind, 'refused');
	if (dependenciesFailed.kind === 'refused') assert.equal(dependenciesFailed.cleanup?.kind, 'complete');
	refuseDependencies = false;

	const interrupted = await acquire('bench/interrupted');
	failCleanup = true;
	const incomplete = await interrupted.release();
	assert.equal(incomplete.kind, 'incomplete');
	assert.ok(existsSync(interrupted.receipt));
	assert.ok(existsSync(incomplete.journal));
	const attempts = records.length;
	failCleanup = false;
	assert.equal(await interrupted.release(), incomplete, 'old failed handle does not silently retry');
	assert.equal(records.length, attempts);
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/interrupted', project })).kind, 'complete');
	const replacement = await acquire('bench/interrupted');
	assert.equal(await interrupted.release(), incomplete, 'stale handle never releases replacement workspace');
	assert.ok(existsSync(replacement.context.worktree));
	assert.equal((await replacement.release()).kind, 'complete');

	const substituted = await acquire('bench/replacement-directory');
	const originalDirectory = `${substituted.context.worktree}-original`;
	renameSync(substituted.context.worktree, originalDirectory);
	mkdirSync(substituted.context.worktree);
	writeFileSync(join(substituted.context.worktree, 'foreign.txt'), 'not ours');
	assert.equal((await substituted.release()).kind, 'refused');
	assert.equal(readFileSync(join(substituted.context.worktree, 'foreign.txt'), 'utf8'), 'not ours');
	rmSync(substituted.context.worktree, { recursive: true });
	renameSync(originalDirectory, substituted.context.worktree);
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/replacement-directory', project })).kind, 'complete');

	const round = await acquire('bench/no-round-adoption');
	mkdirSync(join(round.context.worktree, '.wf'), { recursive: true });
	writeFileSync(join(round.context.worktree, '.wf', 'state.json'), '{}');
	const roundRelease = await round.release();
	assert.equal(roundRelease.kind, 'refused');
	assert.ok(existsSync(round.context.worktree));
	rmSync(join(round.context.worktree, '.wf', 'state.json'));
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/no-round-adoption', project })).kind, 'complete');

	git('branch', 'bench/pre-existing');
	const calls = records.length;
	assert.equal((await acquireDisposableWorkspace(input('bench/pre-existing'))).kind, 'refused');
	assert.equal(records.length, calls);
	assert.ok(git('branch', '--list', 'bench/pre-existing'));
	const escape = await acquireDisposableWorkspace({ ...input('bench/probe-escape'), probeFiles: ['../outside.txt'] });
	assert.equal(escape.kind, 'refused');
	if (escape.kind === 'refused') assert.equal(escape.cleanup?.kind, 'complete');
	assert.equal(git('branch', '--list', 'bench/probe-escape'), '');
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/pre-existing', project })).kind, 'refused', 'a branch name cannot grant disposal authority');
	const invalidRepository = await recoverDisposableWorkspace({ repository: join(root, 'not-a-repository'), branch: 'bench/unknown', project });
	assert.equal(invalidRepository.kind, 'refused');
	assert.equal(invalidRepository.journal, null, 'discovery failure has no known journal');
	console.log('all public disposable allocation, partial setup, dependencies, progress recovery, memoization, replacement and no-adoption witnesses green');
} finally {
	plug(before);
	rmSync(root, { recursive: true, force: true });
}
