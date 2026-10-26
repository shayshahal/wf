// t3code.selfcheck.ts — native presentation through real agreement, prompt and review operations.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { agreementSha } from '../round/agreement.ts';
import { approvalIdentity, trackerNotePath } from '../gates/content-identity.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { t3Presentation, t3WorkspaceHandoff } from './t3code.ts';

assert.equal(t3Presentation({}), null);
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT: '  ', T3_MCP_URL: '' }), null);
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT_SUFFIX: '/w' }), null);
// Project-script terminals inherit the project root, not a thread or its native tools.
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT: '/w' }), null);
assert.equal(t3Presentation({ T3_MCP_URL: 'http://localhost/session' }), null);
assert.equal(t3Presentation({ T3CODE_PROJECT_ROOT: '/w', T3_MCP_BEARER_TOKEN: 'secret-not-for-output' }), null);
assert.equal(t3Presentation({ T3_MCP_URL: 'http://localhost/session', T3_MCP_BEARER_TOKEN: '  ' }), null);
assert.equal(t3Presentation({ T3_ACP_MCP_ENDPOINT: 'http://localhost/acp' }), null);
assert.equal(t3Presentation({ T3_ACP_MCP_AUTHORIZATION: 'secret-not-for-output' }), null);
assert.ok(t3Presentation({ T3_ACP_MCP_ENDPOINT: 'http://localhost/acp', T3_ACP_MCP_AUTHORIZATION: 'secret-not-for-output' }));
const native = t3Presentation({ T3_MCP_URL: 'http://localhost/session', T3_MCP_BEARER_TOKEN: 'secret-not-for-output' });
assert.ok(native);
assert.ok(!native.guidance.includes('secret-not-for-output'));
assert.match(native.guidance, /discover their names and input schemas/);
assert.equal(t3WorkspaceHandoff({}), null);
assert.equal(t3WorkspaceHandoff({ T3CODE_PROJECT_ROOT: '/project-script' }), null);
for (const credentials of [
	{ T3_MCP_URL: 'http://localhost/session', T3_MCP_BEARER_TOKEN: 'secret-not-for-output' },
	{ T3_ACP_MCP_ENDPOINT: 'http://localhost/acp', T3_ACP_MCP_AUTHORIZATION: 'Bearer secret-not-for-output' },
]) {
	const handoff = t3WorkspaceHandoff(credentials);
	assert.ok(handoff);
	const target = join(tmpdir(), 'round with spaces');
	const instructions = handoff(target);
	const payload = /^\{\n[\s\S]*?^\}/m.exec(instructions)?.[0];
	assert.ok(payload);
	const launch = JSON.parse(payload);
	assert.deepEqual(launch.workspaceStrategy, { type: 'existing_worktree', worktreePath: target });
	assert.ok(!('branch' in launch.workspaceStrategy), 'native metadata must not trigger T3 branch renaming');
	assert.match(instructions, /not opened by wf/);
	assert.match(instructions, /setup scripts.*safely repeatable/);
	assert.match(launch.message, /Read .wf\/state.json/);
	assert.ok(!instructions.includes('secret-not-for-output'));
}

const repo = mkdtempSync(join(tmpdir(), 'wf-native-review-'));
const chat = mkdtempSync(join(tmpdir(), 'wf-native-chat-'));
const folder = 'bug-reports/r';
const record = join(repo, folder, 'AGREEMENT-REVIEW.md');
const checkpoint = join(repo, folder, 'CHECKPOINT-REVIEW.md');
const moduleUrl = (path: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, path)).href);
const includesPath = (text: string, path: string) => text.replaceAll('\\', '/').includes(path.replaceAll('\\', '/'));
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
// A separate process exercises host adapters against a local HTTP MCP server. Only
// the native server and product stack are fixtures; binding reads, Git and review records are real.
const invoke = (operation: 'agree' | 'prompt' | 'review' | 'done', insideT3 = true, base = 'main', binding = repo) => {
	const code = `
import { run } from ${moduleUrl('src/run.ts')};
import { plug } from ${moduleUrl('src/seams.ts')};
import { runReview } from ${moduleUrl('src/gates/review.ts')};
import { t3Presentation, t3WorkspaceHandoff } from ${moduleUrl('src/plugin/t3code.ts')};
import { readT3BoundWorkspace } from ${moduleUrl('src/plugin/t3-workspace.ts')};
import { createServer } from 'node:http';
let nativeServer = null;
if (${insideT3}) {
  nativeServer = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    const message = JSON.parse(text);
    if (request.method !== 'POST' || request.headers.authorization !== 'Bearer fixture-secret-not-for-output') { response.writeHead(401); response.end(); return; }
    if (message.method === 'notifications/initialized') { response.writeHead(202); response.end(); return; }
    let result;
    if (message.method === 'initialize') {
      response.setHeader('mcp-session-id', 'fixture-session');
      result = { protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'} };
    } else if (message.method === 'tools/call' && message.params.name === 't3_worktree_status') {
      result = { isError:false,structuredContent:{attached:true,worktreePath:${JSON.stringify(binding)},branch:null,projectWorkspaceRoot:${JSON.stringify(repo)},defaultStartFromOrigin:false} };
    } else { response.writeHead(400); response.end(); return; }
    response.writeHead(200, {'content-type':'application/json'});
    response.end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  });
  await new Promise((resolve) => nativeServer.listen(0, '127.0.0.1', resolve));
  process.env.T3_MCP_URL = 'http://127.0.0.1:' + nativeServer.address().port + '/mcp';
}
const pieces = {
  presentation: t3Presentation(process.env),
  workspaceHandoff: t3WorkspaceHandoff(process.env),
  sessionWorkspace: () => readT3BoundWorkspace(process.env),
  reviewUI: {available:()=>true, annotate:()=>{${insideT3 ? "throw new Error('external annotation stole native presentation')" : "console.log('EXTERNAL_UI'); return null"};}, reviewDiff:()=>{throw new Error('external review stole native presentation');}}
};
try {
${operation === 'agree' ? "await run(['agree', 'fix/r'], pieces);"
	: operation === 'prompt' ? "await run(['prompt', 'agree'], pieces);"
	: `plug(pieces); await runReview(['fix/r', '--checkpoint', '--base', ${JSON.stringify(base)}${operation === 'done' ? ", '--done'" : ''}], {stack: async()=> 'stack unavailable — presentation test uses no live product'});`}
} finally {
  if (nativeServer) { nativeServer.closeAllConnections(); await new Promise((resolve) => nativeServer.close(resolve)); }
}
`;
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
	return spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: insideT3 && operation !== 'prompt' ? binding : repo, env: { ...env, ...(insideT3 ? { T3_MCP_URL: 'http://localhost/session', T3_MCP_BEARER_TOKEN: 'fixture-secret-not-for-output' } : {}) }, encoding: 'utf8', timeout: 30_000 });
};
try {
	git('init', '-q', '-b', 'main');
	writeFileSync(join(repo, 'a.txt'), 'base\n');
	git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
	git('worktree', 'add', '-qb', 'chat', chat, 'main');
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'));
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 3, made_by: 'kit', round: 'fix/r', id: 'r', folder, class: 'B', base: 'main', step: 'agree' }));
	writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- restore fixtures — the person\n');
	const agreement = '# r\n## Observed\n- a.txt:1 — base\n## Agreed\n- Behavior: restore seed values\n- Excluding: full reset\n- Choice: value restore, not drop — retain history\n- Verification: repeat twice\n- **Not asked for.** none — only the requested restore\n- T2 walk: none — executable check\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | repeat | a.txt | manual: inspect repeat |\n';
	writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement);
	writeFileSync(join(repo, folder, 'view.html'), '<!doctype html><p>Proposed fixture comparison</p>');
	mkdirSync(join(repo, folder, 'proof'));
	const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZYQAAAAASUVORK5CYII=', 'base64');
	writeFileSync(join(repo, folder, 'proof', 'before-change.png'), pixel);
	writeFileSync(join(repo, folder, 'proof', 'after-change.png'), pixel);
	const sha = agreementSha(repo, 'B', folder);

	const prompt = invoke('prompt');
	assert.equal(prompt.status, 0, prompt.stderr);
	assert.match(prompt.stdout, /Decision first/);
	assert.match(prompt.stdout, /Native presentation — T3 Code/);
	assert.match(prompt.stdout, /html_preview.*html_render/s);
	assert.match(prompt.stdout, /Workspace binding:.*worktree_status.*round checkout/);
	assert.match(prompt.stdout, /absolute paths in handoffs/);
	assert.ok(!invoke('prompt', false).stdout.includes('Native presentation — T3 Code'));

	const beforeBindingRefusal = readFileSync(join(repo, '.wf/state.json'), 'utf8');
	const wrongAgreementWorkspace = invoke('agree', true, 'main', chat);
	assert.equal(wrongAgreementWorkspace.status, 2, wrongAgreementWorkspace.stdout + wrongAgreementWorkspace.stderr);
	assert.ok(includesPath(wrongAgreementWorkspace.stderr, repo), wrongAgreementWorkspace.stderr);
	assert.match(wrongAgreementWorkspace.stderr, /native session workspace does not match/);
	assert.ok(includesPath(wrongAgreementWorkspace.stderr, chat), wrongAgreementWorkspace.stderr);
	assert.equal(existsSync(record), false);
	assert.equal(readFileSync(join(repo, '.wf/state.json'), 'utf8'), beforeBindingRefusal);

	const opened = invoke('agree');
	assert.equal(opened.status, 0, `${opened.stdout}${opened.stderr}`);
	assert.match(opened.stdout, /native review handoff: T3 Code — agreement \(not opened by wf\)/);
	assert.ok(!opened.stdout.includes('fixture-secret-not-for-output'));
	assert.ok(opened.stdout.includes(record));
	assert.ok(opened.stdout.includes(join(repo, '.wf', 'AGREEMENT-T1.html')));
	assert.equal(readFileSync(join(repo, folder, 'AGREEMENT.md'), 'utf8'), agreement);
	assert.equal(agreementSha(repo, 'B', folder), sha);
	assert.equal(lastField(readFileSync(record, 'utf8'), 'agreement-sha'), sha);
	assert.equal(readVerdict(readFileSync(record, 'utf8')), null);
	assert.ok(existsSync(join(repo, '.wf', 'AGREEMENT-T1.html')));

	const wrongReviewWorkspace = invoke('review', true, 'main', chat);
	assert.equal(wrongReviewWorkspace.status, 2, wrongReviewWorkspace.stdout + wrongReviewWorkspace.stderr);
	assert.ok(includesPath(wrongReviewWorkspace.stderr, repo), wrongReviewWorkspace.stderr);
	assert.match(wrongReviewWorkspace.stderr, /native session workspace does not match/);
	assert.ok(includesPath(wrongReviewWorkspace.stderr, chat), wrongReviewWorkspace.stderr);
	assert.equal(existsSync(checkpoint), false);

	const review = invoke('review');
	assert.equal(review.status, 0, `${review.stdout}${review.stderr}`);
	assert.match(review.stdout, /native review handoff: T3 Code — review/);
	assert.ok(review.stdout.includes(checkpoint));
	// A different checkout still has no .wf: matching the native binding prevents the dead-link case.
	assert.equal(existsSync(join(chat, '.wf', 'before-after.html')), false);
	assert.equal(existsSync(join(repo, '.wf', 'before-after.html')), false);
	const views = [...review.stdout.matchAll(/^view: (.+)$/gm)].map((match) => match[1].trim());
	assert.ok(views.some((page) => /proof[\\/](before|after)-/.test(page)));
	assert.ok(views.every((page) => page.startsWith(repo) && existsSync(page)));
	assert.match(review.stdout, /Workspace binding:.*worktree_status.*round checkout/);
	assert.match(review.stdout, /absolute paths in handoffs/);
	assert.match(review.stdout, /verify.*exists/i);
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
	rmSync(chat, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
}
console.log('all arms green — bound native T1/T2, cross-workspace refusals, prompt, pending verdict, refresh and external fallback');
