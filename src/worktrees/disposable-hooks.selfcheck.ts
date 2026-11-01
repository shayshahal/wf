// #194 F4: disposal and explicit recovery must suppress reference-transaction hooks too.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireDisposableWorkspace, recoverDisposableWorkspace } from './disposable-workspace.ts';
import type { WorkspaceProject } from './workspace-project.ts';

const root = mkdtempSync(join(tmpdir(), "wf-disposal-hooks ' "));
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const marker = join(root, 'hook-ran');
let failTeardown = false;
let failSetup = false;
const project: WorkspaceProject = {
	name: 'no-stack-hook-regression',
	async setup() { if (failSetup) throw new Error('fixture: setup failed'); },
	async acquire() { return { kind: 'ready', disposition: 'none', release: async () => null }; },
	teardown() { return [{ label: 'fixture project teardown', run: () => { if (failTeardown) throw new Error('fixture: retry cleanup'); } }]; },
};
try {
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@test', 'commit', '--allow-empty', '-qm', 'base');
	for (const configured of [false, true]) {
		const hooks = configured ? join(root, "configured hooks ' dir") : join(root, '.git', 'hooks');
		mkdirSync(hooks, { recursive: true });
		writeFileSync(join(hooks, 'reference-transaction'), '#!/bin/sh\necho ran >> "$PWD/hook-ran"\n', { mode: 0o755 });
		if (configured) git('config', 'core.hooksPath', hooks);
		const input = (suffix: string) => ({ repository: root, branch: `bench/hooks-${configured}-${suffix}`, ref: 'HEAD', project, probeFiles: [], log: join(root, '.git', 'diagnostic.log') });
		const lease = await acquireDisposableWorkspace(input('release'));
		assert.equal(lease.kind, 'ready');
		assert.equal(existsSync(marker), false);
		if (lease.kind !== 'ready') throw new Error('fixture: acquisition failed');
		assert.equal((await lease.workspace.release()).kind, 'complete');
		assert.equal(existsSync(marker), false, 'release must not run repository hooks');

		const interrupted = await acquireDisposableWorkspace(input('recover'));
		if (interrupted.kind !== 'ready') throw new Error('fixture: recovery acquisition failed');
		failTeardown = true;
		assert.equal((await interrupted.workspace.release()).kind, 'incomplete');
		assert.equal(existsSync(interrupted.workspace.receipt), true);
		failTeardown = false;
		assert.equal((await recoverDisposableWorkspace({ repository: root, branch: input('recover').branch, project })).kind, 'complete');
		assert.equal(existsSync(marker), false, 'fresh recovery must not run repository hooks');

		failSetup = true;
		const failed = await acquireDisposableWorkspace(input('setup-failed'));
		assert.equal(failed.kind, 'refused');
		if (failed.kind !== 'refused') throw new Error('fixture: setup unexpectedly succeeded');
		assert.equal(failed.cleanup?.kind, 'complete');
		assert.equal(existsSync(marker), false, 'setup-failure cleanup must not run repository hooks');
		failSetup = false;
		if (configured) assert.equal(git('config', '--get', 'core.hooksPath'), hooks);
		git('-c', 'user.name=wf', '-c', 'user.email=wf@test', 'commit', '--allow-empty', '-qm', 'ordinary Git remains unchanged');
		assert.equal(existsSync(marker), true, 'suppression must not persist into ordinary Git');
		rmSync(marker);
	}
	console.log('ok disposable release, explicit recovery and setup-failure cleanup suppress hooks without changing ordinary Git');
} finally { rmSync(root, { recursive: true, force: true }); }
