// projects/jewelryx/checks.mjs — wf check's commands for a JewelryX diff (index.mjs checks):
//   backend  — ruff check + ruff format --check, pytest for the changed tests
//   frontend — svelte-check for the touched packages, vitest for the changed tests
//   test     — the plan row's test path: pytest, vitest in its package, or playwright under verification/
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const isPyTest = (f) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
const isJsTest = (f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);

// Pure: the commands to run, in order. `pkgFor(file)` returns { name, dir, svelte } for a frontend
// file or null; `test` is the plan row's test path or null.
export function checkTasks({ changed, test, pkgFor }) {
	const tasks = [];
	const add = (t) => { if (!tasks.some((x) => x.label === t.label)) tasks.push(t); };
	const backend = changed.filter((f) => f.startsWith('packages/backend/') && f.endsWith('.py'));
	const rel = (f) => (f.startsWith('packages/backend/') ? f.slice('packages/backend/'.length) : f);
	if (backend.length) {
		add({ label: `ruff check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'check', ...backend.map(rel)], cwd: 'packages/backend' });
		add({ label: `ruff format --check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'format', '--check', ...backend.map(rel)], cwd: 'packages/backend' });
	}
	const pytests = backend.filter(isPyTest);
	if (test?.endsWith('.py') && !pytests.includes(test)) pytests.push(test);
	if (pytests.length) add({ label: `pytest ${pytests.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'pytest', ...pytests.map(rel)], cwd: 'packages/backend' });

	const pkgs = new Map();
	for (const f of changed.filter((f) => f.startsWith('packages/frontend/'))) {
		const pkg = pkgFor(f);
		if (!pkg) continue;
		if (!pkgs.has(pkg.name)) pkgs.set(pkg.name, { ...pkg, tests: [] });
		if (isJsTest(f)) pkgs.get(pkg.name).tests.push(relative(pkg.dir, f).replace(/\\/g, '/'));
	}
	for (const pkg of pkgs.values()) {
		if (pkg.svelte) add({ label: `svelte-check ${pkg.name}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'svelte-check', '--threshold', 'error', '--incremental', '--tsgo'], cwd: '.' });
		if (pkg.tests.length) add({ label: `vitest ${pkg.name} ${pkg.tests.join(' ')}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', ...pkg.tests], cwd: '.' });
	}

	if (!test || test.endsWith('.py')) return tasks;
	if (!test.endsWith('.ts')) return [...tasks, { label: 'check', missing: `PLAN.md row check "${test}" is not runnable — use \`repro\`, one repo-rooted test path, or — (fence only)` }];
	if (test.startsWith('verification/')) add({ label: `playwright ${test}`, cmd: 'pnpm', args: ['exec', 'playwright', 'test', test], cwd: '.' });
	else {
		// vitest lives in the package, not at the root (TJEW-700 row 3: `Command "vitest" not found`).
		const pkg = test.startsWith('packages/frontend/') ? pkgFor(test) : null;
		if (pkg) { const t = relative(pkg.dir, test).replace(/\\/g, '/'); add({ label: `vitest ${pkg.name} ${t}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', t], cwd: '.' }); }
		else add({ label: `vitest ${test}`, cmd: 'pnpm', args: ['exec', 'vitest', 'run', test], cwd: '.' });
	}
	return tasks;
}

// Nearest package.json above a frontend file; svelte-check only where a svelte.config lives.
// `dir` comes back repo-relative, because checkTasks makes test paths relative to it.
export function realPkgFor(toplevel) {
	const cache = new Map();
	return (file) => {
		let dir = dirname(join(toplevel, file));
		const stop = join(toplevel, 'packages', 'frontend');
		while (dir.startsWith(stop) && dir !== stop) {
			if (!cache.has(dir)) {
				const manifest = join(dir, 'package.json');
				cache.set(dir, existsSync(manifest) ? { name: JSON.parse(readFileSync(manifest, 'utf8')).name, dir: relative(toplevel, dir).replace(/\\/g, '/'), svelte: existsSync(join(dir, 'svelte.config.js')) } : null);
			}
			if (cache.get(dir)) return cache.get(dir);
			dir = dirname(dir);
		}
		return null;
	};
}
