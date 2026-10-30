// workspace-allocation.selfcheck.ts — real Git, explicit repositories, no project setup or stack.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addWorktree, allocateWorkspace, workspaceAllocationPath } from './workspace-allocation.ts';
import { listWorktrees } from './worktree-registry.ts';
import { plug, seams } from '../seams.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-neutral-allocation-'));
const original = seams.createWorktree;
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
try {
	git('init', '-q', '-b', 'main');
	writeFileSync(join(root, 'source.txt'), 'unchanged\n');
	git('add', '.');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');
	const head = git('rev-parse', 'HEAD');
	plug({ createWorktree: null });
	const branch = 'bench/neutral-explicit';
	const allocated = await allocateWorkspace({ repository: root, branch, ref: head, log: join(root, 'diagnostic.log') });
	assert.equal(allocated.kind, 'allocated');
	assert.equal(allocated.path, workspaceAllocationPath(root, branch));
	assert.equal(listWorktrees(root).filter((tree) => tree.branch === branch).length, 1);
	assert.equal(git('rev-parse', branch), head);
	assert.ok(existsSync(join(allocated.path, 'source.txt')));
	assert.ok(!existsSync(join(allocated.path, '.wf', 'state.json')));
	assert.ok(!existsSync(join(allocated.path, 'bug-reports')));
	assert.ok(!existsSync(join(allocated.path, '.verify-stack.env')));
	assert.ok(!existsSync(join(allocated.path, 'node_modules')));
	assert.equal(git('status', '--porcelain'), '', 'allocation does not write source/round state in caller checkout');
	const refused = await allocateWorkspace({ repository: root, branch, ref: head, log: join(root, 'diagnostic.log') });
	assert.equal(refused.kind, 'refused');
	assert.equal(git('rev-parse', branch), head, 'existing branch survives refusal');
	git('worktree', 'remove', allocated.path);
	git('branch', '-d', branch);

	// Neutral allocation suppresses Git hooks too, including reference transactions and configured hooksPath.
	for (const configured of [false, true]) {
		const hookDir = join(root, '.git', configured ? 'custom hooks' : 'hooks');
		mkdirSync(hookDir, { recursive: true });
		for (const name of ['post-checkout', 'reference-transaction']) writeFileSync(join(hookDir, name), `#!/bin/sh
printf hook-ran > "$PWD/neutral-hook-marker"
`, { mode: 0o755 });
		if (configured) git('config', 'core.hooksPath', hookDir);
		const parametersBefore = process.env.GIT_CONFIG_PARAMETERS;
		const hookParameter = `'core.hooksPath=${hookDir.replaceAll("'", String.fromCharCode(39, 92, 39, 39))}'`;
		process.env.GIT_CONFIG_PARAMETERS = [parametersBefore, hookParameter].filter(Boolean).join(' ');
		const neutral = await allocateWorkspace({ repository: root, branch: `bench/hooks-${configured}`, ref: head, log: join(root, 'hooks.log') });
		if (parametersBefore === undefined) delete process.env.GIT_CONFIG_PARAMETERS; else process.env.GIT_CONFIG_PARAMETERS = parametersBefore;
		assert.equal(neutral.kind, 'allocated', JSON.stringify(neutral));
		assert.ok(!existsSync(join(neutral.path, 'neutral-hook-marker')) && !existsSync(join(root, 'neutral-hook-marker')), 'neutral Git checkout and reference hooks never run');
		assert.equal(configured ? git('config', '--get', 'core.hooksPath') : git('config', '--get-regexp', '^core\.' ).includes('hookspath'), configured ? hookDir : false);
		git('worktree', 'remove', neutral.path);
		git('branch', '-d', neutral.branch);
		rmSync(join(root, 'neutral-hook-marker'), { force: true });
		if (configured) git('config', '--unset', 'core.hooksPath');
	}
	const legacy = join(root, 'round-hook-checkout');
	addWorktree({ branch: 'round/hooks-preserved', path: legacy, base: head, cwd: root });
	assert.ok(existsSync(join(legacy, 'neutral-hook-marker')), 'existing round Git hook behavior is unchanged');
	git('worktree', 'remove', '--force', legacy); git('branch', '-d', 'round/hooks-preserved');
	rmSync(join(root, 'neutral-hook-marker'), { force: true });

	const calls: string[] = [];
	plug({ createWorktree: (input) => {
		assert.equal(input.repository, root);
		assert.equal(input.setup, 'none');
		calls.push(input.path);
		// A backend returning a different checkout must not authorize setup there.
		return { path: root, branch: 'main' };
	} });
	const wrong = await allocateWorkspace({ repository: root, branch: 'bench/backend', ref: head, log: join(root, 'diagnostic.log') });
	assert.equal(wrong.kind, 'refused');
	assert.equal(calls.length, 1);
	assert.equal(git('rev-parse', 'HEAD'), head);
	const unavailable = await allocateWorkspace({ repository: join(root, 'absent-repository'), branch: 'bench/absent', ref: head, log: join(root, 'absent.log') });
	assert.equal(unavailable.kind, 'refused');
	assert.equal(unavailable.path, null, 'unavailable repository has no confirmed placement');
	console.log('all real Git repository-explicit allocation, no-ceremony and backend-binding witnesses green');
} finally {
	plug({ createWorktree: original });
	rmSync(root, { recursive: true, force: true });
}
