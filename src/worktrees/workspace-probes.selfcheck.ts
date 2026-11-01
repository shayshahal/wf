import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scratchDestination } from './workspace-probes.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-probe-authority-'));
try {
	// Generated spelling combinations must not make ownership files become admitted test inputs.
	const reserved = ['.git', '.git/config', '.wf/state.json', '.wf/serve.pid', '.wf/serve-owner.json', '.wf/workspace-dependency.json', '.wf/check-processes/runner.json'];
	for (const prefix of ['', './', '././', './/']) for (const name of reserved) {
		assert.throws(() => scratchDestination(root, `${prefix}${name}`), /execution ownership/);
		if (process.platform === 'win32') assert.throws(() => scratchDestination(root, `${prefix}${name.toUpperCase()}`), /execution ownership/);
	}
	assert.equal(scratchDestination(root, '.wf/repro.mjs'), join(root, '.wf', 'repro.mjs'), 'task-owned scripts remain admitted');
	assert.equal(scratchDestination(root, 'test/fixtures/state.json'), join(root, 'test', 'fixtures', 'state.json'));
	assert.throws(() => scratchDestination(root, '../outside'), /\.\. segment/);
	console.log('workspace probes preserve Git/execution authority across normalized path spellings; unowned scripts and test fixtures remain admitted');
} finally { rmSync(root, { recursive: true, force: true }); }
