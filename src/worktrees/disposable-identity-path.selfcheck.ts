// Real public disposable lifecycle: checkout rebinding and physical diagnostic-path replacements.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { acquireDisposableWorkspace, recoverDisposableWorkspace } from './disposable-workspace.ts';
import type { WorkspaceProject } from './workspace-project.ts';
import { workspaceAllocationPath } from './workspace-allocation.ts';
import { plug, seams } from '../seams.ts';

const fixture = mkdtempSync(join(tmpdir(), 'wf-disposable-identity-path-'));
const root = join(fixture, 'repository');
mkdirSync(root);
const before = { createWorktree: seams.createWorktree, sessionWorkspace: seams.sessionWorkspace };
const gitAt = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const git = (...args: string[]) => gitAt(root, ...args);
let dependencyReleases = 0, teardowns = 0;
let duringTeardown: (() => void) | undefined;
const project: WorkspaceProject = {
	name: 'identity-path-no-stack', setup: async () => {},
	acquire: async () => ({ kind: 'ready', disposition: 'none', release: async () => { dependencyReleases++; return null; } }),
	teardown: () => [{ label: 'release identity-path fixture', run: () => { teardowns++; duringTeardown?.(); } }],
};
const input = (branch: string) => ({ repository: root, branch, ref: 'main', project, probeFiles: [], log: join(root, '.git', `${branch.replaceAll('/', '-')}.log`) });
const acquire = async (branch: string, log?: string) => {
	const result = await acquireDisposableWorkspace({ ...input(branch), ...(log ? { log } : {}) });
	assert.equal(result.kind, 'ready', JSON.stringify(result));
	if (result.kind !== 'ready') throw new Error('identity-path acquisition fixture unavailable');
	return result.workspace;
};
try {
	plug({ createWorktree: null, sessionWorkspace: null });
	git('init', '-q', '-b', 'main');
	writeFileSync(join(root, 'base.txt'), 'base\n');
	git('add', '.');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');

	for (const mode of ['switched', 'detached', 'rebound']) {
		const branch = `bench/${mode}`;
		const workspace = await acquire(branch);
		const gitFile = join(workspace.context.worktree, '.git');
		const originalBinding = `${gitFile}.original-binding`;
		if (mode === 'switched') gitAt(workspace.context.worktree, 'switch', '-qc', 'replacement-work');
		if (mode === 'detached') gitAt(workspace.context.worktree, 'switch', '--detach', '-q');
		if (mode === 'rebound') {
			const foreign = join(fixture, 'foreign-repository');
			git('clone', '--quiet', '--no-checkout', root, foreign);
			gitAt(foreign, 'switch', '-qc', branch, 'main');
			assert.equal(gitAt(foreign, 'rev-parse', 'HEAD'), workspace.ref, 'same ref and branch do not establish the original repository binding');
			renameSync(gitFile, originalBinding);
			writeFileSync(gitFile, `gitdir: ${join(foreign, '.git')}\n`);
		}
		const sentinel = join(workspace.context.worktree, 'new-user-work.txt');
		writeFileSync(sentinel, `replacement ${mode}\n`);
		const owner = readFileSync(workspace.receipt, 'utf8');
		const effects = { dependencyReleases, teardowns };
		const released = await workspace.release();
		assert.equal(released.kind, 'refused', JSON.stringify(released));
		const recovered = await recoverDisposableWorkspace({ repository: root, branch, project });
		assert.equal(recovered.kind, 'refused', JSON.stringify(recovered));
		assert.deepEqual({ dependencyReleases, teardowns }, effects, 'neither handle release nor fresh recovery may tear down replacement work');
		assert.equal(readFileSync(sentinel, 'utf8'), `replacement ${mode}\n`);
		assert.equal(readFileSync(workspace.receipt, 'utf8'), owner);
		assert.equal(git('rev-parse', branch), workspace.ref);
		if (mode === 'rebound') { unlinkSync(gitFile); renameSync(originalBinding, gitFile); }
		else gitAt(workspace.context.worktree, 'switch', '-q', branch);
		assert.equal((await recoverDisposableWorkspace({ repository: root, branch, project })).kind, 'complete');
		assert.ok(!existsSync(workspace.context.worktree));
		console.log(`${mode} checkout: release and fresh recovery refuse before teardown; replacement file and owner preserved`);
	}

	const absent = await acquire('bench/absent-after-removal');
	const branchLock = join(root, '.git', 'refs', 'heads', 'bench', 'absent-after-removal.lock');
	writeFileSync(branchLock, 'fixture prevents branch deletion after successful directory removal');
	const priorTeardowns = teardowns;
	const incomplete = await absent.release();
	assert.equal(incomplete.kind, 'incomplete', JSON.stringify(incomplete));
	assert.ok(!existsSync(absent.context.worktree));
	assert.ok(existsSync(absent.receipt));
	assert.ok(existsSync(incomplete.journal));
	unlinkSync(branchLock);
	assert.equal((await recoverDisposableWorkspace({ repository: root, branch: 'bench/absent-after-removal', project })).kind, 'complete');
	assert.equal(teardowns, priorTeardowns + 1, 'cleanup recovery resumes after committed teardown/removal instead of replaying them');
	assert.ok(!existsSync(absent.receipt));
	assert.equal(git('branch', '--list', 'bench/absent-after-removal'), '');
	console.log('genuine absent-directory recovery resumes the same cleanup journal after repairing branch-delete failure');

	const alias = join(fixture, 'repository-alias');
	symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
	const aliasedBranch = 'bench/aliased-inside-log';
	const path = workspaceAllocationPath(root, aliasedBranch);
	const insideAlias = join(alias, '.claude', 'worktrees', path.split(/[\\/]/).at(-1) ?? '', 'new', 'output.log');
	const admissionEffects = { dependencyReleases, teardowns };
	const aliased = await acquireDisposableWorkspace({ ...input(aliasedBranch), log: insideAlias });
	assert.equal(aliased.kind, 'refused', JSON.stringify(aliased));
	assert.ok(!existsSync(path), 'aliased admission is refused before allocation or setup');
	assert.equal(git('branch', '--list', aliasedBranch), '');
	assert.deepEqual({ dependencyReleases, teardowns }, admissionEffects);

	const danglingBranch = 'bench/dangling-inside-log';
	const danglingPath = workspaceAllocationPath(root, danglingBranch);
	const danglingParent = join(fixture, 'not-yet-created-checkout-alias');
	symlinkSync(danglingPath, danglingParent, process.platform === 'win32' ? 'junction' : 'dir');
	const dangling = await acquireDisposableWorkspace({ ...input(danglingBranch), log: join(danglingParent, 'output.log') });
	assert.equal(dangling.kind, 'refused', JSON.stringify(dangling));
	assert.ok(!existsSync(danglingPath));

	const linkBranch = 'bench/admission-log-link';
	const logLink = join(root, '.git', 'inside-log-link');
	symlinkSync(join(workspaceAllocationPath(root, linkBranch), 'not-created.log'), logLink, 'file');
	assert.equal((await acquireDisposableWorkspace({ ...input(linkBranch), log: logLink })).kind, 'refused');
	unlinkSync(logLink);
	console.log('physical admission rejects parent alias, dangling parent junction and dangling leaf log symlink into future checkout');

	const externalLog = join(alias, '.git', 'external-aliased.log');
	const external = await acquire('bench/external-parent-alias', externalLog);
	const observed = await external.runDiagnostic({ executable: process.execPath, args: ['-e', "console.log('external aliased output survives')"], env: process.env });
	assert.equal(observed.kind, 'retained', JSON.stringify(observed));
	assert.equal((await external.release()).kind, 'complete');
	assert.match(readFileSync(externalLog, 'utf8'), /external aliased output survives/);
	console.log('external parent alias remains valid and its actual native diagnostic stdout survives release');

	for (const when of ['before-release', 'during-teardown']) {
		const branch = `bench/log-link-${when}`;
		const workspace = await acquire(branch);
		const execution = await workspace.runDiagnostic({ executable: process.execPath, args: ['-e', "console.log('native output preserved across destination rebind')"], env: process.env });
		assert.equal(execution.kind, 'retained', JSON.stringify(execution));
		const output = readFileSync(workspace.context.log, 'utf8');
		const insideLog = join(workspace.context.worktree, 'replacement-log.txt');
		const replaceLog = () => {
			writeFileSync(insideLog, output);
			unlinkSync(workspace.context.log);
			symlinkSync(insideLog, workspace.context.log, 'file');
		};
		if (when === 'before-release') replaceLog();
		else duringTeardown = replaceLog;
		const effects = { dependencyReleases, teardowns };
		const released = await workspace.release();
		assert.equal(released.kind, when === 'before-release' ? 'refused' : 'incomplete', JSON.stringify(released));
		duringTeardown = undefined;
		const recovered = await recoverDisposableWorkspace({ repository: root, branch, project });
		assert.equal(recovered.kind, 'refused', JSON.stringify(recovered));
		assert.equal(teardowns, effects.teardowns + (when === 'during-teardown' ? 1 : 0));
		assert.equal(dependencyReleases, effects.dependencyReleases + (when === 'during-teardown' ? 1 : 0));
		assert.ok(existsSync(workspace.context.worktree));
		assert.ok(existsSync(workspace.receipt));
		assert.match(readFileSync(insideLog, 'utf8'), /native output preserved across destination rebind/);
		unlinkSync(workspace.context.log);
		writeFileSync(workspace.context.log, output);
		assert.equal((await recoverDisposableWorkspace({ repository: root, branch, project })).kind, 'complete');
		assert.match(readFileSync(workspace.context.log, 'utf8'), /native output preserved across destination rebind/);
		console.log(`log symlink ${when}: refuse destructive cleanup and fresh recovery; repair destination then recover without losing native stdout`);
	}
} finally {
	plug(before);
	rmSync(fixture, { recursive: true, force: true });
}
