// check.selfcheck.mjs — node check.selfcheck.mjs → exit 0 when green.
// Pure arms only (no git, no runners): the fence, the repro line, and what buildTasks makes of a
// plan row's check cell. The project's own commands: projects/<name>/checks.selfcheck.mjs.
import { checkRunLine, buildTasks, fenceViolations, isRoundPaperwork, reproCommand, resolvedBlockedName, tokenize } from './check.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

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
const seen = [];
const projectTasks = (test) => { seen.push(test); return test === 'bad' ? [{ label: 'check', missing: 'not runnable' }] : [{ label: `project ${test ?? '-'}`, cmd: 'x', args: [], cwd: '.' }]; };
const labels = (t) => t.map((x) => x.label);
const at = (cell) => { seen.length = 0; buildTasks({ row: { check: cell }, projectTasks, repro: null }); return seen[0]; };
check('a test path cell hands the path to the project', at('packages/backend/tests/test_auth.py') === 'packages/backend/tests/test_auth.py');
check('the command is the first code span; the path is its last word', at('`vitest run a/x.test.ts` (fixture carries params {floor: 3}, detail without the number)') === 'a/x.test.ts');
check('— means fence only: the project gets no test', at('—') === null && at('— (svelte-check runs on its own). Also run `repro --grep x`') === null && at('  — fence') === null);
check('a cell starting with s is not fence only', at('ssss— x') === 'x');
check('no row → the project runs the diff with no test', at(undefined) === null);
const repro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: 'node scripts/repro.mjs' });
check('check: repro runs the project tasks, then the RESEARCH.md command', JSON.stringify(labels(repro)) === '["project -","node scripts/repro.mjs"]' && repro[1].cmd === 'node' && repro[1].args.join(' ') === 'scripts/repro.mjs', JSON.stringify(repro));
const noRepro = buildTasks({ row: { check: 'repro' }, projectTasks, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1).missing?.includes('RESEARCH.md'), JSON.stringify(noRepro));
check('a `repro --grep …` cell is a path for the project, which refuses it', at('`repro --grep auction`') === 'auction');

const logLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`repro`', tasks: [{ label: 'ruff check x.py', exit: 0 }, { label: 'npx playwright test r.spec.ts', exit: 1 }], result: 'red' }));
check('checks.log line carries row, the row check, each task exit and the result', logLine.row === '2' && logLine.rowCheck === '`repro`' && logLine.tasks[1].exit === 1 && logLine.result === 'red', JSON.stringify(logLine));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
