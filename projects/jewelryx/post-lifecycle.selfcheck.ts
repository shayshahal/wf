// #191: one public-command publish -> notify OPEN -> human merge -> reconcile -> tracker completion.
// Real git/local bare origin; persistent controlled GitHub/fetch edges only. No live API mutations.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../../src/paths.ts';
import { approvalIdentity, trackerNotePath } from '../../src/gates/content-identity.ts';
import { readState } from '../../src/round/state.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-post-lifecycle-'));
const branch = 'fix/191';
const folder = 'bug-reports/191';
const note = `${folder}/JIRA.md`;
const url = 'https://github.com/o/r/pull/191';
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(GIT_|T3_|T3CODE_|PI_|JIRA_)/.test(k)));
env.GIT_CONFIG_GLOBAL = join(root, 'empty-config');
env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_GLOBAL;
writeFileSync(env.GIT_CONFIG_GLOBAL, '');
process.env.GIT_CONFIG_GLOBAL = env.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_SYSTEM;
let failures = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) failures++; };
const git = (work: string, ...args: string[]) => {
	const r = spawnSync('git', args, { cwd: work, env, encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')}: ${r.stderr}`);
	return r.stdout.trim();
};
const read = (file: string) => readFileSync(file, 'utf8');
const json = (file: string) => JSON.parse(read(file));
const save = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));
const harness = join(root, 'cli.mjs');
writeFileSync(harness, `
import { run } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)};
import { writeState, readState } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/round/state.ts')).href)};
import { captureCorrection } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/round/corrections.ts')).href)};
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = process.env.REMOTE, mode = process.env.MODE, work = process.cwd();
const read = () => JSON.parse(readFileSync(file,'utf8'));
const save = (r) => writeFileSync(file,JSON.stringify(r));
const json = (o) => new Response(JSON.stringify(o),{status:200});
const change = () => {
 if (mode === 'race-note') writeFileSync(${JSON.stringify(note)},readFileSync(${JSON.stringify(note)},'utf8')+'changed note');
 if (mode === 'race-product') writeFileSync('product.txt','changed product');
 if (mode === 'race-delivery') writeState(work, s => ({delivery:{...s.delivery,head:'f'.repeat(40)}}));
 if (mode === 'race-correction') captureCorrection(work,{kind:'human',source:'fixture:191',author:'Shay',relay:'controlled tracker',text:'Keep this instruction.',scope:'round',reason:'race test'});
 if (mode === 'race-question') writeState(work, () => ({questions:[{n:1,to:'user',text:'Which?',asked:'2026-10-24'}]}));
};
const gh = (args) => {
 const r=read(); r.gh.push(args); save(r);
 if(args[0]==='pr' && args[1]==='list') return {status:0,stdout:JSON.stringify(r.pr?[r.pr]:[]),stderr:''};
 if(args[0]==='pr' && args[1]==='create') {
  r.create++; r.pr={url:${JSON.stringify(url)},state:'OPEN',headRefOid:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),headRefName:${JSON.stringify(branch)},baseRefName:'dev',isCrossRepository:false};save(r);
  return {status:0,stdout:${JSON.stringify(url)},stderr:''};
 }
 return {status:1,stdout:'',stderr:'unexpected controlled gh: '+args.join(' ')};
};
globalThis.fetch = async (url, init={}) => {
 if (existsSync('.wf/state.json.lock')) throw new Error('NETWORK UNDER STATE LOCK');
 const r=read(), u=String(url), method=init.method??'GET', key=/issue\\/([^/?]+)/.exec(u)?.[1], ticket=r.tickets[key];
 if(!ticket) throw new Error('unexpected controlled ticket '+u);
 r.calls.push({key,url:u,method});save(r);
 if(u.includes('/changelog')) return json({values:[],isLast:true});
 if(u.includes('/attachments')) {ticket.attachments.push({filename:init.body.get('file').name});save(r);return json([]);}
 if(u.endsWith('/comment') && method==='POST') {ticket.comments.push({body:JSON.parse(init.body).body});save(r);if(mode==='crash-comment')process.exit(137);return json({});}
 if(u.includes('?fields=status')) {
  change();
  if(mode==='unavailable' || (mode==='partial' && key==='X-2')) throw new Error('controlled status unavailable');
  if(mode==='unknown' || (mode==='readback-unknown' && ticket.transitions)) return json({fields:{status:null}});
  if(mode==='malformed') return json({fields:{status:{name:17}}});
  return json({fields:{status:{name:ticket.status}}});
 }
 if(u.includes('/transitions')) {
  if(method==='POST') {
   ticket.transitions++;if(mode!=='not-applied')ticket.status='Fixed in Local';save(r);
   if(mode==='crash-transition')process.exit(137);
   if(mode==='lost-transition')throw new Error('controlled transition response lost');
   if(mode==='race-after-transition')writeState(work,s=>({delivery:{...s.delivery,head:'e'.repeat(40)}}));
   return new Response(null,{status:204});
  }
  if(mode==='no-transition')return json({transitions:[]});
  return json({transitions:ticket.status==='Fixed in Local'?[]:[{id:'31',to:{name:'Fixed in Local'}}]});
 }
 return json({fields:{attachment:ticket.attachments,comment:{comments:ticket.comments}}});
};
await run(JSON.parse(process.env.ARGS),{gh});
`);

type Fixture = { work: string; remote: string };
const state = (f: Fixture) => readState(f.work);
type Ticket = { status: string; comments: {body: string; created?: string}[]; attachments: {filename: string}[]; transitions: number };
type Remote = { create: number; pr: {state: string}; calls: {key: string; url: string}[]; tickets: Record<string, Ticket> };
// Only this controlled harness writes these fixture records; production parses its own responses.
const remote = (f: Fixture): Remote => json(f.remote);
function command(f: Fixture, args: string[], mode = 'ok') {
	const r = spawnSync(process.execPath, [harness], { cwd: f.work, env: { ...env, JIRA_EMAIL: 'fixture@example.invalid', JIRA_TOKEN: 'controlled-not-real', REMOTE: f.remote, ARGS: JSON.stringify(args), MODE: mode }, encoding: 'utf8' });
	return { code: r.status, out: r.stdout + r.stderr };
}
function clone(source: Fixture, name: string): Fixture {
	const work = join(root, name, 'work');
	cpSync(source.work, work, { recursive: true });
	const remote = join(root, name, 'remote.json');
	cpSync(source.remote, remote);
	return { work, remote };
}
function makeRepo(): Fixture {
	const work = join(root, 'base', 'work');
	mkdirSync(work, { recursive: true });
	const origin = join(root, 'origin.git');
	git(work, 'init', '-q', '--bare', origin);
	git(work, 'init', '-q', '-b', 'dev');
	git(work, 'config', 'core.autocrlf', 'false');
	git(work, 'config', 'user.name', 'fixture');
	git(work, 'config', 'user.email', 'fixture@example.invalid');
	writeFileSync(join(work, 'product.txt'), 'base');
	git(work, 'add', '.'); git(work, 'commit', '-qm', 'base');
	git(work, 'remote', 'add', 'origin', 'https://github.com/o/r.git');
	git(work, 'config', `url.${pathToFileURL(origin).href}.insteadOf`, 'https://github.com/o/r.git');
	git(work, 'push', '-qu', 'origin', 'dev');
	git(work, 'checkout', '-qb', branch);
	mkdirSync(join(work, folder, 'proof'), { recursive: true });
	writeFileSync(join(work, folder, 'TICKET.md'), '# X-1\n## Intent\n- the thing\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | preserves behavior | product.txt | test |\n');
	writeFileSync(join(work, folder, 'ASSESSMENT.md'), `head: ${git(work, 'rev-parse', 'HEAD')}\nVerdict: clean\n## Intent\n- the thing: met: product.txt:1 · before: broken · after: fixed\n`);
	mkdirSync(join(work, '.wf'));
	save(join(work, '.wf/state.json'), { wf_version: 5, round: branch, class: 'A', id: 'X-1', ids: ['X-1', 'X-2'], folder, base: 'dev', step: 'pr', made_by: 'kit', history: [{ step: 'classify', at: '2026-10-01T00:00:00Z' }] });
	const identity = approvalIdentity(work, folder, trackerNotePath(folder));
	writeFileSync(join(work, folder, 'REVIEW.md'), `round: ${branch}\nbase: dev\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\nverdict: approved\n`);
	const remote = join(root, 'base', 'remote.json');
	const ticket = () => ({ status: 'In Progress', comments: [], attachments: [], transitions: 0 });
	save(remote, { create: 0, gh: [], calls: [], tickets: { 'X-1': ticket(), 'X-2': ticket() } });
	return { work, remote };
}
const comments = (f: Fixture) => Object.values(remote(f).tickets).map((t) => t.comments.length).join();
const transitions = (f: Fixture) => Object.values(remote(f).tickets).map((t) => t.transitions).join();
const completionKeys = (f: Fixture) => state(f)?.post_completion?.sections.map((s) => s.key).join() ?? '';
const preserved = (f: Fixture) => existsSync(join(f.work, note)) && existsSync(join(f.work, folder, 'proof/after-1.png'));
function refusedCleanup(f: Fixture, name: string) {
	const next = command(f, ['next']);
	const reap = command(f, ['reap', branch]);
	check(`${name}: next routes completion, direct reap refuses without deleting recovery evidence`, next.out.startsWith('post:') && reap.code === 2 && reap.out.includes('tracker completion') && preserved(f), next.out + reap.out);
}
try {
	const f = makeRepo();
	const publish = command(f, ['deliver']);
	check('continuous publish creates OPEN candidate, not delivery', publish.code === 0 && !!state(f)?.pr_handoff && !state(f)?.delivery && remote(f).create === 1, publish.out);
	if (publish.code !== 0) throw new Error(publish.out);
	writeFileSync(join(f.work, note), read(join(f.work, note)).replace(/<[^>]*>/g, 'filled').replace(/^pictures:.*$/gm, 'pictures: after-1.png'));
	writeFileSync(join(f.work, folder, 'proof/after-1.png'), 'selected');
	writeFileSync(join(f.work, folder, 'proof/after-old.png'), 'not selected');
	const beforeNotify = clone(f, 'before-notify');
	const notified = command(f, ['post']);
	check('continuous OPEN post notifies each ticket once, selects exact proof and never transitions', notified.code === 0 && comments(f) === '1,1' && transitions(f) === '0,0' && !state(f)?.post_completion && Object.values(remote(f).tickets).every((t) => t.attachments.map((a) => a.filename).join() === '191-after-1.png'), notified.out);
	check('OPEN next waits for human merge, not cleanup', command(f, ['next']).out.startsWith('wait user: PR'));
	const openRetry = command(f, ['post']);
	check('OPEN retry does not repost or complete', openRetry.code === 0 && comments(f) === '1,1' && transitions(f) === '0,0');
	const r = remote(f); r.pr.state = 'MERGED'; save(f.remote, r); // controlled human merge of the SAME PR/head
	const reconcile = command(f, ['deliver']);
	check('continuous delivery reconciliation records confirmed merge', reconcile.code === 0 && !!state(f)?.delivery && state(f)?.step === 'merged', reconcile.out);
	const beforeComplete = clone(f, 'before-complete');
	refusedCleanup(f, 'continuous before completion');
	const completed = command(f, ['post']);
	check('continuous previously-posted tickets complete after readback, no duplicate notification', completed.code === 0 && completionKeys(f) === 'X-1,X-2' && comments(f) === '1,1' && transitions(f) === '1,1', completed.out);
	const bytes = read(join(f.work, '.wf/state.json'));
	check('completed next offers cleanup', command(f, ['next']).out.startsWith('done:'));
	const postAgain = command(f, ['post']);
	const deliveryAgain = command(f, ['deliver']);
	const finalPost = command(f, ['post']);
	check('repeated post/reconcile preserves receipts and one publication', postAgain.code === 0 && deliveryAgain.code === 2 && deliveryAgain.out.includes('already merged') && finalPost.code === 0 && comments(f) === '1,1' && transitions(f) === '1,1' && remote(f).create === 1 && read(join(f.work, '.wf/state.json')) === bytes, postAgain.out + deliveryAgain.out + finalPost.out);

	for (const [name, prior, first] of [
		['remote-prefix', 'https://github.com/o/r/pull/1910', 'השינוי מוכן ב-PR וממתין למיזוג.'],
		['remote-repository', 'https://github.com/other/repo/pull/191', 'השינוי מוכן ב-PR וממתין למיזוג.'],
		['remote-quote', url, 'Human question about this PR:'],
	]) {
		const c = clone(beforeNotify, name);
		const old = remote(c);
		for (const t of Object.values(old.tickets)) t.comments.push({body: `${first}\nPR: ${prior}`,created:'2026-09-01T00:00:00Z'});
		old.pr.state = 'MERGED'; save(c.remote, old);
		const merged = command(c, ['deliver']);
		const posted = command(c, ['post']);
		check(`${name}: unrelated remote comment never suppresses notification or selected uploads`, merged.code === 0 && posted.code === 0 && comments(c) === '2,2' && Object.values(remote(c).tickets).every((t) => t.attachments.length === 1) && completionKeys(c) === 'X-1,X-2', merged.out + posted.out);
	}

	const commentCrash = clone(beforeNotify, 'comment-crash');
	check('kill after first remote comment leaves notification unacknowledged', command(commentCrash, ['post'], 'crash-comment').code === 137 && comments(commentCrash) === '1,0' && !read(join(commentCrash.work, note)).includes('(posted)'));
	check('comment crash retry never duplicates comment/selected upload', command(commentCrash, ['post']).code === 0 && comments(commentCrash) === '1,1' && Object.values(remote(commentCrash).tickets).every((t) => t.attachments.length === 1) && transitions(commentCrash) === '0,0');

	for (const mode of ['crash-transition', 'lost-transition', 'readback-unknown']) {
		const c = clone(beforeComplete, mode);
		const failed = command(c, ['post'], mode);
		check(`${mode}: no local completion after interrupted remote success`, failed.code !== 0 && !state(c)?.post_completion && transitions(c) === '1,0' && comments(c) === '1,1', failed.out);
		refusedCleanup(c, mode);
		const retry = command(c, ['post']);
		check(`${mode}: retry acknowledges already-delivered status without another transition/comment`, retry.code === 0 && completionKeys(c) === 'X-1,X-2' && transitions(c) === '1,1' && comments(c) === '1,1', retry.out);
	}
	for (const mode of ['unknown', 'malformed', 'unavailable', 'no-transition', 'not-applied']) {
		const c = clone(beforeComplete, mode);
		const result = command(c, ['post'], mode);
		check(`${mode}: failure stays incomplete, note/proof retained`, result.code !== 0 && !state(c)?.post_completion && comments(c) === '1,1' && preserved(c), result.out);
		refusedCleanup(c, mode);
		check(`${mode}: retry can finish without notification duplication`, command(c, ['post']).code === 0 && completionKeys(c) === 'X-1,X-2' && comments(c) === '1,1');
	}
	const already = clone(beforeComplete, 'already-delivered');
	const delivered = remote(already); for (const t of Object.values(delivered.tickets)) t.status = 'Fixed in Local'; save(already.remote, delivered);
	check('legacy posted notes at already-delivered tracker need no transition', command(already, ['post']).code === 0 && completionKeys(already) === 'X-1,X-2' && transitions(already) === '0,0' && comments(already) === '1,1');
	const partial = clone(beforeComplete, 'partial');
	check('multi-ticket partial completion persists successful ticket only', command(partial, ['post'], 'partial').code !== 0 && completionKeys(partial) === 'X-1' && transitions(partial) === '1,0');
	refusedCleanup(partial, 'multi-ticket partial');
	const firstCalls = remote(partial).calls.filter((c) => c.key === 'X-1' && c.url.includes('?fields=status')).length;
	check('partial retry performs only unfinished status work', command(partial, ['post']).code === 0 && completionKeys(partial) === 'X-1,X-2' && transitions(partial) === '1,1' && remote(partial).calls.filter((c) => c.key === 'X-1' && c.url.includes('?fields=status')).length === firstCalls);

	for (const mode of ['race-note', 'race-product', 'race-delivery', 'race-correction', 'race-question', 'race-after-transition']) {
		const c = clone(beforeComplete, mode);
		const result = command(c, ['post'], mode);
		check(`${mode}: stale lookup cannot mutate status or acknowledge another subject`, result.code !== 0 && !state(c)?.post_completion && comments(c) === '1,1' && transitions(c) === (mode === 'race-after-transition' ? '1,0' : '0,0') && preserved(c), result.out);
		check(`${mode}: next never authorizes cleanup`, !command(c, ['next']).out.startsWith('done:'));
	}
	const wrong = clone(beforeComplete, 'wrong-pr');
	writeFileSync(join(wrong.work, note), read(join(wrong.work, note)).replaceAll('/pull/191', '/pull/1910'));
	check('another PR whose number has the same prefix cannot complete this delivery', command(wrong, ['post']).code !== 0 && !state(wrong)?.post_completion && transitions(wrong) === '0,0');
} finally { rmSync(root, { recursive: true, force: true }); }
if (failures) process.exitCode = 1;
else console.log('all continuous tracker lifecycle checks green');
