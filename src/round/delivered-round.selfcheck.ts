// delivered-round.selfcheck.ts — real git/CLI regression for follow-ups under merged state (#129).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { pathToFileURL } from 'node:url';
import { deliveryReceiptGap, mergedImplementationGap } from './delivered-round.ts';
import { readState, writeState, WF_STATE_VERSION } from './state.ts';
import { approvalIdentity, headContentSha } from '../gates/content-identity.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};
const dir = mkdtempSync(join(tmpdir(), 'wf-delivered-'));
const folder = 'bug-reports/first';
const product = join(dir, 'product.txt');
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const cli = (...args: string[]) => wfSync(args, { cwd: dir, env: { ...process.env, WF_FORCE_REAP: '0' } });
try {
	git('init', '-q', '-b', 'dev');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(product, 'delivered\n');
	mkdirSync(join(dir, folder), { recursive: true });
	writeFileSync(join(dir, folder, 'TICKET.md'), '# r\n## Intent\n- the thing\n');
	git('add', '-A'); git('commit', '-qm', 'first delivery');
	const head = git('rev-parse', 'HEAD');
	git('checkout', '-qb', 'fix/first');
	const delivery = { url: 'https://github.com/o/r/pull/1', head, contentSha: headContentSha(dir, folder, null, 'row') };
	const original = writeState(dir, () => ({ wf_version: WF_STATE_VERSION, round: 'fix/first', id: 'X-1', folder, base: 'dev', class: 'A', step: 'merged', delivery, note: `${folder}/NOTE.md`, history: [{ step: 'merged', at: '2026-10-13T10:00:00Z' }] }));
	writeFileSync(join(dir, folder, 'NOTE.md'), '## X-1\nDelivered\n');
	check('the merged product identity allows post-only resume', mergedImplementationGap(dir, original) === null);
	const post = cli('next');
	check('real next still posts the first delivery', post.status === 0 && post.stdout.startsWith('post: X-1'), `${post.stdout}${post.stderr}`);
	writeFileSync(join(dir, folder, 'NOTE.md'), `## X-1 (posted)\nDelivered\npictures: none\nPR: ${delivery.url}\n`);
	// #191: establish completion by actual status readback, then retain the identity assertions.
	const postHarness = join(dir, folder, 'post-harness.mjs');
	writeFileSync(postHarness, `import { run } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)};
	globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes('/changelog') ? {values:[],isLast:true} : {fields:{status:{name:'Fixed in Local'},comment:{comments:[]}}}),{status:200});
	await run(['post']);`);
	const completed = spawnSync(process.execPath, [postHarness], {cwd:dir,env:{...process.env,JIRA_EMAIL:'fixture@example.invalid',JIRA_TOKEN:'controlled-not-real'},encoding:'utf8'});
	check('tracker readback establishes separate bound completion', completed.status === 0 && readState(dir)?.post_completion?.delivery.head === head, completed.stdout + completed.stderr);
	rmSync(postHarness);
	git('add', folder); git('commit', '-qm', 'post-delivery paperwork');
	const done = cli('next');
	check('paperwork-only commits preserve the receipt and allow reap', done.status === 0 && done.stdout.startsWith('done:'), `${done.stdout}${done.stderr}`);
	const ask = cli('ask', 'What wording should the tracker note use?');
	const question = readState(dir)?.questions?.[0];
	const decide = cli('decide', '--q', String(question?.n), 'Use the delivered wording');
	check('post-delivery questions and answers do not reopen or block ordinary posting', ask.status === 0 && decide.status === 0 && readState(dir)?.step === 'merged' && readState(dir)?.delivery?.head === head && cli('next').stdout.startsWith('done:'), `${ask.stdout}${ask.stderr}${decide.stdout}${decide.stderr}`);

	for (const command of [['step', 'build'], ['step', 'classify'], ['decide', '--revise', 'more behavior'], ['brief', 'build'], ['review', 'fix/first', '--done'], ['check']]) {
		const before = readFileSync(join(dir, '.wf/state.json'), 'utf8');
		const result = cli(...command);
		check(`${command.join(' ')} cannot reopen the old delivery`, result.status !== 0 && result.stderr.includes('fresh round') && readFileSync(join(dir, '.wf/state.json'), 'utf8') === before, `${result.stdout}${result.stderr}`);
	}

	writeFileSync(product, 'follow-up\n');
	const dirty = cli('next');
	check('uncommitted follow-up stops post/reap and names the fresh route', dirty.stdout.startsWith('wait user: product changes exist after delivery') && dirty.stdout.includes('--reopen') && !dirty.stdout.includes('done:'), `${dirty.stdout}${dirty.stderr}`);
	// Exercise the real dispatcher/refusal, but never let a broken guard invoke project teardown
	// or write the person's cache. The adapter is inert; the real lifecycle has its own bench.
	const reapHarness = join(dir, '.wf/reap-harness.mjs');
	writeFileSync(reapHarness, `import { run } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)}; await run(['reap', 'fix/first'], { removalPlan: () => { throw Error('test removal adapter reached'); } });`);
	const reap = spawnSync(process.execPath, [reapHarness], { cwd: dir, env: { ...process.env, HOME: dir, USERPROFILE: dir, WF_FORCE_REAP: '0' }, encoding: 'utf8' });
	check('direct reap also preserves follow-up work rather than deleting its branch', reap.status === 2 && reap.stderr.includes('nothing removed') && readFileSync(product, 'utf8') === 'follow-up\n' && git('branch', '--list', 'fix/first').includes('fix/first'), `${reap.stdout}${reap.stderr}`);
	const forced = spawnSync(process.execPath, [reapHarness], { cwd: dir, env: { ...process.env, HOME: dir, USERPROFILE: dir, WF_FORCE_REAP: '1' }, encoding: 'utf8' });
	check('explicit force reaches removal, with a warning that product changes are not archived', forced.stderr.includes('test removal adapter reached') && forced.stderr.includes('product changes are not archived') && !forced.stderr.includes('nothing removed'), `${forced.stdout}${forced.stderr}`);
	rmSync(join(dir, '.cache'), { recursive: true, force: true });
	rmSync(reapHarness);
	git('add', 'product.txt'); writeFileSync(product, 'delivered\n');
	check('index-only product edits remain visible with restored worktree', mergedImplementationGap(dir, original)?.reason.includes('product changes') === true);
	git('reset', '-q', '--', 'product.txt');
	writeFileSync(product, 'follow-up\n'); git('add', 'product.txt'); git('commit', '-qm', 'follow-up outside round');
	writeFileSync(product, 'delivered\n');
	check('a restored worktree cannot hide new committed product bytes', mergedImplementationGap(dir, original)?.reason.includes('product changes') === true);
	git('reset', '--hard', 'HEAD~1');
	writeFileSync(join(dir, 'new-product.txt'), 'untracked follow-up\n');
	check('untracked product work also blocks post/reap', mergedImplementationGap(dir, original)?.reason.includes('product changes') === true);
	rmSync(join(dir, 'new-product.txt'));

	// Existing merged rounds need not be restarted: their actual T2 tree supplies the product
	// binding. We never infer delivery from today's HEAD, which may already contain follow-up work.
	const identity = approvalIdentity(dir, folder, `${folder}/NOTE.md`);
	writeFileSync(join(dir, folder, 'REVIEW.md'), `content-sha: ${identity.worktree}\nhead-sha: ${identity.head}\nverdict: approved\n`);
	const { delivery: _receipt, ...legacy } = original;
	writeFileSync(join(dir, '.wf/state.json'), JSON.stringify(legacy));
	const legacyGap = mergedImplementationGap(dir, legacy);
	check('pre-receipt merged rounds resume using bound T2 evidence', legacyGap === null, legacyGap?.reason ?? '');
	writeFileSync(product, 'follow-up\n');
	check('pre-receipt T2 binding catches follow-ups without trusting current HEAD', mergedImplementationGap(dir, legacy)?.reason.includes('product changes') === true);
	writeFileSync(product, 'delivered\n');
	rmSync(join(dir, folder, 'REVIEW.md'));
	check('missing delivery authority fails closed for cleanup, not silently rebased to HEAD', mergedImplementationGap(dir, legacy)?.kind === 'unbound');
	writeFileSync(join(dir, folder, 'REVIEW.md'), 'verdict: approved\n');
	writeFileSync(join(dir, folder, 'NOTE.md'), '## X-1\nOriginal delivered note\n');
	check('a pre-content-binding round can still post its original saved note', cli('next').stdout.startsWith('post: X-1'));
	writeFileSync(join(dir, folder, 'NOTE.md'), '## X-1 (posted)\nOriginal delivered note\n');
	const unbound = cli('next');
	check('old unbound rounds need restored evidence or explicit discard, never automatic reap', unbound.stdout.startsWith('wait user:') && unbound.stdout.includes('WF_FORCE_REAP=1') && !unbound.stdout.includes('done:'), `${unbound.stdout}${unbound.stderr}`);

	for (const invalid of [null, {}, { ...delivery, head: 'not-a-head' }, { ...delivery, contentSha: 'tree:bad' }, { ...delivery, url: 'https://github.com/o/r/pull/1?token=secret' }]) {
		check('malformed delivery evidence is rejected', deliveryReceiptGap(invalid) !== null);
		const bytes = JSON.stringify({ ...original, delivery: invalid });
		writeFileSync(join(dir, '.wf/state.json'), bytes);
		let refused = false;
		try { readState(dir); } catch (error) { refused = error instanceof Error && error.message.includes('delivery receipt'); }
		check('state refuses malformed receipts without overwriting them', refused && readFileSync(join(dir, '.wf/state.json'), 'utf8') === bytes);
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
