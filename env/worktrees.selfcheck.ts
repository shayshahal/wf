// env/worktrees.selfcheck.ts — node env/worktrees.selfcheck.ts → exit 0 when green.
// Pure arm: the removal plan on Shay's machine (worktrees.ts). Nothing is run or removed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { teardown } from '../src/project.ts';
import { plug } from '../src/seams.ts';
import { pieces } from './projects/jewelryx/index.ts';
import { removalPlan } from './worktrees.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

plug({ project: pieces });
const plan = removalPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 }, 'win32');
const labels = plan.map((step) => step.label);
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:\\wt\\fix-bjew-1' });
check('verified owned releases precede project teardown and directory removal', labels.join('|') === ['stop owned servers', 'close the show browser', ...down.map((step) => step.label), 'wt remove', 'rm -rf worktree', 'git worktree prune'].join('|'));
check('the show browser is released before the folder, by identity', plan.slice(0, 2).every((step) => Boolean(step.run) && !step.cmd));
check('release uses the identity-verifying operation, never a path sweep', Boolean(plan[0].run) && !plan[0].cmd);
check('wt remove preserves the local branch', plan.find((step) => step.label === 'wt remove')?.args?.includes('--no-delete-branch'));
const served = mkdtempSync(join(tmpdir(), 'wf-served-'));
mkdirSync(join(served, '.wf'));
writeFileSync(join(served, '.wf', 'serve.pid'), '5150');
const withStack = removalPlan({ branch: 'fix/bjew-1', path: served, slug: 'fix-bjew-1', pid: 4242 }, 'win32');
check('both served and unserved worktrees use verified release', Boolean(withStack[0].run) && withStack[0].label === plan[0].label);
rmSync(served, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
