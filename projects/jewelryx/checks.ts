// projects/jewelryx/checks.ts — wf check's commands for a JewelryX diff (index.ts checks):
//   backend  — ruff check + ruff format --check, pytest for the changed tests
//   frontend — svelte-check for the touched packages, vitest for the changed tests
//   test     — the verification case's test path: pytest, vitest in its package, or playwright under verification/
//   pre-commit — the repo's own lefthook pre-commit hook on the changed files, first, when it has one
//              (prettier, eslint and oxlint with --fix, ruff --fix: it rewrites and stages what it fixes)
//   oracle-guard — refused outright when the round's diff against the base touches the oracle (below)
//   pre-push — the repo's own lefthook pre-push hook on the changed files, when it has one (it runs
//              the stricter svelte-check, so the --tsgo one above is dropped then)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CheckTarget, CheckTask } from '../../src/gates/check.ts';

// ── the oracle guard ─────────────────────────────────────────────────────────

// JewelryX's lefthook `oracle-guard` (scripts/oracle-guard.mjs, a pre-push command with no glob)
// fails any fix/* or feat/* branch whose COMMITTED diff against origin/dev touches verification/ or
// JewelryX-Tools/: "product branches never edit the oracle; coverage lands via cr-to-tests /
// bugs-to-tests on a verification/* branch". BJEW-617 (2026-10-06): the plan's row 1 edited
// verification/tests/login-relogin.spec.ts, and nothing said no until row 2's `wf check`. Row 1's own
// check had run `lefthook pre-push` green, because the guard reads base...HEAD and row 1's edit was
// not committed yet; at row 2 it was, and the guard named row 1. Two places say it earlier: the agreement's
// verification cases (oracleCaseGap) and each case's check (oracleGuardTask, on the working tree).
export const PRODUCT_BRANCH = /^(fix|feat)\//;
const ORACLE_PATH = /^(verification|JewelryX-Tools)\//;
export const oracleEdits = (files: string[]): string[] => files.filter((f) => ORACLE_PATH.test(f));
const ORACLE_RULE = "JewelryX's lefthook oracle-guard (scripts/oracle-guard.mjs) fails any fix/* or feat/* branch whose diff against origin/dev touches verification/ or JewelryX-Tools/ (product branches never edit the oracle)";
const ORACLE_WAY = 'coverage for them lands via bugs-to-tests / cr-to-tests on a verification/* branch: take them out of the cases and record that exclusion in the agreement';

// Pure: null, or why the agreement's verification cases cannot pass the oracle guard. A case that
// reverts is let through: on a branch that already carries an oracle edit, undoing it is how the guard
// goes green (BJEW-617's revised plan had exactly that undo, 2026-10-06).
export function oracleCaseGap({ branch, rows }: { branch: string | null; rows: { n: number; message: string; files: string[] }[] }): string | null {
	if (!branch || !PRODUCT_BRANCH.test(branch)) return null;
	const bad = rows.filter((r) => !/^`?revert(?![a-z])/i.test(r.message)).flatMap((r) => oracleEdits(r.files).map((f) => `row ${r.n}: ${f}`));
	return bad.length ? `The agreement lists oracle files on ${branch}: ${bad.join(', ')}. ${ORACLE_RULE}; ${ORACLE_WAY}` : null;
}

// Pure: the refusal `wf check` makes when the working tree's diff against the base (`touched`, the
// oracle files of it) would fail the guard at the next push, or null. The guard itself, run by the
// pre-push hook in checkTasks, only sees commits.
export function oracleGuardTask(touched: string[]): CheckTask | null {
	return touched.length ? { label: 'oracle-guard', missing: `${touched.join(', ')} differ from the base. ${ORACLE_RULE}. Leave them out of this commit (git checkout origin/dev -- <file>) and record the verification blocker in BLOCKED.md: coverage for them lands via bugs-to-tests / cr-to-tests on a verification/* branch` } : null;
}

export type Pkg = { name: string; dir: string; svelte: boolean };
export type PkgFor = (file: string) => Pkg | null;

const isPyTest = (f: string) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
const isJsTest = (f: string) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);

// A test id is a name, but vitest's `-t` and playwright's `-g` read it as a regular expression. The
// #109 review hit `-g "amount (EUR)"`, which also selects `amount EUR` (the group matches nothing),
// so the test the row names was never selected and an unrelated case reported `1 passed`. Every
// RegExp metacharacter is escaped, so the selector only matches the literal characters the row named;
// duplicates the row's own punctuation creates (`` . `` for any one character) are gone. vitest
// matches the test's own name, so its selector is anchored (measured on vitest 5.0.1: `-t
// "^amount \\(EUR\\)$"` runs that one case, `-t "amount (EUR)"` runs `amount EUR`). playwright's `-g`
// matches the project, file and title together, so anchoring would invent a prefix the framework does
// not have (measured on playwright 1.61.1: `-g account` selects by file, `-g "^amount \\(EUR\\)$"`
// finds nothing).
export function selectorLiteral(id: string, anchored = false): string {
	const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return anchored ? `^${escaped}$` : escaped;
}

// Pure: the commands to run, in order. `pkgFor(file)` returns { name, dir, svelte } for a frontend
// file or null; `target` is the plan row's check cell (its repo-relative test path, the intended test
// id and assertion line, and whether the row is a `refactor:`) or null; `pushHook`: the repo has a
// lefthook.yml; `onDisk(file)`: the file is still there (not deleted by the diff).
// `oracleTouched`: the oracle files the working tree differs from the base in, on a fix/ or feat/
// branch (index.ts), else empty.
export function checkTasks({ changed, target, pkgFor, pushHook = false, onDisk = () => true, stackEnv = {}, oracleTouched = [] }: { changed: string[]; target: CheckTarget | null; pkgFor: PkgFor; pushHook?: boolean; onDisk?: (file: string) => boolean; stackEnv?: Record<string, string>; oracleTouched?: string[] }): CheckTask[] {
	const oracle = oracleGuardTask(oracleTouched);
	if (oracle) return [oracle];
	const tasks = rowTasks({ changed, target, pkgFor, pushHook, stackEnv, onDisk });
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
	// Deleted files are left out here too, as the push leaves them out: JewelryX's pre-push `files:` is
	// `git diff --name-only --diff-filter=ACMR origin/dev...HEAD`, because prettier and vitest cannot be
	// handed a path that no longer exists. TJEW-670 row 2 (2026-10-06) deleted two routes, got
	// `prettier --check` exit 2 ("No files matching the pattern were found") from frontend-format, and
	// `wf check` went red twice on a row whose only fault was deleting files. A row that only deletes
	// passes no `--file`: lefthook then reads its own `files:` (the committed ACMR diff, the earlier rows),
	// as the real push would once this row is committed; oracle-guard (no glob) and fallow-audit (reads
	// the working tree, so it still sees the deletion) run either way.
	return [...preCommit, ...tasks, { label: 'lefthook pre-push', cmd: 'pnpm', args: ['exec', 'lefthook', 'run', 'pre-push', ...present.flatMap((f) => ['--file', f])], cwd: '.' }];
}

// A deleted file is a change (the fence counts it) but no argument: ruff exits with E902 and vitest with
// "No test files found" on a path that is gone (JX-1221 row 15, 2026-10-08, a row that `git rm`s a test).
// A deleted frontend file still puts its package through svelte-check, whose imports it may have broken.
// The row's own test gets its own task that selects the named test id, so its result is about that one
// case, not a suite total (#109: `1 passed, 1 skipped` cannot say whether the selected case ran).
function rowTasks({ changed, target, pkgFor, pushHook, stackEnv, onDisk }: { changed: string[]; target: CheckTarget | null; pkgFor: PkgFor; pushHook: boolean; stackEnv: Record<string, string>; onDisk: (file: string) => boolean }): CheckTask[] {
	const tasks: CheckTask[] = [];
	const test = target?.file ?? null;
	const id = target?.id ?? null;
	const add = (t: CheckTask) => {
		const i = tasks.findIndex((x) => x.label === t.label);
		if (i === -1) tasks.push(t);
		else if (t.redBase) tasks[i] = { ...tasks[i], redBase: true } as CheckTask;
	};
	const backend = changed.filter((f) => f.startsWith('packages/backend/') && f.endsWith('.py') && onDisk(f));
	const rel = (f: string) => (f.startsWith('packages/backend/') ? f.slice('packages/backend/'.length) : f);
	if (backend.length) {
		add({ label: `ruff check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'check', ...backend.map(rel)], cwd: 'packages/backend' });
		add({ label: `ruff format --check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'format', '--check', ...backend.map(rel)], cwd: 'packages/backend' });
	}
	const pytests = backend.filter(isPyTest);
	if (test?.endsWith('.py') && !pytests.includes(test)) pytests.push(test);
	if (pytests.length) add({ label: `pytest ${pytests.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'pytest', ...pytests.map(rel)], cwd: 'packages/backend' });
	// The row's own test, selected by id: the run's report is about that one test. pytest selects
	// `path::id` and prints a `PASSED <nodeid>` line with `-rA`; vitest and playwright select by an
	// escaped name literal (`-t`/`-g`) with the path left as it is, and `--reporter=verbose`/`list` so
	// the report names the one case that ran (#109 review).
	if (test?.endsWith('.py')) add({ label: `pytest ${rel(test)}${id ? `::${id}` : ''}`, cmd: 'uv', args: ['run', '--frozen', 'pytest', `${rel(test)}${id ? `::${id}` : ''}`, ...(id ? ['-rA'] : [])], cwd: 'packages/backend', redBase: true });

	const pkgs = new Map<string, Pkg & { tests: string[] }>();
	for (const f of changed.filter((f) => f.startsWith('packages/frontend/'))) {
		const pkg = pkgFor(f);
		if (!pkg) continue;
		if (!pkgs.has(pkg.name)) pkgs.set(pkg.name, { ...pkg, tests: [] });
		if (isJsTest(f) && onDisk(f)) pkgs.get(pkg.name)!.tests.push(relative(pkg.dir, f).replace(/\\/g, '/'));
	}
	for (const pkg of pkgs.values()) {
		if (pkg.svelte && !pushHook) add({ label: `svelte-check ${pkg.name}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'svelte-check', '--threshold', 'error', '--incremental', '--tsgo'], cwd: '.' });
		if (pkg.tests.length) add({ label: `vitest ${pkg.name} ${pkg.tests.join(' ')}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', ...pkg.tests], cwd: '.' });
	}

	if (!test || test.endsWith('.py')) return tasks;
	if (!test.endsWith('.ts')) return [...tasks, { label: 'check', missing: `Verification check "${test}" is not runnable — use \`repro\` or one repo-rooted test path with its named assertion` }];
	// verification/ drives the running app: wf check starts the stack first (stack: true, check.ts).
	// Playwright is installed only in verification/node_modules, so the root has no `playwright` (BJEW-617
	// row 1, 2026-10-06: `Command "playwright" not found`). The task runs in verification and hands the
	// runner the verification-relative path, so the declared cwd IS the runner's cwd: its report prints
	// `tests/…` and evidence.ts's sameTestFile resolves that against the task's cwd to the row's repo
	// path exactly. Running from the root with `pnpm --dir verification` left the declared cwd `.` while
	// the runner's cwd was verification, so a passing report named `tests/account.spec.ts` and the row
	// was refused as unavailable (issue #109, 2026-10-09). That config's defaults are localhost:3000/:3001,
	// not this round's stack (its pre-flight then refuses), so the stack's own URLs (.verify-stack.env,
	// as the repro config reads them) go in the env. `--reporter=json` is the framework's own machine
	// report: the suite tree gives the real describe/title path (the row's id is its space-joined
	// canonical form, what `-g` matches) and each failed result the absolute assertion location, so
	// evidence.ts binds the origin to `toplevel + target.file` instead of parsing the list text
	// (#109 review, 2026-10-09).
	if (test.startsWith('verification/')) {
		const local = relative('verification', test).replace(/\\/g, '/');
		add({ label: `playwright ${test}${id ? ` ${id}` : ''}`, cmd: 'pnpm', args: ['exec', 'playwright', 'test', local, ...(id ? ['-g', selectorLiteral(id)] : []), '--reporter=json'], cwd: 'verification', env: stackEnv, stack: true, redBase: true });
	} else {
		// vitest lives in the package, not at the root (TJEW-700 row 3: `Command "vitest" not found`).
		// The row's own test carries `--reporter=verbose` by id, so the report names the one case that
		// ran rather than a suite total (#109 review): the pass verdict requires that positive identity.
		// The task runs in the package and hands the runner the package-relative path, so the declared
		// cwd is the cwd `pnpm --filter … exec` would have used, and evidence.ts resolves the printed
		// path to the row's repo path through the task's cwd (issue #109, 2026-10-09).
		const pkg = test.startsWith('packages/frontend/') ? pkgFor(test) : null;
		if (pkg) { const t = relative(pkg.dir, test).replace(/\\/g, '/'); add({ label: `vitest ${pkg.name} ${t}${id ? ` ${id}` : ''}`, cmd: 'pnpm', args: ['exec', 'vitest', 'run', t, ...(id ? ['-t', selectorLiteral(id, true), '--reporter=verbose'] : [])], cwd: pkg.dir, redBase: true }); }
		else add({ label: `vitest ${test}${id ? ` ${id}` : ''}`, cmd: 'pnpm', args: ['exec', 'vitest', 'run', test, ...(id ? ['-t', selectorLiteral(id, true), '--reporter=verbose'] : [])], cwd: '.', redBase: true });
	}
	return tasks;
}

export type Suite = 'backend' | 'admin' | 'b2b';

// Pure: the whole suites (index.ts suites) whose tests can load or read what the round's diff
// changed: a package's own files; for the two apps also the shared packages both depend on
// (packages/frontend/shared: @jewelryx/data, filters, types, ui) and the root's JS config. Tests also
// read other packages' files as text, which no import graph shows, so those edges are listed here
// (measured 2026-10-06): the apps' contract tests read backend models (a new AuditAction member in
// backend/app/models/audit_log.py failed admin's activity-label-coverage.test.ts; b2b's
// notification-routes.test.ts reads models/notification.py), and backend's test_media_upload_limits.py
// reads both apps' Dockerfiles and terraform/env-*.tfvars. Docs, round folders and verification/
// reach no suite. A whole suite, not the tests importing the change: 24 of admin's 73 test files read
// source as text, and `vitest related` missed 2 of 2 when a route they read was emptied and 1 of 1
// when a translation key was renamed, while saving little once it picked anything (36 s to 28 s).
export function suitesTouched(changed: string[]): Suite[] {
	const touched = new Set<Suite>();
	const apps = () => { touched.add('admin'); touched.add('b2b'); };
	for (const f of changed) {
		if (f.startsWith('packages/backend/')) { touched.add('backend'); apps(); }
		else if (/^packages\/frontend\/(admin|b2b)\/Dockerfile$/.test(f)) { touched.add('backend'); touched.add(f.includes('/admin/') ? 'admin' : 'b2b'); }
		else if (f.startsWith('terraform/')) touched.add('backend');
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
