#!/usr/bin/env node
// check.ts — wf check: the implementer's gate (prompts/implement.md step 2).
// Silent + exit 0 on green; on red only the failing command and the last 40 lines
// of its output, exit 1. Everything is derived from the working-tree diff and the
// PLAN.md row `wf prompt implement N` recorded in .wf/state.json:
//   fence   — no file outside row N's `files` cell may have changed
//   project — the project's commands for the changed files and the row's test path (project.ts checks)
//   repro   — the row's `check` cell `repro`: the command RESEARCH.md records. A row that only
//             edits the repro runs it too, and it must be red: that run is the round's before-the-fix
//             measurement, its output kept in checks.log (TJEW-670: the repro was fixed in a row
//             checked `—`, and two of four subitems never had a red run)
// `wf check --suites` (before validate, wf next): the project's whole test suites side by side, on a
// committed HEAD; one checks.log line (row `suites`, the head it measured, each red task's output
// tail) that validate reads and wf next keys on. Not a commit gate: it measures what the round has
// done to tests no row touched (2026-10-05: a change broke tests outside its commit checks, unseen
// until the next day's full-suite run).
// `wf check --repro` (research, prompts/research.md): RESEARCH.md's repro, three times; stable only when
// all three are red at the same place, in the round's repro files. Its line in checks.log (row
// `repro`, result stable|unstable|green|outside) carries the research brief's token, which `wf next`
// requires before plan.
// Every run appends one JSON line to .wf/checks.log (row, the row's check, each task's exit,
// green|red). The validate agent reads that, never the commit message: "the check was run"
// is then observed, not claimed (llm-as-a-verifier: trust observed output, not narration).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checks, suites } from '../project.ts';
import { planCommitRows, rowFiles } from '../round/prompt.ts';
import type { PlanRow } from '../round/prompt.ts';
import { readState, roundOf, toplevelOf } from '../round/state.ts';
import { ensureServers } from '../worktrees/serve.ts';

const TAIL = 40;
// `pnpm` is a .cmd shim on Windows, so its runs need shell:true; Node then prints DEP0190
// on every spawn, which would break "silent on green". The argv here is paths wf itself
// derived from PLAN.md, never a user string.
process.noDeprecation = true;

// One `wf check` command, or `missing`: the check the plan row names cannot run. The project's
// commands are these too (project.ts checks); `expectRed` only on the repro of a repro-only row.
// `stack`: the command drives the running app, so the worktree's stack is started (and answering)
// before it runs: nothing serves a worktree from its creation (2026-10-04, serve.ts).
export type CheckTask =
	| { label: string; cmd: string; args: string[]; cwd: string; env?: Record<string, string>; expectRed?: boolean; stack?: boolean; missing?: never }
	| { label: string; missing: string; cmd?: never; args?: never; cwd?: never; env?: never; expectRed?: never; stack?: never };
// One task's run, as checks.log records it.
export type CheckRun = { label: string; exit: number | null; missing?: string; expect?: 'red'; output?: string };

// Everything the working tree has moved: unstaged, staged and untracked, repo-relative.
export function changedFiles(toplevel: string) {
	const git = (args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
	return [...new Set([...git(['diff', '--name-only', 'HEAD']), ...git(['diff', '--name-only', '--cached']), ...git(['ls-files', '--others', '--exclude-standard'])])].sort();
}

// The round's own paperwork is never fenced: the implementer writes BLOCKED.md and
// `wf prompt` rewrites state while the commit is open. SPEC, SPEC-REVIEW and REVIEW are in the round
// folder too (until 2026-09-23 they sat at the worktree root, and TJEW-700's class B commits were
// fenced on them there).
export const isRoundPaperwork = (file: string, folder: string | null) => file.startsWith('.wf/') || (folder && file.startsWith(folder.replace(/\\/g, '/').replace(/\/?$/, '/')));

export function fenceViolations(changed: string[], allowed: string[], folder: string | null) {
	const ok = new Set(allowed);
	return changed.filter((f) => !isRoundPaperwork(f, folder) && !ok.has(f));
}

// `command: <line>` under `## Repro` in RESEARCH.md.
export function reproCommand(text: string) {
	const body = text.replace(/\r\n/g, '\n');
	const section = /^## Repro[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
	const m = section && /^command:[ \t]*(.+)$/m.exec(section[1]);
	return m ? m[1].trim().replace(/^`|`$/g, '') : null;
}

// Split a command line on whitespace, honouring "double quotes" — enough for the one
// line RESEARCH.md checks in; no shell is involved anywhere in wf.
export function tokenize(line: string) {
	return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

// Pure: a row's manual proof, when its `check` cell is `manual: <what to look at>` (prompts/plan.md),
// else null. A row whose only proof is a person looking is **fence only** at `wf check` — the fence and
// the project's checks still gate its commit — and this text is what T2 reads, as a `manual:` line
// beside the diff (`review-format.ts` renderHeader, review.ts). Case-insensitive on purpose: a cell
// read as a command would take its last word as a test path and run the wrong test.
export function manualCheck(cell: string | null | undefined): string | null {
	const m = /^\s*manual:[ \t]*(.+?)\s*$/i.exec(cell ?? '');
	return m && m[1] ? m[1] : null;
}

// Pure: the commands to run, in order. `projectTasks(test)` is the project's commands for the diff
// plus `test` (the row's test path, or null); `repro` is the RESEARCH.md command line (or null).
export function buildTasks({ row, projectTasks, repro, reproOnly = false }: { row: { check?: string } | null | undefined; projectTasks: (test: string | null) => CheckTask[]; repro: string | null; reproOnly?: boolean }): CheckTask[] {
	// The command is the first `code span` when there is one — a cell may add a note after it
	// (TJEW-700 row 6: "`vitest run …ts` (fixture carries …)" took `number)` as the path).
	const cell = row?.check ?? '';
	// A cell that starts with — (or -) is fence only, whatever note follows it (TJEW-682 rows 1 and 5
	// carried a code span in the note, which was then read as the command). So is a `manual:` cell: a
	// proof only a person can make has no command, and its last word is not a test path.
	const check = /^\s*[—-]/.test(cell) || manualCheck(cell) ? '' : (/`([^`]+)`/.exec(cell)?.[1] ?? cell).trim();
	// The cell is a command (`pytest packages/backend/tests/x.py`, `vitest run …/x.test.ts`):
	// the path is its last word (TJEW-700: the whole cell was sliced as a path → `ackend/tests/…`).
	const checkPath = check.split(/\s+/).pop() ?? '';
	const tasks = projectTasks(check && check !== 'repro' && !reproOnly ? checkPath : null);
	if (check !== 'repro' && !reproOnly) return tasks;
	if (!repro) return [...tasks, { label: 'repro', missing: 'RESEARCH.md ## Repro has no `command:` line' }];
	const [cmd, ...args] = tokenize(repro);
	// Research's repro reproduces the defect in the running app (prompts/research.md).
	return [...tasks, { label: repro, cmd, args, cwd: '.', stack: true, ...(reproOnly ? { expectRed: true } : {}) }];
}

// Pure: whether every file of a plan row is in the round's repro folder (a row that fixes the repro
// before the product fix).
const reproDir = (folder: string | null) => `${(folder ?? '').replace(/\\/g, '/').replace(/\/?$/, '/')}repro/`;
export function isReproOnly(files: string[], folder: string | null) {
	const dir = reproDir(folder);
	return Boolean(folder) && files.length > 0 && files.every((f) => f.startsWith(dir));
}

// Pure: the checks.log line for one run.
export function checkRunLine({ ts, row, rowCheck, tasks, result, token }: { ts: string; row: number | string | null; rowCheck: string | null; tasks: CheckRun[]; result: string; token?: string }) {
	return JSON.stringify({ ts, row, rowCheck, tasks, result, ...(token ? { token } : {}) });
}

// TJEW-665 (2026-09-28): the repro tapped before the page had hydrated, failed on its precondition
// instead of the defect, and blocked commit 2. A repro racing the page fails differently from run to
// run, or passes once; three runs red at one place is a repro that measures the defect.
export const REPRO_RUNS = 3;

// Pure: what a failing run failed on: its first error line and the first stack frame outside
// node_modules (file:line), colours and durations dropped. Two runs red for one reason share it.
export function failureSignature(output: string): string {
	const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
	const error = lines.find((l) => /^\s*(\w*Error|AssertionError)\b/.test(l))?.trim();
	const own = failureFrame(output);
	const frame = own && `${own.file.split('/').pop()}:${own.line}`;
	const signature = [error, frame].filter(Boolean).join(' @ ') || lines.filter((l) => l.trim()).at(-1)?.trim() || '';
	return signature.replace(/\s*\(\d+(\.\d+)?m?s\)/g, '');
}

// Pure: a failing run's first stack frame outside node_modules: its file (slashes forward) and line.
export function failureFrame(output: string): { file: string; line: string } | null {
	const m = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map((l) => /^\s*at (?:.*?\()?([^()]+?):(\d+):\d+\)?\s*$/.exec(l)).find((x) => x && !x[0].includes('node_modules'));
	return m ? { file: m[1].trim().replace(/\\/g, '/'), line: m[2] } : null;
}

// Pure: whether a run failed in the round's own repro files. BJEW-461 (2026-10-06): the shared global
// setup's login failed before any spec ran, three times at one place, and was counted stable; the
// plan would have had no failing test that the fix turns green.
export function failedInRepro(output: string, folder: string | null) {
	const file = failureFrame(output)?.file;
	const dir = reproDir(folder);
	return Boolean(file) && (file!.startsWith(dir) || file!.includes(`/${dir}`));
}

// Pure: whether the repro's runs make it a measurement: `stable`, every run red at one place;
// `green`, every run green (the ticket does not reproduce here, a finding); `outside`, every run red
// outside the repro's own files (a precondition: login, setup, data), never at the defect; else
// `unstable`.
export type ReproResult = 'stable' | 'unstable' | 'green' | 'outside';
export function reproVerdict(runs: { exit: number | null; output: string }[], folder: string | null): { result: ReproResult; say: string } {
	if (runs.every((r) => r.exit === 0)) return { result: 'green', say: `green on all ${runs.length} runs: the defect does not show on this checkout` };
	const green = runs.findIndex((r) => r.exit === 0);
	if (green >= 0) return { result: 'unstable', say: `run ${green + 1} of ${runs.length} was green: the repro passes on this checkout some of the time` };
	const signatures = runs.map((r) => failureSignature(r.output));
	if (runs.every((r) => !failedInRepro(r.output, folder))) return { result: 'outside', say: `every run was red before the repro's own code failed, outside ${reproDir(folder)}:\n${signatures.map((s, i) => `  run ${i + 1}: ${s}`).join('\n')}` };
	if (new Set(signatures).size > 1) return { result: 'unstable', say: `the runs failed in different places:\n${signatures.map((s, i) => `  run ${i + 1}: ${s}`).join('\n')}` };
	return { result: 'stable', say: `red ${runs.length} times, each at: ${signatures[0]}` };
}

// Starts the stack and waits for it, or exits red naming its logs: the next command would fail
// against no app, and say less.
async function stackOrExit(toplevel: string) {
	try {
		console.error(await ensureServers(toplevel, { wait: true }));
	} catch (e) {
		console.error(`FAILED: ${(e as Error).message}`);
		process.exit(1);
	}
}

export async function runRepro() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const research = join(toplevel, folder ?? '', 'RESEARCH.md');
	const repro = existsSync(research) ? reproCommand(readFileSync(research, 'utf8')) : null;
	if (!repro) {
		console.error('check --repro: RESEARCH.md ## Repro has no `command:` line yet: write it first');
		process.exit(1);
	}
	await stackOrExit(toplevel);
	const [cmd, ...args] = tokenize(repro);
	const runs: { exit: number | null; output: string }[] = [];
	for (let i = 1; i <= REPRO_RUNS; i++) {
		const run = spawnSync(cmd, args, { cwd: toplevel, encoding: 'utf8', shell: process.platform === 'win32' });
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		runs.push({ exit: run.status, output });
		console.log(`run ${i}: ${run.status === 0 ? 'green' : `red at ${failureSignature(output)}`}`);
	}
	const verdict = reproVerdict(runs, folder);
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	const tasks = runs.map((r) => ({ label: repro, exit: r.exit, output: r.output.split('\n').slice(-15).join('\n').trimEnd() }));
	appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: 'repro', rowCheck: null, tasks, result: verdict.result, token: state?.briefs?.research?.token })}\n`);
	console.log(`\n${verdict.result === 'unstable' ? 'NOT STABLE' : verdict.result === 'outside' ? 'NOT THE DEFECT' : verdict.result}: ${verdict.say}`);
	if (verdict.result === 'outside') {
		console.log('A precondition failed (login, setup, data), so the repro never measured the defect. Fix it if it is in your repro, then run `wf check --repro` again; if it is not, write what failed under `Could not find` and stop: wf next takes it on.');
		process.exit(1);
	}
	if (verdict.result === 'unstable') {
		console.log('Fix the repro so it waits for what it needs (the page, the data), then run `wf check --repro` again.');
		process.exit(1);
	}
	if (verdict.result === 'green') {
		console.log('If the repro measures what the ticket describes, that is the finding: RESEARCH.md says it does not reproduce, and wf next asks the user.');
		return;
	}
	console.log(`\nthe last run, for RESEARCH.md's red output:\n${runs.at(-1)!.output.split('\n').filter((l) => l.trim()).slice(-10).join('\n')}`);
}

export async function runCheck() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const changed = changedFiles(toplevel);
	const ran: CheckRun[] = [];
	const logRun = (result: string) => {
		mkdirSync(join(toplevel, '.wf'), { recursive: true });
		appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: state?.commit ?? null, rowCheck: row?.check ?? null, tasks: ran, result })}\n`);
	};
	let row: PlanRow | null = null;
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
	const reproOnly = row ? isReproOnly(rowFiles(row), folder) : false;
	let served = false;
	for (const task of buildTasks({ row, projectTasks: (test) => checks({ toplevel, changed, test }), repro, reproOnly })) {
		if (task.missing) {
			console.error(`check: ${task.missing}`);
			ran.push({ label: task.label, exit: null, missing: task.missing });
			logRun('red');
			process.exit(1);
		}
		if (task.stack && !served) {
			served = true;
			try {
				await ensureServers(toplevel, { wait: true });
			} catch (e) {
				console.error(`FAILED: ${(e as Error).message}`);
				ran.push({ label: 'stack', exit: null, missing: (e as Error).message });
				logRun('red');
				process.exit(1);
			}
		}
		const run = spawnSync(task.cmd!, task.args!, { cwd: join(toplevel, task.cwd!), encoding: 'utf8', shell: process.platform === 'win32' });
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		if (task.expectRed) {
			ran.push({ label: task.label, exit: run.status, expect: 'red', output: output.split('\n').slice(-15).join('\n').trimEnd() });
			if (run.status !== 0) continue;
			console.error(`FAILED: the repro passes before the fix. A row that only edits the repro must leave it red on the defect: ${task.label}`);
			logRun('red');
			process.exit(1);
		}
		ran.push({ label: task.label, exit: run.status });
		if (run.status === 0) continue;
		console.error(`FAILED: ${task.cmd} ${task.args!.join(' ')}`);
		console.error(output.split('\n').slice(-TAIL).join('\n').trimEnd());
		logRun('red');
		process.exit(1);
	}
	logRun('green');
	const blocked = folder && state?.commit ? join(toplevel, folder, 'BLOCKED.md') : null;
	if (blocked && existsSync(blocked)) renameSync(blocked, join(toplevel, folder!, resolvedBlockedName(state!.commit!, readdirSync(join(toplevel, folder!)))));
}

// A block the row got past becomes its record: BLOCKED.md → BLOCKED-commit<n>.md, one name in every
// round (682 and 700 renamed theirs by hand three different ways). The next block starts a fresh BLOCKED.md.
export function resolvedBlockedName(n: number, taken: string[]) {
	for (let i = 1; ; i++) {
		const name = `BLOCKED-commit${n}${i === 1 ? '' : `-${i}`}.md`;
		if (!taken.includes(name)) return name;
	}
}

/** Record whole test suites for one HEAD: green only when every suite exited 0; keep red output tails. */
export function suitesLine({ ts, head, runs }: { ts: string; head: string; runs: { label: string; exit: number | null; output: string }[] }) {
	const tasks: CheckRun[] = runs.map((r) => (r.exit === 0 ? { label: r.label, exit: 0 } : { label: r.label, exit: r.exit, output: tail(r.output) }));
	return JSON.stringify({ ts, row: 'suites', head, tasks, result: tasks.every((t) => t.exit === 0) ? 'green' : 'red' });
}

const tail = (output: string) => output.split('\n').slice(-TAIL).join('\n').trimEnd();

/** Run whole test suites on a committed HEAD; record green or red evidence for validate. */
export async function runSuites() {
	const toplevel = toplevelOf();
	if (!suites.length) return console.log('check --suites: this project names no suites');
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();
	// The line says which commit it measured: product files must be committed, but round reports
	// may be dirty after a validate or critique (a refused push has already tracked those reports).
	const { folder } = roundOf(readState(toplevel), toplevel);
	const dirty = [...git('diff', '--name-only', 'HEAD').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter((f) => f && !isRoundPaperwork(f, folder));
	if (dirty.length) {
		console.error(`check --suites: commit first, the suites measure HEAD:\n${dirty.join('\n')}`);
		process.exit(1);
	}
	const head = git('rev-parse', 'HEAD');
	const start = Date.now();
	const step = (task: CheckTask) => new Promise<{ label: string; exit: number | null; output: string }>((resolve) => {
		if (task.cmd === undefined) return resolve({ label: task.label, exit: null, output: task.missing });
		const child = spawn(task.cmd, task.args, { cwd: join(toplevel, task.cwd), env: { ...process.env, ...task.env }, shell: process.platform === 'win32', windowsHide: true });
		let output = '';
		child.stdout.on('data', (d) => { output += d; });
		child.stderr.on('data', (d) => { output += d; });
		child.on('error', (e) => resolve({ label: task.label, exit: null, output: `${output}${e.message}` }));
		child.on('close', (exit) => resolve({ label: task.label, exit, output }));
	});
	// A suite's steps in order, stopping at the first red one, which then names the suite's result.
	const runs = await Promise.all(suites.map(async (steps) => {
		let last: { label: string; exit: number | null; output: string } = { label: '', exit: 0, output: '' };
		for (const task of steps) {
			last = await step(task);
			if (last.exit !== 0) break;
		}
		return last;
	}));
	const line = suitesLine({ ts: new Date().toISOString(), head, runs });
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	appendFileSync(join(toplevel, '.wf', 'checks.log'), `${line}\n`);
	const took = `${Math.round((Date.now() - start) / 1000)}s`;
	const red = runs.filter((r) => r.exit !== 0);
	if (!red.length) return console.log(`suites green at ${head.slice(0, 9)} in ${took}: ${runs.map((r) => r.label).join(', ')}`);
	for (const r of red) console.error(`FAILED: ${r.label}\n${tail(r.output)}\n`);
	console.error(`suites red at ${head.slice(0, 9)} in ${took}: ${red.map((r) => r.label).join(', ')}. validate reads it from checks.log.`);
	process.exitCode = 1;
}

// basename, not endsWith: `deliver.selfcheck.ts` ends with `check.ts` too.
if (process.argv[1] && basename(process.argv[1]) === 'check.ts') await runCheck();
