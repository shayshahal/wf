#!/usr/bin/env node
// check.ts — wf check: the implementer's gate (prompts/build.md).
// Silent + exit 0 on green; on red only the failing command and the last 40 lines
// of its output, exit 1. Everything is derived from the working-tree diff and the
// agreement's `## Verification` cases (TICKET.md for class A, AGREEMENT.md for B/C):
//   fence   — no file outside the selected case's `files` cell may have changed. A case-less run
//             with a product file changed and no project check refuses rather than log an empty green
//   project — the project's commands for the changed files and the case's test path (project.ts checks)
//   repro   — the case's `check` cell `repro`: the command the agreement records. A case that only
//             edits the repro runs it too, and it must be red: that run is the round's before-the-fix
//             measurement, its output kept in checks.log (TJEW-670: the repro was fixed in a row
//             checked `—`, and two of four subitems never had a red run)
//   red-base — the case's own test, run with the change taken back to HEAD: it must fail on the
//             framework assertion at the origin the case's check cell names (`path::test id@<line>`),
//             or the test cannot show the defect it claims to prove (a test that passes with and
//             without the fix is not proof, process/PRACTICES.md). An exit code is not that proof, and
//             neither is a failure at the line: the project's evidence policy reads the runner's own
//             report (`redBaseEvidence`, projects/<name>/index.ts), which requires a framework
//             assertion (not a NameError/AttributeError/TypeError raised while evaluating it), the
//             exact origin frame (not a caller or helper), and the named test. A missing runner, an
//             import/collection or setup error, a failure in another file, a wrong origin, and a cell
//             with no id or line all fail the case, which checks.log records as the run's verdict
//             (#109, 2026-10-09). The same evidence policy must show the case's named test ran and
//             passed on the current (with-change) tree too: a skip, a suite total or a pass naming
//             another case is not a green, so only a real pass shows the fix turns that assertion
//             green (#109 review, 2026-10-09). A `refactor:` cell is a behavior-preserving case: it
//             needs its named test green on both the current and the reverted side, never a
//             manufactured red. The
//             project marks that one task (`redBase`, projects/<name>/checks.ts); lint, typecheck and
//             the hooks stay out of it, because their red would prove nothing about the test.
// `wf check --suites` (the build runs it on the committed HEAD; the assessment reads it): the
// project's whole suites for what the round's diff reaches (project.ts suites), side by side; one
// checks.log line (row `suites`, the head it measured, each red task's output tail; no tasks when the
// diff reaches no suite). Not a commit gate: it measures what the round has done to tests no case
// touched (2026-10-05: a change broke tests outside its commit checks, unseen until the next
// day's full-suite run).
// `wf check --repro` (prompts/agree.md): the agreement's repro, three times; stable only when
// all three are red at the same place, in the round's repro files. Its line in checks.log (row
// `repro`, result stable|unstable|green|outside) is the finding the check round decides on.
// Every run appends one JSON line to .wf/checks.log (row, the case's check, each task's exit,
// green|red, and a red's `cause`: `environment` when no task ran at all). The assessment agent reads
// that, never the commit message: "the check was run"
// is then observed, not claimed (llm-as-a-verifier: trust observed output, not narration).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { baseBranch, checks, redBaseEvidence, reproFailure, suites } from '../project.ts';
import { caseFiles, verificationCases } from '../round/agreement.ts';
import { agreementPath } from '../round/agreement.ts';
import type { VerificationCase } from '../round/agreement.ts';
import { readState, resolveRoundBase, roundOf, toplevelOf } from '../round/state.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { worktreeContentSha } from './content-identity.ts';

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
	| { label: string; cmd: string; args: string[]; cwd: string; env?: Record<string, string>; expectRed?: boolean; stack?: boolean; redBase?: boolean; missing?: never }
	| { label: string; missing: string; cmd?: never; args?: never; cwd?: never; env?: never; expectRed?: never; stack?: never; redBase?: never };
// What one proof-run's own output shows (#109): the project's evidence policy (projects/<name>/
// index.ts) reads a runner's report and returns one of these. Core reads the verdict and records it:
// only `behavioral-failure` proves a red-base row, only `passed` proves a behavior-preserving refactor,
// and `runner-failure` (the gate never ran) or `unavailable` (no binding, a failure outside the
// intended assertion, a report core cannot tie) is never a green. Reading a runner's report is the
// project's; which verdict a row needs is core's.
export type RunEvidence = {
	verdict: 'behavioral-failure' | 'passed' | 'runner-failure' | 'unavailable';
	say: string;
	runner?: string | null;
	kind?: string;
	detail?: string;
	tests?: { id: string; error: string; source?: string }[];
};

// One task's run, as checks.log records it. `evidence` is the red-base/refactor run's own verdict,
// computed from the full output before `output` is cut to its tail (2026-10-09).
export type CheckRun = { label: string; exit: number | null; missing?: string; expect?: 'red'; output?: string; evidence?: RunEvidence };

// Everything the round has moved: committed on the branch since `base` (when given), plus unstaged,
// staged and untracked, repo-relative. A committed-only product change must be seen too — a build that
// commits before `wf check`, a repair cycle or a resumed round runs on a clean tree (#109).
export function changedFiles(toplevel: string, base?: string | null) {
	const git = (args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
	return [...new Set([...(base ? git(['diff', '--name-only', `${base}...HEAD`]) : []), ...git(['diff', '--name-only', 'HEAD']), ...git(['diff', '--name-only', '--cached']), ...git(['ls-files', '--others', '--exclude-standard'])])].sort();
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

// Pure: the command a row's `check` cell names — the first code span, else the cell — or '' when the
// cell is fence only: `—`/`-` (whatever note follows) or `manual: …`, whose last word is not a path.
export function checkCellCommand(cell: string | null | undefined): string {
	const c = cell ?? '';
	return /^\s*[—-]/.test(c) || manualCheck(c) ? '' : (/`([^`]+)`/.exec(c)?.[1] ?? c).trim();
}

// Pure: the path that command runs — its last word (TJEW-700: the whole cell was sliced as a path).
export const checkCellPath = (cell: string | null | undefined) => checkCellCommand(cell).split(/\s+/).pop() ?? '';

// The target a row's check cell names: the one repo-rooted test path, the intended assertion inside
// it, and whether the row is a behavior-preserving refactor. The assertion is the reviewed origin
// (`path::test id@<line>`) of the assertion the fix must turn green; a red-base run's own report must
// name that line and fail on a framework assertion there (#109). `refactor:` marks a
// behavior-preserving row: it needs its one named test green with the change and without it, never a
// manufactured red. Both syntaxes are core policy; reading a runner's report for the origin line is
// the project's (projects/<name>/evidence.ts).
export type CheckTarget = { refactor: boolean; file: string; id: string | null; line: number | null };

// Pure: the target a command names. A `::` splits the path from the test id, and the id runs to the
// end -- a test name has spaces, so it is not the command's last word; an `@<line>` after the id is
// the reviewed assertion origin. Without a `::` the last word is the path (a bare test path, or a
// `repro --grep auction` command the project then refuses).
function parseTarget(command: string): { file: string; id: string | null; line: number | null } | null {
	const at = command.indexOf('::');
	if (at < 0) {
		const word = command.split(/\s+/).pop() ?? '';
		return word ? { file: word, id: null, line: null } : null;
	}
	const file = command.slice(0, at).split(/\s+/).pop() ?? '';
	const rest = command.slice(at + 2).trim();
	const m = /^(.*?)@(\d+)$/.exec(rest);
	return { file, id: ((m ? m[1] : rest).trim() || null), line: m ? Number(m[2]) : null };
}

/**
 * Pure: the target a row's check cell names, or null when the cell is `repro`, fence only (`—`) or
 * `manual:` (no test to run). The owning helper for the check-cell syntax: `buildTasks` and
 * `redBaseFiles` use its `.file` (the project's commands want a bare path, not `path::id@line`), and
 * the red-base gate uses `.id`/`.line`/`.refactor`. `refactor:` is read before the code span, so
 * `` refactor: `path::id` `` and `` `refactor: path::id` `` mean the same (2026-10-09 review).
 */
export function checkCellTarget(cell: string | null | undefined): CheckTarget | null {
	const c = cell ?? '';
	if (manualCheck(c)) return null;
	const prefixed = /^\s*refactor:[ \t]*/i.test(c);
	const command = checkCellCommand(prefixed ? c.replace(/^\s*refactor:[ \t]*/i, '') : c);
	if (!command) return null;
	const refactor = prefixed || /^\s*refactor:[ \t]*/i.test(command);
	if (!refactor && command === 'repro') return null;
	const target = parseTarget(command.replace(/^\s*refactor:[ \t]*/i, ''));
	return target && target.file ? { refactor, ...target } : null;
}

/**
 * Pure: why a row's target cannot bind proof, or null when it can. A red-base row needs the named test
 * id and the reviewed origin line (`path::test id@<line>`); a `refactor:` row needs the id so its run
 * selects that one case. A bare path, or a cell with no line, cannot prove the claim (#109).
 */
export function targetGap(target: CheckTarget | null): string | null {
	if (!target) return 'the row names no test to run';
	if (!target.id) return `the row names no test id: write \`${target.file}::<test id>${target.refactor ? '' : '@<line>'}\` in its check cell`;
	if (!target.refactor && target.line === null) return `the row names no intended assertion: write \`${target.file}::${target.id}@<line>\` in its check cell`;
	return null;
}

// Pure: the files the red-base run takes back to HEAD — the row's changed files without the test the
// row names (it stays, so it runs against the tree without the fix) and without the round's own
// paperwork. Empty when the row only edits its test: there is no fix to take away.
export function redBaseFiles({ changed, row, folder, testPath }: { changed: string[]; row: Pick<VerificationCase, 'files'> | null; folder: string | null; testPath: string }): string[] {
	if (!row || !testPath) return [];
	const allowed = new Set(caseFiles(row));
	return changed.filter((f) => allowed.has(f) && f !== testPath && !isRoundPaperwork(f, folder));
}

// Pure: the row's red-base run — the project's task that carries the row's own test, and the files
// to take back to HEAD for it — or null when the row has no test task, or only its test to revert.
export function redBaseRun({ tasks, changed, row, folder }: { tasks: CheckTask[]; changed: string[]; row: Pick<VerificationCase, 'files' | 'check'> | null; folder: string | null }): { task: CheckTask; revert: string[] } | null {
	const task = tasks.find((t) => t.redBase && !t.missing);
	if (!task) return null;
	const revert = redBaseFiles({ changed, row, folder, testPath: checkCellTarget(row?.check)?.file ?? '' });
	return revert.length ? { task, revert } : null;
}

// Runs `run()` with `paths` back at HEAD, then puts them back. `git stash push` is the one command
// that both restores HEAD and keeps the working change — tracked or new, staged or not — so a pop
// that fails is a refusal naming the stash, never a green.
export function withFixReverted<T>(toplevel: string, paths: string[], run: () => T): T {
	const git = (args: string[]) => spawnSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' });
	const push = git(['stash', 'push', '--include-untracked', '-m', 'wf red-base', '--', ...paths]);
	if (push.status !== 0) throw new Error(`git stash push: ${(push.stderr || push.stdout).trim()}`);
	try {
		return run();
	} finally {
		const pop = git(['stash', 'pop']);
		if (pop.status !== 0) {
			console.error(`FAILED: git stash pop — the row's changes are in the stash (git stash list): ${(pop.stderr || pop.stdout).trim()}`);
			process.exit(1);
		}
	}
}

// `command: <line>` under `## Repro` in the round agreement (TICKET.md for class A, AGREEMENT.md for B/C).
export function reproCommand(text: string) {
	const body = text.replace(/\r\n/g, '\n');
	const section = /^## Repro[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
	const m = section && /^command:[ \t]*(.+)$/m.exec(section[1]);
	return m ? m[1].trim().replace(/^`|`$/g, '') : null;
}

// Split a command line on whitespace, honouring "double quotes" — enough for the one
// line the agreement checks in; no shell is involved anywhere in wf.
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

// Pure: the commands to run, in order. `projectTasks(target)` is the project's commands for the diff
// plus the row's `target` (its test path, named test id and intended line, and `refactor:` — or null);
// `repro` is the agreement's command line (or null).
export function buildTasks({ row, projectTasks, repro, reproOnly = false }: { row: { check?: string } | null | undefined; projectTasks: (target: CheckTarget | null) => CheckTask[]; repro: string | null; reproOnly?: boolean }): CheckTask[] {
	// The command is the first `code span` when there is one — a cell may add a note after it
	// (TJEW-700 row 6: "`vitest run …ts` (fixture carries …)" took `number)` as the path). A cell that
	// starts with — (or -) is fence only, whatever note follows it (TJEW-682 rows 1 and 5 carried a
	// code span in the note, which was then read as the command). So is a `manual:` cell.
	const check = checkCellCommand(row?.check);
	// The cell is a command (`pytest packages/backend/tests/x.py`, `vitest run …/x.test.ts`):
	// the path is its last word (TJEW-700: the whole cell was sliced as a path → `ackend/tests/…`).
	// The project gets the parsed target: the binding (`::id@line`) and `refactor:` are core's, and the
	// project's per-runner command split and test selection key on the target's parts.
	const target = checkCellTarget(row?.check);
	const tasks = projectTasks(check && check !== 'repro' && !reproOnly ? target : null);
	if (check !== 'repro' && !reproOnly) return tasks;
	if (!repro) return [...tasks, { label: 'repro', missing: 'the agreement ## Repro has no `command:` line' }];
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

// Why a red is red, from the task that ended the run. `environment` when no task ever ran — the stack
// would not answer, the project's check could not be built, a task is `missing`, or the row's check
// names a repro the agreement has no `command:` for. `code` when the run found the round's own work at
// fault: a task ran and exited non-zero, or the fence found a file outside the row.
// BJEW-461 (2026-10-06): the shared setup's login failed before any spec ran. The repro side got
// `outside` for it (reproVerdict); this is the commit gate's half of the same fix — a gate that never
// ran was written down as `red`, so wf next, validate's Commits line and the friction line could not
// tell "the code is wrong" from "the gate could not run".
export type RedCause = 'code' | 'environment';
export function redCause(task: { exit: number | null }): RedCause {
	return task.exit === null ? 'environment' : 'code';
}

// Pure: the checks.log line for one run. `cause` only on a red: green has no cause to give. `content`
// is the implementationContentSha the run finished on (content-identity.ts) — recorded so a green
// names what it measured, never the bytes a mutating task replaced before the run ended (#106).
export function checkRunLine({ ts, row, rowCheck, tasks, result, cause, token, content }: { ts: string; row: number | string | null; rowCheck: string | null; tasks: CheckRun[]; result: string; cause?: RedCause; token?: string; content?: string }) {
	return JSON.stringify({ ts, row, rowCheck, tasks, result, ...(cause ? { cause } : {}), ...(token ? { token } : {}), ...(content ? { content } : {}) });
}

// The row identity a run measured, or undefined when git cannot read the tree: the log line still
// records the run; a line with no content is evidence that cannot bind an approval (#106).
// The row scope excludes the round folder, so it equals the product/tests a row commit carries.
const contentOf = (toplevel: string, folder: string | null): string | undefined => {
	try {
		return worktreeContentSha(toplevel, folder, null, 'row');
	} catch {
		return undefined; // git could not read the tree: the line records the run, with no identity to bind
	}
};

// Pure: what an unreadable or changed before/after identity means. `unavailable` when git could not
// read either snapshot (fail closed: no green is minted); `changed` when a task rewrote the tree
// between them. `null` only when both were read and are equal.
export type IdentityGap = 'unavailable' | 'changed' | null;
export function identityGap(start: string | undefined, end: string | undefined): IdentityGap {
	if (start === undefined || end === undefined) return 'unavailable';
	return start === end ? null : 'changed';
}

// Pure: the argv to hand a spawn. On Windows the runner commands go through cmd.exe (shell: true, so
// a .cmd shim like pnpm starts), and Node joins argv with spaces without quoting; an argument with a
// space or a cmd metacharacter -- the #109 selector `^amount \(EUR\)$`, or a path with spaces -- is
// then split or eaten (`^` dropped, `\(` collapsed). Each argument is quoted so it reaches the
// runner as one literal. The task's args stay the semantic, unquoted array (checks.ts builds them);
// quoting is this edge's job. Quoting does NOT protect `%NAME%`: cmd expands a metavariable inside
// quotes too, so a row id that carries one cannot reach the runner as a literal, and `%PATH%` would
// leak the environment into the report. `shellArgUnsafe` names that, and the row task spawns refuse
// it before the shell runs (never a silent wrong run). This is a bounded Windows limitation, not a
// cmd engine. Off Windows argv is unchanged: no shell, so no quoting or expansion.
export const shellArgv = (args: string[], platform: NodeJS.Platform = process.platform): string[] =>
	platform === 'win32' ? args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`) : args;

// Pure: an argument a Windows shell would rewrite before the runner sees it -- a cmd metavariable
// `%NAME%`. The row's check cell is free text, so this is the honest boundary: the unit that spawns
// the runner refuses such a task (red, environment) instead of running a different argument or
// writing an expanded environment into the report. Off Windows there is no shell, so nothing is
// special. A lone `%` (e.g. `100%`) is not a metavariable and passes.
export const shellArgUnsafe = (arg: string, platform: NodeJS.Platform = process.platform): boolean =>
	platform === 'win32' && /%[^%]+%/.test(arg);

// Pure: the first argument a Windows shell would rewrite before the runner sees it, or null when the
// argv is safe to hand the shell. The row's check cell is free text, so the spawn sites refuse a
// `%NAME%` argument rather than run a different one.
const unsafeArg = (args: string[]): string | null => args.find((a) => shellArgUnsafe(a)) ?? null;

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

// One `wf check --repro`/repro-only run: its exit, its output, and whether its failure is a
// recognized framework assertion inside the repro's own files. `measurement` is false for a crash, a
// generic `Error`/throw, a load failure or a runner wf cannot read (the project's `reproFailure`):
// such a run never measured the defect, however its stack frame reads (#109 review, 2026-10-09).
export type ReproRun = { exit: number | null; output: string; measurement: boolean };

// Pure: whether a repro-only row's before-the-fix run is the red the round needs (#109, TJEW-670).
// `red` only when the run started (a missing executable leaves exit null), failed inside the round's
// own repro files, and failed on a framework assertion there. A shared login or precondition
// (BJEW-461), and an in-repro crash, are `environment`, never the defect; a green run is
// `passed-before-fix`, its own finding about the repro.
export type ReproExpectRed = 'red' | 'passed-before-fix' | 'environment';
export function expectRedVerdict(run: ReproRun, folder: string | null): { result: ReproExpectRed; say: string } {
	if (run.exit === null) return { result: 'environment', say: 'the repro never started (missing executable or spawn failure)' };
	if (run.exit === 0) return { result: 'passed-before-fix', say: 'the repro passes before the fix' };
	if (!failedInRepro(run.output, folder)) return { result: 'environment', say: `the repro failed before its own code, outside ${reproDir(folder)}: ${failureSignature(run.output)}` };
	if (!run.measurement) return { result: 'environment', say: `the repro failed without a framework assertion, so it never measured the defect: ${failureSignature(run.output)}` };
	return { result: 'red', say: failureSignature(run.output) };
}

// Pure: whether the repro's runs make it a measurement: `stable`, every run red on a framework
// assertion at one place; `green`, every run green (the ticket does not reproduce here, a finding);
// `outside`, no run measured the defect (a precondition, a crash, a runner wf cannot read); else
// `unstable`.
export type ReproResult = 'stable' | 'unstable' | 'green' | 'outside';
export function reproVerdict(runs: ReproRun[], folder: string | null): { result: ReproResult; say: string } {
	if (runs.every((r) => r.exit === 0)) return { result: 'green', say: `green on all ${runs.length} runs: the defect does not show on this checkout` };
	const green = runs.findIndex((r) => r.exit === 0);
	if (green >= 0) return { result: 'unstable', say: `run ${green + 1} of ${runs.length} was green: the repro passes on this checkout some of the time` };
	const signatures = runs.map((r) => failureSignature(r.output));
	// A run that never started, or a green run, never measured a red; only a red run whose failure is
	// a framework assertion in the repro's own files is a measurement.
	const measured = (r: ReproRun) => r.exit !== null && r.exit !== 0 && r.measurement;
	if (!runs.some(measured)) return { result: 'outside', say: `no run measured the defect: every red was a crash, a precondition or a runner wf cannot read, not a framework assertion in the repro's own files (${reproDir(folder)}):\n${signatures.map((s, i) => `  run ${i + 1}: ${s}`).join('\n')}` };
	if (!runs.every(measured)) return { result: 'unstable', say: `not every run measured the defect (some crashed or never reached an assertion):\n${signatures.map((s, i) => `  run ${i + 1}: ${s}`).join('\n')}` };
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
	const research = agreementPath(toplevel, state?.class ?? null, folder);
	const repro = existsSync(research) ? reproCommand(readFileSync(research, 'utf8')) : null;
	if (!repro) {
		console.error(`check --repro: ${research.split(/[\\/]/).pop()} ## Repro has no \`command:\` line yet: write it first`);
		process.exit(1);
	}
	await stackOrExit(toplevel);
	const [cmd, ...args] = tokenize(repro);
	const start = contentOf(toplevel, folder);
	const runs: ReproRun[] = [];
	for (let i = 1; i <= REPRO_RUNS; i++) {
		const run = spawnSync(cmd, shellArgv(args), { cwd: toplevel, encoding: 'utf8', shell: process.platform === 'win32' });
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		// A red counts only if it is a framework assertion inside the repro's own files: a crash, a
		// generic Error, or a runner wf cannot read never measured the defect (#109 review).
		runs.push({ exit: run.status, output, measurement: failedInRepro(output, folder) && reproFailure({ cmd, args, output }).asserted });
		console.log(`run ${i}: ${run.status === 0 ? 'green' : `red at ${failureSignature(output)}`}`);
	}
	const verdict = reproVerdict(runs, folder);
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	const tasks = runs.map((r) => ({ label: repro, exit: r.exit, output: r.output.split('\n').slice(-15).join('\n').trimEnd() }));
	const end = contentOf(toplevel, folder);
	// A repro that rewrites the tree measures bytes other than the ones it was handed: no verdict binds.
	// An unreadable before/after snapshot is refused too, not counted as no change.
	const gap = identityGap(start, end);
	appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: 'repro', rowCheck: null, tasks, result: gap ?? verdict.result, content: end })}\n`);
	if (gap === 'unavailable') {
		console.error('check --repro: could not read the implementation before and after the repro (git could not compute the tree); refusing to record a verdict.');
		process.exit(1);
	}
	if (gap === 'changed') {
		console.error('check --repro: the repro rewrote files while it ran; its verdict names bytes it did not all measure. Commit or revert them, then run `wf check --repro` again.');
		process.exit(1);
	}
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
		console.log('If the repro measures what the ticket describes, that is the finding: the agreement says it does not reproduce, and wf next asks the user.');
		return;
	}
	console.log(`\nthe last run, for the agreement's red output:\n${runs.at(-1)!.output.split('\n').filter((l) => l.trim()).slice(-10).join('\n')}`);
}

export async function runCheck(argv: string[] = []) {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const ran: CheckRun[] = [];
	const start = contentOf(toplevel, folder);
	let row: VerificationCase | null = null;
	const logRun = (result: string, cause?: RedCause) => {
		mkdirSync(join(toplevel, '.wf'), { recursive: true });
		appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: row?.n ?? null, rowCheck: row?.check ?? null, tasks: ran, result, cause, content: contentOf(toplevel, folder) })}\n`);
	};
	// The round's base, so a committed-only change is part of the diff (R-1, #109). A base ref that does
	// not resolve leaves the committed range unknown: refuse with one actionable line rather than bless
	// a committed product change the check cannot see (N-1, fail closed).
	const { ref, base } = resolveRoundBase(toplevel, state);
	if (!base) {
		const said = { label: 'base', exit: null, missing: `the round's base \`${ref}\` does not resolve — fetch it, or start the round with \`wf new --base <ref>\`` };
		console.error(`COULD NOT RUN: ${said.missing}`);
		ran.push(said);
		logRun('red', redCause(said));
		process.exit(1);
	}
	const changed = changedFiles(toplevel, base);
	// The verification cases of the round's agreement (TICKET.md for class A, AGREEMENT.md for B/C).
	// No per-commit bookkeeping (#112): `--case N` names one, else the single case whose files this
	// diff touches, else the single case. `--case "<path>::<id>@<line>"` names a raw cell (class A).
	const agreementFile = agreementPath(toplevel, state?.class ?? null, folder);
	const cases = verificationCases(existsSync(agreementFile) ? readFileSync(agreementFile, 'utf8') : '');
	const caseIdx = argv.indexOf('--case');
	const caseArg = caseIdx >= 0 ? argv[caseIdx + 1] : null;
	if (caseArg != null) row = /^\d+$/.test(caseArg) ? cases.find((c) => c.n === Number(caseArg)) ?? null : { n: 0, line: '', message: caseArg, files: checkCellTarget(caseArg)?.file ?? '', check: caseArg };
	else {
		const matching = cases.filter((c) => caseFiles(c).some((f) => changed.includes(f)));
		row = matching.length === 1 ? matching[0] : cases.length === 1 ? cases[0] : null;
	}
	if (caseArg != null && /^\d+$/.test(caseArg) && !row) {
		console.error(`check: the agreement has no verification case ${caseArg} (cases: ${cases.map((c) => c.n).join(', ') || 'none'})`);
		process.exit(1);
	}
	// Scopeprot: a changed product/test file outside the agreement's cases is refused; a round's added
	// helper belongs in a case's `files` cell, which is mutable working detail (no renewed T1).
	const allowed = row ? caseFiles(row) : cases.flatMap((c) => caseFiles(c));
	const violations = allowed.length ? fenceViolations(changed, allowed, folder) : [];
	if (violations.length) {
		for (const f of violations) console.error(`fence: ${f} is not in the agreement's verification cases`);
		const fence = { label: 'fence', exit: 1 };
		ran.push(fence);
		logRun('red', redCause(fence));
		process.exit(1);
	}
	const repro = existsSync(agreementFile) ? reproCommand(readFileSync(agreementFile, 'utf8')) : null;
	const reproOnly = row ? isReproOnly(caseFiles(row), folder) : false;
	const target = checkCellTarget(row?.check);
	let served = false;
	const tasks = buildTasks({ row, projectTasks: (t) => checks({ toplevel, changed, target: t }), repro, reproOnly });
	// Nothing to run is not a green: a case-less or fence-only run with a product file changed and no
	// project check would log a pass that measured nothing (#109). `changed` is the same list the fence
	// uses (committed vs base, worktree, index, untracked), so a committed-only or reverse-index (index
	// changed, worktree back at HEAD) product change is refused too (N-2, #106: a plain `git commit`
	// commits the index, so it is not left to deliver). A docs-only diff has nothing to check. A raw
	// `--case "<path>::<id>@<line>"` gets its file from the cell above, so its fence and red-base run.
	const productChanged = changed.filter((f) => !isRoundPaperwork(f, folder));
	if (!tasks.length && productChanged.length) {
		const nothing = { label: 'check', exit: null, missing: 'the agreement declares no verification case and the project has no check for this diff — name one: wf check --case "<path>::<test id>@<line>"' };
		console.error(`COULD NOT RUN: ${nothing.missing}`);
		ran.push(nothing);
		logRun('red', redCause(nothing));
		process.exit(1);
	}
	for (const task of tasks) {
		const unsafe = task.args ? unsafeArg(task.args) : null;
		if (task.missing || unsafe) {
			const missing = { label: task.label, exit: null, missing: task.missing ?? `the runner cannot be handed \`${unsafe}\`: a Windows shell expands %NAME% before the runner sees it, so the row's id cannot be a literal there` };
			console.error(`COULD NOT RUN: ${missing.missing}`);
			ran.push(missing);
			logRun('red', redCause(missing));
			process.exit(1);
		}
		if (task.stack && !served) {
			served = true;
			try {
				await ensureServers(toplevel, { wait: true });
			} catch (e) {
				const dead = { label: 'stack', exit: null, missing: (e as Error).message };
				console.error(`COULD NOT RUN: ${dead.missing}`);
				ran.push(dead);
				logRun('red', redCause(dead));
				process.exit(1);
			}
		}
		const run = spawnSync(task.cmd!, shellArgv(task.args!), { cwd: join(toplevel, task.cwd!), env: { ...process.env, ...task.env }, encoding: 'utf8', shell: process.platform === 'win32' });
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		if (task.expectRed) {
			const before = { label: task.label, exit: run.status, expect: 'red' as const, output: output.split('\n').slice(-15).join('\n').trimEnd() };
			ran.push(before);
			const verdict = expectRedVerdict({ exit: run.status, output, measurement: failedInRepro(output, folder) && reproFailure({ cmd: task.cmd!, args: task.args!, output }).asserted }, folder);
			if (verdict.result === 'red') continue;
			if (verdict.result === 'passed-before-fix') {
				console.error(`FAILED: the repro passes before the fix. A row that only edits the repro must leave it red on the defect: ${task.label}`);
				logRun('red', redCause(before));
				process.exit(1);
			}
			console.error(`COULD NOT RUN: ${verdict.say}: ${task.label}`);
			logRun('red', 'environment');
			process.exit(1);
		}
		const failed: CheckRun = { label: task.label, exit: run.status };
		// Every row-selected task (the project marks it `redBase`) is checked on the current
		// (with-change) side too: the selected test must be shown to have run and passed, or the fix is
		// not shown to turn the named assertion green -- a skip, a suite total or a pass naming another
		// case is not a pass (#109). Rows with no named target (manual:, fence only, a bare path, a whole
		// unselected suite) keep their own task's exit as the check.
		if (task.redBase && target?.id) failed.evidence = redBaseEvidence({ cmd: task.cmd!, args: task.args!, cwd: task.cwd!, root: toplevel, exit: run.status, output, target });
		ran.push(failed);
		if (run.status === 0) {
			if (failed.evidence && failed.evidence.verdict !== 'passed') {
				console.error(`FAILED: the selected test is not shown to have run and passed with the change: ${failed.evidence.say}. A row checked against \`path::test id\` must run that test green on the current tree; a skip or a suite total is not a pass (prompts/plan.md).`);
				logRun('red', redCause(failed));
				process.exit(1);
			}
			continue;
		}
		console.error(`FAILED: ${task.cmd} ${task.args!.join(' ')}`);
		console.error(output.split('\n').slice(-TAIL).join('\n').trimEnd());
		logRun('red', redCause(failed));
		process.exit(1);
	}

	// Red-base (process/PRACTICES.md, TDD): the row's own test must fail with the row's change taken
	// back to HEAD, or it cannot show the defect it claims to prove — a test that passes with and
	// without the fix is not proof (docs/plans/2026-09-27-kit-and-env.md step 4: a jsdom test that
	// laid nothing out, counted green). The project marks the row's test task (`redBase`); every other
	// task stays out, because a lint or typecheck red would prove nothing about the test.
	const redBasePlan = redBaseRun({ tasks, changed, row, folder });
	if (redBasePlan) {
		const { task: redTask, revert } = redBasePlan;
		const gap = targetGap(target);
		const label = `red-base ${checkCellPath(row?.check)}`;
		const unsafeRed = unsafeArg(redTask.args!);
		if (unsafeRed) {
			const dead = { label, exit: null, missing: `the runner cannot be handed \`${unsafeRed}\`: a Windows shell expands %NAME% before the runner sees it, so the row's id cannot be a literal there` };
			console.error(`COULD NOT RUN: ${dead.missing}`);
			ran.push(dead);
			logRun('red', 'environment');
			process.exit(1);
		}
		if (redTask.stack && !served) {
			served = true;
			try {
				await ensureServers(toplevel, { wait: true });
			} catch (e) {
				const dead = { label, exit: null, missing: (e as Error).message };
				console.error(`COULD NOT RUN: ${dead.missing}`);
				ran.push(dead);
				logRun('red', 'environment');
				process.exit(1);
			}
		}
		// The stash dance restores the working change whatever the run does; a failure to stash or pop
		// is the environment, never a green.
		const run = (() => {
			try {
				return withFixReverted(toplevel, revert, () => spawnSync(redTask.cmd!, shellArgv(redTask.args!), { cwd: join(toplevel, redTask.cwd!), env: { ...process.env, ...redTask.env }, encoding: 'utf8', shell: process.platform === 'win32' }));
			} catch (e) {
				return e as Error;
			}
		})();
		if (run instanceof Error) {
			const dead = { label, exit: null, missing: run.message };
			console.error(`COULD NOT RUN: ${dead.missing}`);
			ran.push(dead);
			logRun('red', 'environment');
			process.exit(1);
		}
		const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
		// The verdict comes from the full output, before `output` is cut to its tail: the runner's
		// provenance (the failing test, its error and the assertion origin) must survive in checks.log
		// even when the tail does not carry it (#109). The row must name the test id and, for a
		// red-base row, the intended assertion line; anything less cannot prove the claim, so the row
		// never greens on a bare exit code.
		const evidence: RunEvidence = gap
			? { verdict: 'unavailable', say: gap }
			: redBaseEvidence({ cmd: redTask.cmd!, args: redTask.args!, cwd: redTask.cwd!, root: toplevel, exit: run.status, output, target: target! });
		const redBase: CheckRun = { label, exit: run.status, expect: 'red', output: output.split('\n').slice(-15).join('\n').trimEnd(), evidence };
		ran.push(redBase);
		// A refactor row must leave its selected test green without the change; any other row must fail
		// on the intended assertion. `passed` is only `passed` when the runner reported the selected
		// test ran and passed on its own (a skip or a suite total is `unavailable`).
		const want = target?.refactor ? 'passed' : 'behavioral-failure';
		if (evidence.verdict === want) {
			// proven: fall through to the content guard and the green line.
		} else if (target?.refactor) {
			console.error(`FAILED: refactor: ${evidence.say}. A behavior-preserving row's selected test must pass with the change taken away too: make it green on both sides, or drop \`refactor:\` when the row really changes behavior (prompts/plan.md).`);
			logRun('red', redCause(redBase));
			process.exit(1);
		} else if (evidence.verdict === 'passed') {
			console.error(`FAILED: ${redTask.label} passes with the row's change taken away — it does not measure the defect. Make the test fail without the fix, or, when this row cannot have one, put its check cell at \`—\` — that is a plan change: write ${folder ?? 'the round folder'}/BLOCKED.md.`);
			logRun('red', redCause(redBase));
			process.exit(1);
		} else {
			console.error(`FAILED: red-base cannot prove the intended assertion: ${evidence.say}. Make the run fail on the assertion the row names (\`path::test id@<line>\`), or move the row's check to \`—\`/\`manual:\` — a plan change: write ${folder ?? 'the round folder'}/BLOCKED.md.`);
			logRun('red', redCause(redBase));
			process.exit(1);
		}
	}
	// A task that rewrote the tree (a `--fix` hook, a repro) measured bytes other than the ones it was
	// handed; an unreadable before/after snapshot measured nothing provable. Either way, no green:
	// record `changed` or `unavailable` and refuse (#106 review).
	const end = contentOf(toplevel, folder);
	const gap = identityGap(start, end);
	if (gap === 'unavailable') {
		console.error('FAILED: could not read the implementation before and after the check (git could not compute the tree); refusing to record a green.');
		logRun('unavailable');
		process.exit(1);
	}
	if (gap === 'changed') {
		console.error('FAILED: the check rewrote files while it ran; a green would name bytes the run did not all measure. Commit or revert them, then run `wf check` again.');
		logRun('changed');
		process.exit(1);
	}
	// Resolve a block before recording green: the renamed file is trailing paperwork (a block the build
	// got past becomes its record). The case number names it when there is one.
	const blocked = folder ? join(toplevel, folder, 'BLOCKED.md') : null;
	if (blocked && existsSync(blocked)) renameSync(blocked, join(toplevel, folder!, resolvedBlockedName(row?.n ?? 0, readdirSync(join(toplevel, folder!)))));
	logRun('green');
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
export function suitesLine({ ts, head, runs, content, gap }: { ts: string; head: string; runs: { label: string; exit: number | null; output: string }[]; content?: string; gap?: IdentityGap }) {
	const tasks: CheckRun[] = runs.map((r) => (r.exit === 0 ? { label: r.label, exit: 0 } : { label: r.label, exit: r.exit, output: tail(r.output) }));
	const red = tasks.filter((t) => t.exit !== 0);
	// A suite whose own runner never started (a spawn error leaves its exit null) is the environment,
	// not a suite of failing tests: validate's Suites section reads this before naming failing tests.
	// Every red one, not any: a suite that really failed is the truth of the line.
	const cause: RedCause | undefined = red.length && red.every((t) => t.exit === null) ? 'environment' : undefined;
	return JSON.stringify({ ts, row: 'suites', head, tasks, result: gap ?? (red.length ? 'red' : 'green'), ...(cause ? { cause } : {}), ...(content ? { content } : {}) });
}

const tail = (output: string) => output.split('\n').slice(-TAIL).join('\n').trimEnd();

/** Run the whole suites the round's diff reaches on a committed HEAD; record green or red evidence for validate. */
export async function runSuites() {
	const toplevel = toplevelOf();
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();
	// The line says which commit it measured: product files must be committed, but round reports
	// may be dirty after a validate or critique (a refused push has already tracked those reports).
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const dirty = [...git('diff', '--name-only', 'HEAD').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter((f) => f && !isRoundPaperwork(f, folder));
	if (dirty.length) {
		console.error(`check --suites: commit first, the suites measure HEAD:\n${dirty.join('\n')}`);
		process.exit(1);
	}
	const head = git('rev-parse', 'HEAD');
	// The round's diff as wf next takes it, from where the round left its base.
	const base = git('merge-base', state?.base ?? `origin/${baseBranch}`, 'HEAD');
	const picked = suites(git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean));
	const start = Date.now();
	const step = (task: CheckTask) => new Promise<{ label: string; exit: number | null; output: string }>((resolve) => {
		if (task.cmd === undefined) return resolve({ label: task.label, exit: null, output: task.missing });
		const child = spawn(task.cmd, shellArgv(task.args), { cwd: join(toplevel, task.cwd), env: { ...process.env, ...task.env }, shell: process.platform === 'win32', windowsHide: true });
		let output = '';
		child.stdout.on('data', (d) => { output += d; });
		child.stderr.on('data', (d) => { output += d; });
		child.on('error', (e) => resolve({ label: task.label, exit: null, output: `${output}${e.message}` }));
		child.on('close', (exit) => resolve({ label: task.label, exit, output }));
	});
	// A suite's steps in order, stopping at the first red one, which then names the suite's result.
	const contentStart = contentOf(toplevel, folder);
	const runs = await Promise.all(picked.map(async (steps) => {
		let last: { label: string; exit: number | null; output: string } = { label: '', exit: 0, output: '' };
		for (const task of steps) {
			last = await step(task);
			if (last.exit !== 0) break;
		}
		return last;
	}));
	const contentEnd = contentOf(toplevel, folder);
	const gap = identityGap(contentStart, contentEnd);
	const line = suitesLine({ ts: new Date().toISOString(), head, runs, gap, content: contentEnd });
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	appendFileSync(join(toplevel, '.wf', 'checks.log'), `${line}\n`);
	if (gap === 'unavailable') {
		console.error('check --suites: could not read the implementation before and after the suites (git could not compute the tree); refusing to record a result.');
		process.exit(1);
	}
	if (gap === 'changed') {
		console.error('check --suites: a suite rewrote files while it ran; the result names bytes it did not all measure. Commit or revert them, then run `wf check --suites` again.');
		process.exit(1);
	}
	if (!runs.length) return console.log(`suites: none at ${head.slice(0, 9)}, the round's diff reaches no suite. validate reads it from checks.log.`);
	const took = `${Math.round((Date.now() - start) / 1000)}s`;
	const red = runs.filter((r) => r.exit !== 0);
	if (!red.length) return console.log(`suites green at ${head.slice(0, 9)} in ${took}: ${runs.map((r) => r.label).join(', ')}`);
	for (const r of red) console.error(`FAILED: ${r.label}\n${tail(r.output)}\n`);
	console.error(`suites red at ${head.slice(0, 9)} in ${took}: ${red.map((r) => r.label).join(', ')}. validate reads it from checks.log.`);
	process.exitCode = 1;
}

// basename, not endsWith: `deliver.selfcheck.ts` ends with `check.ts` too.
if (process.argv[1] && basename(process.argv[1]) === 'check.ts') await runCheck();
