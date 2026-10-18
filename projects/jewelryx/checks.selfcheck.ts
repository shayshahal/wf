import assert from 'node:assert/strict';
import { checkTasks, oracleCaseGap, parseStackEnv, seedActorsEnv } from './checks.ts';
import type { PkgFor } from './checks.ts';
let failures = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(cond ? `ok ${name}` : `FAIL ${name}: ${detail}`); if (!cond) failures++; };
const pkgFor: PkgFor = (f) => f.startsWith('packages/frontend/b2b/') ? {name:'b2b',dir:'packages/frontend/b2b',svelte:true} : null;
const py = checkTasks({ changed: ['packages/backend/app/a.py', 'packages/backend/tests/test_a.py'], pkgFor });
assert.deepEqual(py.map((t) => t.cmd), ['uv','uv','uv']);
assert.deepEqual(py[2].args, ['run','--frozen','pytest','tests/test_a.py']);
const gone = checkTasks({ changed: ['packages/backend/tests/test_gone.py'], pkgFor, onDisk: () => false });
assert.equal(gone.length, 0);
const front = checkTasks({changed:['packages/frontend/b2b/src/x.test.ts'],pkgFor});
assert.deepEqual(front.map((t)=>t.args?.[3]), ['svelte-check','vitest']);
const hooked = checkTasks({changed:['packages/frontend/b2b/src/x.ts'],pkgFor,pushHook:true});
assert.deepEqual(hooked.map((t)=>t.label), ['lefthook pre-commit','lefthook pre-push']);
assert.equal(checkTasks({changed:[],pkgFor}).length, 0);
assert.deepEqual(parseStackEnv(`API_URL=http://127.0.0.1
# ignore
`), {API_URL:'http://127.0.0.1'});
assert.equal(seedActorsEnv({buyer:['b','p'],seller:['s','q']}).B2B_OWNER_EMAIL, 'b');
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

process.exitCode = failures ? 1 : 0;
