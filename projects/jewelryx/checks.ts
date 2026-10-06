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
export function checkTasks({ changed, test, pkgFor, pushHook = false, onDisk = () => true, stackEnv = {} }: { changed: string[]; test: string | null; pkgFor: PkgFor; pushHook?: boolean; onDisk?: (file: string) => boolean; stackEnv?: Record<string, string> }): CheckTask[] {
	const tasks = rowTasks({ changed, test, pkgFor, pushHook, stackEnv });
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

function rowTasks({ changed, test, pkgFor, pushHook, stackEnv }: { changed: string[]; test: string | null; pkgFor: PkgFor; pushHook: boolean; stackEnv: Record<string, string> }): CheckTask[] {
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
	// Playwright is installed only in verification/node_modules, so the root has no `playwright` (BJEW-617
	// row 1, 2026-10-06: `Command "playwright" not found`): `pnpm --dir verification exec`, as the repro
	// runs. That config's defaults are localhost:3000/:3001, not this round's stack (its pre-flight then
	// refuses), so the stack's own URLs (.verify-stack.env, as the repro config reads them) go in the env.
	if (test.startsWith('verification/')) add({ label: `playwright ${test}`, cmd: 'pnpm', args: ['--dir', 'verification', 'exec', 'playwright', 'test', test], cwd: '.', env: stackEnv, stack: true });
	else {
		// vitest lives in the package, not at the root (TJEW-700 row 3: `Command "vitest" not found`).
		const pkg = test.startsWith('packages/frontend/') ? pkgFor(test) : null;
		if (pkg) { const t = relative(pkg.dir, test).replace(/\\/g, '/'); add({ label: `vitest ${pkg.name} ${t}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', t], cwd: '.' }); }
		else add({ label: `vitest ${test}`, cmd: 'pnpm', args: ['exec', 'vitest', 'run', test], cwd: '.' });
	}
	return tasks;
}

export type Suite = 'backend' | 'admin' | 'b2b';

// Pure: the whole suites (index.ts suites) whose tests can load what the round's diff changed: a
// package's own files, and for the two apps also the shared packages both depend on
// (packages/frontend/shared: @jewelryx/data, filters, types, ui) and the root's JS config. The
// backend depends on none of those. Docs, round folders and verification/ load into no suite.
export function suitesTouched(changed: string[]): Suite[] {
	const touched = new Set<Suite>();
	const apps = () => { touched.add('admin'); touched.add('b2b'); };
	for (const f of changed) {
		if (f.startsWith('packages/backend/')) touched.add('backend');
		else if (f.startsWith('packages/frontend/admin/')) touched.add('admin');
		else if (f.startsWith('packages/frontend/b2b/')) touched.add('b2b');
		else if (f.startsWith('packages/frontend/') || ROOT_JS.test(f)) apps();
		else if (f.startsWith('packages/')) { apps(); touched.add('backend'); }
	}
	return (['backend', 'admin', 'b2b'] as const).filter((s) => touched.has(s));
}
const ROOT_JS = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json|openapi\.json|openapi-ts\.config\.ts)$/;

// Pure: the KEY=value lines of a .verify-stack.env (round.ts verifyStackEnv), comments skipped.
export function parseStackEnv(text: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
	}
	return env;
}

// Pure: the env that points a verification/ spec's actors at the round's seeded users. The spec
// defaults (verification/tests/support/env.ts) are verification-owner@ / verification-supplier@, made
// by hand with a script and absent from a round's database, so every owner login was a 401 (BJEW-617
// row 1, 2026-10-06; JewelryX #306 had set them by hand). Owner = the seed's store owner (buyer),
// supplier = its supplier-role user (seller); the admin default already is the seed's admin.
export function seedActorsEnv(logins: { buyer: [string, string]; seller: [string, string] }): Record<string, string> {
	return { B2B_OWNER_EMAIL: logins.buyer[0], B2B_OWNER_PASSWORD: logins.buyer[1], B2B_SUPPLIER_EMAIL: logins.seller[0], B2B_SUPPLIER_PASSWORD: logins.seller[1] };
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
