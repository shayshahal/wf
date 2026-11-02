// Real subprocess boundary with 0.28.45 stdout fixtures; no user settings or reviews touched.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlannotatorReview, plannotatorReviewGuidance } from './plannotator-review.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-code-review-'));
try {
  const fixture = join(root, 'plannotator-fixture.mjs');
  writeFileSync(fixture, `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [scenario, ...args] = process.argv.slice(2);
writeFileSync(join(process.cwd(),'launch.json'),JSON.stringify({args,cwd:process.cwd(),dataDir:process.env.PLANNOTATOR_DATA_DIR ?? null}));
if(scenario==='startup') { console.log(JSON.stringify({decision:'approved',message:'not a real decision'}));process.exit(1); }
if(scenario==='bad-json') { console.log('not json');process.exit(0); }
if(scenario==='other-session') {
 const archive=join(process.cwd(),'feedback','other-session'); mkdirSync(archive,{recursive:true});
 writeFileSync(join(archive,'index.jsonl'),JSON.stringify({surface:'review',ts:new Date().toISOString(),decision:'lgtm',target:{review:{cwd:process.cwd(),base:'review-base',diffType:'merge-base',vcsType:'git',snapshotId:'some-other-displayed-snapshot'}},annotations:[]})+String.fromCharCode(10));
}
console.log(JSON.stringify({decision:scenario==='changes'?'annotated':scenario==='dismissed'?'dismissed':scenario==='unknown'?'unknown':'approved',message:scenario==='notes'?'Approved with guidance: keep the error landing':'entry.ts:1-2 — call-flow step comment\\nverdict: approved'}));
`);
  const config = '{"reviewAnalysis":{"semanticDiff":true,"callFlow":false}}\n';
  writeFileSync(join(root, 'config.json'), config);
  for (const scenario of ['approved', 'notes', 'changes', 'other-session', 'dismissed', 'startup', 'bad-json', 'unknown']) {
    const review = createPlannotatorReview(() => ({ file: process.execPath, args: [fixture, scenario] }));
    const result = review({ worktree: root, base: 'review-base' });
    assert.equal(result.kind, ['approved', 'notes', 'changes', 'other-session'].includes(scenario) ? 'feedback' : scenario === 'dismissed' ? 'dismissed' : 'error', JSON.stringify({ scenario, result }));
    if (result.kind === 'feedback') {
      assert.equal(result.decision, scenario === 'changes' ? 'annotated' : 'approved');
      assert.match(result.message, scenario === 'notes' ? /keep the error landing/ : /entry.ts:1-2 — call-flow step comment/);
    }
    const launch = JSON.parse(readFileSync(join(root, 'launch.json'), 'utf8'));
    assert.deepEqual(launch.args, ['review', root, '--git', '--base', 'review-base', '--diff-type', 'merge-base', '--gate', '--json']);
    assert.equal(launch.cwd, root);
    assert.equal(launch.dataDir, process.env.PLANNOTATOR_DATA_DIR ?? null, 'shared data directory must not be redirected');
    assert.equal(readFileSync(join(root, 'config.json'), 'utf8'), config);
    console.log(`  ok   ${scenario}`);
  }
  assert.equal(createPlannotatorReview(() => null)({ worktree: root, base: 'main' }).kind, 'error');
  assert.equal(createPlannotatorReview(() => ({ file: join(root, 'missing'), args: [] }))({ worktree: root, base: 'main' }).kind, 'error');
  assert.match(plannotatorReviewGuidance, /Call flow is opt-in consent/);
  assert.match(plannotatorReviewGuidance, /End the turn/);
  assert.match(plannotatorReviewGuidance, /leaves the verdict pending/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('all arms green — exact comparison, feedback, consent, dismissal and malformed/failed CLI responses');
