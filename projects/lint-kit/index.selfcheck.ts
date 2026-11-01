import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintKitWorkspaceProject } from './index.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-lint-kit-setup-'));
const log = `${root}.log`;
const context = { worktree: root, branch: 'bench/lint-kit', slug: 'bench-lint-kit', port: 15000, log };
try {
	writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'wf-lint-kit-fixture', private: true, packageManager: 'pnpm@11.3.0', scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(\'behavioral-link\',\'forbidden\')"' } }));
	writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n");
	await lintKitWorkspaceProject.setup(context);
	assert(!existsSync(join(root, 'behavioral-link')), 'neutral install must suppress lifecycle scripts');
	const lease = await lintKitWorkspaceProject.acquire(context);
	assert.equal(lease.kind, 'ready');
	assert.equal(lease.disposition, 'none');
	assert.equal(await lease.release(), null);
	assert.equal(await lease.release(), null);
	assert.deepEqual(lintKitWorkspaceProject.teardown(context), []);
	assert(!existsSync(join(root, '.wf')), 'no app stack or round state');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'wf-lint-kit-fixture', dependencies: { 'impossible-frozen-dependency': '1.0.0' } }));
	await assert.rejects(lintKitWorkspaceProject.setup(context), /lint-kit workspace setup: frozen install failed/);
	rmSync(root, { recursive: true, force: true });
	assert.match(readFileSync(log, 'utf8'), /frozen/);
	console.log('  ok   real frozen pnpm setup, disabled behavioral hooks, no-stack admission, repeated release, and durable failure logs');
} finally {
	rmSync(root, { recursive: true, force: true });
	rmSync(log, { force: true });
}
