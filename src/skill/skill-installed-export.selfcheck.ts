// A release installed by the previous updater has already-anchored templates. Re-export must not
// retain that machine's paths: the first update can still be performed by the previous installer.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { exportSkillFolder } from './skill-export.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-installed-export-'));
try {
	const first = join(root, 'installed round');
	assert.equal(exportSkillFolder(WF_ROOT, first).ok, true);
	const runtime = join(first, 'scripts', 'runtime');
	const normalized = runtime.replace(/\\/g, '/');
	// This is the old installer's actual transformation, not a fabricated stale path in a prompt.
	for (const entry of readdirSync(runtime, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
		const file = join(entry.parentPath, entry.name);
		writeFileSync(file, anchorToolPaths(readFileSync(file, 'utf8'), normalized));
	}
	const second = join(root, 'exported round');
	execFileSync(process.execPath, [join(first, 'scripts', 'wf.mjs'), 'skill', 'export', second], { encoding: 'utf8' });
	const fixture = join(root, 'task');
	mkdirSync(join(fixture, '.wf'), { recursive: true });
	mkdirSync(join(fixture, 'round'));
	const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
	const git = (...args: string[]) => execFileSync('git', ['-C', fixture, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', ...args], { env: gitEnv, stdio: 'pipe' });
	git('init', '-q');
	git('commit', '-qm', 'base', '--allow-empty');
	writeFileSync(join(fixture, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, id: 'R-1', folder: 'round', class: 'B', step: 'agree', base: 'HEAD' }));
	writeFileSync(join(fixture, 'round', 'TICKET.md'), '# Task\n\n## Intent\n- Preserve the requested behavior.\n');
	// Removing the first installation proves the copy cannot accidentally fall back to its sources.
	rmSync(first, { recursive: true, force: true });
	const prompt = execFileSync(process.execPath, [join(second, 'scripts', 'wf.mjs'), 'brief', 'agree'], { cwd: fixture, env: gitEnv, encoding: 'utf8' });
	assert(!prompt.includes(normalized), 'a re-export retained the previous installation path');
	assert(prompt.includes(join(second, 'scripts', 'runtime').replace(/\\/g, '/')), 'the brief must link to its own runtime');
	console.log('previous-installer templates re-export without machine paths');
} finally {
	rmSync(root, { recursive: true, force: true });
}
