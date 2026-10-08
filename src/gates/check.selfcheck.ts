// check.selfcheck.ts — node check.selfcheck.ts → exit 0 when green.
// Pure arms only (no git, no runners): the fence, the repro line, and what buildTasks makes of a
// plan row's check cell. The project's own commands: projects/<name>/checks.selfcheck.ts.
import { failedInRepro, failureFrame, failureSignature, reproVerdict } from './check.ts';
import { checkCellCommand, checkCellPath, checkRunLine, buildTasks, fenceViolations, isReproOnly, isRoundPaperwork, manualCheck, redBaseFiles, redBaseRun, redCause, reproCommand, resolvedBlockedName, suitesLine, tokenize, withFixReverted } from './check.ts';
import type { CheckTask } from './check.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const folder = 'bug-reports/BJEW-1';
const allowed = ['packages/backend/app/api/auth.py', 'packages/backend/tests/test_auth.py'];
const changed = [...allowed, 'packages/backend/app/services/other.py', `${folder}/PLAN.md`, '.wf/state.json'];
const violations = fenceViolations(changed, allowed, folder);
check('a file outside the row is a violation', violations.length === 1 && violations[0] === 'packages/backend/app/services/other.py', JSON.stringify(violations));
check('the round folder is never fenced', isRoundPaperwork(`${folder}/BLOCKED.md`, folder));
check('.wf state is never fenced', isRoundPaperwork('.wf/state.json', folder));
check('a lookalike sibling folder is still fenced', !isRoundPaperwork('bug-reports/BJEW-12/PLAN.md', folder));
check('T1/T2 files in the round folder are never fenced', ['SPEC.md', 'SPEC-REVIEW.md', 'REVIEW.md'].every((f) => isRoundPaperwork(`${folder}/${f}`, folder)));
check('a SPEC.md at the worktree root is fenced now: it belongs in the round folder', !isRoundPaperwork('SPEC.md', folder));
check('a resolved block is named by its commit', resolvedBlockedName(2, ['PLAN.md']) === 'BLOCKED-commit2.md');
check('a second resolved block on the same commit gets a suffix', resolvedBlockedName(2, ['BLOCKED-commit2.md']) === 'BLOCKED-commit2-2.md');
check('a SPEC.md below the root is still fenced', !isRoundPaperwork('packages/backend/SPEC.md', folder));

const research = ['# r', '', '## Repro', 'command: uv run --frozen pytest tests/test_auth.py -k otp', 'red output:', '1 failed', '', '## Seen before'].join('\r\n');
check('repro command read from RESEARCH.md', reproCommand(research) === 'uv run --frozen pytest tests/test_auth.py -k otp', String(reproCommand(research)));
check('no ## Repro → null', reproCommand('# r\nnothing') === null);
check('tokenize honours double quotes', JSON.stringify(tokenize('pnpm exec playwright test "a b.spec.ts"')) === '["pnpm","exec","playwright","test","a b.spec.ts"]', JSON.stringify(tokenize('pnpm exec playwright test "a b.spec.ts"')));

// buildTasks against a stand-in project: it records the test path it was handed.
const seen: (string | null)[] = [];
const projectTasks = (test: string | null): CheckTask[] => { seen.push(test); return test === 'bad' ? [{ label: 'check', missing: 'not runnable' }] : [{ label: `project ${test ?? '-'}`, cmd: 'x', args: [], cwd: '.' }]; };
const labels = (t: CheckTask[]) => t.map((x) => x.label);
const at = (cell: string | undefined) => { seen.length = 0; buildTasks({ row: { check: cell }, projectTasks, repro: null }); return seen[0]; };
check('a test path cell hands the path to the project', at('packages/backend/tests/test_auth.py') === 'packages/backend/tests/test_auth.py');
check('the command is the first code span; the path is its last word', at('`vitest run a/x.test.ts` (fixture carries params {floor: 3}, detail without the number)') === 'a/x.test.ts');
check('— means fence only: the project gets no test', at('—') === null && at('— (svelte-check runs on its own). Also run `repro --grep x`') === null && at('  — fence') === null);
check('a cell starting with s is not fence only', at('ssss— x') === 'x');
check('no row → the project runs the diff with no test', at(undefined) === null);
check('a manual: cell is fence only: the project gets no test, and its last word is not a path', at('manual: open /admin/listings, the badge shows 3') === null, String(at('manual: open /admin/listings, the badge shows 3')));
check('manualCheck reads the text; no text, another cell, or none is null', manualCheck('manual: the badge shows 3') === 'the badge shows 3' && manualCheck('Manual: x') === 'x' && manualCheck('manual:') === null && manualCheck('—') === null && manualCheck('packages/backend/tests/test_auth.py') === null, String(manualCheck('manual: the badge shows 3')));
const repro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: 'node scripts/repro.mjs' });
check('check: repro runs the project tasks, then the RESEARCH.md command', JSON.stringify(labels(repro)) === '["project -","node scripts/repro.mjs"]' && repro[1].cmd === 'node' && repro[1].args.join(' ') === 'scripts/repro.mjs', JSON.stringify(repro));
// Nothing serves a worktree from its creation (2026-10-04): the repro drives the app, so wf check starts the stack for it.
check('check: the repro needs the stack, the project\'s stand-in task does not', repro[1].stack === true && !repro[0].stack, JSON.stringify(repro));
const noRepro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1)!.missing?.includes('RESEARCH.md'), JSON.stringify(noRepro));
check('a `repro --grep …` cell is a path for the project, which refuses it', at('`repro --grep auction`') === 'auction');

const logLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`repro`', tasks: [{ label: 'ruff check x.py', exit: 0 }, { label: 'npx playwright test r.spec.ts', exit: 1 }], result: 'red' }));
check('checks.log line carries row, the row check, each task exit and the result', logLine.row === '2' && logLine.rowCheck === '`repro`' && logLine.tasks[1].exit === 1 && logLine.result === 'red', JSON.stringify(logLine));
// BJEW-461 (2026-10-06): a gate that never ran (the stack, a task wf could not build) is the
// environment, not a check the round failed; a task that ran and exited non-zero is the code.
check('a red where no task ran is the environment; a task that ran and failed is the code', redCause({ exit: null }) === 'environment' && redCause({ exit: 1 }) === 'code' && redCause({ exit: 0 }) === 'code');
check('the cause rides the red line, and a green line has none', JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'stack', exit: null, missing: 'the stack never answered' }], result: 'red', cause: 'environment' })).cause === 'environment' && !('cause' in JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'x', exit: 0 }], result: 'green' }))));

// A row that only edits the repro runs it, expecting red: the round's before-the-fix run (TJEW-670).
check('a row of repro files only is repro-only', isReproOnly(['bug-reports/r/repro/a.spec.ts'], 'bug-reports/r') && !isReproOnly(['bug-reports/r/repro/a.spec.ts', 'packages/x.ts'], 'bug-reports/r') && !isReproOnly([], 'bug-reports/r') && !isReproOnly(['bug-reports/r2/repro/a.spec.ts'], 'bug-reports/r'));
const fixRepro = buildTasks({ row: { check: '\u2014' }, projectTasks, repro: 'node scripts/repro.mjs', reproOnly: true });
check('a repro-only row runs the repro even when its cell says fence only, and expects red', fixRepro.at(-1)!.label === 'node scripts/repro.mjs' && fixRepro.at(-1)!.expectRed === true);
check('any other row with check repro expects green', !buildTasks({ row: { check: 'repro' }, projectTasks, repro: 'node scripts/repro.mjs' }).at(-1)!.expectRed);

// ── wf check --repro: three runs, red at one place (TJEW-665)
const defect = "  1) [chromium] › repro/outside-tap.spec.ts:12:5 › closes on outside tap (5.2s)\n\n    Error: sheet still open after a tap outside it\n\n      27 |   await page.tap('body');\n    > 29 |   expect(open).toBe(false);\n\n        at C:\\wt\\x\\bug-reports\\r\\repro\\outside-tap.spec.ts:29:23\n        at node_modules/playwright/lib/x.js:1:1\n\n  1 failed\n";
const precondition = "  1) [chromium] › repro/outside-tap.spec.ts:12:5 › closes on outside tap (5.2s)\n\n    Error: precondition: sheet never opened\n\n      27 |   await page.tap('body');\n    > 29 |   expect(open).toBe(false);\n\n        at C:\\wt\\x\\bug-reports\\r\\repro\\outside-tap.spec.ts:18:23\n        at node_modules/playwright/lib/x.js:1:1\n\n  1 failed\n";
check('the signature: the error line and the first frame outside node_modules, no durations', failureSignature(defect) === 'Error: sheet still open after a tap outside it @ outside-tap.spec.ts:29', failureSignature(defect));
check('the same failure in another run, timings aside, has the same signature', failureSignature(defect.replace('(5.2s)', '(7.9s)')) === failureSignature(defect));
check('no error line or frame: the last line stands for the run', failureSignature('a\nexit code 1\n\n') === 'exit code 1');
check('three reds at one place: stable', reproVerdict([0, 1, 2].map(() => ({ exit: 1, output: defect })), 'bug-reports/r').result === 'stable');
check('green on every run: green, the ticket does not reproduce here', reproVerdict([0, 1, 2].map(() => ({ exit: 0, output: '' })), 'bug-reports/r').result === 'green');
check('one green run: not stable, and which one', (({ result, say }) => result === 'unstable' && say.startsWith('run 2 of 3 was green'))(reproVerdict([{ exit: 1, output: defect }, { exit: 0, output: '' }, { exit: 1, output: defect }], 'bug-reports/r')));
check('red twice at the defect, once at its precondition: not stable, with each run', (({ result, say }) => result === 'unstable' && say.includes('run 3: Error: precondition: sheet never opened @ outside-tap.spec.ts:18'))(reproVerdict([{ exit: 1, output: defect }, { exit: 1, output: defect }, { exit: 1, output: precondition }], 'bug-reports/r')));
// BJEW-461 (2026-10-06): the shared global setup's login failed before any spec ran, three times at one place.
const setup = "Error: control-jewelryx auth buyer: page.waitForSelector: Timeout 30000ms exceeded.\n  - waiting for locator('input[name=\"email\"]')\n\n   at ..\\docs\\agents\\verify-jewelryx\\repro-global-setup.ts:13\n\n> 13 | \t\t\te ? fail(new Error(`control-jewelryx auth ${role}: ${err || e.message}`)) : done(),\n    at C:\\wt\\x\\docs\\agents\\verify-jewelryx\\repro-global-setup.ts:13:13\n";
check('the first own frame, in parentheses or bare, slashes forward', failureFrame('    at fn (C:\\wt\\x\\a.ts:3:9)\n')?.file === 'C:/wt/x/a.ts' && failureFrame(setup)?.file === 'C:/wt/x/docs/agents/verify-jewelryx/repro-global-setup.ts' && failureFrame('exit code 1') === null);
check('a frame in the round\'s repro is in it; a shared setup, another round\'s repro or no frame is not', failedInRepro(defect, 'bug-reports/r') && !failedInRepro(setup, 'bug-reports/r') && !failedInRepro(defect, 'bug-reports/r2') && !failedInRepro('exit code 1', 'bug-reports/r'));
check('three reds at one place in the shared setup: outside, not stable', (({ result, say }) => result === 'outside' && say.includes('repro-global-setup.ts:13'))(reproVerdict([0, 1, 2].map(() => ({ exit: 1, output: setup })), 'bug-reports/r')));
check('red at the defect once, in the setup twice: not stable', reproVerdict([{ exit: 1, output: defect }, { exit: 1, output: setup }, { exit: 1, output: setup }], 'bug-reports/r').result === 'unstable');
check('the checks.log line carries the research token when it has one', JSON.parse(checkRunLine({ ts: 't', row: 'repro', rowCheck: null, tasks: [], result: 'stable', token: 'abc' })).token === 'abc' && !('token' in JSON.parse(checkRunLine({ ts: 't', row: 1, rowCheck: null, tasks: [], result: 'green' }))));

// wf check --suites: one line, the head it measured, a red suite's output tail.
const sl = JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [{ label: 'suite one', exit: 0, output: 'x\n3201 passed' }, { label: 'suite two', exit: 1, output: `${'line\n'.repeat(60)}FAIL src/x.test.ts` }] }));
check('suites line: row suites, its head, red when any suite is', sl.row === 'suites' && sl.head === 'abc' && sl.result === 'red');
check('suites line: a green suite keeps no output, a red one its last 40 lines', sl.tasks[0].output === undefined && sl.tasks[1].output.split('\n').length === 40 && sl.tasks[1].output.endsWith('FAIL src/x.test.ts'));
check('suites line: green when every suite exits 0', JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [{ label: 'a', exit: 0, output: '' }] })).result === 'green');
check('suites line: a diff that reaches no suite is recorded, with no tasks, so wf next moves on', JSON.stringify(JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [] }))) === '{"ts":"t","row":"suites","head":"abc","tasks":[],"result":"green"}');
// A suite whose runner never started is the environment, not a suite of failing tests; one that ran
// and failed is the code, and a real failure beside an unrunnable suite keeps the line about the code.
const suitesCause = (runs: { label: string; exit: number | null; output: string }[]) => JSON.parse(suitesLine({ ts: 't', head: 'abc', runs })).cause;
check('suites line: a runner that never started is the environment', suitesCause([{ label: 'a', exit: null, output: 'spawn failed' }]) === 'environment' && suitesCause([{ label: 'a', exit: 1, output: 'FAIL' }]) === undefined && suitesCause([{ label: 'a', exit: null, output: 'spawn failed' }, { label: 'b', exit: 1, output: 'FAIL' }]) === undefined);

// Red-base: the row's test must fail with the row's change taken back to HEAD. The file set leaves
// the test in place; the stash dance restores the working change whatever the run does.
check('the check cell\'s path: the first code span, its last word; — and manual: are fence only', checkCellPath('`vitest run a/x.test.ts` (a note)') === 'a/x.test.ts' && checkCellPath('pytest packages/backend/tests/test_auth.py') === 'packages/backend/tests/test_auth.py' && checkCellPath('— note `x.ts`') === '' && checkCellPath('manual: open /admin/listings') === '' && checkCellPath(undefined) === '' && checkCellCommand('`vitest run a/x.test.ts` (a note)') === 'vitest run a/x.test.ts', JSON.stringify([checkCellPath('`vitest run a/x.test.ts` (a note)'), checkCellPath('— note `x.ts`')]));
const redRow = { files: 'packages/backend/app/api/auth.py packages/backend/tests/test_auth.py', check: 'packages/backend/tests/test_auth.py' };
check('red-base keeps the row\'s test and the round paperwork out of the revert', JSON.stringify(redBaseFiles({ changed, row: redRow, folder, testPath: 'packages/backend/tests/test_auth.py' })) === '["packages/backend/app/api/auth.py"]', JSON.stringify(redBaseFiles({ changed, row: redRow, folder, testPath: 'packages/backend/tests/test_auth.py' })));
check('red-base with nothing but the test to revert is skipped', redBaseFiles({ changed: ['packages/backend/tests/test_auth.py'], row: { files: 'packages/backend/tests/test_auth.py' }, folder, testPath: 'packages/backend/tests/test_auth.py' }).length === 0 && redBaseFiles({ changed, row: null, folder, testPath: 'x' }).length === 0);
const redTasks: CheckTask[] = [{ label: 'ruff check app/api/auth.py', cmd: 'uv', args: [], cwd: '.' }, { label: 'pytest tests/test_auth.py', cmd: 'uv', args: [], cwd: 'packages/backend', redBase: true }, { label: 'lefthook pre-push', cmd: 'pnpm', args: [], cwd: '.' }];
const plan = redBaseRun({ tasks: redTasks, changed, row: redRow, folder });
check('red-base picks the project\'s marked task, not lint or the hooks, and the row files without the test', plan?.task.label === 'pytest tests/test_auth.py' && JSON.stringify(plan.revert) === '["packages/backend/app/api/auth.py"]', JSON.stringify(plan));
check('red-base is skipped when the project marked nothing, or the row only edits its test', redBaseRun({ tasks: [{ label: 'ruff', cmd: 'uv', args: [], cwd: '.' }], changed, row: redRow, folder }) === null && redBaseRun({ tasks: redTasks, changed: ['packages/backend/tests/test_auth.py'], row: { files: 'packages/backend/tests/test_auth.py', check: 'packages/backend/tests/test_auth.py' }, folder }) === null);
const redRepo = mkdtempSync(join(tmpdir(), 'wf-redbase-'));
const redGit = (args: string[]) => execFileSync('git', args, { cwd: redRepo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
redGit(['init', '-q']);
// Byte-preserving on Windows: the arm is about the stash dance, not about CRLF.
redGit(['config', 'core.autocrlf', 'false']);
writeFileSync(join(redRepo, 'product.ts'), 'fixed\n');
redGit(['add', 'product.ts']);
redGit(['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-q', '-m', 'base']);
writeFileSync(join(redRepo, 'product.ts'), 'fix\n');
const atBase = withFixReverted(redRepo, ['product.ts'], () => readFileSync(join(redRepo, 'product.ts'), 'utf8'));
check('red-base runs against HEAD and puts the working change back', atBase === 'fixed\n' && readFileSync(join(redRepo, 'product.ts'), 'utf8') === 'fix\n', JSON.stringify(atBase));
writeFileSync(join(redRepo, 'new.ts'), 'new\n');
const goneAtBase = withFixReverted(redRepo, ['new.ts'], () => existsSync(join(redRepo, 'new.ts')));
check('red-base takes an untracked row file away for the run and restores it', goneAtBase === false && existsSync(join(redRepo, 'new.ts')));
rmSync(redRepo, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
