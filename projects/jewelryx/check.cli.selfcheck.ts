// check.cli.selfcheck.ts — node projects/jewelryx/check.cli.selfcheck.ts → exit 0 when green.
// The red-base gate through the real command route (#109): `node wf.mjs check` in a throwaway round
// repo, with a faithful runner stub on PATH that prints a recorded runner report and exits with its
// code. The stub reads the working tree to decide (like a real test): its report names the row's
// assertion only while the fix is present. Offline and deterministic; no pytest, vitest or playwright
// is installed to run (the reports are the runner's own, captured 2026-10-09 and kept in
// evidence.selfcheck.ts). It lives with the project because the runner commands, the test selection
// and the report shapes are JewelryX's.
//
// The arms are the acceptance list of #109: a valid red-base greens; a failure at another assertion of
// the selected test, a NameError at the bound line, a helper origin elsewhere, an import/collection
// error, a setup error, a failure in another file, a row that names no assertion, and an unreadable
// report all red the row (never a green); and a `refactor:` row greens only when its selected test
// passes on both the current and the reverted side, reds when either fails, when either ran nothing,
// or when either side's `1 passed` names a different test than the row's selected case.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the runner stub: a `uv` that prints a recorded report, keyed on the working tree
const stubSource = `// wf check selfcheck's runner stub: a uv that reports pytest's output from a fixture.
const fs = require('node:fs');
const args = process.argv.slice(2);
if (!args.join(' ').includes('pytest')) process.exit(0); // ruff and the rest are green
const s = JSON.parse(fs.readFileSync(process.env.WF_STUB_SCENARIO, 'utf8'));
let text = '';
try { text = fs.readFileSync(process.env.WF_STUB_GUARD, 'utf8'); } catch { text = ''; }
const pick = text.includes(s.fixedMarker) ? s.current : s.reverted;
process.stdout.write(pick.out || '');
process.stderr.write(pick.err || '');
process.exit(pick.code || 0);
`;
const stubDir = mkdtempSync(join(tmpdir(), 'wf-check-stub-'));
writeFileSync(join(stubDir, 'stub.cjs'), stubSource);
if (process.platform === 'win32') writeFileSync(join(stubDir, 'uv.cmd'), '@node "%~dp0stub.cjs" %*\r\n');
else writeFileSync(join(stubDir, 'uv'), `#!/bin/sh\nexec node "$(dirname "$0")/stub.cjs" "$@"\n`, { mode: 0o755 });

// node and git only: the missing-runner arm's reverted run must find no runner, without a real `uv`
// (mise, a venv) on PATH turning the absence into an unrelated failure.
const whichFirst = (cmd: string) => {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? null) : null;
};
const toolPath = [dirname(process.execPath), dirname(whichFirst('git') ?? process.execPath)].join(delimiter);

// ── recorded pytest reports (the shapes evidence.ts reads; temp paths rewritten)
const pyFail = (file: string, id: string, line: number, msg: string, e = `assert ${msg}`) => [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  `__________________________________ ${id} ___________________________________`,
  '',
  `    def ${id}():`,
  `>       ${e}`,
  `E       ${e}`,
  '',
  `tests\\${file}.py:${line}: ${e.startsWith('assert') ? 'AssertionError' : 'Error'}`,
  '=========================== short test summary info ===========================',
  `FAILED tests/${file}.py::${id} - ${e}`,
  '1 failed in 0.04s',
  '',
].join('\n');
const passOut = [
  'tests/test_bug.py .                                                       [100%]',
  '',
  '=========================== short test summary info ============================',
  'PASSED tests/test_bug.py::test_bug',
  '1 passed in 0.01s',
  '',
].join('\n');
// The review's counterexample through the same route: `1 passed`, but the PASSED line names another
// test, so the selected case never ran and the row must not green (#109 review, 2026-10-09).
const passOther = passOut.replace('PASSED tests/test_bug.py::test_bug', 'PASSED tests/test_bug.py::test_other');
const skippedOut = 's                                                                        [100%]\n1 skipped in 0.01s\n';
const importError = [
  '=================================== ERRORS ====================================',
  '_____________________ ERROR collecting tests/test_bug.py ______________________',
  "ImportError while importing test module 'C:\\wt\\x\\tests\\test_bug.py'.",
  'Traceback:',
  'tests\\test_bug.py:1: in <module>',
  '    from app.pricing import total',
  "E   ModuleNotFoundError: No module named 'app.pricing'",
  '=========================== short test summary info ===========================',
  'ERROR tests/test_bug.py',
  '!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!',
  '1 error in 0.14s',
  '',
].join('\n');
const setupError = [
  'E                                                                        [100%]',
  '=================================== ERRORS ====================================',
  '_______________________ ERROR at setup of test_bug ____________________________',
  "E       fixture 'db' not found",
  '=========================== short test summary info ===========================',
  'ERROR tests/test_bug.py::test_bug',
  '1 error in 0.01s',
  '',
].join('\n');

type Scenario = { cell: string; files: string[]; current?: { code: number; out: string }; reverted: { code: number; out: string }; runnerInRepo?: boolean };

// The stub's scenario file lives outside the repo: an untracked file inside it would be a fence
// violation (the fixture repo's diff is what `wf check` fences). The arms run one at a time.
const fixtureDir = mkdtempSync(join(tmpdir(), 'wf-check-fixture-'));
const scenarioPath = join(fixtureDir, 'scenario.json');

// One `node wf.mjs check` in a throwaway repo: base `main` with the broken product, branch `round/bug`
// with the fixed product and the row's test (`test_bug`'s precondition at line 2, its intended
// assertion at line 3). Returns the CLI's exit, its stderr, and the checks.log line it wrote.
function runCli(scenario: Scenario) {
  const repo = mkdtempSync(join(tmpdir(), 'wf-check-cli-'));
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'wf check selfcheck']);
  git(['config', 'user.email', 'wf-check@example.invalid']);
  mkdirSync(join(repo, 'packages', 'backend', 'app'), { recursive: true });
  mkdirSync(join(repo, 'packages', 'backend', 'tests'), { recursive: true });
  mkdirSync(join(repo, 'bug-reports', 'BJEW-109'), { recursive: true });
  const product = join(repo, 'packages', 'backend', 'app', 'pricing.py');
  writeFileSync(product, 'BROKEN\n');
  writeFileSync(join(repo, 'packages', 'backend', 'tests', 'test_bug.py'), 'def test_bug():\n    assert login() == 200\n    assert total() == 120\n');
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  git(['switch', '-qc', 'round/bug']);
  writeFileSync(product, 'FIXED\n');
  // A runner the row itself carries (`tools/uv`), so reverting the row takes it away.
  if (scenario.runnerInRepo) {
    mkdirSync(join(repo, 'tools'), { recursive: true });
    const shim = process.platform === 'win32' ? `@node "${join(stubDir, 'stub.cjs').replace(/\\/g, '/')}" %*\r\n` : `#!/bin/sh\nexec node "${join(stubDir, 'stub.cjs')}" "$@"\n`;
    writeFileSync(join(repo, 'tools', process.platform === 'win32' ? 'uv.cmd' : 'uv'), shim, { mode: 0o755 });
  }
  const ticket = [
    '# BJEW-109 — ticket',
    '',
    '## Intent',
    '',
    '- the price is wrong',
    '',
    '## Verification',
    '| # | case | files | check |',
    '|---|---------|-------|-------|',
    `| 1 | fix: pricing | ${scenario.files.map((f) => `\`${f}\``).join(' ')} | \`${scenario.cell}\` |`,
    '',
  ].join('\n');
  writeFileSync(join(repo, 'bug-reports', 'BJEW-109', 'TICKET.md'), ticket);
  mkdirSync(join(repo, '.wf'), { recursive: true });
  writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, id: 'BJEW-109', folder: 'bug-reports/BJEW-109', base: 'main', step: 'build', class: 'A' })}\n`);
  writeFileSync(scenarioPath, JSON.stringify({ fixedMarker: 'FIXED', current: scenario.current ?? { code: 0, out: passOut }, reverted: scenario.reverted }));
  try {
    const path = scenario.runnerInRepo ? `${join(repo, 'tools')}${delimiter}${toolPath}` : `${stubDir}${delimiter}${process.env.PATH ?? ''}`;
    const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check'], {
      cwd: repo,
      env: { ...gitEnv, PATH: path, WF_STUB_SCENARIO: scenarioPath, WF_STUB_GUARD: product },
      encoding: 'utf8',
      timeout: 60000,
    });
    const lines = existsSync(join(repo, '.wf', 'checks.log')) ? readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').split('\n').filter(Boolean) : [];
    const line = lines.map((l) => { try { return JSON.parse(l) as { row?: unknown; result?: string; tasks?: { label?: string; evidence?: { verdict?: string; say?: string } }[] }; } catch { return null; } }).find((c) => c?.row === 1) ?? null;
    const redBase = line?.tasks?.find((t) => t.label?.startsWith('red-base'));
    const current = line?.tasks?.find((t) => t.label?.includes('::') && !t.label?.startsWith('red-base'));
    return { code: run.status, stderr: run.stderr ?? '', result: line?.result ?? null, evidence: redBase?.evidence ?? null, currentEvidence: current?.evidence ?? null };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const files = ['packages/backend/app/pricing.py', 'packages/backend/tests/test_bug.py'];
const cell = (refactor = false) => `${refactor ? 'refactor: ' : ''}packages/backend/tests/test_bug.py::test_bug@3`;
const assertFail = pyFail('test_bug', 'test_bug', 3, '401 == 200');

// 1. valid intended behavior: the test fails on its assertion at the line the row names.
const valid = runCli({ cell: cell(), files, reverted: { code: 1, out: assertFail } });
check('a red-base that fails on an assertion at the intended line greens, and the record names it', valid.code === 0 && valid.result === 'green' && valid.evidence?.verdict === 'behavioral-failure' && valid.evidence?.say?.includes('tests/test_bug.py'), `exit ${valid.code}, ${JSON.stringify(valid)}`);

// 2. the selected test fails earlier, on its precondition at line 2.
const precondition = runCli({ cell: cell(), files, reverted: { code: 1, out: pyFail('test_bug', 'test_bug', 2, 'login() == 200') } });
check('a failure on a precondition inside the selected test reds the row: not proof of the named assertion', precondition.code !== 0 && precondition.result === 'red' && precondition.evidence?.verdict === 'unavailable' && precondition.evidence?.say?.includes('line 3'), `exit ${precondition.code}, ${JSON.stringify(precondition)}`);

// 3. the expression at the bound line raises NameError: the assertion never ran (Blocker 1).
const nameErrorOut = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '__________________________________ test_bug ___________________________________',
  '',
  '    def test_bug():',
  '>       assert total() == 120',
  '               ^^^^^',
  "E       NameError: name 'total' is not defined",
  '',
  'tests\\test_bug.py:3: NameError',
  '=========================== short test summary info ===========================',
  "FAILED tests/test_bug.py::test_bug - NameError: name 'total' is not defined",
  '1 failed in 0.04s',
  '',
].join('\n');
const nameError = runCli({ cell: cell(), files, reverted: { code: 1, out: nameErrorOut } });
check('a NameError at the bound line reds the row: the assertion never ran', nameError.code !== 0 && nameError.result === 'red' && nameError.evidence?.verdict === 'unavailable' && nameError.evidence?.say?.includes('not a framework assertion'), `exit ${nameError.code}, ${JSON.stringify(nameError)}`);

// 4. a helper origin elsewhere while the caller is the bound line (Blocker 2).
const helperOriginOut = [
  'F                                                                        [100%]',
  '================================== FAILURES ===================================',
  '__________________________________ test_bug ___________________________________',
  '',
  '    def test_bug():',
  '>       assert compute() == 120',
  '',
  'tests\\test_bug.py:3: ',
  '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
  '',
  '    def compute():',
  '>       raise AssertionError',
  'E       assert 100 == 120',
  '',
  'tests\\test_bug.py:2: AssertionError',
  '=========================== short test summary info ===========================',
  'FAILED tests/test_bug.py::test_bug - assert 100 == 120',
  '1 failed in 0.04s',
  '',
].join('\n');
const helperOrigin = runCli({ cell: cell(), files, reverted: { code: 1, out: helperOriginOut } });
check('a failure that originated in a helper, not the bound line, reds the row', helperOrigin.code !== 0 && helperOrigin.result === 'red' && helperOrigin.evidence?.verdict === 'unavailable', `exit ${helperOrigin.code}, ${JSON.stringify(helperOrigin)}`);

// 5. a row that names no assertion cannot bind.
const unbound = runCli({ cell: 'packages/backend/tests/test_bug.py::test_bug', files, reverted: { code: 1, out: assertFail } });
check('a row that names no intended assertion reds: a bare red is not proof', unbound.code !== 0 && unbound.result === 'red' && unbound.evidence?.verdict === 'unavailable', `exit ${unbound.code}, ${JSON.stringify(unbound)}`);

// 6-7. the reverted fix broke the import; and a fixture/setup failure, which exits 1 like a failed test.
const imported = runCli({ cell: cell(), files, reverted: { code: 2, out: importError } });
check('an import/collection failure on revert reds the row as a runner failure, never proof', imported.code !== 0 && imported.result === 'red' && imported.evidence?.verdict === 'runner-failure' && imported.evidence?.say?.includes('collection-error'), `exit ${imported.code}, ${JSON.stringify(imported)}`);
const setup = runCli({ cell: cell(), files, reverted: { code: 1, out: setupError } });
check('a setup/fixture failure reds the row as a runner failure', setup.code !== 0 && setup.result === 'red' && setup.evidence?.verdict === 'runner-failure' && setup.evidence?.say?.includes('setup-error'), `exit ${setup.code}, ${JSON.stringify(setup)}`);

// 8. a failing test in another file while the row's test is named.
const unrelated = runCli({ cell: cell(), files, reverted: { code: 1, out: pyFail('other', 'test_other', 2, '1 == 2') } });
check('a failure in another file reds the row: not the selected target', unrelated.code !== 0 && unrelated.result === 'red' && unrelated.evidence?.verdict === 'unavailable', `exit ${unrelated.code}, ${JSON.stringify(unrelated)}`);

// 9. a red report with nothing to read, and a runner the revert took away.
const unreadable = runCli({ cell: cell(), files, reverted: { code: 1, out: 'boom\n' } });
check('an unreadable red report fails closed', unreadable.code !== 0 && unreadable.result === 'red' && unreadable.evidence?.verdict === 'unavailable', `exit ${unreadable.code}, ${JSON.stringify(unreadable)}`);
const runnerGone = runCli({ cell: cell(), files: [...files, `tools/${process.platform === 'win32' ? 'uv.cmd' : 'uv'}`], reverted: { code: 0, out: passOut }, runnerInRepo: true });
check('a runner the revert took away reds the row: a run that never started is not proof', runnerGone.code !== 0 && runnerGone.result === 'red' && runnerGone.evidence?.verdict !== 'behavioral-failure', `exit ${runnerGone.code}, ${JSON.stringify(runnerGone)}`);

// 9b. the #109 execution counterexample through the route: the row's selected test is collected but
// SKIPPED on the current tree (exit 0, a suite total, no PASSED line), while reverting the row's
// product change makes it fail on the declared assertion at line 3. A bare current-side exit 0 is not
// proof that the fix turned that assertion green, so the row must red -- it cannot green on the
// reverted proof alone. The current-side report is faithful per-case output (a summary, no named
// case), not a relaxed policy.
const currentSkipped = runCli({ cell: cell(), files, current: { code: 0, out: skippedOut }, reverted: { code: 1, out: assertFail } });
check('a defect row reds when the selected test was skipped WITH the change, though the reverted side fails on the named assertion', currentSkipped.code !== 0 && currentSkipped.result === 'red' && currentSkipped.currentEvidence?.verdict === 'unavailable', `exit ${currentSkipped.code}, ${JSON.stringify(currentSkipped)}`);
// The same with a current-side pass that names another test: `1 passed` is a total, not the case.
const currentOther = runCli({ cell: cell(), files, current: { code: 0, out: passOther }, reverted: { code: 1, out: assertFail } });
check('a defect row reds when the WITH-change pass names another test, though the reverted side fails on the named assertion', currentOther.code !== 0 && currentOther.result === 'red' && currentOther.currentEvidence?.verdict === 'unavailable', `exit ${currentOther.code}, ${JSON.stringify(currentOther)}`);
// A current-side red still reds the row as before, whatever the reverted side would show.
const currentRed = runCli({ cell: cell(), files, current: { code: 1, out: assertFail }, reverted: { code: 0, out: passOut } });
check('a defect row reds on a current-side failure, unchanged', currentRed.code !== 0 && currentRed.result === 'red', `exit ${currentRed.code}, ${JSON.stringify(currentRed)}`);

// 10-13. a behavior-preserving refactor: the selected test must pass on the current side and the
// reverted side. A skip (a suite total, a current-side skip) is not a pass; a red is not a pass.
const refactorPass = runCli({ cell: cell(true), files, reverted: { code: 0, out: passOut } });
check('a refactor row greens when its selected test passes on both sides, with positive evidence', refactorPass.code === 0 && refactorPass.result === 'green' && refactorPass.evidence?.verdict === 'passed', `exit ${refactorPass.code}, ${JSON.stringify(refactorPass)}`);
const refactorFail = runCli({ cell: cell(true), files, reverted: { code: 1, out: assertFail } });
check('a refactor row reds when its test fails without the change', refactorFail.code !== 0 && refactorFail.result === 'red' && refactorFail.evidence?.verdict === 'behavioral-failure', `exit ${refactorFail.code}, ${JSON.stringify(refactorFail)}`);
const refactorSkip = runCli({ cell: cell(true), files, reverted: { code: 0, out: skippedOut } });
check('a refactor row reds when the selected test was skipped without the change, not greens on a suite total', refactorSkip.code !== 0 && refactorSkip.result === 'red' && refactorSkip.evidence?.verdict === 'unavailable', `exit ${refactorSkip.code}, ${JSON.stringify(refactorSkip)}`);
const refactorCurrentSkip = runCli({ cell: cell(true), files, current: { code: 0, out: skippedOut }, reverted: { code: 0, out: passOut } });
check('a refactor row reds when the selected test was skipped WITH the change: the current side is checked too', refactorCurrentSkip.code !== 0 && refactorCurrentSkip.result === 'red', `exit ${refactorCurrentSkip.code}, ${JSON.stringify(refactorCurrentSkip)}`);
// The #109 counterexample, same route: a passing report that names another test is not the selected
// case, on the reverted side or the current side.
const refactorOther = runCli({ cell: cell(true), files, reverted: { code: 0, out: passOther } });
check('a refactor row reds when the reverted pass report names another test, not the selected one', refactorOther.code !== 0 && refactorOther.result === 'red' && refactorOther.evidence?.verdict === 'unavailable', `exit ${refactorOther.code}, ${JSON.stringify(refactorOther)}`);
const refactorCurrentOther = runCli({ cell: cell(true), files, current: { code: 0, out: passOther }, reverted: { code: 0, out: passOut } });
check('a refactor row reds when the WITH-change pass report names another test', refactorCurrentOther.code !== 0 && refactorCurrentOther.result === 'red', `exit ${refactorCurrentOther.code}, ${JSON.stringify(refactorCurrentOther)}`);

rmSync(stubDir, { recursive: true, force: true });
rmSync(fixtureDir, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
