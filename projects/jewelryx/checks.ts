// projects/jewelryx/checks.ts — wf check's commands for a JewelryX diff (index.ts checks):
//   backend  — ruff check + ruff format --check, pytest for the changed tests
//   frontend — check:fast (prep + svelte-check) for touched packages, vitest for changed tests
//   pre-commit — the repo's own lefthook pre-commit hook on the changed files, first, when it has one
//              (prettier, eslint and oxlint with --fix, ruff --fix: it rewrites and stages what it fixes)
//   oracle-guard — refused outright when the round's diff against the base touches the oracle (below)
//   pre-push — the repo's own lefthook pre-push hook on the changed files, when it has one (it runs
//              the stricter prepared check, so check:fast above is dropped then)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { CheckTask } from '../../src/gates/check.ts';

// ── the oracle guard ─────────────────────────────────────────────────────────

// JewelryX's lefthook `oracle-guard` (scripts/oracle-guard.mjs, a pre-push command with no glob)
// fails any fix/* or feat/* branch whose COMMITTED diff against origin/dev touches verification/ or
// JewelryX-Tools/: "product branches never edit the oracle; coverage lands via cr-to-tests /
// bugs-to-tests on a verification/* branch". BJEW-617 (2026-10-06): the plan's row 1 edited
// verification/tests/login-relogin.spec.ts, and nothing said no until row 2's `wf check`. Row 1's own
// check had run `lefthook pre-push` green, because the guard reads base...HEAD and row 1's edit was
// not committed yet; at row 2 it was, and the guard named row 1. Two places say it earlier: the agreement's
// verification cases (oracleCaseGap) and protectedFilesGap (the actual changed files).
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

export type Pkg = { name: string; dir: string; svelte: boolean };
export type PkgFor = (file: string) => Pkg | null;

const isPyTest = (f: string) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
const isJsTest = (f: string) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);

/** Optional affected commands; existing files only, with hooks when this checkout has them. */
export function checkTasks({ changed, pkgFor, pushHook = false, onDisk = () => true }: { changed: string[]; pkgFor: PkgFor; pushHook?: boolean; onDisk?: (file: string) => boolean }): CheckTask[] {
	const tasks = affectedTasks({ changed, pkgFor, pushHook, onDisk });
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
function affectedTasks({ changed, pkgFor, pushHook, onDisk }: { changed: string[]; pkgFor: PkgFor; pushHook: boolean; onDisk: (file: string) => boolean }): CheckTask[] {
	const tasks: CheckTask[] = [];
	const add = (t: CheckTask) => {
		const i = tasks.findIndex((x) => x.label === t.label);
		if (i === -1) tasks.push(t);
	};
	const backend = changed.filter((f) => f.startsWith('packages/backend/') && f.endsWith('.py') && onDisk(f));
	const rel = (f: string) => (f.startsWith('packages/backend/') ? f.slice('packages/backend/'.length) : f);
	if (backend.length) {
		add({ label: `ruff check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'check', ...backend.map(rel)], cwd: 'packages/backend' });
		add({ label: `ruff format --check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'format', '--check', ...backend.map(rel)], cwd: 'packages/backend' });
	}
	const pytests = backend.filter(isPyTest);
	if (pytests.length) add({ label: `pytest ${pytests.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'pytest', ...pytests.map(rel)], cwd: 'packages/backend' });
	const pkgs = new Map<string, Pkg & { tests: string[] }>();
	for (const f of changed.filter((f) => f.startsWith('packages/frontend/'))) {
		const pkg = pkgFor(f);
		if (!pkg) continue;
		if (!pkgs.has(pkg.name)) pkgs.set(pkg.name, { ...pkg, tests: [] });
		if (isJsTest(f) && onDisk(f)) pkgs.get(pkg.name)!.tests.push(relative(pkg.dir, f).replace(/\\/g, '/'));
	}
	for (const pkg of pkgs.values()) {
		if (pkg.svelte && !pushHook) add({ label: `check:fast ${pkg.name}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'check:fast'], cwd: '.' });
		if (pkg.tests.length) add({ label: `vitest ${pkg.name} ${pkg.tests.join(' ')}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', ...pkg.tests], cwd: '.' });
	}

	return tasks;
}

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
