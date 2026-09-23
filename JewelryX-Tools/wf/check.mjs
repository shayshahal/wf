#!/usr/bin/env node
// check.mjs — wf check: the implementer's gate (prompts/implement.md step 2).
// Silent + exit 0 on green; on red only the failing command and the last 40 lines
// of its output, exit 1. Everything is derived from the working-tree diff and the
// PLAN.md row `wf prompt implement N` recorded in .wf/state.json:
//   fence   — no file outside row N's `files` cell may have changed
//   backend — ruff check + ruff format --check, pytest for the changed tests
//   frontend— svelte-check for the touched packages, vitest for the changed tests
//   check   — the row's own `check` cell: `repro` (RESEARCH.md) or a test path
// Every run appends one JSON line to .wf/checks.log (row, the row's check, each task's exit,
// green|red). The validate agent reads that, never the commit message: "the check was run"
// is then observed, not claimed (llm-as-a-verifier: trust observed output, not narration).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { planCommitRows, rowFiles } from './prompt.mjs';
import { readState, roundOf, toplevelOf } from './state.mjs';

const TAIL = 40;
// `pnpm` is a .cmd shim on Windows, so its runs need shell:true; Node then prints DEP0190
// on every spawn, which would break "silent on green". The argv here is paths wf itself
// derived from PLAN.md, never a user string.
process.noDeprecation = true;

// Everything the working tree has moved: unstaged, staged and untracked, repo-relative.
export function changedFiles(toplevel) {
	const git = (args) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
	return [...new Set([...git(['diff', '--name-only', 'HEAD']), ...git(['diff', '--name-only', '--cached']), ...git(['ls-files', '--others', '--exclude-standard'])])].sort();
}

// The round's own paperwork is never fenced: the implementer writes BLOCKED.md and
// `wf prompt` rewrites state while the commit is open. `wf design` writes SPEC.md and
// SPEC-REVIEW.md at the worktree root, `wf review` writes REVIEW.md there (TJEW-700: every class B
// commit was fenced on them).
const ROOT_PAPERWORK = new Set(['SPEC.md', 'SPEC-REVIEW.md', 'REVIEW.md']);
export const isRoundPaperwork = (file, folder) => file.startsWith('.wf/') || ROOT_PAPERWORK.has(file) || (folder && file.startsWith(folder.replace(/\\/g, '/').replace(/\/?$/, '/')));

export function fenceViolations(changed, allowed, folder) {
	const ok = new Set(allowed);
	return changed.filter((f) => !isRoundPaperwork(f, folder) && !ok.has(f));
}

// `command: <line>` under `## Repro` in RESEARCH.md.
export function reproCommand(text) {
	const body = text.replace(/\r\n/g, '\n');
	const section = /^## Repro[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
	const m = section && /^command:[ \t]*(.+)$/m.exec(section[1]);
	return m ? m[1].trim().replace(/^`|`$/g, '') : null;
}

// Split a command line on whitespace, honouring "double quotes" — enough for the one
// line RESEARCH.md checks in; no shell is involved anywhere in wf.
export function tokenize(line) {
	return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

const isPyTest = (f) => /(^|\/)tests?\//.test(f) || /(^|\/)test_[^/]+\.py$/.test(f);
const isJsTest = (f) => /\.(test|spec)\.[cm]?[jt]s$/.test(f);

// Pure: the commands to run, in order. `pkgFor(file)` returns { name, dir, svelte } for a
// frontend file or null; `repro` is the RESEARCH.md command line (or null).
export function buildTasks({ changed, row, pkgFor, repro }) {
	const tasks = [];
	const add = (t) => { if (!tasks.some((x) => x.label === t.label)) tasks.push(t); };
	const backend = changed.filter((f) => f.startsWith('packages/backend/') && f.endsWith('.py'));
	const rel = (f) => (f.startsWith('packages/backend/') ? f.slice('packages/backend/'.length) : f);
	if (backend.length) {
		add({ label: `ruff check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'check', ...backend.map(rel)], cwd: 'packages/backend' });
		add({ label: `ruff format --check ${backend.map(rel).join(' ')}`, cmd: 'uv', args: ['run', '--frozen', 'ruff', 'format', '--check', ...backend.map(rel)], cwd: 'packages/backend' });
	}
	// The command is the first `code span` when there is one — a cell may add a note after it
	// (TJEW-700 row 6: "`vitest run …ts` (fixture carries …)" took `number)` as the path).
	const cell = row?.check ?? '';
	// A cell that starts with — (or -) is fence only, whatever note follows it (TJEW-682 rows 1 and 5
	// carried a code span in the note, which was then read as the command).
	const check = /^\s*[—-]/.test(cell) ? '' : (/`([^`]+)`/.exec(cell)?.[1] ?? cell).trim();
	// The cell is a command (`pytest packages/backend/tests/x.py`, `vitest run …/x.test.ts`):
	// the path is its last word (TJEW-700: the whole cell was sliced as a path → `ackend/tests/…`).
	const checkPath = check.split(/\s+/).pop() ?? '';
	const pytests = backend.filter(isPyTest);
	if (checkPath.endsWith('.py') && !pytests.includes(checkPath)) pytests.push(checkPath);
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

	if (check === 'repro') {
		if (!repro) return [...tasks, { label: 'repro', missing: 'RESEARCH.md ## Repro has no `command:` line' }];
		const [cmd, ...args] = tokenize(repro);
		add({ label: repro, cmd, args, cwd: '.' });
	} else if (checkPath.endsWith('.ts')) {
		if (checkPath.startsWith('verification/')) add({ label: `playwright ${checkPath}`, cmd: 'pnpm', args: ['exec', 'playwright', 'test', checkPath], cwd: '.' });
		else {
			// vitest lives in the package, not at the root (TJEW-700 row 3: `Command "vitest" not found`).
			const pkg = checkPath.startsWith('packages/frontend/') ? pkgFor(checkPath) : null;
			if (pkg) { const t = relative(pkg.dir, checkPath).replace(/\\/g, '/'); add({ label: `vitest ${pkg.name} ${t}`, cmd: 'pnpm', args: ['--filter', pkg.name, 'exec', 'vitest', 'run', t], cwd: '.' }); }
			else add({ label: `vitest ${checkPath}`, cmd: 'pnpm', args: ['exec', 'vitest', 'run', checkPath], cwd: '.' });
		}
	} else if (check && !checkPath.endsWith('.py')) {
		// A cell wf cannot run used to pass with no check at all (TJEW-682: `repro --grep …`).
		return [...tasks, { label: 'check', missing: `PLAN.md row check "${cell}" is not runnable — use \`repro\`, one repo-rooted test path, or — (fence only)` }];
	}
	return tasks;
}

// Nearest package.json above a frontend file; svelte-check only where a svelte.config lives.
// `dir` comes back repo-relative, because buildTasks makes test paths relative to it.
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

// Pure: the checks.log line for one run.
export function checkRunLine({ ts, row, rowCheck, tasks, result }) {
	return JSON.stringify({ ts, row, rowCheck, tasks, result });
}

export function runCheck() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const changed = changedFiles(toplevel);
	const ran = [];
	const logRun = (result) => {
		mkdirSync(join(toplevel, '.wf'), { recursive: true });
		appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: state?.commit ?? null, rowCheck: row?.check ?? null, tasks: ran, result })}\n`);
	};
	let row = null;
	if (state?.commit && folder && existsSync(join(toplevel, folder, 'PLAN.md'))) {
		row = planCommitRows(readFileSync(join(toplevel, folder, 'PLAN.md'), 'utf8')).find((r) => r.n === Number(state.commit)) ?? null;
		const violations = fenceViolations(changed, rowFiles(row), folder);
		if (violations.length) {
			for (const f of violations) console.error(`fence: ${f} is not in PLAN.md row ${state.commit}`);
			ran.push({ label: 'fence', exit: 1 });
			logRun('red');
			process.exit(1);
		}
	}
	const research = join(toplevel, folder ?? '', 'RESEARCH.md');
	const repro = existsSync(research) ? reproCommand(readFileSync(research, 'utf8')) : null;
	for (const task of buildTasks({ changed, row, pkgFor: realPkgFor(toplevel), repro })) {
		if (task.missing) {
			console.error(`check: ${task.missing}`);
			ran.push({ label: task.label, exit: null, missing: task.missing });
			logRun('red');
			process.exit(1);
		}
		const run = spawnSync(task.cmd, task.args, { cwd: join(toplevel, task.cwd), encoding: 'utf8', shell: process.platform === 'win32' });
		ran.push({ label: task.label, exit: run.status });
		if (run.status === 0) continue;
		console.error(`FAILED: ${task.cmd} ${task.args.join(' ')}`);
		console.error(`${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').slice(-TAIL).join('\n').trimEnd());
		logRun('red');
		process.exit(1);
	}
	logRun('green');
}

// basename, not endsWith: `deliver.selfcheck.mjs` ends with `check.mjs` too.
if (process.argv[1] && basename(process.argv[1]) === 'check.mjs') runCheck();
