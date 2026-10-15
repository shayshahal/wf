import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { plug, seams } from '../seams.ts';
import { runReap } from './reap.ts';
import { listWorktrees } from './worktree.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-partial-reap-'));
const caller = process.cwd();
const previous = seams.removalPlan;
const force = process.env.WF_FORCE_REAP;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
const target = join(root, 'round');
let failDelete = true;
try {
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '--allow-empty', '-qm', 'base');
	git('worktree', 'add', '-qb', 'bench/partial', target);
	plug({ removalPlan: () => [
		{ label: 'wt remove', run: () => {
			// Faithful partial outcome: unregister succeeded but deletion failed, leaving the checkout.
			const held = join(root, 'held');
			renameSync(target, held); git('worktree', 'prune', '--expire=now'); renameSync(held, target);
			throw new Error('fixture: directory deletion failed after unregister');
		} },
		{ label: 'rm -rf worktree', run: () => {
			assert.equal(resolve(process.cwd()), resolve(root), 'reap runs from surviving cwd');
			if (failDelete) throw new Error('fixture: directory remains busy');
			rmSync(target, { recursive: true, force: true });
		} },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
	] });
	process.env.WF_FORCE_REAP = '1';
	process.chdir(target);
	await runReap(['bench/partial']);
	assert.equal(process.exitCode, 1);
	process.exitCode = 0;
	assert.ok(existsSync(target));
	assert.ok(!listWorktrees(root).some((tree) => tree.branch === 'bench/partial'));
	const journals = readdirSync(join(root, '.git')).filter((name) => /^wf-reap-.*\.json$/.test(name));
	assert.equal(journals.length, 1, 'unregistered target remains durably discoverable');
	const original = join(root, 'original-directory');
	renameSync(target, original); mkdirSync(target);
	await assert.rejects(runReap(['bench/partial']), /ownership changed/);
	assert.ok(existsSync(target), 'stale recovery cannot delete a replacement checkout');
	rmSync(target, { recursive: true }); renameSync(original, target);

	failDelete = false;
	await runReap(['bench/partial']);
	assert.ok(!existsSync(target));
	assert.ok(!existsSync(join(root, '.git', journals[0])));
	assert.match(git('branch', '--list', 'bench/partial'), /bench\/partial/, 'unfinished branch survives');
	console.log('all safe-cwd, partial unregister, failed delete and fresh retry witnesses green');
} finally {
	process.chdir(caller); plug({ removalPlan: previous });
	if (force === undefined) delete process.env.WF_FORCE_REAP; else process.env.WF_FORCE_REAP = force;
	rmSync(root, { recursive: true, force: true });
}
