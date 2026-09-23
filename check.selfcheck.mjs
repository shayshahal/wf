// check.selfcheck.mjs — node check.selfcheck.mjs → exit 0 when green.
// Pure arms only (no git, no runners): the fence, the repro line, and the task list
// buildTasks derives from a fixture diff.
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

const pkgFor = (f) => (f.startsWith('packages/frontend/b2b/')
  ? { name: 'jewelryx-frontend', dir: 'packages/frontend/b2b', svelte: true }
  : f.startsWith('packages/frontend/shared/types/') ? { name: '@jewelryx/types', dir: 'packages/frontend/shared/types', svelte: false } : null);
const labels = (t) => t.map((x) => x.label);

const backend = buildTasks({ changed: allowed, row: { check: 'packages/backend/tests/test_auth.py' }, pkgFor, repro: null });
check('backend diff runs ruff check, ruff format --check, pytest', JSON.stringify(labels(backend)) === JSON.stringify([
  'ruff check app/api/auth.py tests/test_auth.py', 'ruff format --check app/api/auth.py tests/test_auth.py', 'pytest tests/test_auth.py',
]), JSON.stringify(labels(backend)));
check('pytest runs from packages/backend', backend[2].cwd === 'packages/backend' && backend[2].cmd === 'uv');

const front = buildTasks({ changed: ['packages/frontend/b2b/src/lib/x.svelte', 'packages/frontend/b2b/src/lib/x.test.ts', 'packages/frontend/shared/types/src/a.ts'], row: { check: 'repro' }, pkgFor, repro: 'node scripts/repro.mjs' });
check('svelte-check only for the package that has a svelte config', labels(front).filter((l) => l.startsWith('svelte-check')).join() === 'svelte-check jewelryx-frontend', labels(front).join(' | '));
check('vitest runs the changed test file, package-relative', labels(front).includes('vitest jewelryx-frontend src/lib/x.test.ts'), labels(front).join(' | '));
check('svelte-check carries --incremental --tsgo', front[0].args.join(' ').includes('--threshold error --incremental --tsgo'), front[0].args.join(' '));
check('check: repro runs the RESEARCH.md command', front.at(-1).cmd === 'node' && front.at(-1).args.join(' ') === 'scripts/repro.mjs', JSON.stringify(front.at(-1)));

const noRepro = buildTasks({ changed: [], row: { check: 'repro' }, pkgFor, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1).missing?.includes('RESEARCH.md'), JSON.stringify(noRepro));
const pw = buildTasks({ changed: [], row: { check: 'verification/specs/login.spec.ts' }, pkgFor, repro: null });
check('a verification/ .ts check runs playwright', pw[0].args.join(' ') === 'exec playwright test verification/specs/login.spec.ts', JSON.stringify(pw[0]));
const vt = buildTasks({ changed: [], row: { check: 'packages/frontend/b2b/src/x.spec.ts' }, pkgFor, repro: null });
check('a package .ts check runs vitest inside its package', vt[0].args.join(' ') === '--filter jewelryx-frontend exec vitest run src/x.spec.ts', JSON.stringify(vt[0]));
const pyCmd = buildTasks({ changed: [], row: { check: '`pytest packages/backend/tests/test_auth.py`' }, pkgFor, repro: null });
check('a `pytest <path>` cell runs that path from packages/backend', pyCmd[0]?.args.join(' ') === 'run --frozen pytest tests/test_auth.py', JSON.stringify(pyCmd));
const vtCmd = buildTasks({ changed: [], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts`' }, pkgFor, repro: null });
check('a `vitest run <path>` cell runs that path in its package', vtCmd[0]?.args.join(' ') === '--filter jewelryx-frontend exec vitest run src/x.test.ts', JSON.stringify(vtCmd));
const vtDup = buildTasks({ changed: ['packages/frontend/b2b/src/x.test.ts'], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts`' }, pkgFor, repro: null });
check('a changed test named by the check cell runs once', vtDup.filter((t) => t.label.startsWith('vitest')).length === 1, JSON.stringify(labels(vtDup)));
const noted = buildTasks({ changed: [], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts` (fixture carries params {floor: 3}, detail without the number)' }, pkgFor, repro: null });
check('a note after the command does not replace its path', noted[0]?.args.join(' ') === '--filter jewelryx-frontend exec vitest run src/x.test.ts', JSON.stringify(noted));
check('no changes and no check cell → nothing to run', buildTasks({ changed: [], row: null, pkgFor, repro: null }).length === 0);
const grep = buildTasks({ changed: [], row: { check: '`repro --grep auction`' }, pkgFor, repro: 'node r.mjs' });
check('a check cell wf cannot run is refused, not skipped', grep.at(-1)?.missing?.includes('not runnable'), JSON.stringify(grep));
const fenceOnly = buildTasks({ changed: [], row: { check: '—' }, pkgFor, repro: null });
check('— means fence only: no check task, no refusal', fenceOnly.length === 0, JSON.stringify(fenceOnly));
const fenceNote = buildTasks({ changed: [], row: { check: '— (svelte-check runs on its own). Also run `repro --grep x`' }, pkgFor, repro: 'node r.mjs' });
check('— with a note is still fence only, even when the note has a code span', fenceNote.length === 0, JSON.stringify(fenceNote));
const leadingSpace = buildTasks({ changed: [], row: { check: '  — fence' }, pkgFor, repro: null });
check('leading spaces before — are still fence only', leadingSpace.length === 0, JSON.stringify(leadingSpace));
const sWord = buildTasks({ changed: [], row: { check: 'ssss— x' }, pkgFor, repro: null });
check('a cell starting with s is not fence only', sWord.length > 0, JSON.stringify(sWord));

const logLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`repro`', tasks: [{ label: 'ruff check x.py', exit: 0 }, { label: 'npx playwright test r.spec.ts', exit: 1 }], result: 'red' }));
check('checks.log line carries row, the row check, each task exit and the result', logLine.row === '2' && logLine.rowCheck === '`repro`' && logLine.tasks[1].exit === 1 && logLine.result === 'red', JSON.stringify(logLine));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
