// JX-1393: one concrete unavailable-rate repair, with no ignored handoff or extra artifact.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { assessmentContentSha } from './assessment-rulings.ts';
import { parseRepairFindings, repairResponseGap } from './repair-findings.ts';

const findings = '- R1: Intent 5, unavailable rate | action: route the rate request to fail, then measure no notice and unblocked confirmation\n- R2: confirmation test | action: replace the source-text assertion with an interaction assertion';
const report = `Verdict: repair\nhead: HEAD\n## Intent\n- "rate unavailable": NOT MEASURED — failed request not driven\n## Repairs\n${findings}\n`;
const answers = (source: string | null, content: string | null, lines: string) => `\n## Repair responses\nsource: ${source}\ncontent-sha: ${content}\n${lines}\n`;
const done = '- R1: done: drove failed fetch and confirmed no notice or blocked confirmation | evidence: proof/after-rate-unavailable.png and trace.zip\n- R2: done: added the behavioral interaction test | evidence: confirmation.test.ts::confirms when rate fetch fails, passed';

for (const newline of ['\n', '\r\n']) {
	const text = report.replace(/\n/g, newline);
	assert.equal(parseRepairFindings(text).kind, 'findings');
	assert.equal(repairResponseGap(text, answers(assessmentContentSha(text), 'current', done), 'current'), null);
}
for (const invalid of ['', '- R1: Intent 5', '- R1: Intent 5 | action: ', '- R1: Intent 5 | blocker: no route tool', `${findings}\n${findings}`]) {
	assert.equal(parseRepairFindings(`## Repairs\n${invalid}\n`).kind, 'invalid');
}
assert.match(repairResponseGap(report, '', 'current') ?? '', /source:/);
assert.match(repairResponseGap(report, answers('old assessment', 'current', done), 'current') ?? '', /source:/);
assert.match(repairResponseGap(report, answers(assessmentContentSha(report), 'old tree', done), 'current') ?? '', /content-sha:/);
assert.match(repairResponseGap(report, answers(assessmentContentSha(report), 'current', done.split('\n')[0]), 'current') ?? '', /R2/);
assert.match(repairResponseGap(report, answers(assessmentContentSha(report), 'current', `${done}\n${done}`), 'current') ?? '', /R1/);
assert.equal(repairResponseGap(report, answers(assessmentContentSha(report), 'current', done.replace(done.split('\n')[0], '- R1: impossible: browser routing transport failed | owner: browser integration | next: restore routing and rerun the failed-fetch measurement')), 'current'), null);
assert.equal(repairResponseGap('Verdict: clean\n', '', null), null);

const repo = mkdtempSync(join(tmpdir(), 'wf-repair-findings-'));
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trim();
const cli = (...args: string[]) => {
	const result = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
	return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
const folder = 'bug-reports/r';
const stateFile = join(repo, '.wf/state.json');
const assessmentFile = join(repo, folder, 'ASSESSMENT.md');
const ticketFile = join(repo, folder, 'TICKET.md');
try {
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'product.txt'), 'rate fallback\n');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	git('add', '.'); git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');
	git('checkout', '-qb', 'fix/r');
	mkdirSync(join(repo, folder), { recursive: true }); mkdirSync(join(repo, '.wf'));
	const ticket = '# r\n## Intent\n- "rate unavailable": no notice and nothing blocked\n## Notes\n- **T2 walk.** none — controlled fixture, no browser page\n';
	writeFileSync(ticketFile, ticket);
	writeFileSync(stateFile, JSON.stringify({ wf_version: 2, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'assess', repairs: 0 }));
	const content = worktreeContentSha(repo, folder, null, 'row');
	const green = () => appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ result: 'green', content: worktreeContentSha(repo, folder, null, 'row') })}\n`);
	green();
	const assessment = report.replace('head: HEAD', `head: ${git('rev-parse', 'HEAD')}`);
	writeFileSync(assessmentFile, assessment.split('## Repairs')[0]);
	const vague = cli('next');
	assert.match(vague.out, /^dispatch assess/);
	assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).repairs, 0);
	writeFileSync(assessmentFile, assessment);
	const repair = cli('next');
	assert.match(repair.out, /^dispatch build/);
	assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).repairs, 1);
	const brief = cli('brief', 'build');
	assert.equal(brief.code, 0, brief.out);
	assert.ok(brief.out.includes(`source: ${assessmentContentSha(assessment)}`));
	assert.ok(brief.out.includes('route the rate request to fail'));
	const before = readFileSync(stateFile, 'utf8');
	const ignored = cli('step', 'assess');
	assert.equal(ignored.code, 2, ignored.out);
	assert.match(ignored.out, /repair responses:/);
	assert.equal(readFileSync(stateFile, 'utf8'), before);
	writeFileSync(ticketFile, ticket + answers(assessmentContentSha(assessment), content, done.split('\n')[0]));
	const partial = cli('step', 'assess');
	assert.equal(partial.code, 2, partial.out); assert.match(partial.out, /R2/);
	writeFileSync(ticketFile, ticket + answers(assessmentContentSha(assessment), content, done));
	writeFileSync(join(repo, 'product.txt'), 'updated fallback\n'); green();
	const stale = cli('step', 'assess');
	assert.equal(stale.code, 2, stale.out); assert.match(stale.out, /content-sha:/);
	writeFileSync(ticketFile, ticket + answers(assessmentContentSha(assessment), worktreeContentSha(repo, folder, null, 'row'), done));
	const handoff = cli('step', 'assess');
	assert.equal(handoff.code, 0, handoff.out);
	assert.equal(readFileSync(assessmentFile, 'utf8'), assessment);
	const assessor = cli('prompt', 'assess');
	assert.equal(assessor.code, 0, assessor.out);
	assert.match(assessor.out, /Builder's repair responses/); assert.ok(assessor.out.includes(done));
	writeFileSync(assessmentFile, `Verdict: clean\nhead: ${git('rev-parse', 'HEAD')}\nassessed-at: 2026-10-15T10:00:00Z\n## Intent\n- "rate unavailable": met: before: unavailable rate blocked confirmation · after: failed-fetch interaction passes without notice\n`);
	const finished = cli('next');
	assert.match(finished.out, /^review: T2/);
	assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).repairs, 1);
	// A missing runtime follows the existing harness path once, then resumes the builder without
	// spending a product repair or repeatedly sending the same report back to the harness fixer.
	const blocked = assessment.replace(findings, '- R1: Intent 5, unavailable rate | blocker: browser routing transport unavailable | owner: browser integration | next: restore routing and drive the failed request');
	writeFileSync(assessmentFile, blocked);
	writeFileSync(stateFile, JSON.stringify({ wf_version: 2, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'assess', repairs: 0 }));
	const recovery = cli('next');
	assert.match(recovery.out, /^wait user: harness —/);
	assert.match(recovery.out, /browser integration/);
	const pending = JSON.parse(readFileSync(stateFile, 'utf8'));
	assert.equal(pending.repairs, 0); assert.equal(pending.step, 'build');
	assert.ok(!pending.questions?.length);
	const resumed = cli('next');
	assert.match(resumed.out, /^dispatch build/); assert.match(resumed.out, /execution recovery/);
	writeFileSync(ticketFile, ticket + answers(assessmentContentSha(blocked), worktreeContentSha(repo, folder, null, 'row'), done.split('\n')[0]));
	const recovered = cli('step', 'assess');
	assert.equal(recovered.code, 0, recovered.out);
	const fresh = cli('next');
	assert.match(fresh.out, /^dispatch assess/);
	assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).repairs, 0);
} finally { rmSync(repo, { recursive: true, force: true }); }
console.log('all repair finding contracts and the one-repair CLI replay green');
