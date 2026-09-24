#!/usr/bin/env node
// check.mjs — wf check: the implementer's gate (prompts/implement.md step 2).
// Silent + exit 0 on green; on red only the failing command and the last 40 lines
// of its output, exit 1. Everything is derived from the working-tree diff and the
// PLAN.md row `wf prompt implement N` recorded in .wf/state.json:
//   fence   — no file outside row N's `files` cell may have changed
//   project — the project's commands for the changed files and the row's test path (project.mjs checks)
//   repro   — the row's `check` cell `repro`: the command RESEARCH.md records
// Every run appends one JSON line to .wf/checks.log (row, the row's check, each task's exit,
// green|red). The validate agent reads that, never the commit message: "the check was run"
// is then observed, not claimed (llm-as-a-verifier: trust observed output, not narration).
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checks } from './project.mjs';
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
// `wf prompt` rewrites state while the commit is open. SPEC, SPEC-REVIEW and REVIEW are in the round
// folder too (until 2026-09-23 they sat at the worktree root, and TJEW-700's class B commits were
// fenced on them there).
export const isRoundPaperwork = (file, folder) => file.startsWith('.wf/') || (folder && file.startsWith(folder.replace(/\\/g, '/').replace(/\/?$/, '/')));

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

// Pure: the commands to run, in order. `projectTasks(test)` is the project's commands for the diff
// plus `test` (the row's test path, or null); `repro` is the RESEARCH.md command line (or null).
export function buildTasks({ row, projectTasks, repro }) {
	// The command is the first `code span` when there is one — a cell may add a note after it
	// (TJEW-700 row 6: "`vitest run …ts` (fixture carries …)" took `number)` as the path).
	const cell = row?.check ?? '';
	// A cell that starts with — (or -) is fence only, whatever note follows it (TJEW-682 rows 1 and 5
	// carried a code span in the note, which was then read as the command).
	const check = /^\s*[—-]/.test(cell) ? '' : (/`([^`]+)`/.exec(cell)?.[1] ?? cell).trim();
	// The cell is a command (`pytest packages/backend/tests/x.py`, `vitest run …/x.test.ts`):
	// the path is its last word (TJEW-700: the whole cell was sliced as a path → `ackend/tests/…`).
	const checkPath = check.split(/\s+/).pop() ?? '';
	const tasks = projectTasks(check && check !== 'repro' ? checkPath : null);
	if (check !== 'repro') return tasks;
	if (!repro) return [...tasks, { label: 'repro', missing: 'RESEARCH.md ## Repro has no `command:` line' }];
	const [cmd, ...args] = tokenize(repro);
	return [...tasks, { label: repro, cmd, args, cwd: '.' }];
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
	for (const task of buildTasks({ row, projectTasks: (test) => checks({ toplevel, changed, test }), repro })) {
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
	const blocked = folder && state?.commit ? join(toplevel, folder, 'BLOCKED.md') : null;
	if (blocked && existsSync(blocked)) renameSync(blocked, join(toplevel, folder, resolvedBlockedName(state.commit, readdirSync(join(toplevel, folder)))));
}

// A block the row got past becomes its record: BLOCKED.md → BLOCKED-commit<n>.md, one name in every
// round (682 and 700 renamed theirs by hand three different ways). The next block starts a fresh BLOCKED.md.
export function resolvedBlockedName(n, taken) {
	for (let i = 1; ; i++) {
		const name = `BLOCKED-commit${n}${i === 1 ? '' : `-${i}`}.md`;
		if (!taken.includes(name)) return name;
	}
}

// basename, not endsWith: `deliver.selfcheck.mjs` ends with `check.mjs` too.
if (process.argv[1] && basename(process.argv[1]) === 'check.mjs') runCheck();
