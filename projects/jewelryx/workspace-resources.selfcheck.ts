import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJewelryxWorkspaceProject, setup } from './index.ts';
import { seams } from '../../src/seams.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-jewelryx-workspace-'));
const log = `${root}.log`;
const originalProject = seams.project;
const originalSetup = { ...setup };
const context = { worktree: root, branch: 'bench/workspace-resources', slug: 'bench-workspace-resources', port: 15000, log };
try {
	mkdirSync(join(root, 'packages', 'backend'), { recursive: true });
	writeFileSync(join(root, '.worktreeinclude'), 'packages/backend/.env\n');
	writeFileSync(join(root, 'packages', 'backend', '.env'), 'DATABASE_NAME=live\n');
	seams.project = { secretsFrom: () => root };
	setup.node = `"${process.execPath}" -e "console.log('neutral shared node build')"`;
	setup.verify = `"${process.execPath}" -e "console.log('neutral shared verification setup')"`;
	setup.tools = 'exit 91';
	let databaseSetup = false;
	setup.db = async (input) => { assert.equal(input.log, log); databaseSetup = true; };
	const adapter = createJewelryxWorkspaceProject({ requirements: { kind: 'none' }, ambient: {} });
	await adapter.setup(context);
	assert(databaseSetup);
	assert.match(readFileSync(log, 'utf8'), /neutral shared node build/);
	assert.match(readFileSync(log, 'utf8'), /neutral shared verification setup/);
	assert.match(readFileSync(join(root, 'packages', 'backend', '.env'), 'utf8'), /DATABASE_NAME=jewelryx_bench-workspace-resources/);
	assert(!existsSync(join(root, '.agents')), 'no behavioral tool linker');
	const lease = await adapter.acquire(context);
	assert.equal(lease.kind, 'ready'); assert.equal(lease.disposition, 'none');
	assert.equal(await lease.release(), null);
	const steps = adapter.teardown(context);
	assert.deepEqual(steps.map((step) => step.label), ['confirm workspace server release', 'drop workspace database']);
	assert(steps[0].run); await steps[0].run();
	mkdirSync(join(root, '.wf'), { recursive: true });
	writeFileSync(join(root, '.wf', 'serve-owner.json'), 'unknown authority');
	await assert.rejects(async () => steps[0].run?.(), /unresolved server ownership/);
	const persistent = createJewelryxWorkspaceProject({ requirements: { kind: 'stack', profile: 'shared-auth', temporary: false }, ambient: {} });
	assert.equal((await persistent.acquire(context)).kind, 'refused');
	console.log('  ok   explicit no-stack binding, shared neutral setup, retained logs, no behavioral tools, persistent refusal, and owned-only teardown guard');
} finally {
	Object.assign(setup, originalSetup);
	seams.project = originalProject;
	rmSync(root, { recursive: true, force: true }); rmSync(log, { force: true });
}
