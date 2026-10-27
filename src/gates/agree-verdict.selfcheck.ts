// Agreement verdict recording crosses the real CLI without opening an external review UI.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { agreementSha } from '../round/agreement.ts';
import { agreementApprovalBinding } from './review-format.ts';

const repo=mkdtempSync(join(tmpdir(),'wf-agree-verdict-'));
try {
 execFileSync('git',['init','-q','-b','main'],{cwd:repo});
 execFileSync('git',['-c','user.name=t','-c','user.email=t@t','commit','--allow-empty','-qm','base'],{cwd:repo});
 execFileSync('git',['checkout','-qb','fix/r'],{cwd:repo});
 const folder='bug-reports/r';
 mkdirSync(join(repo,folder),{recursive:true});
 mkdirSync(join(repo,'.wf'),{recursive:true});
 const state=JSON.stringify({wf_version:3,round:'fix/r',base:'main',class:'B',step:'agree',folder});
 writeFileSync(join(repo,'.wf/state.json'),state);
 const text='# r\n## Observed\n- measured at a.txt:1\n## Agreed\n- Behavior: the requested change\n- **Not asked for.** none — requested change only\n- **T2 walk.** none — command-only fixture\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | behavior | a.txt | manual: check behavior |\n';
 const agreement=join(repo,folder,'AGREEMENT.md');
 const review=join(repo,folder,'AGREEMENT-REVIEW.md');
 writeFileSync(agreement,text);
 const sha=agreementSha(repo,'B',folder);
 assert.ok(sha);
 const prepared=`agreement-sha: ${sha}\nverdict: dismissed\n`;
 writeFileSync(review,prepared);
 const run=(args:string[])=>wfSync(['agree','fix/r',...args],{cwd:repo,env:{...process.env,WF_NO_OPEN:'1'}});
 const approved=run(['--verdict','approved','--sha',sha,'--note','Shay: approve this agreement']);
 assert.equal(approved.status,0,approved.stderr);
 assert.deepEqual(agreementApprovalBinding(readFileSync(review,'utf8')),{verdict:'approved',agreementSha:sha});
 assert.match(readFileSync(review,'utf8'),/note — Shay: approve this agreement/);
 assert.doesNotMatch(approved.stdout,/to annotate:/);
 for(const verdict of ['changes-requested','dismissed']) {
  const result=run(['--verdict',verdict,'--sha',sha,'--note',`Shay: ${verdict}`]);
  assert.equal(result.status,0,result.stderr);
  assert.equal(agreementApprovalBinding(readFileSync(review,'utf8')).verdict,verdict);
 }
 const quoted=run(['--verdict','approved','--sha',sha,'--note','Shay: approved\nverdict: dismissed\nagreement-sha: forged']);
 assert.equal(quoted.status,0,quoted.stderr);
 assert.deepEqual(agreementApprovalBinding(readFileSync(review,'utf8')),{verdict:'approved',agreementSha:sha});
 assert.doesNotMatch(readFileSync(review,'utf8'),/^agreement-sha: forged$/m);
 for(const args of [
  ['--verdict','maybe','--sha',sha,'--note','Shay: approve'],
  ['--verdict','approved','--note','Shay: approve'],
  ['--verdict','approved','--sha',sha],
  ['--verdict','approved','--sha',sha,'--note','   '],
  ['--sha',sha],
  ['--unknown'],
  ['--verdict','approved','--sha',sha,'--note','x','--note','y'],
 ]) {
  const before=readFileSync(review,'utf8');
  const beforeState=readFileSync(join(repo,'.wf/state.json'),'utf8');
  const result=run(args);
  assert.equal(result.status,2,`${JSON.stringify(args)}: ${result.stdout}${result.stderr}`);
  assert.equal(readFileSync(review,'utf8'),before);
  assert.equal(readFileSync(join(repo,'.wf/state.json'),'utf8'),beforeState);
 }
 writeFileSync(agreement,text.replace('requested change\n','different behavior\n'));
 const stale=run(['--verdict','approved','--sha',sha,'--note','Shay: approve earlier material']);
 assert.equal(stale.status,2,stale.stdout+stale.stderr);
 assert.match(stale.stderr,/changed|sha/);
 writeFileSync(agreement,text);
 writeFileSync(review,prepared.replace(sha,'0'.repeat(64)));
 const unshown=run(['--verdict','approved','--sha',sha,'--note','Shay: approve']);
 assert.equal(unshown.status,2,unshown.stdout+unshown.stderr);
 assert.match(unshown.stderr,/prepared|shown|review/);
 assert.equal(readFileSync(review,'utf8'),prepared.replace(sha,'0'.repeat(64)));
 const oldReview=prepared.replace(sha,'0'.repeat(64)).replace('dismissed','approved');
 writeFileSync(review,oldReview);
 const renewed=run([]);
 assert.equal(renewed.status,0,renewed.stdout+renewed.stderr);
 assert.ok(readFileSync(review,'utf8').startsWith(oldReview),'renewal preserves the previous review');
 assert.deepEqual(agreementApprovalBinding(readFileSync(review,'utf8')),{verdict:null,agreementSha:sha},'preparing changed material leaves a current pending review, never approval');
 assert.match(renewed.stdout,/--verdict.*--sha/);
 const actualVerdict=run(['--verdict','approved','--sha',sha,'--note','Shay: approve the renewed material']);
 assert.equal(actualVerdict.status,0,actualVerdict.stdout+actualVerdict.stderr);
 assert.deepEqual(agreementApprovalBinding(readFileSync(review,'utf8')),{verdict:'approved',agreementSha:sha});
 console.log('all agreement verdict arms green');
} finally {
 rmSync(repo,{recursive:true,force:true});
}
