// reap.selfcheck.mjs — node JewelryX-Tools/wf/reap.selfcheck.mjs → exit 0 when green.
// Pure arm: the teardown plan for a fixture worktree (nothing is run, nothing is removed).
import { paperworkToKeep, reapPlan } from './reap.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const plan = reapPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 });
const sweep = Buffer.from(plan[0].args[2], 'base64').toString('utf16le');
check('eight steps in teardown order', plan.map((s) => s.label).join(' → ') === 'kill stragglers → wt remove → rm -rf worktree → git worktree prune → docker rm mongo → docker volume rm → docker network rm → portless prune', plan.map((s) => s.label).join(' → '));
check('wt remove keeps the branch and runs in the foreground', plan[1].args.join(' ') === 'remove fix/bjew-1 --no-delete-branch --force --foreground -y', plan[1].args.join(' '));
check('the straggler sweep matches both path spellings and spares this process', sweep.includes('C:\\wt\\fix-bjew-1') && sweep.includes('-ne 4242'), sweep);
check('the sweep only targets node and python', sweep.includes("Name='node.exe' or Name='python.exe'"));
check('rm is in-process, not a command', plan[2].rm === 'C:\\wt\\fix-bjew-1' && !plan[2].cmd);
check('docker names come from the slug', plan[4].args.at(-1) === 'jewelryx-mongo-fix-bjew-1' && plan[5].args.at(-1) === 'jewelryx-wt-mongo-fix-bjew-1');
check('the compose network is removed by its slug name', plan[6].args.join(' ') === 'network rm jewelryx-wt-fix-bjew-1_default', plan[6].args.join(' '));
check('portless prune runs with CI=1', plan[7].env.CI === '1' && plan[7].args.join(' ') === 'prune');

const kept = paperworkToKeep('?? REVIEW.md\n M bug-reports/x/PLAN.md\n?? bug-reports/x/proof/a.png\n D bug-reports/x/old.md\n?? packages/backend/tmp.py\n M SPEC.md\nR  bug-reports/x/a.md -> bug-reports/x/b.md\n');
check('reap keeps uncommitted paperwork: root review files and the round folder, not code or deletions', kept.join() === 'REVIEW.md,bug-reports/x/PLAN.md,bug-reports/x/proof/a.png,SPEC.md,bug-reports/x/b.md', kept.join());

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
