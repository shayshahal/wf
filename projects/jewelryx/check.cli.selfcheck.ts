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
import { initializeSlices, parseBuildUnits } from '../../src/round/build-units.ts';
import { runRepro } from '../../src/gates/check.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the runner stub: a `uv` that prints a recorded report, keyed on the working tree
const stubSource = `// wf check selfcheck's runner stub: a uv that reports pytest's output from a fixture.
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.VERIFY_STUB_COUNT) fs.appendFileSync(process.env.VERIFY_STUB_COUNT, (process.env.INJECT_TAG ? 'INJECT=' + process.env.INJECT_TAG + ' ' : '') + args.join(' ') + '\\n');
if (process.env.VERIFY_STUB_MUTATE && !fs.existsSync(process.env.VERIFY_STUB_MUTATE)) { fs.writeFileSync(process.env.VERIFY_STUB_MUTATE, '1'); fs.appendFileSync(process.env.VERIFY_STUB_GUARD, '\\n# hook rewrite\\n'); }
if (!args.join(' ').includes('pytest')) process.exit(0); // ruff and the rest are green
const s = JSON.parse(fs.readFileSync(process.env.VERIFY_STUB_SCENARIO, 'utf8'));
let text = '';
try { text = fs.readFileSync(process.env.VERIFY_STUB_GUARD, 'utf8'); } catch { text = ''; }
const current = text.includes(s.fixedMarker);
// A selected test (its argv carries ::<id>) reports that one case; the shared suite reports s.current.
const id = /::([^\\s]+)/.exec(args.join(' '))?.[1];
const pick = (id && s.perTest && s.perTest[id]) ? (current ? s.perTest[id].current : s.perTest[id].reverted) : (current ? s.current : s.reverted);
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

type Scenario = { cell: string; files: string[]; current?: { code: number; out: string }; reverted: { code: number; out: string }; runnerInRepo?: boolean; testSource?: string; unit?: boolean; testOnly?: boolean };

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
  writeFileSync(join(repo, 'packages', 'backend', 'tests', 'test_bug.py'), scenario.testSource ?? 'def test_bug():\n    assert login() == 200\n    assert total() == 120\n');
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  git(['switch', '-qc', 'round/bug']);
  if (scenario.testOnly) writeFileSync(join(repo, 'packages', 'backend', 'tests', 'test_bug.py'), 'def test_bug():\n    assert total() == 120\n');
  else writeFileSync(product, 'FIXED\n');
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
    ...(scenario.unit ? [
      '| 2 | fix: product | packages/backend/app/pricing.py | manual: product check |',
      '## Units', '| # | unit | cases | depends on | review after |', '|---|---|---|---|---|',
      '| 1 | pricing | 1, 2 | — | — |',
    ] : []),
    '',
  ].join('\n');
  writeFileSync(join(repo, 'bug-reports', 'BJEW-109', 'TICKET.md'), ticket);
  mkdirSync(join(repo, '.wf'), { recursive: true });
  const plan = parseBuildUnits(ticket);
  const slices = scenario.unit && plan.kind === 'units' ? initializeSlices(plan, git(['rev-parse', 'HEAD'])) : undefined;
  writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, id: 'BJEW-109', folder: 'bug-reports/BJEW-109', base: 'main', step: 'build', class: 'A', ...(slices ? { slices } : {}) })}\n`);
  writeFileSync(scenarioPath, JSON.stringify({ fixedMarker: 'FIXED', current: scenario.current ?? { code: 0, out: passOut }, reverted: scenario.reverted }));
  try {
    const path = scenario.runnerInRepo ? `${join(repo, 'tools')}${delimiter}${toolPath}` : `${stubDir}${delimiter}${process.env.PATH ?? ''}`;
    const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check', ...(scenario.unit ? ['--case', '1'] : [])], {
      cwd: repo,
      env: { ...gitEnv, PATH: path, VERIFY_STUB_SCENARIO: scenarioPath, VERIFY_STUB_GUARD: product },
      encoding: 'utf8',
      timeout: 60000,
    });
    const lines = existsSync(join(repo, '.wf', 'checks.log')) ? readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').split('\n').filter(Boolean) : [];
    const line = lines.map((l) => { try { return JSON.parse(l) as { row?: unknown; result?: string; tasks?: { label?: string; expect?: 'red' | 'green'; evidence?: { verdict?: string; say?: string } }[] }; } catch { return null; } }).find((c) => c?.row === 1) ?? null;
    const redBase = line?.tasks?.find((t) => t.label?.startsWith('red-base'));
    const current = line?.tasks?.find((t) => t.label?.includes('::') && !t.label?.startsWith('red-base'));
    return { code: run.status, stderr: run.stderr ?? '', result: line?.result ?? null, expect: redBase?.expect ?? null, evidence: redBase?.evidence ?? null, currentEvidence: current?.evidence ?? null };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const files = ['packages/backend/app/pricing.py', 'packages/backend/tests/test_bug.py'];
const cell = (refactor = false) => `${refactor ? 'refactor: ' : ''}packages/backend/tests/test_bug.py::test_bug@3`;
const assertFail = pyFail('test_bug', 'test_bug', 3, '401 == 200');

// 1. valid intended behavior: the test fails on its assertion at the line the row names.
const valid = runCli({ cell: cell(), files, reverted: { code: 1, out: assertFail } });
check('a red-base that fails on an assertion at the intended line greens, and the record names it', valid.code === 0 && valid.result === 'green' && valid.evidence?.verdict === 'behavioral-failure' && valid.evidence?.say?.includes('tests/test_bug.py') && valid.expect === 'red', `exit ${valid.code}, ${JSON.stringify(valid)}`);

// 2. the selected test fails earlier, on its precondition at line 2.
const precondition = runCli({ cell: cell(), files, reverted: { code: 1, out: pyFail('test_bug', 'test_bug', 2, 'login() == 200') } });
check('a failure on a precondition inside the selected test reds the row: not proof of the named assertion', precondition.code !== 0 && precondition.result === 'red' && precondition.evidence?.verdict === 'unavailable' && precondition.evidence?.say?.includes('line 3'), `exit ${precondition.code}, ${JSON.stringify(precondition)}`);

// #135: the behavior assertion is line 3; an added representation assertion at line 2 fails
// before it. That red cannot prove the value behavior changed, even in the same selected test.
const representationSource = 'def test_bug():\n    assert attrs().get("aria-invalid") == "false"\n    assert value() == 120\n';
const representationRed = { code: 1, out: pyFail('test_bug', 'test_bug', 2, 'None == "false"') };
const incidentalAttribute = runCli({ cell: cell(), files, testSource: representationSource, reverted: representationRed });
check('an absent new attribute cannot stand in for the named value assertion on baseline', incidentalAttribute.code !== 0 && incidentalAttribute.result === 'red' && incidentalAttribute.evidence?.verdict === 'unavailable', JSON.stringify(incidentalAttribute));
const preservationAttribute = runCli({ cell: cell(true), files, testSource: representationSource, reverted: representationRed });
check('a preservation case with a new attribute assertion is refused until it measures unchanged behavior on both sides', preservationAttribute.code !== 0 && preservationAttribute.result === 'red', JSON.stringify(preservationAttribute));

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
check('a refactor row greens when its selected test passes on both sides, with positive evidence', refactorPass.code === 0 && refactorPass.result === 'green' && refactorPass.evidence?.verdict === 'passed' && refactorPass.expect === 'green', `exit ${refactorPass.code}, ${JSON.stringify(refactorPass)}`);
// #135: preservation belongs in defect rounds too, not only refactoring tickets. These
// faithful reports name the valid-input/reset cases explicitly; the old side needs no new attribute.
for (const [id, assertion] of [['test_valid_input', 'input_value(42) == 42'], ['test_empty_reset', 'range_after_clear() == (0, 100)']]) {
  const pass = { code: 0, out: passOut.replace('::test_bug', `::${id}`) };
  const preserved = runCli({ cell: `refactor: packages/backend/tests/test_bug.py::${id}`, files, testSource: `def ${id}():\n    assert ${assertion}\n`, current: pass, reverted: pass });
  check(`${id}: unchanged behavior is green on both sides and logs that expectation`, preserved.code === 0 && preserved.result === 'green' && preserved.expect === 'green' && preserved.currentEvidence?.verdict === 'passed' && preserved.evidence?.verdict === 'passed', JSON.stringify(preserved));
}
// A scoped case may fence through another case, but that is not a baseline measurement.
const omittedArea = runCli({ cell: cell(true), files: [files[1]], unit: true, reverted: { code: 1, out: assertFail } });
check('a preservation case that omits the changed area cannot green without a baseline measurement', omittedArea.code !== 0 && omittedArea.result === 'red' && omittedArea.stderr.includes('preservation'), JSON.stringify(omittedArea));
const omittedDefect = runCli({ cell: cell(), files: [files[1]], unit: true, reverted: { code: 1, out: assertFail } });
check('a defect case that omits the changed area cannot green without baseline proof', omittedDefect.code !== 0 && omittedDefect.result === 'red' && omittedDefect.expect === 'red' && omittedDefect.evidence?.verdict === 'unavailable', JSON.stringify(omittedDefect));
const testOnlyDefect = runCli({ cell: cell(), files: [files[1]], testOnly: true, reverted: { code: 0, out: passOut } });
check('test-only coverage cannot masquerade as defect proof of an unchanged product', testOnlyDefect.code !== 0 && testOnlyDefect.result === 'red' && testOnlyDefect.expect === 'red', JSON.stringify(testOnlyDefect));
const testOnlyPreservation = runCli({ cell: cell(true), files: [files[1]], testOnly: true, reverted: { code: 0, out: passOut } });
check('test-only preservation still measures both sides when no other implementation changed', testOnlyPreservation.code === 0 && testOnlyPreservation.result === 'green' && testOnlyPreservation.expect === 'green' && testOnlyPreservation.evidence?.verdict === 'passed', JSON.stringify(testOnlyPreservation));
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

// ── #140: a unit's cases share the diff-wide tasks, once per unchanged tree ─────────────────────
// The unit's three cases name three ids of one changed test file, so the project builds, per case:
// ruff check/format, the shared `pytest tests/test_multi.py`, and the row's own `pytest …::<id> -rA`
// (redBase). `wf check` with no --case runs all three in this process. The stub counts its calls, so
// the arm measures the shared suite once, each row's own test on both sides, and — with the shared
// suite red — every covered row red on that same task.
type MultiRowResult = { code: number | null; lines: { row?: unknown; result?: string; tasks?: { label?: string; exit?: number | null }[] }[]; calls: string[] };

function runMultiRow({ suiteRed = false, mutate = false }: { suiteRed?: boolean; mutate?: boolean } = {}): MultiRowResult {
  const repo = mkdtempSync(join(tmpdir(), 'wf-check-multi-'));
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
  mkdirSync(join(repo, 'bug-reports', 'BJEW-140'), { recursive: true });
  const product = join(repo, 'packages', 'backend', 'app', 'pricing.py');
  const testFile = join(repo, 'packages', 'backend', 'tests', 'test_multi.py');
  const testSource = (value: number) => ['def test_one():', '    assert login() == 200', `    assert total() == ${value}`, '', 'def test_two():', '    assert login() == 200', `    assert total() == ${value}`, '', 'def test_three():', '    assert login() == 200', `    assert total() == ${value}`, ''].join('\n');
  writeFileSync(product, 'BROKEN\n');
  writeFileSync(testFile, testSource(100));
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  git(['switch', '-qc', 'round/bug']);
  writeFileSync(product, 'FIXED\n');
  writeFileSync(testFile, testSource(120));
  const caseLine = (n: number, id: string) => `| ${n} | fix: ${id} | \`packages/backend/app/pricing.py\` \`packages/backend/tests/test_multi.py\` | \`packages/backend/tests/test_multi.py::${id}@3\` |`;
  const ticket = [
    '# BJEW-140 — multi-row', '', '## Intent', '', '- three cases share the diff-wide tasks', '',
    '## Verification', '| # | case | files | check |', '|---|---------|-------|-------|',
    caseLine(1, 'test_one'), caseLine(2, 'test_two'), caseLine(3, 'test_three'), '',
    '## Units', '| # | unit | cases | depends on | review after |', '|---|---|---|---|---|',
    '| 1 | shared | 1, 2, 3 | — | — |', '',
  ].join('\n');
  writeFileSync(join(repo, 'bug-reports', 'BJEW-140', 'TICKET.md'), ticket);
  mkdirSync(join(repo, '.wf'), { recursive: true });
  const plan = parseBuildUnits(ticket);
  const slices = plan.kind === 'units' ? initializeSlices(plan, git(['rev-parse', 'HEAD'])) : undefined;
  writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, id: 'BJEW-140', folder: 'bug-reports/BJEW-140', base: 'main', step: 'build', class: 'A', ...(slices ? { slices } : {}) })}\n`);
  const countDir = mkdtempSync(join(tmpdir(), 'wf-check-count-'));
  const countPath = join(countDir, 'stub-calls.log');
  const mutateGuard = mutate ? join(countDir, 'mutated') : undefined;
  const passFor = (id: string) => passOut.replace('::test_bug', `::${id}`).replaceAll('tests/test_bug.py', 'tests/test_multi.py');
  const perTest = Object.fromEntries(['test_one', 'test_two', 'test_three'].map((id) => [id, { current: { code: 0, out: passFor(id) }, reverted: { code: 1, out: pyFail('test_multi', id, 3, '401 == 200') } }]));
  writeFileSync(scenarioPath, JSON.stringify({
    fixedMarker: 'FIXED',
    current: suiteRed ? { code: 1, out: `F\nFAILED tests/test_multi.py\n1 failed in 0.04s\n` } : { code: 0, out: passFor('test_one') },
    reverted: { code: 1, out: pyFail('test_multi', 'test_one', 3, '401 == 200') },
    perTest,
  }));
  try {
    const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check'], {
      cwd: repo,
      env: { ...gitEnv, PATH: `${stubDir}${delimiter}${process.env.PATH ?? ''}`, VERIFY_STUB_SCENARIO: scenarioPath, VERIFY_STUB_GUARD: product, VERIFY_STUB_COUNT: countPath, ...(mutateGuard ? { VERIFY_STUB_MUTATE: mutateGuard } : {}) },
      encoding: 'utf8',
      timeout: 60000,
    });
    const lines = existsSync(join(repo, '.wf', 'checks.log')) ? readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as MultiRowResult['lines'][number]) : [];
    const calls = existsSync(countPath) ? readFileSync(countPath, 'utf8').split('\n').filter(Boolean) : [];
    return { code: run.status, lines, calls };
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(countDir, { recursive: true, force: true });
  }
}

const suiteCalls = (r: MultiRowResult) => r.calls.filter((c) => c.includes('pytest tests/test_multi.py') && !c.includes('::')).length;
const idCalls = (r: MultiRowResult, id: string) => r.calls.filter((c) => c.includes(`::${id}`)).length;
const multi = runMultiRow();
check('the shared suite runs once for the unit\'s three cases, not once per case', suiteCalls(multi) === 1, JSON.stringify(multi.calls));
check('each case still runs and records its own selected test on both sides, and all three green', ['test_one', 'test_two', 'test_three'].every((id) => idCalls(multi, id) === 2) && multi.lines.length === 3 && multi.lines.every((l) => l.result === 'green'), JSON.stringify({ calls: multi.calls, lines: multi.lines }));
check('each row records the shared suite task as its own', multi.lines.every((l) => (l.tasks ?? []).some((t) => t.label?.startsWith('pytest tests/test_multi.py') && !t.label.includes('::'))), JSON.stringify(multi.lines));
const multiRed = runMultiRow({ suiteRed: true });
check('a failing shared task reds every case it covers', multiRed.code !== 0 && multiRed.lines.length === 3 && multiRed.lines.every((l) => l.result === 'red' && (l.tasks ?? []).some((t) => t.label?.startsWith('pytest tests/test_multi.py') && !t.label.includes('::') && t.exit !== 0)), JSON.stringify({ code: multiRed.code, lines: multiRed.lines }));
check('a failing shared task runs once; the rows it reds do not run their own tests', suiteCalls(multiRed) === 1 && ['test_one', 'test_two', 'test_three'].every((id) => idCalls(multiRed, id) === 0), JSON.stringify(multiRed.calls));
const multiChanged = runMultiRow({ mutate: true });
const ruffCalls = (r: MultiRowResult) => r.calls.filter((c) => c.includes('ruff check')).length;
check('a task that rewrites the tree invalidates reuse: the next row reruns the shared task on the new bytes', multiChanged.lines[0]?.result === 'changed' && ruffCalls(multiChanged) === 2 && multiChanged.lines.slice(1).every((l) => l.result === 'green'), JSON.stringify({ calls: multiChanged.calls, lines: multiChanged.lines }));
check('the changed-tree row reruns the shared suite it could not reuse, and the settled tree is shared again', suiteCalls(multiChanged) === 1 && multiChanged.lines.length === 3, JSON.stringify(multiChanged.calls));

// ── wf check --repro: the project's stack env reaches the repro child (no browser, no DB) ────────
// A repro that imports the project's support helpers reads the round's seed actors and the stack
// URLs from its process env. The stack is a stand-in (the seam runBrief's selfcheck already uses),
// and the repro command is a stub that records the env it received and exits green. The stub writes
// outside the repo: a repro that rewrites the tree is refused by runRepro itself.
const reseeds: number[] = [];
async function runReproEnv(): Promise<Record<string, string> | null> {
  const repo = mkdtempSync(join(tmpdir(), 'wf-repro-env-'));
  const seenDir = mkdtempSync(join(tmpdir(), 'wf-repro-seen-'));
  const seen = join(seenDir, 'env.json');
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const cwd = process.cwd();
  try {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'wf repro selfcheck']);
    git(['config', 'user.email', 'wf-repro@example.invalid']);
    mkdirSync(join(repo, 'bug-reports', 'BJEW-144'), { recursive: true });
    mkdirSync(join(repo, '.wf'), { recursive: true });
    writeFileSync(join(repo, 'repro-stub.cjs'), [
      'try {',
      "  require('node:fs').writeFileSync(process.env.WF_ENV_OUT, JSON.stringify({ owner: process.env.B2B_OWNER_EMAIL, supplier: process.env.B2B_SUPPLIER_EMAIL, url: process.env.B2B_URL, sentinel: process.env.WF_SELFCHECK_SENTINEL }));",
      '} catch (e) { console.error(e); }',
      '',
    ].join('\n'));
    writeFileSync(join(repo, '.verify-stack.env'), 'B2B_URL=http://localhost:11111\nAPI_URL=http://127.0.0.1:11112/api/v1\nWF_SELFCHECK_SENTINEL=from-selfcheck\n');
    writeFileSync(join(repo, 'bug-reports', 'BJEW-144', 'TICKET.md'), ['# BJEW-144', '', '## Intent', '', '- env reaches the repro', '', '## Repro', 'command: node repro-stub.cjs', ''].join('\n'));
    writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, id: 'BJEW-144', folder: 'bug-reports/BJEW-144', base: 'main', step: 'build', class: 'A' })}\n`);
    git(['add', '.']);
    git(['commit', '-qm', 'base']);
    process.chdir(repo);
    process.env.WF_ENV_OUT = seen;
    await runRepro({ stack: async () => 'wf serve: stand-in (no server started)', ready: async () => {}, reseed: async () => { reseeds.push(1); } });
    return existsSync(seen) ? JSON.parse(readFileSync(seen, 'utf8')) as Record<string, string> : null;
  } finally {
    delete process.env.WF_ENV_OUT;
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
    rmSync(seenDir, { recursive: true, force: true });
  }
}

const reproSeen = await runReproEnv();
check('wf check --repro spawns the repro with the round seed actors and .verify-stack.env, no browser or DB', reproSeen?.owner === 'buyer@seed.jewelryx' && reproSeen?.supplier === 'seller@seed.jewelryx' && reproSeen?.url === 'http://localhost:11111' && reproSeen?.sentinel === 'from-selfcheck', JSON.stringify(reproSeen));

check('wf check --repro re-seeds the round database before each of its 3 repro runs', reseeds.length === 3, String(reseeds.length));

// ── #133: a validated red-base proof is reused across paperwork; a changed fixture is not ─────
// The observed failure (JX-1069): a later assessment discarded an existing before-the-fix
// measurement and asked for another run, and each run swapped the fix out of the live worktree. The
// same `wf check` on the same implementation, with only the round's assessment paperwork changed,
// must reuse the recorded red-base proof (its runner verdict and all its bound inputs): the stub
// counts its `pytest …::test_bug` invocations, once with the change and once reverted. Changed
// paperwork does not re-run; a changed round-folder fixture in the case's `files` does.
type ReuseStep = { env?: Record<string, string>; before?: (ctx: { folder: string; fixture: string }) => void };
function runReuse(steps: ReuseStep[]): { codes: (number | null)[]; redBase: { reused?: boolean; key?: string }[]; calls: number[]; countLines: string[] } {
  const repo = mkdtempSync(join(tmpdir(), 'wf-check-reuse-'));
  const countDir = mkdtempSync(join(tmpdir(), 'wf-check-reuse-count-'));
  const countPath = join(countDir, 'calls.log');
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const folder = join(repo, 'bug-reports', 'BJEW-133');
  const product = join(repo, 'packages', 'backend', 'app', 'pricing.py');
  const testFile = join(repo, 'packages', 'backend', 'tests', 'test_bug.py');
  const fixture = join(folder, 'repro', 'fixture.py');
  try {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'wf check selfcheck']);
    git(['config', 'user.email', 'wf-check@example.invalid']);
    mkdirSync(join(repo, 'packages', 'backend', 'app'), { recursive: true });
    mkdirSync(join(repo, 'packages', 'backend', 'tests'), { recursive: true });
    mkdirSync(join(folder, 'repro'), { recursive: true });
    writeFileSync(product, 'BROKEN\n');
    writeFileSync(testFile, 'def test_bug():\n    assert login() == 200\n    assert total() == 120\n');
    git(['add', '.']);
    git(['commit', '-qm', 'base']);
    git(['switch', '-qc', 'round/bug']);
    writeFileSync(product, 'FIXED\n');
    writeFileSync(fixture, 'SEED = 1\n');
    const ticket = [
      '# BJEW-133 — ticket', '', '## Intent', '', '- reuse the before proof', '',
      '## Verification', '| # | case | files | check |', '|---|---------|-------|-------|',
      '| 1 | fix: pricing | `packages/backend/app/pricing.py` `packages/backend/tests/test_bug.py` `bug-reports/BJEW-133/repro/fixture.py` | `packages/backend/tests/test_bug.py::test_bug@3` |', '',
    ].join('\n');
    writeFileSync(join(folder, 'TICKET.md'), ticket);
    mkdirSync(join(repo, '.wf'), { recursive: true });
    writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, id: 'BJEW-133', folder: 'bug-reports/BJEW-133', base: 'main', step: 'build', class: 'A' })}\n`);
    writeFileSync(scenarioPath, JSON.stringify({ fixedMarker: 'FIXED', current: { code: 0, out: passOut }, reverted: { code: 1, out: assertFail } }));
    const countNow = () => (existsSync(countPath) ? readFileSync(countPath, 'utf8').split('\n').filter((c) => c.includes('::test_bug')).length : 0);
    const codes: (number | null)[] = [];
    const calls: number[] = [];
    for (const step of steps) {
      step.before?.({ folder, fixture });
      const before = countNow();
      const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check'], {
        cwd: repo,
        env: { ...gitEnv, PATH: `${stubDir}${delimiter}${process.env.PATH ?? ''}`, VERIFY_STUB_SCENARIO: scenarioPath, VERIFY_STUB_GUARD: product, VERIFY_STUB_COUNT: countPath, ...(step.env ?? {}) },
        encoding: 'utf8',
        timeout: 60000,
      });
      codes.push(run.status);
      if (run.status !== 0) console.error(`proof reuse fixture run ${codes.length}: ${run.error?.message ?? ''}\n${run.stdout ?? ''}${run.stderr ?? ''}`);
      calls.push(countNow() - before);
    }
    const redBase = readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').split('\n').filter(Boolean)
      .map((l) => JSON.parse(l) as { row?: unknown; tasks?: { label?: string; baseline?: { reused?: boolean; key?: string } }[] })
      .filter((l) => l.row === 1)
      .map((l) => l.tasks?.find((t) => t.label?.startsWith('red-base'))?.baseline ?? {});
    const countLines = existsSync(countPath) ? readFileSync(countPath, 'utf8').split('\n').filter(Boolean) : [];
    return { codes, redBase, calls, countLines };
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(countDir, { recursive: true, force: true });
  }
}

// A fresh assessment session is a different host process: its PWD/session id/`_`/SHLVL differ while
// the proof's inputs do not. Those must NOT reach the runner nor invalidate (runs 2 and 3 reuse); a
// genuine change to a bound input (the fixture, run 4) or to a semantic flag (run 5) must re-run.
const session = { PWD: '/somewhere/else', PI_SESSION_ID: 'fresh-session', _: '/other/node', SHLVL: '9' };
const reuse = runReuse([
  {},
  { env: session },
  { env: session, before: ({ folder }) => writeFileSync(join(folder, 'ASSESSMENT.md'), '# assessment\nVerdict: clean\n') },
  { env: session, before: ({ fixture }) => writeFileSync(fixture, 'SEED = 2\n') },
  { env: { ...session, VERIFY_CHANGED: '1' } },
  { env: { ...session, INJECT_TAG: 'a' } },
  { env: { ...session, INJECT_TAG: 'b' } },
]);
// Each run's red-base `::test_bug` invocations: a fresh run does the current side + the reverted side
// (2); a reused run does only the current side (1). Changed session bookkeeping reuses; a changed
// fixture, a changed VERIFY_* flag and a changed arbitrary (non-VERIFY) flag all re-run.
check('a fresh session reuses an unchanged proof; a changed fixture or any semantic flag re-runs red-base', reuse.codes.every((c) => c === 0) && JSON.stringify(reuse.calls) === '[2,1,1,2,2,2,2]' && JSON.stringify(reuse.redBase.map((b) => b.reused === true)) === '[false,true,true,false,false,false,false]', JSON.stringify({ codes: reuse.codes, calls: reuse.calls, reused: reuse.redBase.map((b) => b.reused) }));
check('every red-base run records the identity it measured', reuse.redBase.every((b) => typeof b.key === 'string' && b.key.length > 0), JSON.stringify(reuse.redBase));
// A non-VERIFY flag is not stripped: it reaches BOTH proof sides (the current-side task and the
// reverted red-base task each append it), so a changed one is bound and seen.
const injectedA = reuse.countLines.filter((l) => l.startsWith('INJECT=a') && l.includes('::test_bug')).length;
check('a non-VERIFY semantic flag reaches both proof sides', injectedA === 2, JSON.stringify(reuse.countLines.filter((l) => l.startsWith('INJECT='))));

rmSync(stubDir, { recursive: true, force: true });
rmSync(fixtureDir, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
