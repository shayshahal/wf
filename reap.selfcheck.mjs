// reap.selfcheck.mjs — node reap.selfcheck.mjs → exit 0 when green.
// Pure arm: which uncommitted paperwork reap keeps. The teardown plan is worktree.selfcheck.mjs.
import { paperworkToKeep } from './reap.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const kept = paperworkToKeep('?? REVIEW.md\n M bug-reports/x/PLAN.md\n?? bug-reports/x/proof/a.png\n D bug-reports/x/old.md\n?? packages/backend/tmp.py\n M SPEC.md\nR  bug-reports/x/a.md -> bug-reports/x/b.md\n');
check('reap keeps uncommitted paperwork: root review files and the round folder, not code or deletions', kept.join() === 'REVIEW.md,bug-reports/x/PLAN.md,bug-reports/x/proof/a.png,SPEC.md,bug-reports/x/b.md', kept.join());

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
