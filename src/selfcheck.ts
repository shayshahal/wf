#!/usr/bin/env node
// selfcheck.ts — node src/selfcheck.ts: every *.selfcheck.ts in wf and its projects, tsc over all of
// wf, and eslint (lint-kit's error-handling set, eslint.config.js). Explicit relative selfcheck paths
// select a focused development run; `--changed [ref]` selects the checks whose static imports reach a
// file changed since `ref` (default origin/main) or in the working tree; no arguments runs the complete
// suite manually. Print each completed check's time; on red retain the failing files' output and exit 1.
// Bounded: at most WF_SELFCHECK_JOBS checks run at once (default min(6, cpus/4): every check spawns
// real git and node processes, and 86 at once only fight over the disk), and a check still running
// after WF_SELFCHECK_TIMEOUT_S seconds (default 300) is killed with its children and reported TIMEOUT.
// Run from the editing clone: review.selfcheck.ts needs a git checkout, and tsc needs
// `npm ci` (wf runs on Node alone; its dev dependencies are only for this check).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { WF_ROOT } from './paths.ts';

type Result = { file: string; code: number | null; out: string };

const root = WF_ROOT;
const under = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? under(join(dir, e.name)) : e.name.endsWith('.selfcheck.ts') ? [join(dir, e.name)] : []);
// The kit (src/, projects/) and Shay's env (env/).
const files = ['src', 'projects', 'env', 'bin'].flatMap((d) => under(join(root, d)));
const labels = new Set(files.map((file) => relative(root, file).replace(/\\/g, '/')));
const argv = process.argv.slice(2);
const changedAt = argv.indexOf('--changed');
// `--changed` takes an optional ref: the next argument unless it is a selfcheck path.
const refArg = changedAt >= 0 ? argv[changedAt + 1] : undefined;
const changedRef = refArg && !refArg.endsWith('.ts') && !refArg.startsWith('--') ? refArg : 'origin/main';
const positional = argv.filter((a, i) => a !== '--changed' && !(changedAt >= 0 && i === changedAt + 1 && a === changedRef));
const requested = [...new Set(positional.map((arg) => arg.replace(/\\/g, '/').replace(/^\.\//, '')))];
const unknown = requested.filter((label) => !labels.has(label));
if (unknown.length) {
	console.error(`selfcheck: unknown selfcheck path: ${unknown.join(', ')}. Use existing paths relative to the wf root; no arguments runs the complete suite.`);
	process.exit(2);
}

// The relative files `file` imports, and those they import: a static `from './x.ts'` / `import './x.ts'`
// closure. A check that reaches a changed file is affected by it. A spawned `wf.mjs` is not followed, so
// a check that only drives the CLI is selected through its own imports, or by naming it.
const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const importsOf = (file: string): string[] => {
	if (!existsSync(file)) return [];
	return [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => resolvePath(dirname(file), m[1])).filter((f) => existsSync(f));
};
const closure = (file: string): Set<string> => {
	const seen = new Set<string>();
	const walk = (f: string) => { if (!seen.has(f)) { seen.add(f); importsOf(f).forEach(walk); } };
	walk(file);
	return seen;
};
// A git failure (unknown ref, not a checkout) stops the run: an empty list would read as 'nothing changed'.
const changedFiles = (): string[] => {
	const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	return [...new Set([...git(['diff', '--name-only', `${changedRef}...HEAD`]), ...git(['diff', '--name-only', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard'])])].map((f) => resolvePath(root, f));
};

let selected: string[];
if (changedAt >= 0) {
	const changed = new Set(changedFiles());
	// The runner itself or the toolchain config moved: every check is affected.
	const all = [...changed].some((f) => /[\\/]src[\\/]selfcheck\.ts$|[\\/](package\.json|tsconfig\.json)$/.test(f));
	const hit = files.filter((f) => all || [...closure(f)].some((c) => changed.has(c)));
	selected = [...new Set([...requested.map((label) => join(root, label)), ...hit])];
	console.log(`selfcheck: --changed vs ${changedRef} (${changed.size} files changed): ${selected.length} of ${files.length} files selected; full suite not run.`);
} else if (requested.length) {
	selected = requested.map((label) => join(root, label));
	console.log(`selfcheck: focused (${selected.length} of ${files.length} files); full suite not run.`);
} else selected = files;
const partial = selected.length !== files.length;

// Git runs a hook with GIT_DIR set, absolute in a linked worktree, and a check's temp repo then works
// on this one (2026-10-06, a push from a worktree: git-worktree.selfcheck.ts's `git init` set the
// clone's core.bare, its `base` commit landed on the pushed branch, its `round/mine` in the clone).
// Without them each check's git finds its repo from its cwd, as when it is run by hand.
// Fixture checkouts are not the calling T3 thread's workspace. Native checks supply their own
// local MCP credentials; inheriting the live host's would query it for every throwaway round.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('T3_') && !k.startsWith('T3CODE_')));
// Printed commands stay the full node line, whatever shims this machine has on its PATH (paths.ts).
env.WF_FULL_COMMAND = '1';

const jobs = Math.max(1, Number(process.env.WF_SELFCHECK_JOBS) || Math.min(6, Math.max(2, Math.floor(cpus().length / 4))));
const timeoutS = Number(process.env.WF_SELFCHECK_TIMEOUT_S) || 300;
const total = selected.length + 2; // + tsc, eslint
let finished = 0;
let running = 0;
const waiting: (() => void)[] = [];
const slot = () => new Promise<void>((go) => {
	if (running < jobs) { running++; go(); } else waiting.push(() => { running++; go(); });
});
const release = () => { running--; waiting.shift()?.(); };
// A check's children (the wf and git it spawns) go with it: taskkill /T on Windows, the process group elsewhere.
const killTree = (pid: number | undefined) => {
	if (!pid) return;
	if (process.platform === 'win32') { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; }
	try { process.kill(-pid, 'SIGKILL'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
};
const run = async (label: string, args: string[]) => {
	await slot();
	return new Promise<Result>((resolve) => {
		const started = performance.now();
		const child = spawn(process.execPath, args, { cwd: root, env, detached: process.platform !== 'win32' });
		let out = '';
		let timedOut = false;
		const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutS * 1000);
		child.stdout.on('data', (d) => { out += d; });
		child.stderr.on('data', (d) => { out += d; });
		child.on('close', (code) => {
			clearTimeout(timer);
			finished++;
			console.log(`selfcheck: ${timedOut ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL'} ${label} (${((performance.now() - started) / 1000).toFixed(1)}s) [${finished}/${total}]`);
			release();
			resolve({ file: label, code: timedOut ? 124 : code, out: timedOut ? `${out}\nTIMEOUT: killed after ${timeoutS}s (WF_SELFCHECK_TIMEOUT_S)` : out });
		});
	});
};

// Node strips the types without reading them, so a wrong one only shows here.
const TSC = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const typecheck = existsSync(TSC)
	? run('tsc', [TSC, '-p', root])
	: Promise.resolve({ file: 'tsc', code: 1, out: 'no node_modules/typescript: run `npm ci` in this clone' });
// lint-kit's error-handling set (eslint.config.js): a catch that drops the error says why, or is fixed.
const ESLINT = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const lint = existsSync(ESLINT)
	? run('eslint', ['--disable-warning=ExperimentalWarning', ESLINT, root])
	: Promise.resolve({ file: 'eslint', code: 1, out: 'no node_modules/eslint: run `npm ci` in this clone' });

console.log(`selfcheck: ${total} checks (tsc and eslint included), ${jobs} at a time, ${timeoutS}s each`);
const t0 = Date.now();
const results = await Promise.all([...selected.map((f) => run(relative(root, f).replace(/\\/g, '/'), [f])), typecheck, lint]);
const red = results.filter((r) => r.code !== 0);
for (const r of red) console.error(`\n── FAIL ${r.file}\n${r.out.split('\n').filter((l) => !l.startsWith('  ok ')).join('\n').trimEnd()}`);
console.log(`${red.length ? `${red.length} of ${results.length} selfchecks red` : `${results.length} selfchecks green`} (${partial ? 'focused; ' : ''}tsc and eslint included) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(red.length ? 1 : 0);
