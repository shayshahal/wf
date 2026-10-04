// check.selfcheck.ts — node check.selfcheck.ts → exit 0 when green.
// Pure arms only (no git, no runners): the fence, the repro line, and what buildTasks makes of a
// plan row's check cell. The project's own commands: projects/<name>/checks.selfcheck.ts.
import { failureSignature, reproVerdict } from './check.ts';
import { checkRunLine, buildTasks, fenceViolations, isReproOnly, isRoundPaperwork, reproCommand, resolvedBlockedName, tokenize } from './check.ts';
import type { CheckTask } from './check.ts';

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
const repro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: 'node scripts/repro.mjs' });
check('check: repro runs the project tasks, then the RESEARCH.md command', JSON.stringify(labels(repro)) === '["project -","node scripts/repro.mjs"]' && repro[1].cmd === 'node' && repro[1].args.join(' ') === 'scripts/repro.mjs', JSON.stringify(repro));
// Nothing serves a worktree from its creation (2026-10-04): the repro drives the app, so wf check starts the stack for it.
check('check: the repro needs the stack, the project\'s stand-in task does not', repro[1].stack === true && !repro[0].stack, JSON.stringify(repro));
const noRepro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1)!.missing?.includes('RESEARCH.md'), JSON.stringify(noRepro));
check('a `repro --grep …` cell is a path for the project, which refuses it', at('`repro --grep auction`') === 'auction');

const logLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`repro`', tasks: [{ label: 'ruff check x.py', exit: 0 }, { label: 'npx playwright test r.spec.ts', exit: 1 }], result: 'red' }));
check('checks.log line carries row, the row check, each task exit and the result', logLine.row === '2' && logLine.rowCheck === '`repro`' && logLine.tasks[1].exit === 1 && logLine.result === 'red', JSON.stringify(logLine));

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
check('three reds at one place: stable', reproVerdict([0, 1, 2].map(() => ({ exit: 1, output: defect }))).result === 'stable');
check('green on every run: green, the ticket does not reproduce here', reproVerdict([0, 1, 2].map(() => ({ exit: 0, output: '' }))).result === 'green');
check('one green run: not stable, and which one', (({ result, say }) => result === 'unstable' && say.startsWith('run 2 of 3 was green'))(reproVerdict([{ exit: 1, output: defect }, { exit: 0, output: '' }, { exit: 1, output: defect }])));
check('red twice at the defect, once at its precondition: not stable, with each run', (({ result, say }) => result === 'unstable' && say.includes('run 3: Error: precondition: sheet never opened @ outside-tap.spec.ts:18'))(reproVerdict([{ exit: 1, output: defect }, { exit: 1, output: defect }, { exit: 1, output: precondition }])));
check('the checks.log line carries the research token when it has one', JSON.parse(checkRunLine({ ts: 't', row: 'repro', rowCheck: null, tasks: [], result: 'stable', token: 'abc' })).token === 'abc' && !('token' in JSON.parse(checkRunLine({ ts: 't', row: 1, rowCheck: null, tasks: [], result: 'green' }))));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
