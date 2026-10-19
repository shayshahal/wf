// t3code.selfcheck.ts — native presentation through real agreement, prompt and review operations.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../../src/paths.ts';
import { agreementSha } from '../../src/round/agreement.ts';
import { approvalIdentity, trackerNotePath } from '../../src/gates/content-identity.ts';
import { lastField, readVerdict } from '../../src/gates/review-format.ts';
import { t3Presentation } from './t3code.ts';

assert.equal(t3Presentation({}), null);
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT: '  ', T3_MCP_URL: '' }), null);
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT_SUFFIX: '/w' }), null);
assert.ok(t3Presentation({ T3CODE_PROJECT_ROOT: '/w' }));
assert.ok(t3Presentation({ T3_MCP_URL: 'http://localhost/session', T3_MCP_BEARER_TOKEN: 'secret-not-for-output' }));
const native = t3Presentation({ T3CODE_PROJECT_ROOT: '/w', T3_MCP_BEARER_TOKEN: 'secret-not-for-output' });
assert.ok(native);
assert.ok(!native.guidance.includes('secret-not-for-output'));
assert.match(native.guidance, /discover their names and input schemas/);

const repo = mkdtempSync(join(tmpdir(), 'wf-native-review-'));
const folder = 'bug-reports/r';
const record = join(repo, folder, 'AGREEMENT-REVIEW.md');
const checkpoint = join(repo, folder, 'CHECKPOINT-REVIEW.md');
const moduleUrl = (path: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, path)).href);
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
// A separate process uses the same composition seam as env/wf.ts. Only the external stack is
// substituted: the review still reads real git content, creates bound records and checks verdicts.
const invoke = (operation: 'agree' | 'prompt' | 'review' | 'done', insideT3 = true, base = 'main') => {
	const code = `
import { run } from ${moduleUrl('src/run.ts')};
import { plug } from ${moduleUrl('src/seams.ts')};
import { runReview } from ${moduleUrl('src/gates/review.ts')};
import { t3Presentation } from ${moduleUrl('env/adapters/t3code.ts')};
const pieces = {
  presentation: t3Presentation(process.env),
  reviewUI: {available:()=>true, annotate:()=>{${insideT3 ? "throw new Error('external annotation stole native presentation')" : "console.log('EXTERNAL_UI'); return null"};}, reviewDiff:()=>{throw new Error('external review stole native presentation');}}
};
${operation === 'agree' ? "await run(['agree', 'fix/r'], pieces);"
	: operation === 'prompt' ? "await run(['prompt', 'agree'], pieces);"
	: `plug(pieces); await runReview(['fix/r', '--checkpoint', '--base', ${JSON.stringify(base)}${operation === 'done' ? ", '--done'" : ''}], {stack: async()=> 'stack unavailable — presentation test uses no live product'});`}
`;
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
	return spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: repo, env: { ...env, ...(insideT3 ? { T3CODE_PROJECT_ROOT: repo } : {}) }, encoding: 'utf8', timeout: 30_000 });
};
try {
	git('init', '-q', '-b', 'main');
	writeFileSync(join(repo, 'a.txt'), 'base\n');
	git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'));
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 3, made_by: 'kit', round: 'fix/r', id: 'r', folder, class: 'B', base: 'main', step: 'agree' }));
	writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- restore fixtures — the person\n');
	const agreement = '# r\n## Observed\n- a.txt:1 — base\n## Agreed\n- Behavior: restore seed values\n- Excluding: full reset\n- Choice: value restore, not drop — retain history\n- Verification: repeat twice\n- **Not asked for.** none — only the requested restore\n- T2 walk: none — executable check\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | repeat | a.txt | manual: inspect repeat |\n';
	writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement);
	writeFileSync(join(repo, folder, 'view.html'), '<!doctype html><p>Proposed fixture comparison</p>');
	const sha = agreementSha(repo, 'B', folder);

	const prompt = invoke('prompt');
	assert.equal(prompt.status, 0, prompt.stderr);
	assert.match(prompt.stdout, /compact decision-sheet/);
	assert.match(prompt.stdout, /Native presentation — T3 Code/);
	assert.match(prompt.stdout, /html_preview.*html_render/s);
	assert.ok(!invoke('prompt', false).stdout.includes('Native presentation — T3 Code'));

	const opened = invoke('agree');
	assert.equal(opened.status, 0, `${opened.stdout}${opened.stderr}`);
	assert.match(opened.stdout, /native review handoff: T3 Code — agreement \(not opened by wf\)/);
	assert.ok(opened.stdout.includes(record));
	assert.ok(opened.stdout.includes(join(repo, '.wf', 'AGREEMENT-T1.html')));
	assert.equal(readFileSync(join(repo, folder, 'AGREEMENT.md'), 'utf8'), agreement);
	assert.equal(agreementSha(repo, 'B', folder), sha);
	assert.equal(lastField(readFileSync(record, 'utf8'), 'agreement-sha'), sha);
	assert.equal(readVerdict(readFileSync(record, 'utf8')), null);
	assert.ok(existsSync(join(repo, '.wf', 'AGREEMENT-T1.html')));

	const review = invoke('review');
	assert.equal(review.status, 0, `${review.stdout}${review.stderr}`);
	assert.match(review.stdout, /native review handoff: T3 Code — review/);
	assert.ok(review.stdout.includes(checkpoint));
	assert.equal(readVerdict(readFileSync(checkpoint, 'utf8')), null);
	const before = lastField(readFileSync(checkpoint, 'utf8'), 'head-sha');
	writeFileSync(join(repo, 'a.txt'), 'new implementation\n');
	git('add', 'a.txt'); git('commit', '-qm', 'implementation');
	const reopened = invoke('review');
	assert.equal(reopened.status, 0, `${reopened.stdout}${reopened.stderr}`);
	const latest = readFileSync(checkpoint, 'utf8');
	assert.notEqual(lastField(latest, 'head-sha'), before);
	assert.equal(lastField(latest, 'head-sha'), approvalIdentity(repo, folder, trackerNotePath(folder)).head);
	assert.equal(readVerdict(latest), null);
	const pending = invoke('done');
	assert.equal(pending.status, 2, `${pending.stdout}${pending.stderr}`);
	assert.match(pending.stderr, /no verdict yet/);

	// Fixture ruling only: a changed checkpoint range needs a new ruling even on identical content.
	appendFileSync(checkpoint, '\nverdict: approved\n');
	git('branch', 'mid');
	const rebased = invoke('review', true, 'mid');
	assert.equal(rebased.status, 0, `${rebased.stdout}${rebased.stderr}`);
	const newRange = readFileSync(checkpoint, 'utf8');
	assert.equal(lastField(newRange, 'base'), 'mid');
	assert.equal(lastField(newRange, 'head-sha'), lastField(latest, 'head-sha'));
	assert.equal(readVerdict(newRange), null);
	const awaitingRangeRuling = invoke('done', true, 'mid');
	assert.equal(awaitingRangeRuling.status, 2, `${awaitingRangeRuling.stdout}${awaitingRangeRuling.stderr}`);
	assert.match(awaitingRangeRuling.stderr, /no verdict yet/);

	// Outside T3 the configured external UI still owns the review.
	const external = invoke('agree', false);
	assert.equal(external.status, 0, `${external.stdout}${external.stderr}`);
	assert.match(external.stdout, /EXTERNAL_UI/);
} finally {
	rmSync(repo, { recursive: true, force: true });
}
console.log('all arms green — native T1, T2, prompt, pending verdict, refresh and external fallback');
