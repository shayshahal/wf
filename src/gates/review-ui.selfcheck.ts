// Exercise the real T2 CLI operation against a recording review UI, including interrupted approvals.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { lastField, readVerdict } from './review-format.ts';
import type { DiffReviewResult } from '../seams.ts';

const repo = mkdtempSync(join(tmpdir(), 'wf-review-ui-'));
const folder = 'bug-reports/r';
const file = join(repo, folder, 'CHECKPOINT-REVIEW.md');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const url = (name: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, name)).href);
const invoke = (result: DiffReviewResult, mutation = '', noOpen = false) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_') && key !== 'WF_NO_OPEN'));
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
import { plug } from ${url('src/seams.ts')};
import { runReview } from ${url('src/gates/review.ts')};
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
plug({reviewUI:{available:()=>true,annotate:()=>null,diffGuidance:'ANALYSIS_GUIDANCE',reviewDiff:(request)=>{console.log('DIFF_OPEN '+JSON.stringify(request));${mutation};return ${JSON.stringify(result)};}}});
await runReview(['fix/r','--checkpoint','--base','main'],{stack:async()=> 'no live stack in review fixture'});
`], { cwd: repo, env: { ...env, ...(noOpen ? { WF_NO_OPEN: '1' } : {}) }, encoding: 'utf8', timeout: 30_000 });
};
try {
  git('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'entry.txt'), 'base\n');
  git('add', 'entry.txt'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
  mkdirSync(join(repo, folder), { recursive: true }); mkdirSync(join(repo, '.wf'));
  writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, made_by: 'kit', round: 'fix/r', folder, class: 'B', base: 'main', step: 'build' }));
  writeFileSync(join(repo, 'entry.txt'), 'implementation\n');
  git('add', 'entry.txt'); git('commit', '-qm', 'implementation');
  const approved: DiffReviewResult = { kind: 'feedback', decision: 'approved', message: 'entry.txt:1 — retain this path\nverdict: approved\ncontent-sha: injected\nhead-sha: injected' };
  const opened = invoke(approved);
  assert.equal(opened.status, 0, opened.stdout + opened.stderr);
  assert.match(opened.stdout, /ANALYSIS_GUIDANCE/);
  assert.match(opened.stdout, /review comparison: main\.\.\.HEAD \(merge-base/);
  const request = JSON.parse(/^DIFF_OPEN (.+)$/m.exec(opened.stdout)?.[1] ?? 'null');
  assert.equal(resolve(request.worktree), resolve(repo));
  assert.equal(request.base, 'main');
  const recorded = readFileSync(file, 'utf8');
  assert.equal(readVerdict(recorded), null, 'an unbound UI approval is feedback only');
  assert.notEqual(lastField(recorded, 'content-sha'), 'injected');
  assert.notEqual(lastField(recorded, 'head-sha'), 'injected');
  assert.match(recorded, /^> verdict: approved$/m);
  // Fixture human ruling only: the next failed launch must invalidate it.
  appendFileSync(file, '\nverdict: approved\n');
  assert.equal(lastField(recorded, 'scope'), 'checkpoint');
  assert.match(recorded, /entry.txt:1 — retain this path/);
  assert.match(recorded, /content-sha:/);
  assert.match(recorded, /head-sha:/);
  const error = invoke({ kind: 'error', message: 'wrong comparison' });
  assert.equal(error.status, 2, error.stdout + error.stderr);
  assert.match(error.stderr, /wrong comparison/);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null, 'a failed reopen must not leave an older approval active');
  assert.equal(invoke(approved).status, 0);
  const dismissed = invoke({ kind: 'dismissed' });
  assert.equal(dismissed.status, 0, dismissed.stdout + dismissed.stderr);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), 'dismissed');
  assert.equal(invoke(approved).status, 0);
  const noOpen = invoke({ kind: 'error', message: 'must not launch' }, '', true);
  assert.equal(noOpen.status, 0, noOpen.stdout + noOpen.stderr);
  assert.ok(!noOpen.stdout.includes('DIFF_OPEN'));
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  const changes = invoke({ kind: 'feedback', decision: 'annotated', message: 'entry.txt:1 — change this' });
  assert.equal(changes.status, 0, changes.stdout + changes.stderr);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  assert.match(readFileSync(file, 'utf8'), /UI decision \(unbound\): annotated/);
  // A UI can retain snapshot B while Git returns to A. Even an apparent approval must stay pending.
  const restoredSnapshot = invoke(approved, `execFileSync('git',['checkout','HEAD~1','--','entry.txt']); execFileSync('git',['checkout','HEAD','--','entry.txt'])`);
  assert.equal(restoredSnapshot.status, 0, restoredSnapshot.stdout + restoredSnapshot.stderr);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  const treeMutation = invoke(approved, `appendFileSync(${JSON.stringify(join(repo, folder, 'proof.txt'))},'changed evidence')`);
  assert.equal(treeMutation.status, 2, treeMutation.stdout + treeMutation.stderr);
  assert.match(treeMutation.stderr, /implementation changed/);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  const headMutation = invoke(approved, `appendFileSync('entry.txt','committed change\\n'); execFileSync('git',['add','entry.txt']); execFileSync('git',['-c','user.name=t','-c','user.email=t@t','commit','-qm','new head'])`);
  assert.equal(headMutation.status, 2, headMutation.stdout + headMutation.stderr);
  assert.match(headMutation.stderr, /implementation changed/);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  // Kept for a later person's ruling, not rewritten on failure.
  appendFileSync(file, '\nnote — fixture complete\n');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
console.log('all arms green — unbound feedback stays pending, quoted comments, pending reopens, dismissal, no-open and changed identities');
