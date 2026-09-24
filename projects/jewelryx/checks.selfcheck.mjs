// checks.selfcheck.mjs — node projects/jewelryx/checks.selfcheck.mjs → exit 0 when green.
// Pure: JewelryX's commands for a diff and a plan row, through core's buildTasks (the row's check
// cell, the repro) with this project's checkTasks, as `wf check` runs them. No git, no runners.
import { buildTasks as coreBuildTasks } from '../../check.mjs';
import { checkTasks } from './checks.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const allowed = ['packages/backend/app/api/auth.py', 'packages/backend/tests/test_auth.py'];
const buildTasks = ({ changed, row, pkgFor, repro }) => coreBuildTasks({ row, repro, projectTasks: (test) => checkTasks({ changed, test, pkgFor }) });

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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
