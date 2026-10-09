// checks.selfcheck.ts — node projects/jewelryx/checks.selfcheck.ts → exit 0 when green.
// Pure: JewelryX's commands for a diff and a plan row, through core's buildTasks (the row's check
// cell, the repro) with this project's checkTasks, as `wf check` runs them. No git, no runners.
import { buildTasks as coreBuildTasks } from '../../src/gates/check.ts';
import type { CheckTarget } from '../../src/gates/check.ts';
import { checkTasks, oracleGuardTask, parseStackEnv, planOracleGap, seedActorsEnv, suitesTouched } from './checks.ts';
import type { PkgFor } from './checks.ts';

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
check('check: repro runs the RESEARCH.md command', front.at(-1)!.cmd === 'node' && front.at(-1)!.args!.join(' ') === 'scripts/repro.mjs', JSON.stringify(front.at(-1)));

const noRepro = buildTasks({ changed: [], row: { check: 'repro' }, pkgFor, repro: null });
check('check: repro with no command line reports it instead of passing', noRepro.at(-1)!.missing?.includes('RESEARCH.md'), JSON.stringify(noRepro));
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
check('a check cell wf cannot run is refused, not skipped', grep.at(-1)?.missing?.includes('not runnable'), JSON.stringify(grep));
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
const gap = planOracleGap({ branch: 'fix/bjew-617-account-menu-logout', rows: bjew617 });
check('a fix/ plan whose rows list verification/ files is refused, each row and file named', gap?.includes('row 1: verification/tests/login-relogin.spec.ts') && gap.includes('row 2: verification/tests/m1-desktop-guard-b2b.spec.ts'), String(gap));
check('the refusal says the guard\'s rule and where coverage goes', gap?.includes('oracle-guard') && gap.includes('fix/* or feat/*') && gap.includes('bugs-to-tests / cr-to-tests') && gap.includes('verification/* branch'), String(gap));
check('a feat/ plan listing JewelryX-Tools/ is refused too', planOracleGap({ branch: 'feat/tjew-700-x', rows: [row(1, 'chore: tool', 'JewelryX-Tools/Doc-to-Tests/gate/x.py')] })?.includes('row 1: JewelryX-Tools/Doc-to-Tests/gate/x.py') === true);
check('a verification/* branch may plan verification/ rows', planOracleGap({ branch: 'verification/sveltekit3-form-names', rows: bjew617 }) === null);
check('a plan with no oracle file in its rows passes, a path that only mentions verification does not count', planOracleGap({ branch: 'fix/x', rows: [row(1, 'fix: x', 'packages/backend/app/x.py, docs/verification/notes.md')] }) === null);
check('a revert row is let through: on a branch that carries the edit it is how the guard goes green', planOracleGap({ branch: 'fix/x', rows: [row(2, 'revert: "test(verification): log out via the settings sidebar in login-relogin"', 'verification/tests/login-relogin.spec.ts'), row(3, 'fix(b2b): x', 'packages/frontend/b2b/src/a.svelte')] }) === null);
check('no branch known: nothing to judge', planOracleGap({ branch: null, rows: bjew617 }) === null);
check('no oracle file differing: no guard task', oracleGuardTask([]) === null);
const guardRow = checkTasks({ changed: ['verification/tests/login-relogin.spec.ts'], target: target('verification/tests/login-relogin.spec.ts'), pkgFor, pushHook: true, oracleTouched: ['verification/tests/login-relogin.spec.ts'] });
check('row 1 of BJEW-617: an oracle edit in the diff makes the row check red at once, before lefthook, with the rule', guardRow.length === 1 && guardRow[0].label === 'oracle-guard' && guardRow[0].missing?.includes('verification/tests/login-relogin.spec.ts') === true && guardRow[0].missing.includes('bugs-to-tests / cr-to-tests'), JSON.stringify(guardRow));
check('and the same row with no oracle diff runs as before', labels(checkTasks({ changed: ['verification/tests/login-relogin.spec.ts'], target: target('verification/tests/login-relogin.spec.ts'), pkgFor, pushHook: true })).join() === 'lefthook pre-commit,playwright verification/tests/login-relogin.spec.ts,lefthook pre-push');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
