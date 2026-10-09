// evidence.selfcheck.ts — node projects/jewelryx/evidence.selfcheck.ts → exit 0 when green.
// What a red-base run's own output proves (evidence.ts, issue #109): a framework assertion the runner
// reported FAILED at the intended origin, versus a missing runner, an import/collection or setup
// error, a non-assertion exception at the bound line, a failure at another origin, a failure outside
// the target, or a report that cannot be tied. A `passed` verdict must name the selected case in the
// runner's report, not count a total (#109 review): a raw `-t`/`-g` selector or a suite total can
// report `1 passed` while the row's own case never ran. Offline and deterministic: the pytest arms are
// real captured output (2026-10-09, `uv run --no-project --with pytest`, pytest 9.1.1; temp paths
// rewritten to the project layout), the vitest arms real captured output (vitest 5.0.1) and the
// playwright arms real captured browser-free `--reporter=json` reports (playwright 1.61.1), plus one
// real `node` CLI crash capture for the repro classifier.
import { matchesTarget, notIntendedAssertion, redBaseEvidence, reproFailure, runnerOf, sameTestFile, selectedTestPath, targetLabel } from './evidence.ts';
import type { RunnerEvidence } from './evidence.ts';
import { checkTasks, selectorLiteral } from './checks.ts';
import { checkCellTarget } from '../../src/gates/check.ts';
import type { CheckTarget } from '../../src/gates/check.ts';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const t = (file: string, id: string | null = null, line: number | null = null, refactor = false): CheckTarget => ({ refactor, file, id, line });
// The helpers mirror the commands checks.ts builds -- the runner's own cwd, the per-test reporter (so a
// pass names its case) and the selected id. The `-t`/`-g` value does not change what the parser reads
// (the report does), so it stays the raw id here; checks.selfcheck covers the escaped selector.
const pkgDir = (file: string) => file.split('/').slice(0, 3).join('/'); // packages/frontend/<name>
const pyt = (exit: number | null, output: string, target: CheckTarget) => redBaseEvidence({ cmd: 'uv', args: ['run', '--frozen', 'pytest', `${target.file.replace(/^packages\/backend\//, '')}${target.id ? `::${target.id}` : ''}`, ...(target.id ? ['-rA'] : [])], cwd: 'packages/backend', exit, output, target });
const vitest = (exit: number | null, output: string, target: CheckTarget) => redBaseEvidence({ cmd: 'pnpm', args: ['exec', 'vitest', 'run', target.file.replace(/^packages\/frontend\/[^/]+\//, ''), ...(target.id ? ['-t', target.id, '--reporter=verbose'] : [])], cwd: pkgDir(target.file), exit, output, target });
// The selected Playwright task runs in verification (checks.ts) with `--reporter=json`, so the runner
// prints a verification-relative path and the evidence resolves it through the task's own cwd; the
// task's absolute error location binds through the worktree root core passes (`root`), #109 review.
const PW_ROOT = 'C:/Users/Shay/AppData/Local/Temp/wf109-json-probe';
const pw = (exit: number | null, output: string, target: CheckTarget, cwd = 'verification', root: string | undefined = PW_ROOT) => redBaseEvidence({ cmd: 'pnpm', args: ['exec', 'playwright', 'test', target.file.replace(/^verification\//, ''), ...(target.id ? ['-g', target.id] : []), '--reporter=json'], cwd, root, exit, output, target });
const verdict = (e: RunnerEvidence) => e.verdict;

// ── the target and the path resolution
check('the check cell is a path, path::test id, or path::test id@line', JSON.stringify(checkCellTarget('packages/backend/tests/test_auth.py')) === JSON.stringify(t('packages/backend/tests/test_auth.py')) && JSON.stringify(checkCellTarget('packages/backend/tests/test_auth.py::test_otp_login@7')) === JSON.stringify(t('packages/backend/tests/test_auth.py', 'test_otp_login', 7)), JSON.stringify(checkCellTarget('packages/backend/tests/test_auth.py::test_otp_login@7')));
check('refactor: is read outside and inside the code span; —, manual: and repro name no target', checkCellTarget('refactor: `a/b.py::test_x`')?.refactor === true && checkCellTarget('`refactor: a/b.py::test_x`')?.refactor === true && checkCellTarget('—') === null && checkCellTarget('manual: open /admin/listings') === null && checkCellTarget('repro') === null);
check('the target reads back as a label', targetLabel(t('a/b.py', 'test_x', 7)) === 'a/b.py::test_x@7' && targetLabel(t('a/b.py')) === 'a/b.py');
check('the task\'s printed test path is the selected one', selectedTestPath(['run', '--frozen', 'pytest', 'tests/a.py::test_x']) === 'tests/a.py' && selectedTestPath(['--filter', 'x', 'exec', 'vitest', 'run', 'src/a.test.ts', '-t', 'a > b']) === 'src/a.test.ts' && selectedTestPath(['--dir', 'verification', 'exec', 'playwright', 'test', 'verification/a.spec.ts']) === 'verification/a.spec.ts' && selectedTestPath(['run', '--frozen', 'pytest']) === null);
const ctx = { cwd: 'packages/backend', selected: 'tests/test_auth.py' };
check('a runner path ties to the target by the repo path, the cwd, or the selected path -- never an arbitrary suffix', sameTestFile('packages/backend/tests/test_auth.py', t('packages/backend/tests/test_auth.py'), ctx) && sameTestFile('tests/test_auth.py', t('packages/backend/tests/test_auth.py'), ctx) && !sameTestFile('other/tests/test_auth.py', t('packages/backend/tests/test_auth.py'), ctx));
// The selected Playwright task's declared cwd IS the runner's cwd (checks.ts): a report naming the
// verification-relative path resolves to the row's repo path through it. With a declared `.` the
// pre-#109 `--dir verification` task kept the repo path as its arg, so the printed `tests/…` named
// neither the repo path, the cwd join, nor the selected arg and the pass was unavailable.
check('a verification-relative runner path resolves through the task cwd', sameTestFile('tests/account.spec.ts', t('verification/tests/account.spec.ts'), { cwd: 'verification', selected: 'tests/account.spec.ts' }));
// Playwright's error location is absolute. It binds only through the actual worktree root core ran the
// task in: another worktree, or no root at all, is not the target (#109 review).
check('an absolute runner path binds only through the actual worktree root', sameTestFile(`${PW_ROOT}/verification/tests/account.spec.ts`, t('verification/tests/account.spec.ts'), { cwd: 'verification', root: PW_ROOT, selected: 'tests/account.spec.ts' }) && !sameTestFile('C:/other/wt/verification/tests/account.spec.ts', t('verification/tests/account.spec.ts'), { cwd: 'verification', root: PW_ROOT, selected: 'tests/account.spec.ts' }) && !sameTestFile(`${PW_ROOT}/verification/tests/account.spec.ts`, t('verification/tests/account.spec.ts'), { cwd: 'verification', selected: 'tests/account.spec.ts' }));
check('a node id matches its file and test id, and only then', matchesTarget('tests/test_auth.py::test_otp_login', t('packages/backend/tests/test_auth.py', 'test_otp_login'), ctx) && !matchesTarget('tests/test_auth.py::test_other', t('packages/backend/tests/test_auth.py', 'test_otp_login'), ctx) && !matchesTarget('other/tests/test_auth.py::test_otp_login', t('packages/backend/tests/test_auth.py', 'test_otp_login'), ctx));
check('the known runners, from the task command', runnerOf({ cmd: 'uv', args: ['run', '--frozen', 'pytest', 'tests/a.py'] }) === 'pytest' && runnerOf({ cmd: 'pnpm', args: ['--filter', 'x', 'exec', 'vitest', 'run', 'a.test.ts'] }) === 'vitest' && runnerOf({ cmd: 'pnpm', args: ['--dir', 'verification', 'exec', 'playwright', 'test', 'a.spec.ts'] }) === 'playwright' && runnerOf({ cmd: 'node', args: ['r.mjs'] }) === null);
check('an unknown task fails closed', verdict(redBaseEvidence({ cmd: 'node', args: ['scripts/repro.mjs'], cwd: '.', exit: 1, output: 'boom', target: t('x') })) === 'unavailable');

// ── pytest, real captured output (2026-10-09, pytest 9.1.1)
const passOne = '.' + ' '.repeat(70) + '[100%]\n\n' + '1 passed in 0.01s\n';
const failOne = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '_______________________________ test_otp_login ________________________________',
  '',
  '    def test_otp_login():',
  '>       assert 401 == 200',
  'E       assert 401 == 200',
  '',
  'tests\\test_auth.py:2: AssertionError',
  '=========================== short test summary info ===========================',
  'FAILED tests/test_auth.py::test_otp_login - assert 401 == 200',
  '1 failed in 0.04s',
  '',
].join('\n');
// The #109 gap: `assert total() == 120` at the bound line raised NameError -- the assertion never ran.
const nameError = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '_________________________________ test_total __________________________________',
  '',
  '    def test_total():',
  '>       assert total() == 120',
  '               ^^^^^',
  'E       NameError: name \'total\' is not defined',
  '',
  'tests\\test_nameerror.py:2: NameError',
  '=========================== short test summary info ===========================',
  "FAILED tests/test_nameerror.py::test_total - NameError: name 'total' is not defined",
  '1 failed in 0.04s',
  '',
].join('\n');
// A failure that originated in a helper line 2 while the caller (and the bound line) is 6.
const helperValue = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '__________________________________ test_bug ___________________________________',
  '',
  '    def test_bug():',
  '>       assert compute() == 120',
  '               ^^^^^^^^^',
  '',
  'tests\\test_helper.py:6: ',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '',
  '    def compute():',
  '>       raise ValueError("boom in compute")',
  'E       ValueError: boom in compute',
  '',
  'tests\\test_helper.py:2: ValueError',
  '=========================== short test summary info ===========================',
  'FAILED tests/test_helper.py::test_bug - ValueError: boom in compute',
  '1 failed in 0.03s',
  '',
].join('\n');
const helperAssert = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '__________________________________ test_bug ___________________________________',
  '',
  '    def test_bug():',
  '>       assert validate(100) is None',
  '               ^^^^^^^^^^^^^',
  '',
  'tests\\test_helper_assert.py:6: ',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '',
  'value = 100',
  '',
  '    def validate(value):',
  '>       assert value == 120',
  'E       assert 100 == 120',
  '',
  'tests\\test_helper_assert.py:2: AssertionError',
  '=========================== short test summary info ===========================',
  'FAILED tests/test_helper_assert.py::test_bug - assert 100 == 120',
  '1 failed in 0.03s',
  '',
].join('\n');
// The precondition: the test failed at its login assertion (line 10) before the pricing assertion (11).
const precondition = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '__________________________________ test_bug ___________________________________',
  '',
  '    def test_bug():',
  '>       assert login() == 200',
  'E       assert 401 == 200',
  'E        +  where 401 = login()',
  '',
  'tests\\test_bug.py:10: AssertionError',
  '=========================== short test summary info ===========================',
  'FAILED tests/test_bug.py::test_bug - assert 401 == 200',
  '1 failed in 0.04s',
  '',
].join('\n');
const importError = [
  '=================================== ERRORS ====================================',
  '_____________________ ERROR collecting tests/test_impl.py _____________________',
  "ImportError while importing test module 'C:\\wt\\x\\tests\\test_impl.py'.",
  'Traceback:',
  'tests\\test_impl.py:1: in <module>',
  '    from app.auth import login',
  "E   ModuleNotFoundError: No module named 'app'",
  '=========================== short test summary info ===========================',
  'ERROR tests/test_impl.py',
  '!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!',
  '1 error in 0.14s',
  '',
].join('\n');
const setupError = [
  'E                                                                        [100%]',
  '=================================== ERRORS ====================================',
  '_______________________ ERROR at setup of test_needs_db _______________________',
  "E       fixture 'db' not found",
  '=========================== short test summary info ===========================',
  'ERROR tests/test_setup.py::test_needs_db',
  '1 error in 0.01s',
  '',
].join('\n');
// A refactor's reverted run: one unrelated test passed and the selected one was skipped (a real
// refresh run, pytest 9.1.1) -- a suite total, not evidence the selected case ran.
const twoTotal = 's.' + ' '.repeat(70) + '[100%]\n\n' + '1 passed, 1 skipped in 0.00s\n';
const oneSkipped = 's' + ' '.repeat(70) + '[100%]\n\n' + '1 skipped in 0.00s\n';

check('a test that ran and FAILED on an assertion at the named line is proof, with its origin', ((e) => e.verdict === 'behavioral-failure' && e.tests[0].id === 'tests/test_auth.py::test_otp_login' && e.tests[0].error === 'assert 401 == 200' && e.tests[0].source === 'tests/test_auth.py:2')(pyt(1, failOne, t('packages/backend/tests/test_auth.py', 'test_otp_login', 2))), JSON.stringify(pyt(1, failOne, t('packages/backend/tests/test_auth.py', 'test_otp_login', 2))));
check('the named line binds: the same red at another line is not proof', verdict(pyt(1, failOne, t('packages/backend/tests/test_auth.py', 'test_otp_login', 7))) === 'unavailable');
// Blocker 1: an exception at the bound line is not an assertion.
check('a NameError at the bound line is not proof -- the assertion never ran', ((e) => e.verdict === 'unavailable' && e.say.includes('NameError') && e.say.includes('not a framework assertion'))(pyt(1, nameError, t('packages/backend/tests/test_nameerror.py', 'test_total', 2))), JSON.stringify(pyt(1, nameError, t('packages/backend/tests/test_nameerror.py', 'test_total', 2))));
// Blocker 2: the origin is the failing call, not the caller at the bound line.
check('a non-assertion exception raised in a helper is not proof, whatever the caller line', ((e) => e.verdict === 'unavailable' && e.say.includes('ValueError') && e.say.includes('not a framework assertion'))(pyt(1, helperValue, t('packages/backend/tests/test_helper.py', 'test_bug', 6))), JSON.stringify(pyt(1, helperValue, t('packages/backend/tests/test_helper.py', 'test_bug', 6))));
check('a helper assertion at line 2 is proof when the row names line 2, and unavailable when it names the caller line 6', verdict(pyt(1, helperAssert, t('packages/backend/tests/test_helper_assert.py', 'test_bug', 2))) === 'behavioral-failure' && verdict(pyt(1, helperAssert, t('packages/backend/tests/test_helper_assert.py', 'test_bug', 6))) === 'unavailable', JSON.stringify(pyt(1, helperAssert, t('packages/backend/tests/test_helper_assert.py', 'test_bug', 6))));
// The #109 motivating shape, captured fresh: a login precondition at line 10 before the pricing line 11.
check('a failure on a precondition is unavailable when the row names line 11, proof when it names line 10', verdict(pyt(1, precondition, t('packages/backend/tests/test_bug.py', 'test_bug', 11))) === 'unavailable' && verdict(pyt(1, precondition, t('packages/backend/tests/test_bug.py', 'test_bug', 10))) === 'behavioral-failure', JSON.stringify(pyt(1, precondition, t('packages/backend/tests/test_bug.py', 'test_bug', 11))));
check('a row that names no line cannot bind', verdict(pyt(1, failOne, t('packages/backend/tests/test_auth.py', 'test_otp_login'))) === 'unavailable');
check('all passed is not a red-base proof', verdict(pyt(0, passOne, t('packages/backend/tests/test_pass.py'))) === 'passed');
check('a passing run shows exactly the one selected test ran: a suite total is not proof', verdict(pyt(0, twoTotal, t('packages/backend/tests/test_pass.py', 'test_bug'))) === 'unavailable' && verdict(pyt(0, oneSkipped, t('packages/backend/tests/test_pass.py', 'test_bug'))) === 'unavailable');
const crlf = passOne.replace(/\n/g, '\r\n');
check('a CRLF report is read the same', verdict(pyt(0, crlf, t('packages/backend/tests/test_pass.py'))) === 'passed');
// A selected task's pass must name the case (real captured `-rA` output, pytest 9.1.1, 2026-10-09):
// `1 passed` alone does not say which test ran, so the report's own PASSED line is the identity.
const passNamed = ['collected 1 item', '', 'tests/test_bug.py .                                                      [100%]', '', '=========================== short test summary info ============================', 'PASSED tests/test_bug.py::test_bug', '============================== 1 passed in 0.00s ==============================', ''].join('\n');
check('a selected pytest task passes only when the report names the selected test', ((e) => e.verdict === 'passed' && e.test === 'tests/test_bug.py::test_bug')(pyt(0, passNamed, t('packages/backend/tests/test_bug.py', 'test_bug'))), JSON.stringify(pyt(0, passNamed, t('packages/backend/tests/test_bug.py', 'test_bug'))));
check('the #109 counterexample: `1 passed` while the report names another test is not proof', verdict(pyt(0, passNamed.replace('::test_bug', '::test_other'), t('packages/backend/tests/test_bug.py', 'test_bug'))) === 'unavailable');
check('a selected pytest pass with no PASSED line is not proof: the total alone is not the case', verdict(pyt(0, passOne, t('packages/backend/tests/test_bug.py', 'test_bug'))) === 'unavailable');
check('two PASSED tests matching the selected node id is ambiguous, not proof', verdict(pyt(0, `${passNamed}\nPASSED tests/test_bug.py::TestX::test_bug\n`, t('packages/backend/tests/test_bug.py', 'test_bug'))) === 'unavailable');

check('an import/collection error is a runner failure, never proof -- nonzero exit is not enough', ((e) => e.verdict === 'runner-failure' && e.kind === 'collection-error' && e.detail.includes('No module named'))(pyt(2, importError, t('packages/backend/tests/test_impl.py', 'test_impl', 1))), JSON.stringify(pyt(2, importError, t('packages/backend/tests/test_impl.py', 'test_impl', 1))));
check('a setup/fixture error is a runner failure, even though pytest exits 1 like a failed test', ((e) => e.verdict === 'runner-failure' && e.kind === 'setup-error')(pyt(1, setupError, t('packages/backend/tests/test_setup.py', 'test_needs_db', 1))));
check('the path pytest was given was not found (exit 4) is a runner failure', verdict(pyt(4, 'ERROR: file or directory not found: nope.py\n\nno tests ran in 0.00s', t('nope.py'))) === 'runner-failure');
check('nothing collected (exit 5) is a runner failure, not proof', verdict(pyt(5, '1 deselected in 0.00s', t('packages/backend/tests/test_auth.py'))) === 'runner-failure');
check('no exit status (missing executable or spawn failure) is a runner failure', ((e) => e.verdict === 'runner-failure' && e.kind === 'no-exit-status')(pyt(null, '', t('packages/backend/tests/test_auth.py', 'test_otp_login', 2))));
check('an empty, unreadable red report fails closed', verdict(pyt(1, 'boom', t('packages/backend/tests/test_auth.py'))) === 'unavailable');

// ── vitest, documented report shape
const vTest = [' FAIL  src/lib/x.test.ts > cart > drops the line', 'AssertionError: expected 1 to be 2', ' ❯ src/lib/x.test.ts:12:5', '', ' Test Files  1 failed (1)', '      Tests  1 failed (1)', ''].join('\n');
const vType = [' FAIL  src/lib/x.test.ts > cart > drops the line', "TypeError: cannot read properties of undefined (reading 'total')", ' ❯ src/lib/x.test.ts:12:5', '', ' Test Files  1 failed (1)', '      Tests  1 failed (1)', ''].join('\n');
const vSuite = [' FAIL  src/lib/x.test.ts [ src/lib/x.test.ts ]', "Error: Cannot find module './missing'", ' ❯ src/lib/x.test.ts:1:1', '', ' Test Files  1 failed (1)', '      Tests  no tests', ''].join('\n');
const vPass = [' ✓ src/lib/x.test.ts (2 tests) 12ms', '', ' Test Files  1 passed (1)', '      Tests  1 passed (1)', ''].join('\n');
check('vitest: an AssertionError at the named line is proof, with its origin', ((e) => e.verdict === 'behavioral-failure' && e.tests[0].id.includes('drops the line') && e.tests[0].source === 'src/lib/x.test.ts:12')(vitest(1, vTest, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line', 12))));
check('vitest: a TypeError at the same line is not proof', ((e) => e.verdict === 'unavailable' && e.say.includes('not a framework assertion'))(vitest(1, vType, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line', 12))));
check('vitest: a selected name with spaces still matches the one case that ran', verdict(vitest(1, vTest, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops', 12))) === 'behavioral-failure');
check('vitest: a failure at another line of the target test is not proof', verdict(vitest(1, vTest, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line', 20))) === 'unavailable');
check('vitest: a Failed Suite (the file did not load) is a collection error, not proof', ((e) => e.verdict === 'runner-failure' && e.kind === 'collection-error')(vitest(1, vSuite, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line', 5))));
check('vitest: no test files found is a runner failure', verdict(vitest(1, 'No test files found, exiting with code 1', t('packages/frontend/b2b/src/lib/x.test.ts'))) === 'runner-failure');
check('vitest: exactly the one selected test passing is proof; a skipped case is not', verdict(vitest(0, vPass, t('packages/frontend/b2b/src/lib/x.test.ts'))) === 'passed' && verdict(vitest(0, [' Test Files  1 passed (1)', '      Tests  1 passed | 1 skipped (2)', ''].join('\n'), t('packages/frontend/b2b/src/lib/x.test.ts'))) === 'unavailable');
// Real captured vitest 5.0.1 output (2026-10-09), `--reporter=verbose`: the ✓ line names the case that
// ran, the ↓ line a case the selector skipped. A selected task's pass must carry that named case.
const vNamed = ['', ' RUN  v5.0.1', '', ' ✓ src/lib/x.test.ts > cart > drops the line 3ms', ' ↓ src/lib/x.test.ts > cart > keeps the line', '', ' Test Files  1 passed (1)', '      Tests  1 passed | 1 skipped (2)', ''].join('\n');
// Real captured vitest 5.0.1 output (2026-10-09), `--reporter=verbose`, run at the package cwd with
// the anchored literal selector: the ✓ line names the one case that ran and the ↓ line the case the
// selector skipped.
const vRealNamed = ['', ' RUN  v5.0.1 C:/wt/verification-tests', '', ' ↓ src/account.test.ts > amount (EUR)', ' ✓ src/account.test.ts > amount EUR 1ms', '', ' Test Files  1 passed (1)', '      Tests  1 passed | 1 skipped (2)', '', '   Start at  16:57:54', '   Duration  92ms (transform 51%, import 30%, worker 12%, tests 7%)', ''].join('\n');
const vDeselected = ['', ' RUN  v5.0.1', '', ' ✓ src/lib/x.test.ts > cart > drops', ' ↓ src/lib/x.test.ts > cart > drops the line', '', ' Test Files  1 passed (1)', '      Tests  1 passed | 1 skipped (2)', ''].join('\n');
check('vitest: a selected pass names the case, not just the total', ((e) => e.verdict === 'passed' && e.test === 'packages/frontend/b2b/src/lib/x.test.ts > cart > drops the line')(vitest(0, vNamed, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line'))), JSON.stringify(vitest(0, vNamed, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line'))));
check('vitest: a real captured pass at the package cwd names the selected case', ((e) => e.verdict === 'passed' && e.test === 'packages/frontend/b2b/src/account.test.ts > amount EUR')(vitest(0, vRealNamed, t('packages/frontend/b2b/src/account.test.ts', 'amount EUR'))), JSON.stringify(vitest(0, vRealNamed, t('packages/frontend/b2b/src/account.test.ts', 'amount EUR'))));
check('vitest: the #109 counterexample -- the intended case skipped and another passed is not proof', verdict(vitest(0, vDeselected, t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line'))) === 'unavailable');
check('vitest: two different cases passing is ambiguous, not proof', verdict(vitest(0, vNamed.replace(' ↓ src/lib/x.test.ts > cart > keeps the line', ' ✓ src/lib/x.test.ts > cart > keeps the line'), t('packages/frontend/b2b/src/lib/x.test.ts', 'cart > drops the line'))) === 'unavailable');

// ── playwright, real captured reports (2026-10-09, playwright 1.61.1, browser-free)
// The selected task runs `--reporter=json` (checks.ts). These reports are the real captured objects,
// run IN verification/ with the escaped selector, exactly the task's shape:
//   playwright test tests/<file> -g "<escaped id>" --reporter=json
// `config` and each error's `stack`/`snippet` are trimmed and the ANSI codes in a message stripped
// for readability; the suite/spec nesting, titles, absolute locations and stats are verbatim. The
// suite title is the file as the reporter writes it (Windows backslashes), which is what the codec's
// file-node rule reads.
const bs = String.fromCharCode(92);
const nl = String.fromCharCode(10);
const win = (p: string) => p.split('/').join(bs);
// The real project config (`testDir: './tests'`) puts `config.rootDir` at `verification/tests` and
// writes each spec's `file` as its basename; the synthetic reports above use the older
// `verification` root with `tests/…` files. Both must bind the same repo path.
const PW_TESTS_ROOT = `${PW_ROOT}/verification/tests`;
const pwReport = (suites: unknown[], errors: unknown[] = [], stats: Record<string, number> = {}, rootDir = `${PW_ROOT}/verification`): string => JSON.stringify({ config: { rootDir }, suites, errors, stats });
const pwFileSuite = (file: string, specs: unknown[] = [], suites: unknown[] = []): unknown => ({ title: win(file), file, line: 0, specs, suites });
const pwDescribeS = (file: string, title: string, specs: unknown[] = [], suites: unknown[] = []): unknown => ({ title, file, specs, suites });
const pwSpec = (file: string, title: string, ok: boolean, line: number, result: unknown): unknown => ({ title, ok, file, line, tests: [{ projectName: '', results: [result] }] });
const pwMultiSpec = (file: string, title: string, ok: boolean, line: number, tests: unknown[]): unknown => ({ title, ok, file, line, tests });
// The `--list --reporter=json` shape: the case is collected (`ok: true`), its test carries no result
// and a `skipped` status. Execution is what proves a pass, so this is not a pass (#109 review).
const pwCollectedSpec = (file: string, title: string, ok: boolean, line: number): unknown => ({ title, ok, file, line, tests: [{ projectName: '', results: [], status: 'skipped' }] });
// The same native report with each spec's `tests` key removed entirely (the #109 review's other
// counterexample): nothing to read, so no execution is established.
const pwNoTestsSpec = (file: string, title: string, ok: boolean, line: number): unknown => ({ title, ok, file, line });
const pwErr = (message: string, file: string, line: number, column: number) => ({ message, location: { file: win(file), line, column } });
const pwStats = (expected: number, unexpected: number, skipped = 0) => ({ expected, unexpected, skipped, flaky: 0 });
const pwAssertion = (expected: number, received: number) => ['Error: expect(received).toBe(expected) // Object.is equality', '', `Expected: ${expected}`, `Received: ${received}`].join(nl);

const nestedFile = 'tests/nested.spec.ts';
const flatFile = 'tests/flat.spec.ts';
const helperFile = 'tests/helper.spec.ts';
const nestedRepo = 'verification/tests/nested.spec.ts';
const flatRepo = 'verification/tests/flat.spec.ts';
const helperRepo = 'verification/tests/helper.spec.ts';
const pwNestedPass = pwReport([pwFileSuite(nestedFile, [], [pwDescribeS(nestedFile, 'cart', [], [pwDescribeS(nestedFile, 'discount', [pwSpec(nestedFile, 'keeps the line', true, 5, { status: 'passed' })])])])], [], pwStats(1, 0));
// The assertion frame is the ABSOLUTE Windows path at line 6 (the assertion). `pwAssertLine` is the
// fixture where the assertion line and the test-definition line differ.
const pwNestedFail = pwReport([pwFileSuite(nestedFile, [], [pwDescribeS(nestedFile, 'cart', [], [pwDescribeS(nestedFile, 'discount', [pwSpec(nestedFile, 'drops the line', false, 6, { status: 'failed', error: pwErr(pwAssertion(3, 2), `${PW_ROOT}/verification/${nestedFile}`, 6, 52) })])])])], [], pwStats(0, 1));
const pwFlatFail = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'cart discount drops the line', false, 3, { status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/${flatFile}`, 3, 62) })])], [], pwStats(0, 1));
const pwGlyphPass = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'cart › leaf', true, 5, { status: 'passed' })])], [], pwStats(1, 0));
// The test definition is line 3; the assertion is line 4. The result's location is 4.
const pwAssertLine = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'off by one', false, 3, { status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/${flatFile}`, 4, 13) })])], [], pwStats(0, 1));
const pwHelperFail = pwReport([pwFileSuite(helperFile, [], [pwDescribeS(helperFile, 'cart', [pwSpec(helperFile, 'drops the line', false, 7, { status: 'failed', error: pwErr('Error: helper blew up', `${PW_ROOT}/verification/${helperFile}`, 4, 9) })])])], [], pwStats(0, 1));
const pwGenericFail = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'boom', false, 3, { status: 'failed', error: pwErr('Error: boom, not an expectation', `${PW_ROOT}/verification/${flatFile}`, 3, 34) })])], [], pwStats(0, 1));
const pwSkip = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'skipped', true, 3, { status: 'skipped' })])], [], pwStats(0, 0, 1));
const pwNoTests = pwReport([], [{ message: ['Error: No tests found.', 'Make sure that arguments are regular expressions matching test files.'].join(nl) }], pwStats(0, 0));
const pwBroken = pwReport([], [{ message: `SyntaxError: ${win(`${PW_ROOT}/verification/${nestedFile}`)}: Unexpected token (3:0)`, location: { file: win(`${PW_ROOT}/verification/${nestedFile}`), line: 3, column: 0 } }, { message: 'Error: No tests found.' }], pwStats(0, 0));
// A `cart > discount` and a flat `cart discount` collapse to the same space-joined id and BOTH run:
// Playwright does not reject the duplicate (verified 2026-10-09), so the evidence's one-case count is
// the boundary that refuses them.
const pwDuplicate = pwReport([pwFileSuite(nestedFile, [pwSpec(nestedFile, 'cart discount', true, 6, { status: 'passed' })], [pwDescribeS(nestedFile, 'cart', [pwSpec(nestedFile, 'discount', true, 3, { status: 'passed' })])])], [], pwStats(2, 0));
// The real project config, captured 2026-10-09 (playwright 1.61.1): `testDir: './tests'` and
// `retries: 1` under verification. The reporter writes `config.rootDir = <root>/verification/tests`
// and the spec `file` as its BASENAME (`nested.spec.ts`); a retried failure appends a second result.
const pwRealSuite = (specs: unknown[], stats: Record<string, number>): string => pwReport([pwFileSuite('nested.spec.ts', [], [pwDescribeS('nested.spec.ts', 'cart', [], [pwDescribeS('nested.spec.ts', 'discount', specs)])])], [], stats, PW_TESTS_ROOT);
const pwRealPass = pwRealSuite([pwMultiSpec('nested.spec.ts', 'keeps the line', true, 5, [{ projectName: 'chromium', results: [{ status: 'passed' }] }])], pwStats(1, 0));
const pwRealRed = pwRealSuite([pwMultiSpec('nested.spec.ts', 'drops the line', false, 5, [{ projectName: 'chromium', results: [{ status: 'failed', error: pwErr(pwAssertion(2, 3), `${PW_TESTS_ROOT}/nested.spec.ts`, 5, 52) }, { status: 'failed', error: pwErr(pwAssertion(2, 3), `${PW_TESTS_ROOT}/nested.spec.ts`, 5, 52) }] }])], pwStats(0, 1));
const pwRealList = pwRealSuite([pwCollectedSpec('nested.spec.ts', 'keeps the line', true, 5)], pwStats(0, 0, 1));

check('playwright: a real JSON pass names the nested case by its space-joined title path', ((e) => e.verdict === 'passed' && e.test === `${nestedRepo} › cart discount keeps the line`)(pw(0, pwNestedPass, t(nestedRepo, 'cart discount keeps the line', 5))), JSON.stringify(pw(0, pwNestedPass, t(nestedRepo, 'cart discount keeps the line', 5))));
check('playwright: a real nested RED binds the assertion to the absolute origin at the declared line', ((e) => e.verdict === 'behavioral-failure' && e.tests[0].source === `${PW_ROOT}/verification/${nestedFile}:6` && e.tests[0].error.includes('expect(received)'))(pw(1, pwNestedFail, t(nestedRepo, 'cart discount drops the line', 6))), JSON.stringify(pw(1, pwNestedFail, t(nestedRepo, 'cart discount drops the line', 6))));
check('playwright: a real flat RED binds too', verdict(pw(1, pwFlatFail, t(flatRepo, 'cart discount drops the line', 3))) === 'behavioral-failure');
check('playwright: the numbered header is the DEFINITION line, not the assertion: declared @4 is proof, @3 is not', verdict(pw(1, pwAssertLine, t(flatRepo, 'off by one', 4))) === 'behavioral-failure' && verdict(pw(1, pwAssertLine, t(flatRepo, 'off by one', 3))) === 'unavailable');
check('playwright: a flat title keeps its literal glyphs as its own canonical id', verdict(pw(0, pwGlyphPass, t(flatRepo, 'cart › leaf', 5))) === 'passed');
check('playwright: a refactor row\'s selected test passing on the reverted side is `passed`', verdict(pw(0, pwNestedPass, t(nestedRepo, 'cart discount keeps the line', 5, true))) === 'passed');
check('playwright: an absolute origin binds only through the worktree root core passed', verdict(pw(1, pwFlatFail, t(flatRepo, 'cart discount drops the line', 3), 'verification', 'C:/other/wt')) === 'unavailable' && verdict(redBaseEvidence({ cmd: 'pnpm', args: ['exec', 'playwright', 'test', 'tests/flat.spec.ts', '-g', 'cart discount drops the line', '--reporter=json'], cwd: 'verification', exit: 1, output: pwFlatFail, target: t(flatRepo, 'cart discount drops the line', 3) })) === 'unavailable');
check('playwright: a helper throw at an earlier line is not a framework assertion at the declared line', ((e) => e.verdict === 'unavailable' && e.say.includes('not a framework assertion'))(pw(1, pwHelperFail, t(helperRepo, 'cart drops the line', 7))));
check('playwright: a generic exception is not proof', ((e) => e.verdict === 'unavailable' && e.say.includes('not a framework assertion'))(pw(1, pwGenericFail, t(flatRepo, 'boom', 3))));
// A `beforeEach`/fixture throw is a spec failure too, but at the setup line and not `expect(...)`.
const pwSetupFail = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'needs setup', false, 4, { status: 'failed', error: pwErr('Error: fixture not seeded', `${PW_ROOT}/verification/${flatFile}`, 3, 37) })])], [], pwStats(0, 1));
check('playwright: a setup/fixture failure is not proof', ((e) => e.verdict === 'unavailable' && e.say.includes('not a framework assertion'))(pw(1, pwSetupFail, t(flatRepo, 'needs setup', 4))));
const pwOtherFile = pwReport([pwFileSuite('tests/other.spec.ts', [pwSpec('tests/other.spec.ts', 'unrelated', false, 3, { status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/tests/other.spec.ts`, 3, 10) })])], [], pwStats(0, 1));
check('playwright: a report red in another file is unavailable', verdict(pw(1, pwOtherFile, t(flatRepo, 'amount (EUR)', 3))) === 'unavailable');
check('playwright: a skipped selected case is not a pass, as a defect or a refactor', verdict(pw(0, pwSkip, t(flatRepo, 'skipped', 3))) === 'unavailable' && verdict(pw(0, pwSkip, t(flatRepo, 'skipped', 3, true))) === 'unavailable');
check('playwright: no tests found is a runner failure', verdict(pw(1, pwNoTests, t(nestedRepo, 'nothing', 1))) === 'runner-failure');
check('playwright: a syntax error is a collection error, not proof', ((e) => e.verdict === 'runner-failure' && e.kind === 'collection-error')(pw(1, pwBroken, t(nestedRepo, 'x', 1))));
check('playwright: two cases collapsing to the same canonical id are ambiguous, not proof', ((e) => e.verdict === 'unavailable' && e.say.includes('matched 2 tests'))(pw(0, pwDuplicate, t(nestedRepo, 'cart discount', 6))), JSON.stringify(pw(0, pwDuplicate, t(nestedRepo, 'cart discount', 6))));
// #109 review: a red in the SAME file but a different case used to be reported as "another file".
const pwWrongCase = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'amount EUR', false, 3, { status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/${flatFile}`, 3, 62) })])], [], pwStats(0, 1));
check('playwright: a red in the same file but another case says so, not "another file"', ((e) => e.verdict === 'unavailable' && e.say.includes(`red in ${flatFile} at amount EUR`) && !e.say.includes('another file'))(pw(1, pwWrongCase, t(flatRepo, 'amount (EUR)', 3))));
check('playwright: a report with no tests and no error proves nothing', verdict(pw(0, pwReport([], [], pwStats(0, 0)), t(flatRepo, 'amount', 3))) === 'runner-failure');
// A report the runner could not write (or a non-JSON run) fails closed, and never throws: a false
// proof would be a green on a report nobody can read.
check('playwright: a malformed or non-JSON report fails closed, never throws', verdict(pw(0, ['Running 1 test using 1 worker', '  1 passed (2.0s)'].join(nl), t(flatRepo, 'amount', 3))) === 'unavailable' && verdict(pw(1, 'not json at all', t(flatRepo, 'amount', 3))) === 'unavailable');
check('playwright: a missing browser binary before any test is a runner failure', verdict(pw(1, "browserType.launch: Executable doesn't exist at /ms-playwright/chromium", t(flatRepo, 'login', 3))) === 'runner-failure');
// The JSON report carries its own absolute `config.rootDir`, so the file binds through the worktree
// root plus the row's repo path even when the task's declared cwd is the pre-#109 `.`: the runner's
// actual root is in the report, not guessed from the cwd.
check('playwright: the report\'s own rootDir binds the file even under the pre-#109 `.` cwd', verdict(redBaseEvidence({ cmd: 'pnpm', args: ['--dir', 'verification', 'exec', 'playwright', 'test', 'verification/tests/flat.spec.ts', '-g', 'cart › leaf'], cwd: '.', root: PW_ROOT, exit: 0, output: pwGlyphPass, target: t(flatRepo, 'cart › leaf', 5) })) === 'passed');
// The project's own selected task, through checks.ts: the declared cwd is the runner's cwd, the path
// is verification-relative, the selector is the escaped canonical id and the reporter is JSON. Read
// the task from the factory rather than a hand-built command, so the composition cannot drift.
const pwTask = checkTasks({ changed: [], target: t(nestedRepo, 'cart discount keeps the line', 5), pkgFor: () => null, pushHook: false, stackEnv: {} }).find((x) => x.label.startsWith('playwright'))!;
check('the project task declares the runner cwd, the verification-relative path, the escaped selector and the JSON reporter', pwTask.cwd === 'verification' && pwTask.args.join(' ') === `exec playwright test tests/nested.spec.ts -g ${selectorLiteral('cart discount keeps the line')} --reporter=json`, JSON.stringify(pwTask));
check('the factory task + the real captured nested pass is `passed`', verdict(redBaseEvidence({ cmd: pwTask.cmd!, args: pwTask.args!, cwd: pwTask.cwd!, root: PW_ROOT, exit: 0, output: pwNestedPass, target: t(nestedRepo, 'cart discount keeps the line', 5) })) === 'passed');

// ── #109 review: a pass must come from an executed result, not `spec.ok` or the run's totals
// The real `--list --reporter=json` report (playwright 1.61.1, captured 2026-10-09) COLLECTS the
// selected case (`ok: true`) with an empty `results` and a `skipped` test status. `spec.ok` and the
// "0 passed, 1 skipped" total do not prove execution, so this is unavailable, never `passed`.
const pwCollected = pwReport([pwFileSuite(nestedFile, [], [pwDescribeS(nestedFile, 'cart', [], [pwDescribeS(nestedFile, 'discount', [pwCollectedSpec(nestedFile, 'keeps the line', true, 5)])])])], [], pwStats(0, 0, 1));
check('playwright: a `--list` collection (ok, empty results) is not a pass: no result establishes execution', verdict(pw(0, pwCollected, t(nestedRepo, 'cart discount keeps the line', 5))) === 'unavailable', JSON.stringify(pw(0, pwCollected, t(nestedRepo, 'cart discount keeps the line', 5))));
// The same report with the spec's `tests` dropped entirely: nothing to read, so unavailable.
check('playwright: a spec with its `tests` dropped is not a pass', verdict(pw(0, pwReport([pwFileSuite(nestedFile, [pwNoTestsSpec(nestedFile, 'keeps the line', true, 5)])], [], pwStats(0, 0, 1)), t(nestedRepo, 'keeps the line', 5))) === 'unavailable');
// A result with no status, and an unknown status, are unavailable, not a failure by default; the
// known statuses read as they say.
const pwFailedKnown = pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'case', false, 3, { status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/${flatFile}`, 3, 5) })])], [], pwStats(0, 1));
check('playwright: no status is unavailable, `timedOut` is unavailable (not a failure), `failed`+assertion and `passed`/`skipped` read', verdict(pw(0, pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'case', true, 3, {})])], [], pwStats(1, 0)), t(flatRepo, 'case', 3))) === 'unavailable' && verdict(pw(1, pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'case', false, 3, { status: 'timedOut' })])], [], pwStats(0, 1)), t(flatRepo, 'case', 3))) === 'unavailable' && verdict(pw(1, pwFailedKnown, t(flatRepo, 'case', 3))) === 'behavioral-failure' && verdict(pw(0, pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'case', true, 3, { status: 'passed' })])], [], pwStats(1, 0)), t(flatRepo, 'case', 3))) === 'passed' && verdict(pw(0, pwReport([pwFileSuite(flatFile, [pwSpec(flatFile, 'case', true, 3, { status: 'skipped' })])], [], pwStats(0, 0, 1)), t(flatRepo, 'case', 3))) === 'unavailable');
// Multi-project: one test per project. A pass needs every executed attempt `passed`; a disagreement is
// unavailable, and a failure in one project is a failure, never a pass from `spec.ok` or the totals.
const pwMultiFail = pwReport([pwFileSuite(flatFile, [pwMultiSpec(flatFile, 'amount', true, 3, [{ projectName: 'a', results: [{ status: 'passed' }] }, { projectName: 'b', results: [{ status: 'failed', error: pwErr(pwAssertion(2, 1), `${PW_ROOT}/verification/${flatFile}`, 3, 5) }] }])])], [], pwStats(1, 1));
const pwMultiSkip = pwReport([pwFileSuite(flatFile, [pwMultiSpec(flatFile, 'amount', true, 3, [{ projectName: 'a', results: [{ status: 'passed' }] }, { projectName: 'b', results: [{ status: 'skipped' }] }])])], [], pwStats(1, 0, 1));
check('playwright: a multi-project spec that failed in one project is a failure; skipped in one is unavailable', verdict(pw(1, pwMultiFail, t(flatRepo, 'amount', 3))) === 'behavioral-failure' && verdict(pw(0, pwMultiSkip, t(flatRepo, 'amount', 3))) === 'unavailable', JSON.stringify([pw(1, pwMultiFail, t(flatRepo, 'amount', 3)), pw(0, pwMultiSkip, t(flatRepo, 'amount', 3))]));
// A malformed used field (a scalar where an array/object/string is read) makes the report unavailable,
// never a throw: `suites`, `specs`, `results`, `title`, `status` and `location.file` are all checked.
// The config prefix is valid here so the report fails on the field, not on the root.
const pwBad = (body: string) => `{"config":{"rootDir":"${PW_ROOT}/verification"},${body}}`;
const pwBadShapes = [pwBad('"suites":{}'), pwBad('"suites":[{"specs":{}}]'), pwBad('"suites":[{"title":123,"specs":[]}]'), pwBad('"suites":[{"specs":[{"tests":[{"results":{}}]}]}]'), pwBad('"suites":[{"specs":[{"tests":[{"results":[{"status":7}]}]}]}]'), pwBad('"suites":[{"specs":[{"tests":[{"results":[{"status":"passed","error":{"location":{"file":5}}}]}]}]}]')];
check('playwright: a report whose used fields have the wrong shape is unavailable, never a throw', pwBadShapes.every((out) => verdict(pw(0, out, t(flatRepo, 'amount', 3))) === 'unavailable'), JSON.stringify(pwBadShapes.map((out) => { try { return verdict(pw(0, out, t(flatRepo, 'amount', 3))); } catch (e) { return `THREW ${(e as Error).message}`; } })));
// `config.rootDir` is mandatory and absolute: missing, empty, relative or wrong-typed config names no
// known file, so the report fails closed rather than aliasing the relative `file` to the task's cwd.
const pwNoRoot = JSON.parse(pwGlyphPass) as { config?: unknown };
delete pwNoRoot.config;
const pwBadConfig = ['{"suites":[]}', '{"config":{},"suites":[]}', '{"config":{"rootDir":"verification"},"suites":[]}', '{"config":{"rootDir":7},"suites":[]}', '{"config":7,"suites":[]}'];
check('playwright: a missing, relative or wrong-typed config.rootDir fails closed, never aliased to the cwd', verdict(pw(0, JSON.stringify(pwNoRoot), t(flatRepo, 'cart › leaf', 5))) === 'unavailable' && pwBadConfig.every((out) => verdict(pw(0, out, t(flatRepo, 'amount', 3))) === 'unavailable'), JSON.stringify(pwBadConfig));
// The file node is only the TOP-LEVEL suite whose title is the file path: a nested describe whose
// title literally equals the file path is still a describe, and its title stays in the canonical id.
const pwFileTitledDescribe = pwReport([pwFileSuite(flatFile, [], [pwDescribeS(flatFile, flatFile, [pwSpec(flatFile, 'leaf', true, 3, { status: 'passed' })])])], [], pwStats(1, 0));
check('playwright: a nested describe whose title equals the file path keeps its title (the file node is only the top)', verdict(pw(0, pwFileTitledDescribe, t(flatRepo, `${flatFile} leaf`, 3))) === 'passed', JSON.stringify(pw(0, pwFileTitledDescribe, t(flatRepo, `${flatFile} leaf`, 3))));
// The real project config through the codec: `config.rootDir` + basename `file` binds the row's
// repo path for a named PASS and a refactor PASS, and a retried failure at the declared assertion
// line is proof. The `--list` collection is still not a pass.
check('playwright: the real testDir:./tests basename report binds a named PASS', verdict(pw(0, pwRealPass, t(nestedRepo, 'cart discount keeps the line', 5))) === 'passed', JSON.stringify(pw(0, pwRealPass, t(nestedRepo, 'cart discount keeps the line', 5))));
check('playwright: the real basename report binds a retried RED at the declared assertion line', verdict(pw(1, pwRealRed, t(nestedRepo, 'cart discount drops the line', 5))) === 'behavioral-failure', JSON.stringify(pw(1, pwRealRed, t(nestedRepo, 'cart discount drops the line', 5))));
check('playwright: the real basename report is a refactor PASS on both sides', verdict(pw(0, pwRealPass, t(nestedRepo, 'cart discount keeps the line', 5, true))) === 'passed');
check('playwright: the real basename `--list` collection is unavailable, not a pass', verdict(pw(0, pwRealList, t(nestedRepo, 'cart discount keeps the line', 5))) === 'unavailable');



// ── the repro classifier: only a framework assertion can measure the defect
check('reproFailure reads a framework assertion: pytest assert, vitest AssertionError, playwright expect', reproFailure({ cmd: 'uv', args: ['run', '--frozen', 'pytest', 'r.py'], output: 'E       assert 401 == 200\n' }).asserted && reproFailure({ cmd: 'pnpm', args: ['exec', 'vitest', 'run', 'r.test.ts'], output: 'AssertionError: expected 1 to be 2\n' }).asserted && reproFailure({ cmd: 'pnpm', args: ['--dir', 'verification', 'exec', 'playwright', 'test', 'r.spec.ts'], output: '    Error: expect(received).toBe(expected)\n' }).asserted);
check('reproFailure refuses a generic error or a crash, whatever the runner', !reproFailure({ cmd: 'uv', args: ['run', '--frozen', 'pytest', 'r.py'], output: 'E       NameError: name \'x\' is not defined\n' }).asserted && !reproFailure({ cmd: 'pnpm', args: ['exec', 'vitest', 'run', 'r.test.ts'], output: "Error: Cannot find module './missing'\n" }).asserted && !reproFailure({ cmd: 'pnpm', args: ['--dir', 'verification', 'exec', 'playwright', 'test', 'r.spec.ts'], output: '    Error: setup before the defect\n' }).asserted);
// A faithful real `node` capture: the CLI crashed before measuring anything. wf cannot read a Node
// script's throw, so it is not a measurement (2026-10-09, node 26.10.0).
const nodeRepo = mkdtempSync(join(tmpdir(), 'wf-repro-node-'));
writeFileSync(join(nodeRepo, 'throw.mjs'), "throw new Error('setup before the defect: the repro never reached its check');\n");
const nodeRun = spawnSync(process.execPath, [join(nodeRepo, 'throw.mjs')], { encoding: 'utf8' });
const nodeOut = `${nodeRun.stdout ?? ''}${nodeRun.stderr ?? ''}`;
rmSync(nodeRepo, { recursive: true, force: true });
check('a faithful node CLI crash is unsupported evidence, not a measurement', nodeRun.status !== 0 && /Error: setup before the defect/.test(nodeOut) && !reproFailure({ cmd: 'node', args: ['throw.mjs'], output: nodeOut }).asserted, JSON.stringify(nodeOut.split('\n').slice(0, 2)));

// ── the binding helper, on its own
const bctx = { cwd: 'packages/backend', selected: 'tests/x.py' };
check('notIntendedAssertion: a null line, a non-assertion, a missing source, another line and another file each say why', notIntendedAssertion({ id: 'x', error: 'e', assertion: true }, t('packages/backend/tests/x.py', 'x', 7), bctx) !== null && notIntendedAssertion({ id: 'x', error: 'e', assertion: false, source: 'tests/x.py:7' }, t('packages/backend/tests/x.py', 'x', 7), bctx) !== null && notIntendedAssertion({ id: 'x', error: 'e', assertion: true }, t('packages/backend/tests/x.py', 'x', 7), bctx) !== null && notIntendedAssertion({ id: 'x', error: 'e', assertion: true, source: 'tests/x.py:3' }, t('packages/backend/tests/x.py', 'x', 7), bctx) !== null && notIntendedAssertion({ id: 'x', error: 'e', assertion: true, source: 'other/x.py:7' }, t('packages/backend/tests/x.py', 'x', 7), bctx) !== null && notIntendedAssertion({ id: 'x', error: 'e', assertion: true, source: 'tests/x.py:7' }, t('packages/backend/tests/x.py', 'x', 7), bctx) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
