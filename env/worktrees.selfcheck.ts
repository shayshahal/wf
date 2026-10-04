// env/worktrees.selfcheck.ts — node env/worktrees.selfcheck.ts → exit 0 when green.
// Pure arm: the removal plan on Shay's machine (worktrees.ts). Nothing is run or removed.
import { teardown } from '../src/project.ts';
import { plug } from '../src/seams.ts';
import { pieces } from './projects/jewelryx/index.ts';
import { removalPlan } from './worktrees.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

plug({ project: pieces });
const plan = removalPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 }, 'win32');
const sweep = Buffer.from(plan[0].args![2], 'base64').toString('utf16le');
// The project's teardown before the folder goes: the database drop runs the worktree's python (the
// first shared-mongo reap, 2026-10-04, dropped nothing with it after).
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:\\wt\\fix-bjew-1' });
const at = (label: string) => plan.findIndex((s) => s.label === label);
check('stragglers, the project\'s teardown, then wt\'s three steps', plan.map((s) => s.label).join(' → ') === ['kill stragglers', ...down.map((s) => s.label), 'wt remove', 'rm -rf worktree', 'git worktree prune'].join(' → '), plan.map((s) => s.label).join(' → '));
check('the database is dropped while the folder is still there', at('drop database') > 0 && at('drop database') < at('rm -rf worktree'));
check('wt remove keeps the branch and runs in the foreground', plan[at('wt remove')].args!.join(' ') === 'remove fix/bjew-1 --no-delete-branch --force --foreground -y', plan[at('wt remove')].args!.join(' '));
check('the straggler sweep matches both path spellings and spares this process', sweep.includes('C:\\wt\\fix-bjew-1') && sweep.includes('-ne 4242'), sweep);
check('the sweep only targets node and python', sweep.includes("Name='node.exe' or Name='python.exe'"));
check('rm is in-process, not a command', plan[at('rm -rf worktree')].rm === 'C:\\wt\\fix-bjew-1' && !plan[at('rm -rf worktree')].cmd);
const posix = removalPlan({ branch: 'fix/bjew-1', path: '/wt/fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 }, 'linux');
check('off Windows the sweep is pkill on the tree\'s path, the rest the same', posix[0].cmd === 'pkill' && posix[0].args!.join(' ') === '-f /wt/fix-bjew-1' && posix.slice(1).map((s) => s.label).join() === plan.slice(1).map((s) => s.label).join(), JSON.stringify(posix[0]));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
