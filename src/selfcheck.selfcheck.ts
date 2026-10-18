// Exercise the actual selfcheck entry in an inert tree: native child checks, no module mocks.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { WF_ROOT } from './paths.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-selfcheck-entry-'));
const put = (file: string, text: string) => {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), text);
};
const program = (label: string, code = 0) => `import {appendFileSync} from 'node:fs'; appendFileSync('calls.log', ${JSON.stringify(label + '\n')}); process.exit(${code});`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const run = (...args: string[]) => {
	writeFileSync(join(root, 'calls.log'), '');
	const result = spawnSync(process.execPath, [join(root, 'src/selfcheck.ts'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
	assert.ifError(result.error);
	return { ...result, calls: readFileSync(join(root, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).sort() };
};
try {
	for (const dir of ['src', 'projects', 'env']) mkdirSync(join(root, dir));
	put('package.json', '{"type":"module"}');
	for (const file of ['selfcheck.ts', 'paths.ts']) copyFileSync(join(WF_ROOT, 'src', file), join(root, 'src', file));
	put('src/alpha.selfcheck.ts', program('alpha'));
	put('env/bravo.selfcheck.ts', program('bravo'));
	// These executables implement only the runner's child-exit contract, not compiler/linter semantics.
	put('node_modules/typescript/bin/tsc', program('tsc'));
	put('node_modules/eslint/bin/eslint.js', program('eslint'));

	const focused = run('src/alpha.selfcheck.ts');
	assert.equal(focused.status, 0, focused.stderr);
	assert.deepEqual(focused.calls, ['alpha', 'eslint', 'tsc']);
	assert.match(focused.stdout, /focused.*full suite not run/);
	assert.match(focused.stdout, /selfcheck: PASS src\/alpha\.selfcheck\.ts \(\d+\.\d+s\)/);
	assert.match(focused.stdout, /3 selfchecks green \(focused;/);
	console.log('  ok   focused entry runs only selected checks plus both static tools, with timings and an explicit limited claim');

	for (const alias of ['./src/alpha.selfcheck.ts', 'src\\alpha.selfcheck.ts']) {
		const duplicate = run('src/alpha.selfcheck.ts', alias);
		assert.equal(duplicate.status, 0, duplicate.stderr);
		assert.deepEqual(duplicate.calls, ['alpha', 'eslint', 'tsc']);
	}
	console.log('  ok   relative and Windows path aliases cannot execute one check twice');

	for (const unknown of ['missing.selfcheck.ts', '../outside.selfcheck.ts', '--unknown']) {
		const refused = run('src/alpha.selfcheck.ts', unknown);
		assert.equal(refused.status, 2);
		assert.deepEqual(refused.calls, []);
		assert.match(refused.stderr, /selfcheck: unknown selfcheck path/);
		assert.doesNotMatch(refused.stdout, /green/);
	}
	console.log('  ok   any unknown selection refuses the whole request before any child starts');

	const full = run();
	assert.equal(full.status, 0, full.stderr);
	assert.deepEqual(full.calls, ['alpha', 'bravo', 'eslint', 'tsc']);
	assert.match(full.stdout, /4 selfchecks green \(tsc and eslint included\)/);
	assert.doesNotMatch(full.stdout, /focused/);
	put('env/bravo.selfcheck.ts', program('bravo', 3));
	const red = run();
	assert.equal(red.status, 1);
	assert.match(red.stdout, /selfcheck: FAIL env\/bravo\.selfcheck\.ts/);
	assert.match(red.stdout, /1 of 4 selfchecks red/);
	assert.match(red.stderr, /FAIL env\/bravo\.selfcheck\.ts/);
	assert.equal(run('src/alpha.selfcheck.ts').status, 0);
	console.log('  ok   no-argument manual suite still runs everything and propagates red independently of focused selection');

	put('node_modules/typescript/bin/tsc', program('tsc', 5));
	const typeRed = run('src/alpha.selfcheck.ts');
	assert.equal(typeRed.status, 1);
	assert.match(typeRed.stderr, /FAIL tsc/);
	put('node_modules/typescript/bin/tsc', program('tsc'));
	rmSync(join(root, 'node_modules/eslint'), { recursive: true });
	const missingTool = run('src/alpha.selfcheck.ts');
	assert.equal(missingTool.status, 1);
	assert.match(missingTool.stderr, /no node_modules\/eslint/);
	console.log('  ok   focused runs cannot omit or hide failing/missing static tools');
} finally {
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
