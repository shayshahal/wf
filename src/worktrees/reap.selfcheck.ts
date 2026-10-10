// reap.selfcheck.ts — node reap.selfcheck.ts → exit 0 when green.
// Pure arm: which uncommitted paperwork reap keeps. The teardown plan is worktree.selfcheck.ts.
import { branchStep, paperworkToKeep, proofToKeep, reapRuns } from './reap.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const kept = paperworkToKeep('?? REVIEW.md\n M bug-reports/x/PLAN.md\n?? bug-reports/x/proof/a.png\n D bug-reports/x/old.md\n?? packages/backend/tmp.py\n M SPEC.md\nR  bug-reports/x/a.md -> bug-reports/x/b.md\n');
check('reap keeps uncommitted paperwork: root review files and the round folder, not code or deletions', kept.join() === 'REVIEW.md,bug-reports/x/PLAN.md,bug-reports/x/proof/a.png,SPEC.md,bug-reports/x/b.md', kept.join());

// JX-268 (2026-10-07): the before/after pictures are gitignored, so git status never listed them.
const pictures = proofToKeep('bug-reports/x', ['before-1.png', 'after-1.png', 'after-2.png', 'trace.zip', 'before-x.png']);
check('reap keeps the before/after pictures by name, gitignored or not, and nothing else in proof/', pictures.join() === 'bug-reports/x/proof/before-1.png,bug-reports/x/proof/after-1.png,bug-reports/x/proof/after-2.png', pictures.join());

// A merged round is reaped for real; anything else only with the flag (BJEW-562, 2026-09-27).
check('merged: reap runs without the flag', reapRuns({}, { step: 'merged' }));
check('not merged: dry unless WF_FORCE_REAP=1', !reapRuns({}, { step: 'review' }) && !reapRuns({}, null) && reapRuns({ WF_FORCE_REAP: '1' }, { step: 'review' }));

const del = branchStep({ step: 'merged' }, 'cr/x', 'C:/repo/.git');
check('merged: the local branch goes too, in its own repository', del?.args.join(' ') === '--git-dir=C:/repo/.git branch -D cr/x');
check('force-reaped but never merged: the branch stays', branchStep({ step: 'review' }, 'cr/x', 'C:/repo/.git') === null && branchStep(null, 'cr/x', 'C:/repo/.git') === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
