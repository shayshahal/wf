// projects/jewelryx/checks.ts — wf check's commands for a JewelryX diff (index.ts checks):
//   backend  — ruff check + ruff format --check, pytest for the changed tests
//   frontend — svelte-check for the touched packages, vitest for the changed tests
//   test     — the plan row's test path: pytest, vitest in its package, or playwright under verification/
//   pre-commit — the repo's own lefthook pre-commit hook on the changed files, first, when it has one
//              (prettier, eslint and oxlint with --fix, ruff --fix: it rewrites and stages what it fixes)
//   pre-push — the repo's own lefthook pre-push hook on the changed files, when it has one (it runs
//              the stricter svelte-check, so the --tsgo one above is dropped then)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CheckTask } from '../../src/gates/check.ts';

export type Pkg = { name: string; dir: string; svelte: boolean };
export type PkgFor = (file: string) => Pkg | null;

const isPyTest = (f: string) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
const isJsTest = (f: string) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);

// Pure: the commands to run, in order. `pkgFor(file)` returns { name, dir, svelte } for a frontend
// file or null; `test` is the plan row's test path or null; `pushHook`: the repo has a lefthook.yml;
// `onDisk(file)`: the file is still there (not deleted by the diff).
export function checkTasks({ changed, test, pkgFor, pushHook = false, onDisk = () => true }: { changed: string[]; test: string | null; pkgFor: PkgFor; pushHook?: boolean; onDisk?: (file: string) => boolean }): CheckTask[] {
	const tasks = rowTasks({ changed, test, pkgFor, pushHook });
	if (!pushHook || !changed.length || tasks.some((t) => t.missing)) return tasks;
	// What the commit will run, run first: ESLint (lint-kit's Svelte rules, @shadcn/lint) runs only in
	// pre-commit, so an implementer met it at `git commit`, after wf check had said green (2026-10-04).
	// First, because it fixes formatting the commands after it would otherwise fail on. Deleted files
	// are left out, as a commit's staged list leaves them out: prettier exits 2 on a path that is not
	// there (measured on a bench worktree, the same day).
	const present = changed.filter(onDisk);
	const preCommit: CheckTask[] = present.length ? [{ label: 'lefthook pre-commit', cmd: 'pnpm', args: ['exec', 'lefthook', 'run', 'pre-commit', ...present.flatMap((f) => ['--file', f])], cwd: '.' }] : [];
	// What the push will run, run before the commit: TJEW-670 (2026-09-28) was approved at T2, then
	// its push was refused by fallow-audit, and the fix commit after the approval needed a second T2.
	// fallow audit sees uncommitted and untracked files (measured on a bench round, the same day).
	return [...preCommit, ...tasks, { label: 'lefthook pre-push', cmd: 'pnpm', args: ['exec', 'lefthook', 'run', 'pre-push', ...changed.flatMap((f) => ['--file', f])], cwd: '.' }];
}

function rowTasks({ changed, test, pkgFor, pushHook }: { changed: string[]; test: string | null; pkgFor: PkgFor; pushHook: boolean }): CheckTask[] {
	const tasks: CheckTask[] = [];
	const add = (t: CheckTask) => { if (!tasks.some((x) => x.label === t.label)) tasks.push(t); };
	const backend = changed.filter((f) => f.startsWith('packages/backend/') && f.endsWith('.py'));
	const rel = (f: string) => (f.startsWith('packages/backend/') ? f.slice('packages/backend/'.length) : f);
	if (backend.length) {
		add({ label: `ruff check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'check', ...backend.map(rel)], cwd: 'packages/backend' });
		add({ label: `ruff format --check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'format', '--check', ...backend.map(rel)], cwd: 'packages/backend' });
	}
	const pytests = backend.filter(isPyTest);
	if (test?.endsWith('.py') && !pytests.includes(test)) pytests.push(test);
	if (pytests.length) add({ label: `pytest ${pytests.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'pytest', ...pytests.map(rel)], cwd: 'packages/backend' });

	const pkgs = new Map<string, Pkg & { tests: string[] }>();
	for (const f of changed.filter((f) => f.startsWith('packages/frontend/'))) {
		const pkg = pkgFor(f);
		if (!pkg) continue;
		if (!pkgs.has(pkg.name)) pkgs.set(pkg.name, { ...pkg, tests: [] });
		if (isJsTest(f)) pkgs.get(pkg.name)!.tests.push(relative(pkg.dir, f).replace(/\\/g, '/'));
	}
	for (const pkg of pkgs.values()) {
		if (pkg.svelte && !pushHook) add({ label: `svelte-check ${pkg.name}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'svelte-check', '--threshold', 'error', '--incremental', '--tsgo'], cwd: '.' });
		if (pkg.tests.length) add({ label: `vitest ${pkg.name} ${pkg.tests.join(' ')}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', ...pkg.tests], cwd: '.' });
	}

	if (!test || test.endsWith('.py')) return tasks;
	if (!test.endsWith('.ts')) return [...tasks, { label: 'check', missing: `PLAN.md row check "${test}" is not runnable — use \`repro\`, one repo-rooted test path, or — (fence only)` }];
	// verification/ drives the running app: wf check starts the stack first (stack: true, check.ts).
	if (test.startsWith('verification/')) add({ label: `playwright ${test}`, cmd: 'pnpm', args: ['exec', 'playwright', 'test', test], cwd: '.', stack: true });
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
export function realPkgFor(toplevel: string): PkgFor {
	const cache = new Map<string, Pkg | null>();
	return (file) => {
		let dir = dirname(join(toplevel, file));
		const stop = join(toplevel, 'packages', 'frontend');
		while (dir.startsWith(stop) && dir !== stop) {
			if (!cache.has(dir)) {
				const manifest = join(dir, 'package.json');
				cache.set(dir, existsSync(manifest) ? { name: (JSON.parse(readFileSync(manifest, 'utf8')) as { name: string }).name, dir: relative(toplevel, dir).replace(/\\/g, '/'), svelte: existsSync(join(dir, 'svelte.config.js')) } : null);
			}
			if (cache.get(dir)) return cache.get(dir)!;
			dir = dirname(dir);
		}
		return null;
	};
}
