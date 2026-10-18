// reap.selfcheck.ts — node reap.selfcheck.ts → exit 0 when green.
// Pure arm: which uncommitted paperwork reap keeps. The teardown plan is worktree.selfcheck.ts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { branchDeleteArgs, branchKeptLine, branchStep, keepRoundPaperwork, paperworkToKeep, proofToKeep, reapRuns, reapSummary } from './reap.ts';
import { runRemovalStep } from './removal.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const kept = paperworkToKeep('?? REVIEW.md\n M bug-reports/x/PLAN.md\n?? bug-reports/x/proof/a.png\n D bug-reports/x/old.md\n?? packages/backend/tmp.py\n M SPEC.md\nR  bug-reports/x/a.md -> bug-reports/x/b.md\n');
check('reap keeps uncommitted paperwork: root review files and the round folder, not code or deletions', kept.join() === 'REVIEW.md,bug-reports/x/PLAN.md,bug-reports/x/proof/a.png,SPEC.md,bug-reports/x/b.md', kept.join());

// JX-268 (2026-10-07): the before/after pictures are gitignored, so git status never listed them.
// JX-1239 (2026-10-12): reap kept only numbered before/after pairs and deleted the rest of proof/ (named
// screenshots, traces, nested folders). Everything under proof/ is evidence: all of it is kept.
const proofFiles = proofToKeep('bug-reports/x', ['before-1.png', 'after-he-1280-assess.png', 'trace.zip', 'run-2/after-start.png']);
check('reap keeps every file under proof/, named or numbered, nested or not', proofFiles.join() === 'bug-reports/x/proof/before-1.png,bug-reports/x/proof/after-he-1280-assess.png,bug-reports/x/proof/trace.zip,bug-reports/x/proof/run-2/after-start.png', proofFiles.join());

// The real boundary: a git checkout with a gitignored picture, a trace, a nested run folder, a committed
// note and an uncommitted review; the copy goes to a cache root of the check's own.
const work = mkdtempSync(join(tmpdir(), 'wf-reap-'));
const wt = join(work, 'wt');
const cache = join(work, 'cache');
const git = (...args: string[]) => execFileSync('git', ['-C', wt, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
mkdirSync(join(wt, 'bug-reports/x/proof/run-2'), { recursive: true });
mkdirSync(join(wt, '.wf'));
git('init', '-q');
git('config', 'core.autocrlf', 'false');
writeFileSync(join(wt, '.gitignore'), '*.png\n.wf/\n');
writeFileSync(join(wt, 'bug-reports/x/NOTES.md'), 'committed note\n');
git('add', '-A');
git('commit', '-q', '-m', 'round folder');
writeFileSync(join(wt, 'bug-reports/x/proof/after-he-1280-assess.png'), 'png');
writeFileSync(join(wt, 'bug-reports/x/proof/trace.zip'), 'zip');
writeFileSync(join(wt, 'bug-reports/x/proof/run-2/after-start-now-checked.png'), 'nested');
writeFileSync(join(wt, 'REVIEW.md'), 'uncommitted review\n');
writeFileSync(join(wt, '.wf/state.json'), '{}');
const saved = keepRoundPaperwork(wt, 'x', 'bug-reports/x', cache);
const copied = (f: string) => existsSync(join(cache, 'x', f));
check('the gitignored named picture, the trace and the nested picture are copied', ['after-he-1280-assess.png', 'trace.zip', 'run-2/after-start-now-checked.png'].every((f) => copied(`bug-reports/x/proof/${f}`)), saved.files.join());
check('the copy has the picture bytes, and the uncommitted review and the round record', readFileSync(join(cache, 'x/bug-reports/x/proof/run-2/after-start-now-checked.png'), 'utf8') === 'nested' && copied('REVIEW.md') && copied('.wf/state.json'));
check('a committed note is not copied: git keeps it, and reap says so', !copied('bug-reports/x/NOTES.md') && saved.committed?.join() === 'bug-reports/x/NOTES.md', String(saved.committed));
const said = reapSummary({ slug: 'x', dest: join(cache, 'x'), ...saved, folder: 'bug-reports/x', worktree: wt, worktreeGone: true });
check('the summary names the archive, what is in it, and what stayed in git', said.includes(`kept copy: ${join(cache, 'x')} — 5 file(s): 3 proof artifact(s), 2 other`) && said.includes('in git, not copied: 1 committed file(s) under bug-reports/x/') && said.includes(`worktree ${wt}: deleted`), said);
check('a worktree still there is said, not called deleted', reapSummary({ slug: 'x', dest: 'd', files: [], committed: [], folder: 'f', worktree: wt, worktreeGone: false }).includes('NOT deleted'));
check('nothing to keep says so', reapSummary({ slug: 'x', dest: 'd', files: [], committed: null, folder: 'f', worktree: wt, worktreeGone: true }).includes('kept copy: none'));
rmSync(work, { recursive: true, force: true });

// A merged round is reaped for real; anything else only with the flag (BJEW-562, 2026-09-27).
check('merged: reap runs without the flag', reapRuns({}, { step: 'merged' }));
check('not merged: dry unless WF_FORCE_REAP=1', !reapRuns({}, { step: 'review' }) && !reapRuns({}, null) && reapRuns({ WF_FORCE_REAP: '1' }, { step: 'review' }));

const del = branchStep({ step: 'merged' }, 'cr/x', 'C:/repo/.git');
check('merged: the local branch goes too, in its own repository', branchDeleteArgs('C:/repo/.git', 'cr/x').join(' ') === '--git-dir=C:/repo/.git branch -D cr/x' && Boolean(del && 'run' in del && del.run));
check('force-reaped but never merged: the branch stays', branchStep({ step: 'review' }, 'cr/x', 'C:/repo/.git') === null && branchStep(null, 'cr/x', 'C:/repo/.git') === null);

// A branch deleted by hand must not make reap fail: the step is "already gone", and reap re-runs it
// from its journal on every retry (2026-10-18, #180's neighbouring report).
{
  const repo = mkdtempSync(join(tmpdir(), 'wf-branch-step-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@e.invalid', ...args], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('commit', '-qm', 'base', '--allow-empty');
  git('branch', 'cr/x');
  const step = branchStep({ step: 'merged' }, 'cr/x', join(repo, '.git'));
  const first = await runRemovalStep(step!);
  check('a merged round\'s branch is deleted', first.ok && git('branch', '--list', 'cr/x') === '');
  const again = await runRemovalStep(step!);
  check('a branch already gone is already gone, not a failure', again.ok, again.say);
  rmSync(repo, { recursive: true, force: true });
}
check('a deleted branch is said to be deleted', branchKeptLine({ step: 'merged' }, 'fix/x', true).includes('deleted'));
check('an unmerged round\'s kept branch says why', branchKeptLine({ step: 'review' }, 'fix/x', false).includes('never reached step merged'));
check('a worktree that was never a round says that instead', branchKeptLine(null, 'verification/x', false).includes('was not a round'));

// The shared removal-step runner (reap.ts runs the plan with it; a baseline scratch tears itself down
// with it, baseline-run.ts). Every step tolerates "already gone" and a failed step never aborts the
// rest: reap must reach the folder removal and prune, whatever a database drop or a straggler sweep
// did; a baseline scratch must always release its worktree.
const stepDir = mkdtempSync(join(tmpdir(), 'wf-removal-step-'));
try {
  const sub = join(stepDir, 'sub');
  mkdirSync(sub);
  check('a command step runs and reports ok', (await runRemovalStep({ label: 'init', cmd: 'git', args: ['-C', sub, 'init', '-q'] })).ok && existsSync(join(sub, '.git')));
  let ran = false;
  const ranStep = await runRemovalStep({ label: 'mark', run: () => { ran = true; } });
  check('an in-process step runs and reports ok', ranStep.ok && ran && ranStep.say === 'mark: ok');
  const gone = join(stepDir, 'gone');
  mkdirSync(gone);
  writeFileSync(join(gone, 'x'), 'x');
  check('a folder step removes it and reports ok', (await runRemovalStep({ label: 'rm', rm: gone })).ok && !existsSync(gone));
  check('an already-gone folder step still reports ok', (await runRemovalStep({ label: 'rm', rm: gone })).ok);
  const bad = await runRemovalStep({ label: 'bad', cmd: 'node', args: ['-e', 'process.exit(3)'] });
  check('a failing command step never throws and is NOT ok', !bad.ok && bad.say.startsWith('bad: already gone or failed'));
  let threw = false;
  let boom: Awaited<ReturnType<typeof runRemovalStep>> | null = null;
  try { boom = await runRemovalStep({ label: 'boom', run: () => { throw new Error('no database'); } }); } catch { threw = true; }
  check('an in-process step that throws is reported as not ok, not thrown', !threw && boom !== null && !boom.ok && boom.say.includes('no database'));
  // The structured outcome is what a baseline teardown refuses a green on: a folder that survives
  // removal is never reported as ok.
  const busy = join(stepDir, 'busy');
  mkdirSync(busy);
  const survives = { label: 'rm busy', rm: busy };
  const first = await runRemovalStep(survives);
  check('a folder step whose path came back is not ok (the resource was not released)', first.ok === !existsSync(busy));
} finally {
  rmSync(stepDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
