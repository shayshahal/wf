// env/worktrees.selfcheck.mts — node env/worktrees.selfcheck.mts → exit 0 when green.
// Pure arm: the removal plan on Shay's machine (worktrees.mts). Nothing is run or removed.
import { teardown } from '../project.mts';
import { plug } from '../seams.mts';
import { pieces } from './projects/jewelryx/index.mts';
import { removalPlan } from './worktrees.mts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

plug({ project: pieces });
const plan = removalPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 });
const sweep = Buffer.from(plan[0].args![2], 'base64').toString('utf16le');
check('wf\'s four steps first, then the project\'s teardown', plan.slice(0, 4).map((s) => s.label).join(' → ') === 'kill stragglers → wt remove → rm -rf worktree → git worktree prune' && JSON.stringify(plan.slice(4)) === JSON.stringify(teardown({ slug: 'fix-bjew-1' })), plan.map((s) => s.label).join(' → '));
check('wt remove keeps the branch and runs in the foreground', plan[1].args!.join(' ') === 'remove fix/bjew-1 --no-delete-branch --force --foreground -y', plan[1].args!.join(' '));
check('the straggler sweep matches both path spellings and spares this process', sweep.includes('C:\\wt\\fix-bjew-1') && sweep.includes('-ne 4242'), sweep);
check('the sweep only targets node and python', sweep.includes("Name='node.exe' or Name='python.exe'"));
check('rm is in-process, not a command', plan[2].rm === 'C:\\wt\\fix-bjew-1' && !plan[2].cmd);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
