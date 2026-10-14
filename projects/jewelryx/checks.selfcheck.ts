// checks.selfcheck.ts — node projects/jewelryx/checks.selfcheck.ts → exit 0 when green.
// Pure: JewelryX's commands for a diff and a plan row, through core's buildTasks (the row's check
// cell, the repro) with this project's checkTasks, plus the real CLI against a temporary repository
// and a faithful runner stub for committed and uncommitted red-base measurements.
import { buildTasks as coreBuildTasks } from '../../src/gates/check.ts';
import type { CheckTarget } from '../../src/gates/check.ts';
import { checkTasks, oracleGuardTask, parseStackEnv, oracleCaseGap, roundReproConfigArg, seedActorsEnv, suitesTouched, roundReproRuntimeInputs } from './checks.ts';
import type { PkgFor } from './checks.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';

// A check-cell target with no id or line: what `checkTasks` gets for a row whose test it must run whole.
const target = (file: string, id: string | null = null, line: number | null = null, refactor = false): CheckTarget => ({ refactor, file, id, line });

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const stackEnv = parseStackEnv(['# a worktree', 'B2B_URL=http://localhost:12345', '', 'ADMIN_URL = http://localhost:12346 ', 'API_URL=http://localhost:12347', ''].join('\n'));
const allowed = ['packages/backend/app/api/auth.py', 'packages/backend/tests/test_auth.py'];
const actors = seedActorsEnv({ buyer: ['buyer@seed.jewelryx', 'seed1234'], seller: ['seller@seed.jewelryx', 'seed1234'] });
const buildTasks = ({ changed, row, pkgFor, repro }: { changed: string[]; row: { check: string } | null; pkgFor: PkgFor; repro: string | null }) => coreBuildTasks({ row, repro, projectTasks: (t: CheckTarget | null) => checkTasks({ changed, target: t, pkgFor, stackEnv }) });

const pkgFor: PkgFor = (f) => (f.startsWith('packages/frontend/b2b/')
  ? { name: 'jewelryx-frontend', dir: 'packages/frontend/b2b', svelte: true }
  : f.startsWith('packages/frontend/shared/types/') ? { name: '@jewelryx/types', dir: 'packages/frontend/shared/types', svelte: false } : null);
const labels = (t: { label: string }[]) => t.map((x) => x.label);

const backend = buildTasks({ changed: allowed, row: { check: 'packages/backend/tests/test_auth.py' }, pkgFor, repro: null });
check('backend diff runs ruff check, ruff format --check, pytest', JSON.stringify(labels(backend)) === JSON.stringify([
  'ruff check app/api/auth.py tests/test_auth.py', 'ruff format --check app/api/auth.py tests/test_auth.py', 'pytest tests/test_auth.py',
]), JSON.stringify(labels(backend)));
check('pytest runs from packages/backend', backend[2].cwd === 'packages/backend' && backend[2].cmd === 'uv');
check('the row\'s test task is the red-base one; lint and format are not', backend[2].redBase === true && !backend.slice(0, 2).some((t: { redBase?: boolean }) => t.redBase), JSON.stringify(backend));

const front = buildTasks({ changed: ['packages/frontend/b2b/src/lib/x.svelte', 'packages/frontend/b2b/src/lib/x.test.ts', 'packages/frontend/shared/types/src/a.ts'], row: { check: 'repro' }, pkgFor, repro: 'node scripts/repro.mjs' });
check('svelte-check only for the package that has a svelte config', labels(front).filter((l) => l.startsWith('svelte-check')).join() === 'svelte-check jewelryx-frontend', labels(front).join(' | '));
check('vitest runs the changed test file, package-relative', labels(front).includes('vitest jewelryx-frontend src/lib/x.test.ts'), labels(front).join(' | '));
check('svelte-check carries --incremental --tsgo', front[0].args!.join(' ').includes('--threshold error --incremental --tsgo'), front[0].args!.join(' '));
check('check: repro runs the agreement command', front.at(-1)!.cmd === 'node' && front.at(-1)!.args!.join(' ') === 'scripts/repro.mjs', JSON.stringify(front.at(-1)));

const noRepro = buildTasks({ changed: [], row: { check: 'repro' }, pkgFor, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1)!.missing?.includes('the agreement'), JSON.stringify(noRepro));
const pw = buildTasks({ changed: [], row: { check: 'verification/specs/login.spec.ts' }, pkgFor, repro: null });
// BJEW-617 row 1 (2026-10-06): from the repo root, `pnpm exec playwright` found no playwright (it is installed in verification/ only).
// The task's declared cwd is verification -- the runner's own cwd -- and it is handed the
// verification-relative path, so a runner report (`tests/…`) resolves against it (issue #109, 2026-10-09).
check('a verification/ .ts check runs playwright from verification/, as the repro does', pw[0].cmd === 'pnpm' && pw[0].args!.join(' ') === 'exec playwright test specs/login.spec.ts --reporter=json' && pw[0].cwd === 'verification', JSON.stringify(pw[0]));
check('a playwright row test is red-base', pw[0].redBase === true, JSON.stringify(pw[0]));
check('it runs against the round stack, not the config default localhost:3000/:3001', pw[0].env?.B2B_URL === 'http://localhost:12345' && pw[0].env?.ADMIN_URL === 'http://localhost:12346' && pw[0].env?.API_URL === 'http://localhost:12347', JSON.stringify(pw[0].env));
check('the env gives a verification spec the seeded owner (store owner) and supplier, which the round database has', actors.B2B_OWNER_EMAIL === 'buyer@seed.jewelryx' && actors.B2B_OWNER_PASSWORD === 'seed1234' && actors.B2B_SUPPLIER_EMAIL === 'seller@seed.jewelryx' && actors.B2B_SUPPLIER_PASSWORD === 'seed1234', JSON.stringify(actors));
check('parseStackEnv skips comments and blank lines, trims spaces', JSON.stringify(Object.keys(stackEnv)) === '["B2B_URL","ADMIN_URL","API_URL"]' && stackEnv.ADMIN_URL === 'http://localhost:12346' && Object.keys(parseStackEnv('')).length === 0);
check('playwright drives the running app: wf check starts the stack first', pw[0].stack === true && !buildTasks({ changed: [], row: { check: 'packages/frontend/b2b/src/x.spec.ts' }, pkgFor, repro: null }).some((t) => t.stack), JSON.stringify(pw[0]));
const vt = buildTasks({ changed: [], row: { check: 'packages/frontend/b2b/src/x.spec.ts' }, pkgFor, repro: null });
check('a package .ts check runs vitest inside its package, at the package\u2019s own cwd', vt[0].args!.join(' ') === 'exec vitest run src/x.spec.ts' && vt[0].cwd === 'packages/frontend/b2b', JSON.stringify(vt[0]));
const pyCmd = buildTasks({ changed: [], row: { check: '`pytest packages/backend/tests/test_auth.py`' }, pkgFor, repro: null });
check('a `pytest <path>` cell runs that path from packages/backend', pyCmd[0]?.args!.join(' ') === 'run --frozen pytest tests/test_auth.py', JSON.stringify(pyCmd));
const vtCmd = buildTasks({ changed: [], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts`' }, pkgFor, repro: null });
check('a `vitest run <path>` cell runs that path in its package', vtCmd[0]?.args!.join(' ') === 'exec vitest run src/x.test.ts' && vtCmd[0]?.cwd === 'packages/frontend/b2b', JSON.stringify(vtCmd));
// 2026-10-09 review: the row's test is selected by name -- `-t`/`-g` -- with the path left bare, the
// name escaped as a literal, and the JSON reporter, so the report carries the suite/title path and the
// assertion location the evidence binds (playwright) or a per-test line that names the case (vitest).
const pwSel = buildTasks({ changed: [], row: { check: 'verification/specs/login.spec.ts::login relogin works' }, pkgFor, repro: null });
check('a playwright row test is selected with -g and the path is verification-relative', pwSel[0].args!.join(' ') === 'exec playwright test specs/login.spec.ts -g login relogin works --reporter=json' && pwSel[0].cwd === 'verification' && !pwSel[0].args!.join(' ').includes('::') && pwSel[0].redBase === true, JSON.stringify(pwSel[0]));
// #133 review: a NAMED round repro (`bug-reports/<round>/repro/x.spec.ts::id`) is a stack playwright
// case, not a root vitest file. It runs from verification/ with the project's own repro config (the
// same the `## Repro` command names) and the JSON reporter, so the report binds the named assertion.
const reproRepo = mkdtempSync(join(tmpdir(), 'wf-round-repro-'));
mkdirSync(join(reproRepo, 'docs', 'agents', 'verify-jewelryx'), { recursive: true });
writeFileSync(join(reproRepo, 'docs', 'agents', 'verify-jewelryx', 'repro.config.ts'), '// the project repro config\n');
const roundRepro = checkTasks({ toplevel: reproRepo, changed: ['bug-reports/BJEW-1/repro/slider.spec.ts', 'bug-reports/BJEW-1/repro/fixture.ts'], target: { refactor: false, file: 'bug-reports/BJEW-1/repro/slider.spec.ts', id: 'old slider', line: 42 }, pkgFor, stackEnv });
check('a named round repro runs playwright through the project repro config, from verification/, with the JSON reporter', roundRepro[0]?.cmd === 'pnpm' && roundRepro[0]?.args!.join(' ') === 'exec playwright test -c ../docs/agents/verify-jewelryx/repro.config.ts ../bug-reports/BJEW-1/repro/slider.spec.ts -g old slider --reporter=json' && roundRepro[0]?.cwd === 'verification' && roundRepro[0]?.stack === true && roundRepro[0]?.redBase === true && !roundRepro.some((t) => t.cmd === 'pnpm' && t.args?.includes('vitest')), JSON.stringify(roundRepro[0]));
const roundReproFallback = checkTasks({ toplevel: join(reproRepo, 'no-skill-here'), changed: ['bug-reports/BJEW-1/repro/slider.spec.ts'], target: { refactor: true, file: 'bug-reports/BJEW-1/repro/slider.spec.ts', id: 'old slider', line: null }, pkgFor, stackEnv });
check('without the skill config, a named round repro uses the per-round fallback config wf new wrote', roundReproFallback[0]?.args!.includes('../bug-reports/BJEW-1/repro/playwright.config.ts') && roundReproFallback[0]?.env?.B2B_URL === 'http://localhost:12345', JSON.stringify(roundReproFallback[0]));
// #133 review (M3): the per-round fallback config exists only in the LIVE worktree, so the named
// round-repro's before side must copy it (and its global setup) into the scratch, or the runner fails
// before the spec loads. The shared config's global setup and tsconfig are the same kind of runtime
// input. `roundReproRuntimeInputs` resolves whichever the route will use; core hands it to probeInputs.
const runtimeRepo = mkdtempSync(join(tmpdir(), 'wf-round-runtime-'));
const reproSpec = 'bug-reports/BJEW-9/repro/slider.spec.ts';
const sharedDir = join(runtimeRepo, 'docs', 'agents', 'verify-jewelryx');
mkdirSync(sharedDir, { recursive: true });
const shared = ['repro.config.ts', 'repro-global-setup.ts', 'tsconfig.json'].map((n) => `docs/agents/verify-jewelryx/${n}`);
for (const f of shared) writeFileSync(join(runtimeRepo, f), '// shared\n');
check('with the shared config, a named round repro copies the config, its global setup and its tsconfig', JSON.stringify([...roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9')].sort()) === JSON.stringify([...shared].sort()), JSON.stringify(roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9')));
rmSync(sharedDir, { recursive: true, force: true });
const fallbackDir = join(runtimeRepo, 'bug-reports', 'BJEW-9', 'repro');
mkdirSync(fallbackDir, { recursive: true });
const fallback = ['bug-reports/BJEW-9/repro/playwright.config.ts', 'bug-reports/BJEW-9/repro/global-setup.ts'];
for (const f of fallback) writeFileSync(join(runtimeRepo, f), '// fallback\n');
check('without the shared config, a named round repro copies the per-round fallback config and its global setup', JSON.stringify([...roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9')].sort()) === JSON.stringify([...fallback].sort()), JSON.stringify(roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9')));
// The route runs `-c ../<fallback>` from verification/; the runtime inputs copy exactly that file, so the
// before side has the config the arg names (the missing-file runner failure the review reproduced).
check('the fallback config the route runs is the one the inputs copy', roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9').some((f) => f.endsWith('/repro/playwright.config.ts')) && roundReproConfigArg(runtimeRepo, 'bug-reports/BJEW-9').endsWith('bug-reports/BJEW-9/repro/playwright.config.ts'), JSON.stringify({ runtime: roundReproRuntimeInputs(runtimeRepo, reproSpec, 'bug-reports/BJEW-9'), arg: roundReproConfigArg(runtimeRepo, 'bug-reports/BJEW-9') }));
check('a non-round-repro target copies no runtime config', roundReproRuntimeInputs(runtimeRepo, 'packages/frontend/b2b/src/x.test.ts', 'bug-reports/BJEW-9').length === 0);
rmSync(runtimeRepo, { recursive: true, force: true });
rmSync(reproRepo, { recursive: true, force: true });
const vtSel = buildTasks({ changed: [], row: { check: 'packages/frontend/b2b/src/x.spec.ts::cart > drops the line' }, pkgFor, repro: null });
check('a vitest row test is selected with -t and the path is package-relative at the package cwd', vtSel[0].args!.join(' ') === 'exec vitest run src/x.spec.ts -t ^cart > drops the line$ --reporter=verbose' && vtSel[0].cwd === 'packages/frontend/b2b' && !vtSel[0].args!.join(' ').includes('::') && vtSel[0].redBase === true, JSON.stringify(vtSel[0]));
const pySel = buildTasks({ changed: [], row: { check: 'packages/backend/tests/test_auth.py::test_otp_login@7' }, pkgFor, repro: null });
check('a pytest row test is selected by node id, with -rA so the report names the passed test', pySel.some((t) => t.args?.join(' ') === 'run --frozen pytest tests/test_auth.py::test_otp_login -rA' && t.redBase === true), JSON.stringify(pySel.map((t) => t.args?.join(' '))));
// The #109 review's counterexample: `amount (EUR)` as a bare selector also matches `amount EUR` (the
// group matches nothing), so the row's own case is never selected and an unrelated one passes. Every
// RegExp metacharacter is escaped; vitest anchors its name, playwright does not (its `-g` matches the
// project, file and title together). Node's own RegExp is the judge, the selector the frameworks read.
const pwParen = buildTasks({ changed: [], row: { check: 'verification/tests/account.spec.ts::amount (EUR)@3' }, pkgFor, repro: null });
const pwSelector = pwParen[0].args![pwParen[0].args!.indexOf('-g') + 1];
check('the playwright selector escapes metacharacters, so `amount (EUR)` no longer matches `amount EUR`', pwSelector !== 'amount (EUR)' && !new RegExp(pwSelector).test('amount EUR') && new RegExp(pwSelector).test('amount (EUR)') && new RegExp(pwSelector).test('checkout amount (EUR) total'), pwSelector);
const vtParen = buildTasks({ changed: [], row: { check: 'packages/frontend/b2b/src/x.spec.ts::amount (EUR)@3' }, pkgFor, repro: null });
const vtSelector = vtParen[0].args![vtParen[0].args!.indexOf('-t') + 1];
check('the vitest selector is escaped and anchored to the test name', vtSelector !== 'amount (EUR)' && !new RegExp(vtSelector).test('amount EUR') && new RegExp(vtSelector).test('amount (EUR)') && !new RegExp(vtSelector).test('prefix amount (EUR)'), vtSelector);
const dots = buildTasks({ changed: [], row: { check: 'verification/tests/account.spec.ts::total . 3' }, pkgFor, repro: null });
const dotSelector = dots[0].args![dots[0].args!.indexOf('-g') + 1];
check('a bare `.` in a row id matches the literal character, not any one character', !new RegExp(dotSelector).test('total x 3') && new RegExp(dotSelector).test('total . 3'), dotSelector);
const vtDup = buildTasks({ changed: ['packages/frontend/b2b/src/x.test.ts'], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts`' }, pkgFor, repro: null });
check('a changed test named by the check cell runs once', vtDup.filter((t: { label: string }) => t.label.startsWith('vitest')).length === 1, JSON.stringify(labels(vtDup)));
check('a vitest row test is red-base even when the changed tests run it once', vtDup.filter((t: { redBase?: boolean }) => t.redBase).length === 1, JSON.stringify(vtDup));
const noted = buildTasks({ changed: [], row: { check: '`vitest run packages/frontend/b2b/src/x.test.ts` (fixture carries params {floor: 3}, detail without the number)' }, pkgFor, repro: null });
check('a note after the command does not replace its path', noted[0]?.args!.join(' ') === 'exec vitest run src/x.test.ts', JSON.stringify(noted));
check('no changes and no check cell → nothing to run', buildTasks({ changed: [], row: null, pkgFor, repro: null }).length === 0);
const grep = buildTasks({ changed: [], row: { check: '`repro --grep auction`' }, pkgFor, repro: 'node r.mjs' });
check('a check cell wf cannot run is refused, not skipped, with the current verification contract', grep.at(-1)?.missing?.includes('Verification check') && grep.at(-1)?.missing?.includes('not runnable') && !grep.at(-1)?.missing?.includes('PLAN.md'), JSON.stringify(grep));
const fenceOnly = buildTasks({ changed: [], row: { check: '—' }, pkgFor, repro: null });
check('— means fence only: no check task, no refusal', fenceOnly.length === 0, JSON.stringify(fenceOnly));
const fenceNote = buildTasks({ changed: [], row: { check: '— (svelte-check runs on its own). Also run `repro --grep x`' }, pkgFor, repro: 'node r.mjs' });
check('— with a note is still fence only, even when the note has a code span', fenceNote.length === 0, JSON.stringify(fenceNote));
const leadingSpace = buildTasks({ changed: [], row: { check: '  — fence' }, pkgFor, repro: null });
check('leading spaces before — are still fence only', leadingSpace.length === 0, JSON.stringify(leadingSpace));
const sWord = buildTasks({ changed: [], row: { check: 'ssss— x' }, pkgFor, repro: null });
check('a cell starting with s is not fence only', sWord.length > 0, JSON.stringify(sWord));

// With the repo's lefthook.yml: its pre-push hook runs on the changed files, and replaces the --tsgo
// svelte-check (the hook's own is stricter). TJEW-670: fallow-audit first ran at the push, after T2.
const svelteDiff = ['packages/frontend/b2b/src/routes/x/+page.svelte'];
const hooked = checkTasks({ changed: svelteDiff, target: null, pkgFor, pushHook: true });
check('with a push hook: the hook on the changed files, and no --tsgo svelte-check', JSON.stringify(labels(hooked)) === '["lefthook pre-commit","lefthook pre-push"]' && hooked[1].args!.join(' ') === 'exec lefthook run pre-push --file packages/frontend/b2b/src/routes/x/+page.svelte', JSON.stringify(hooked));
check('without one: svelte-check as before', labels(checkTasks({ changed: svelteDiff, target: null, pkgFor })).join() === 'svelte-check jewelryx-frontend');
check('nothing changed: no hook run', checkTasks({ changed: [], target: null, pkgFor, pushHook: true }).length === 0);

// The pre-commit hook runs first (it fixes formatting the rest would fail on), on the files still
// there: ESLint ran only at `git commit`, after wf check said green (2026-10-04).
const mixed = ['packages/backend/app/a.py', 'packages/frontend/b2b/src/gone.ts', ...svelteDiff];
const withCommit = checkTasks({ changed: mixed, target: null, pkgFor, pushHook: true, onDisk: (f) => !f.endsWith('gone.ts') });
check('pre-commit first, before ruff', labels(withCommit)[0] === 'lefthook pre-commit' && labels(withCommit)[1].startsWith('ruff check'), JSON.stringify(labels(withCommit)));
const pushArgs = withCommit.at(-1)!.args!.join(' ');
check('pre-commit and pre-push both leave a deleted file out (prettier --check exits 2 on it; the push lists ACMR only)', withCommit[0].args!.join(' ') === 'exec lefthook run pre-commit --file packages/backend/app/a.py --file packages/frontend/b2b/src/routes/x/+page.svelte' && pushArgs === 'exec lefthook run pre-push --file packages/backend/app/a.py --file packages/frontend/b2b/src/routes/x/+page.svelte', pushArgs);
// TJEW-670 row 2 (2026-10-06): a row that only deletes files. No --file: lefthook reads its own `files:`.
const onlyGone = checkTasks({ changed: ['packages/frontend/b2b/src/gone.ts'], target: null, pkgFor, pushHook: true, onDisk: () => false });
check('only deletions: no pre-commit run, pre-push runs with no --file (lefthook reads its own files: list)', JSON.stringify(labels(onlyGone)) === '["lefthook pre-push"]' && onlyGone[0].args!.join(' ') === 'exec lefthook run pre-push', JSON.stringify(onlyGone));

// JX-1221 row 15 (2026-10-08): a row that `git rm`s a test. ruff and pytest were handed the deleted
// path: `E902 The system cannot find the file specified`, so the row could never go green.
const deletedPy = ['packages/backend/app/services/user_service.py', 'packages/backend/tests/services/test_ownership_transfer.py'];
const gonePy = checkTasks({ changed: deletedPy, target: null, pkgFor, onDisk: (f) => !f.endsWith('test_ownership_transfer.py') });
const goneArgs = gonePy.flatMap((t) => t.args ?? []).join(' ');
check('a deleted .py is left out of ruff check, ruff format --check and pytest', !goneArgs.includes('test_ownership_transfer') && labels(gonePy).join() === 'ruff check app/services/user_service.py,ruff format --check app/services/user_service.py', JSON.stringify(labels(gonePy)));
check('a row that only deletes a .py runs no ruff and no pytest', checkTasks({ changed: [deletedPy[1]], target: null, pkgFor, onDisk: () => false }).length === 0);
const goneTest = checkTasks({ changed: ['packages/frontend/b2b/src/lib/x.svelte', 'packages/frontend/b2b/src/lib/x.test.ts'], target: null, pkgFor, onDisk: (f) => !f.endsWith('x.test.ts') });
check('a deleted vitest file is not handed to vitest; its package still gets svelte-check', labels(goneTest).join() === 'svelte-check jewelryx-frontend', JSON.stringify(labels(goneTest)));

// The whole suites a round's diff reaches (index.ts suites).
const touched = (changed: string[]) => suitesTouched(changed).join();
check('BJEW-461: an admin change and its round folder run only the admin suite', touched(['bug-reports/fix-bjew-461-cancel-order-reopen/MEASURED.md', 'packages/frontend/admin/src/lib/components/order/OrderDetailsDrawer.svelte']) === 'admin');
check('a backend change runs the apps too: their contract tests read backend models', touched(['packages/backend/app/models/audit_log.py']) === 'backend,admin,b2b');
check('an app Dockerfile runs that app and the backend, whose tests read it', touched(['packages/frontend/admin/Dockerfile']) === 'backend,admin' && touched(['packages/frontend/b2b/Dockerfile']) === 'backend,b2b');
check('terraform runs the backend, whose tests read its tfvars', touched(['terraform/env-qa.tfvars']) === 'backend');
check('an app file that is not its Dockerfile runs only that app', touched(['packages/frontend/admin/src/Dockerfile.md']) === 'admin');
check('a shared frontend package runs both apps, not the backend', touched(['packages/frontend/shared/ui/src/dialog.svelte']) === 'admin,b2b');
check('the root JS config and the lockfile run both apps', touched(['pnpm-lock.yaml']) === 'admin,b2b' && touched(['tsconfig.json']) === 'admin,b2b');
check('a package nobody named runs every suite', touched(['packages/worker/main.py']) === 'backend,admin,b2b');
check('docs, verification/ and a round folder run none', touched(['docs/agents/testing.md', 'verification/tests/a.spec.ts', 'bug-reports/x/PLAN.md', 'AGENTS.md']) === '');
check('in a fixed order, once each', touched(['packages/frontend/b2b/a.ts', 'packages/frontend/admin/Dockerfile', 'packages/frontend/b2b/c.ts']) === 'backend,admin,b2b' && touched(['packages/frontend/b2b/a.ts', 'packages/frontend/b2b/c.ts']) === 'b2b');

// ── the oracle guard (scripts/oracle-guard.mjs in JewelryX): BJEW-617, 2026-10-06
const row = (n: number, message: string, files: string) => ({ n, message, files: files.split(/[\s,`]+/).filter(Boolean) });
const bjew617 = [row(1, 'test(verification): log out via the settings sidebar in login-relogin', '`verification/tests/login-relogin.spec.ts`'), row(2, 'fix(b2b): drop contact and logout from the desktop dropdown', 'packages/frontend/b2b/src/lib/components/layout/Header.svelte, verification/tests/m1-desktop-guard-b2b.spec.ts')];
const gap = oracleCaseGap({ branch: 'fix/bjew-617-account-menu-logout', rows: bjew617 });
check('a fix/ plan whose rows list verification/ files is refused, each row and file named', gap?.includes('row 1: verification/tests/login-relogin.spec.ts') && gap.includes('row 2: verification/tests/m1-desktop-guard-b2b.spec.ts'), String(gap));
check('the refusal says the guard\'s rule, where coverage goes and the current agreement', gap?.includes('oracle-guard') && gap.includes('fix/* or feat/*') && gap.includes('bugs-to-tests / cr-to-tests') && gap.includes('verification/* branch') && gap.includes('The agreement lists oracle files') && !gap.includes('PLAN.md'), String(gap));
check('a feat/ plan listing JewelryX-Tools/ is refused too', oracleCaseGap({ branch: 'feat/tjew-700-x', rows: [row(1, 'chore: tool', 'JewelryX-Tools/Doc-to-Tests/gate/x.py')] })?.includes('row 1: JewelryX-Tools/Doc-to-Tests/gate/x.py') === true);
check('a verification/* branch may plan verification/ rows', oracleCaseGap({ branch: 'verification/sveltekit3-form-names', rows: bjew617 }) === null);
check('a plan with no oracle file in its rows passes, a path that only mentions verification does not count', oracleCaseGap({ branch: 'fix/x', rows: [row(1, 'fix: x', 'packages/backend/app/x.py, docs/verification/notes.md')] }) === null);
check('a revert row is let through: on a branch that carries the edit it is how the guard goes green', oracleCaseGap({ branch: 'fix/x', rows: [row(2, 'revert: "test(verification): log out via the settings sidebar in login-relogin"', 'verification/tests/login-relogin.spec.ts'), row(3, 'fix(b2b): x', 'packages/frontend/b2b/src/a.svelte')] }) === null);
check('no branch known: nothing to judge', oracleCaseGap({ branch: null, rows: bjew617 }) === null);
check('no oracle file differing: no guard task', oracleGuardTask([]) === null);
const guardRow = checkTasks({ changed: ['verification/tests/login-relogin.spec.ts'], target: target('verification/tests/login-relogin.spec.ts'), pkgFor, pushHook: true, oracleTouched: ['verification/tests/login-relogin.spec.ts'] });
check('row 1 of BJEW-617: an oracle edit in the diff makes the row check red at once, before lefthook, with the rule', guardRow.length === 1 && guardRow[0].label === 'oracle-guard' && guardRow[0].missing?.includes('verification/tests/login-relogin.spec.ts') === true && guardRow[0].missing.includes('bugs-to-tests / cr-to-tests'), JSON.stringify(guardRow));
check('and the same row with no oracle diff runs as before', labels(checkTasks({ changed: ['verification/tests/login-relogin.spec.ts'], target: target('verification/tests/login-relogin.spec.ts'), pkgFor, pushHook: true })).join() === 'lefthook pre-commit,playwright verification/tests/login-relogin.spec.ts,lefthook pre-push');

// JX-718, 2026-10-12: deliver rechecks an already committed single-build fix. HEAD contains the
// fix then; its red baseline must be the round's merge-base, not HEAD or the advancing base tip.
const root = mkdtempSync(join(tmpdir(), 'wf-single-redbase-'));
try {
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), CLAUDECODE: '1', PATH: `${bin}${delimiter}${process.env.PATH}` };
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', ...args], { env, encoding: 'utf8' }).trim();
  const product = 'packages/backend/app/product.py';
  const test = 'packages/backend/tests/test_product.py';
  const folder = 'bug-reports/r';
  git('init', '-q', '-b', 'dev');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(repo, 'packages/backend/app'), { recursive: true });
  mkdirSync(join(repo, 'packages/backend/tests'), { recursive: true });
  writeFileSync(join(repo, product), 'FIXED = False\n');
  git('add', '-A');
  git('commit', '-qm', 'defect');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'fix/r');
  mkdirSync(join(repo, folder), { recursive: true });
  mkdirSync(join(repo, '.wf'));
  writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 2, round: 'fix/r', class: 'A', base: 'dev', folder, step: 'pr', made_by: 'kit' }));
  writeFileSync(join(repo, `${folder}/TICKET.md`), `# r\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | fix the defect | ${product} ${test} | ${test}::test_fix@3 |\n`);
  writeFileSync(join(repo, test), 'from app.product import FIXED\ndef test_fix():\n    assert FIXED is True\n');
  writeFileSync(join(repo, product), 'FIXED = True\n');
  // The stub reads the actual reverted product and keeps pytest's named-case/assertion protocol.
  // Lint is inert; no Python, packages, stack, network or production stash is involved.
  writeFileSync(join(bin, 'runner.cjs'), `const { readFileSync } = require('node:fs');
if (process.argv.includes('ruff')) process.exit(0);
if (!process.argv.includes('pytest')) process.exit(2);
readFileSync('tests/test_product.py');
const passed = process.env.VERIFY_TEST_NOOP === '1' || readFileSync('app/product.py', 'utf8').startsWith('FIXED = True');
console.log(passed ? 'PASSED tests/test_product.py::test_fix\\n1 passed' : '___ test_fix ___\\n>       assert FIXED is True\\nE       assert False is True\\ntests/test_product.py:3: AssertionError\\n=== short test summary info ===\\nFAILED tests/test_product.py::test_fix - assert False is True\\n1 failed');
process.exit(passed ? 0 : 1);
`);
  const win = process.platform === 'win32';
  writeFileSync(join(bin, win ? 'uv.cmd' : 'uv'), win ? `@"${process.execPath}" "%~dp0runner.cjs" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/runner.cjs" "$@"\n`, win ? {} : { mode: 0o755 });
  const attempt = (noop = false) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check'], { cwd: repo, env: { ...env, VERIFY_TEST_NOOP: noop ? '1' : '0' }, encoding: 'utf8' });
  const working = attempt();
  check('single-build check measures the defect before the fix is committed', working.status === 0, `${working.stdout}${working.stderr}`);
  git('add', product, test, folder);
  git('commit', '-qm', 'fix');
  // The base branch independently gains the fix: only its merge-base is the before-fix tree.
  git('checkout', '-q', 'dev');
  writeFileSync(join(repo, product), 'FIXED = True\n');
  git('add', product);
  git('commit', '-qm', 'base advanced independently');
  git('checkout', '-q', 'fix/r');
  check('fixture: base tip advanced but the round merge-base is still the defect', git('merge-base', 'dev', 'HEAD') === base && git('rev-parse', 'dev') !== base);
  writeFileSync(join(repo, 'other.txt'), 'unrelated work\n');
  git('stash', 'push', '--include-untracked', '-m', 'unrelated', '--', 'other.txt');
  const stash = git('rev-parse', 'refs/stash');
  const head = git('rev-parse', 'HEAD');
  const index = git('write-tree');
  const committed = attempt();
  check('single-build check still measures the defect after the fix is committed', committed.status === 0, `${committed.stdout}${committed.stderr}`);
  const line = JSON.parse(readFileSync(join(repo, '.wf/checks.log'), 'utf8').trim().split('\n').at(-1) ?? '{}');
  check('committed single-build logs green with behavioral red-base evidence', line.result === 'green' && line.tasks.some((task: { expect?: string; evidence?: { verdict: string } }) => task.expect === 'red' && task.evidence?.verdict === 'behavioral-failure'), JSON.stringify(line));
  const noop = attempt(true);
  check('a test that passes without the fix is still refused', noop.status === 1 && noop.stderr.includes('does not measure the defect'), `${noop.stdout}${noop.stderr}`);
  check('single-build rechecks preserve the committed fix, index, HEAD and unrelated stash', readFileSync(join(repo, product), 'utf8') === 'FIXED = True\n' && git('write-tree') === index && git('rev-parse', 'HEAD') === head && git('rev-parse', 'refs/stash') === stash && !git('diff', 'HEAD', '--', product, test));
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
