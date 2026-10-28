// Published conflict recovery (#149): real Git publication, divergent upstream, scoped repair and
// retry. Only GitHub's answers are controlled; every push goes to a disposable local bare origin.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startBranch } from '../fixture-template.ts';
import { plug, seams } from '../seams.ts';
import { readState, writeState } from '../round/state.ts';
import { addQuestion } from '../round/ask.ts';
import { captureCorrection, disposeCorrection } from '../round/corrections.ts';
import { approvalIdentity, trackerNotePath } from './content-identity.ts';
import { reconcilePublishedDelivery } from './deliver.ts';
import { acquireProcessLock } from '../process-lock.ts';
import type { GhResult } from '../seams.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-published-conflict-'));
const BRANCH = 'fix/149';
const FOLDER = 'bug-reports/bjew-1';
const PR_URL = 'https://github.com/o/r/pull/149';
const GITHUB = 'https://github.com/o/r.git';
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
ENV.GIT_CONFIG_GLOBAL = join(ROOT, 'empty-gitconfig');
ENV.GIT_CONFIG_SYSTEM = ENV.GIT_CONFIG_GLOBAL;
writeFileSync(ENV.GIT_CONFIG_GLOBAL, '');
process.env.GIT_CONFIG_GLOBAL = ENV.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_SYSTEM = ENV.GIT_CONFIG_SYSTEM;
let failures = 0;
const startedAt = Date.now();
const check = (name: string, cond: unknown, detail = '') => {
	console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${cond ? `ok   ${name}` : `FAIL ${name} — ${detail}`}`);
	if (!cond) failures++;
};
const git = (work: string, args: string[]) => spawnSync('git', ['-C', work, ...args], { env: ENV, encoding: 'utf8' });
const must = (work: string, ...args: string[]) => {
	const result = git(work, args);
	if (result.status !== 0) throw new Error(`published conflict fixture git ${args.join(' ')}: ${result.stderr}`);
	return result.stdout.trim();
};
const head = (work: string) => must(work, 'rev-parse', 'HEAD');
const approve = (work: string) => {
	const identity = approvalIdentity(work, FOLDER, trackerNotePath(FOLDER));
	writeFileSync(join(work, FOLDER, 'REVIEW.md'), `round: ${BRANCH}\nbase: dev\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\n\nverdict: approved\n`);
};
type Remote = { rows: Record<string, unknown>[]; calls: string[][]; creates: number; edits: number; merges: number; mergeOnList?: number; createMergeability?: string };
type Fixture = { work: string; origin: string; remote: string; publishedHead: string; base: string };
const remoteOf = (f: Fixture): Remote => JSON.parse(readFileSync(f.remote, 'utf8'));
const saveRemote = (f: Fixture, remote: Remote) => writeFileSync(f.remote, JSON.stringify(remote));
const rowOf = (f: Fixture, over: Record<string, unknown> = {}) => ({ url: PR_URL, state: 'OPEN', headRefOid: f.publishedHead, headRefName: BRANCH, baseRefName: 'dev', baseRefOid: f.base, isCrossRepository: false, mergeable: 'MERGEABLE', ...over });
const setRows = (f: Fixture, rows: Record<string, unknown>[]) => saveRemote(f, { ...remoteOf(f), rows });
const correctionsOf = (f: Fixture) => readState(f.work)?.corrections ?? [];

// A process per CLI invocation preserves the real process.exit refusal contract. No module mocks:
// run(['deliver']/['next'], { gh }) is the same composition seam as the installed entry.
const HARNESS = `
import { run } from ${JSON.stringify(new URL('../run.ts', import.meta.url).href)};
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = process.env.WF_CONFLICT_REMOTE;
const gh = (args, cwd) => {
 const r = JSON.parse(readFileSync(file, 'utf8'));
 r.calls.push(args);
 const currentHead = () => execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
 let stdout = '';
 if (args[0] !== 'pr') throw new Error('unexpected gh command: ' + args.join(' '));
 switch (args[1]) {
  case 'list': {
   const n = r.calls.filter((a) => a[1] === 'list').length;
   if (r.mergeOnList === n) r.rows = r.rows.map((p) => ({ ...p, state: 'MERGED' }));
   const pushed = execFileSync('git', ['-C', cwd, 'ls-remote', '--heads', 'origin', ${JSON.stringify(BRANCH)}], { encoding: 'utf8' }).trim().split(/\\s+/)[0];
   r.rows = r.rows.map((p) => p.state === 'OPEN' && pushed ? { ...p, headRefOid: pushed } : p);
   stdout = JSON.stringify(r.rows); break;
  }
  case 'create':
   r.creates++;
   r.rows = [{ url: ${JSON.stringify(PR_URL)}, state: 'OPEN', headRefOid: currentHead(), headRefName: ${JSON.stringify(BRANCH)}, baseRefName: 'dev', baseRefOid: execFileSync('git', ['-C', cwd, 'rev-parse', 'origin/dev'], { encoding: 'utf8' }).trim(), isCrossRepository: false, mergeable: r.createMergeability ?? 'MERGEABLE' }];
   stdout = ${JSON.stringify(PR_URL)}; break;
  case 'edit': r.edits++; r.rows = r.rows.map((p) => ({ ...p, headRefOid: currentHead(), mergeable: 'MERGEABLE' })); break;
  case 'merge': r.merges++; writeFileSync(file, JSON.stringify(r)); throw new Error('automatic merge is forbidden');
  default: throw new Error('unexpected gh command: ' + args.join(' '));
 }
 writeFileSync(file, JSON.stringify(r));
 return { status: 0, stdout, stderr: '' };
};
await run(JSON.parse(process.env.WF_CONFLICT_ARGS), { gh });
`;
writeFileSync(join(ROOT, 'harness.mjs'), HARNESS);
const attempt = (f: Fixture, args = ['deliver']) => {
	const result = spawnSync(process.execPath, [join(ROOT, 'harness.mjs')], { cwd: f.work, env: { ...ENV, WF_CONFLICT_REMOTE: f.remote, WF_CONFLICT_ARGS: JSON.stringify(args) }, encoding: 'utf8', timeout: 120_000 });
	if (result.error) throw result.error;
	return { code: result.status, out: result.stdout + result.stderr };
};
const answerRows = (rows: unknown[]): GhResult => ({ status: 0, stdout: JSON.stringify(rows), stderr: '' });
async function reconcile(f: Fixture, answer: () => GhResult) {
	const heldGh = seams.gh;
	const cwd = process.cwd();
	try {
		process.chdir(f.work);
		plug({ gh: (args) => {
			if (args[0] !== 'pr' || args[1] !== 'list') throw new Error(`unexpected conflict reconciliation gh ${args.join(' ')}`);
			return answer();
		} });
		return await reconcilePublishedDelivery(f.work);
	} finally { process.chdir(cwd); plug({ gh: heldGh }); }
}

// One copied Git template, with both kinds of path tracked from the common ancestor. Publishing
// each kind starts from an actual reviewed implementation commit, not a fabricated handoff.
const template = join(ROOT, 'template');
const templateWork = join(template, 'work');
mkdirSync(template, { recursive: true });
must(ROOT, 'init', '-q', '--bare', join(template, 'origin.git'));
must(ROOT, 'init', '-q', '-b', 'dev', templateWork);
must(templateWork, 'config', 'core.autocrlf', 'false');
must(templateWork, 'config', 'user.name', 'wf');
must(templateWork, 'config', 'user.email', 'wf@selfcheck');
writeFileSync(join(templateWork, 'product.txt'), 'base\n');
writeFileSync(join(templateWork, 'generated.txt'), 'base\n');
must(templateWork, 'add', '-A'); must(templateWork, 'commit', '-qm', 'common ancestor');
must(templateWork, 'remote', 'add', 'origin', GITHUB);
must(templateWork, 'config', `url.${pathToFileURL(join(template, 'origin.git')).href}.insteadOf`, GITHUB);
must(templateWork, 'push', '-q', '-u', 'origin', 'dev');
let sequence = 0;
function copyFixture(source: string): Fixture {
	const dir = join(ROOT, `case-${++sequence}`);
	cpSync(source, dir, { recursive: true });
	const work = join(dir, 'work');
	const origin = join(dir, 'origin.git');
	const config = join(work, '.git/config');
	writeFileSync(config, readFileSync(config, 'utf8').replaceAll(pathToFileURL(join(source, 'origin.git')).href, pathToFileURL(origin).href));
	return { work, origin, remote: join(dir, 'remote.json'), publishedHead: head(work), base: must(work, 'rev-parse', 'origin/dev') };
}
function makeRound(path: string, createMergeability: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' = 'MERGEABLE'): Fixture {
	const f = copyFixture(template);
	startBranch(f.work, BRANCH);
	writeFileSync(join(f.work, 'generated.txt'), 'implementation\n');
	writeFileSync(join(f.work, 'product.txt'), 'implementation\n');
	must(f.work, 'add', 'generated.txt', 'product.txt'); must(f.work, 'commit', '-qm', 'reviewed implementation');
	mkdirSync(join(f.work, FOLDER), { recursive: true });
	writeFileSync(join(f.work, FOLDER, 'TICKET.md'), '# BJEW-1 — scoped conflict repair\n\n## Intent\nKeep the implementation.\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | repair divergence | product.txt | — |\n');
	writeFileSync(join(f.work, FOLDER, 'ASSESSMENT.md'), `head: ${head(f.work)}\nVerdict: clean\n\n## Intent\n- Keep the implementation: met\n`);
	mkdirSync(join(f.work, '.wf'), { recursive: true });
	writeFileSync(join(f.work, '.wf/state.json'), JSON.stringify({ wf_version: 3, round: BRANCH, class: 'A', id: 'BJEW-1', ids: ['BJEW-1'], folder: FOLDER, base: 'dev', step: 'pr', made_by: 'kit' }));
	approve(f.work);
	saveRemote(f, { rows: [], calls: [], creates: 0, edits: 0, merges: 0, createMergeability });
	const published = attempt(f);
	const expectedExit = createMergeability === 'UNKNOWN' ? 2 : 0;
	check(`${path}: real CLI publishes exactly one PR and reports its observation`, published.code === expectedExit && remoteOf(f).creates === 1 && !!readState(f.work)?.pr_handoff, published.out);
	if (published.code !== expectedExit) throw new Error(`published conflict fixture publication failed: ${published.out}`);
	f.publishedHead = head(f.work);
	return f;
}
function upstreamConflict(f: Fixture, path: string) {
	// Advance upstream on the original base, then return to the published implementation. The failed
	// local merge independently proves divergence; abort leaves clean discovery input.
	must(f.work, 'checkout', '-q', 'dev');
	writeFileSync(join(f.work, path), 'upstream\n');
	must(f.work, 'add', path); must(f.work, 'commit', '-qm', 'upstream changes same line');
	must(f.work, 'push', '-q', 'origin', 'dev');
	f.base = head(f.work);
	must(f.work, 'checkout', '-q', BRANCH);
	const merge = git(f.work, ['merge', '--no-edit', 'origin/dev']);
	check(`${path}: real Git reports the upstream conflict`, merge.status !== 0 && must(f.work, 'diff', '--name-only', '--diff-filter=U').split('\n').includes(path), merge.stdout + merge.stderr);
	must(f.work, 'merge', '--abort');
	setRows(f, [rowOf(f, { mergeable: 'CONFLICTING' })]);
}

// The provider may already report uncertainty/conflict at creation. Exercise the post-create branch
// through real CLI publication, not only later discovery of an initially mergeable PR.
for (const mergeability of ['CONFLICTING', 'UNKNOWN'] as const) {
	const f = makeRound(`initial ${mergeability}`, mergeability);
	const current = readState(f.work);
	check(`initial ${mergeability}: handoff survives without merging`, !!current?.pr_handoff && !current?.delivery && remoteOf(f).merges === 0);
	check(`initial ${mergeability}: correction or explicit uncertainty, not false readiness`, mergeability === 'CONFLICTING'
		? current?.step === 'build' && correctionsOf(f).length === 1 && correctionsOf(f)[0].kind === 'system'
		: current?.step === 'pr' && correctionsOf(f).length === 0);
}

// Publication is identical for both paths. Copy its real result rather than paying for an identical
// publication per conflict shape; each continuation has its own Git objects, refs and bare origin.
const initial = makeRound('generated/product');
const cleanPublishedTemplate = join(initial.work, '..');
let publishedTemplate = '';
for (const path of ['generated.txt', 'product.txt']) {
	const f = copyFixture(cleanPublishedTemplate);
	upstreamConflict(f, path);
	// Save an untouched continuous publication for the narrow matrix; later repair must not alter it.
	if (path === 'generated.txt') {
		publishedTemplate = join(ROOT, 'published-template');
		cpSync(join(f.work, '..'), publishedTemplate, { recursive: true });
		const config = join(publishedTemplate, 'work/.git/config');
		writeFileSync(config, readFileSync(config, 'utf8').replaceAll(pathToFileURL(f.origin).href, pathToFileURL(join(publishedTemplate, 'origin.git')).href));
	}
	const reviewBefore = readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8');
	const discovery = attempt(f, ['next']);
	const correction = correctionsOf(f)[0];
	check(`${path}: next discovers conflict and routes scoped repair`, discovery.code === 0 && discovery.out.startsWith('work build') && correction?.kind === 'system' && readState(f.work)?.pr_repair?.url === PR_URL, discovery.out);
	check(`${path}: durable correction binds exact PR/head/base and preserves approval history`, !!correction && [PR_URL, f.publishedHead, f.base, 'dev'].every((part) => correction.source.includes(part)) && /regenerat/i.test(correction.text) && /assess|independent/i.test(correction.text) && /approv/i.test(correction.text) && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === reviewBefore, JSON.stringify(correction));
	if (!correction) continue;
	const once = JSON.stringify(correctionsOf(f));
	await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]));
	check(`${path}: repeat observation keeps one exact correction`, JSON.stringify(correctionsOf(f)) === once, JSON.stringify(correctionsOf(f)));
	// Explicit disposition cannot make a still-conflicting PR merge-ready.
	const disposition = disposeCorrection(f.work, correction.id, { kind: 'addressed', note: 'Testing persistent conflict refusal; no publication authority.' });
	const addressed = JSON.stringify(correctionsOf(f));
	writeState(f.work, () => ({ step: 'pr' }));
	const persistent = attempt(f);
	check(`${path}: addressed source stays addressed and live conflict refuses delivery`, disposition.kind === 'recorded' && persistent.code !== 0 && /conflict/i.test(persistent.out) && JSON.stringify(correctionsOf(f)) === addressed && remoteOf(f).edits === 0, persistent.out);
	// Generated content gets the same approval fence; core never chooses the resolution.
	git(f.work, ['merge', '--no-edit', 'origin/dev']);
	writeFileSync(join(f.work, path), 'implementation with upstream\n');
	must(f.work, 'add', path); must(f.work, 'commit', '-qm', 'scoped base integration and repair');
	// GitHub may still be computing mergeability for old H1 when repaired local H2 is ready. This
	// uncertainty cannot authorize H1's merge, but must not prevent a freshly approved replacement.
	setRows(f, [rowOf(f, { mergeable: path === 'product.txt' ? 'UNKNOWN' : 'MERGEABLE' })]);
	writeState(f.work, () => ({ step: 'pr' }));
	const stale = attempt(f);
	check(`${path}: old T2 cannot publish changed subject/base integration`, stale.code !== 0 && /approv/i.test(stale.out) && remoteOf(f).edits === 0 && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === reviewBefore, stale.out);
	// These fixture records stand in for the independently-owned assessment/human gates. This tests
	// delivery's binding, not an actual independent reviewer or human approval interaction.
	writeFileSync(join(f.work, FOLDER, 'ASSESSMENT.md'), `head: ${head(f.work)}\nVerdict: clean\n\n## Intent\n- Keep the implementation: met after scoped repair\n`);
	approve(f.work);
	const beforeRepair = remoteOf(f).rows[0];
	const repaired = attempt(f);
	if (path === 'product.txt') {
		check('old H1 UNKNOWN does not block freshly approved local H2 replacement', beforeRepair.headRefOid === f.publishedHead && beforeRepair.mergeable === 'UNKNOWN' && head(f.work) !== f.publishedHead && repaired.code === 0 && /unknown/i.test(repaired.out) && /scoped repair\/replacement/i.test(repaired.out) && remoteOf(f).edits === 1 && readState(f.work)?.pr_handoff?.head === head(f.work), repaired.out);
	}
	const retried = path === 'generated.txt' ? attempt(f) : repaired;
	const remote = remoteOf(f);
	check(`${path}: fresh binding publishes repair on same PR and retry is idempotent`, repaired.code === 0 && retried.code === 0 && remote.creates === 1 && remote.edits >= 1 && readState(f.work)?.pr_handoff?.url === PR_URL && readState(f.work)?.pr_handoff?.head === head(f.work), repaired.out + retried.out);
	check(`${path}: no automatic merge or confirmed delivery`, remote.merges === 0 && !readState(f.work)?.delivery && must(f.work, 'ls-remote', 'origin', `refs/heads/${BRANCH}`).startsWith(head(f.work)), JSON.stringify(remote));
}

// Each scenario copies a real published/conflicting Git repository plus its private bare origin.
// The uncertainty table reuses one fixture because refusal must preserve every authoritative byte.
{
	const f = copyFixture(publishedTemplate);
	const variants: Array<[string, Record<string, unknown>]> = [
		['UNKNOWN', { mergeable: 'UNKNOWN' }],
		['missing mergeability', { mergeable: undefined }],
		['malformed mergeability', { mergeable: true }],
		['missing base commit', { baseRefOid: undefined }],
		['short base commit', { baseRefOid: 'abc123' }],
	];
	for (const [name, over] of variants) {
		const before = JSON.stringify(readState(f.work));
		const result = await reconcile(f, () => answerRows([rowOf(f, over)]));
		check(`${name}: explicit retry/refusal preserves candidate and instructions`, result.kind === 'refused' && /retry|unknown|mergeab/i.test(result.why) && JSON.stringify(readState(f.work)) === before, JSON.stringify(result));
	}
	setRows(f, [rowOf(f, { mergeable: 'UNKNOWN' })]);
	const next = attempt(f, ['next']);
	check('next UNKNOWN never claims human merge readiness or fabricates conflict', /retry|unknown|mergeab/i.test(next.out) && !/remains open for human merge/.test(next.out) && correctionsOf(f).length === 0, next.out);
}
{
	const f = copyFixture(publishedTemplate);
	const first = await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]));
	const original = correctionsOf(f)[0];
	if (original) disposeCorrection(f.work, original.id, { kind: 'addressed', note: 'First observed base integration addressed.' });
	const secondBase = 'd'.repeat(40);
	const changed = await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING', baseRefOid: secondBase })]));
	const corrections = correctionsOf(f);
	check('changed base identity creates distinct correction without reopening addressed source', first.kind === 'open' && changed.kind === 'open' && corrections.length === 2 && corrections[0].outcome.kind === 'addressed' && corrections[1].outcome.kind === 'pending' && corrections[1].source.includes(secondBase), JSON.stringify(corrections));
}

// A distinct authored instruction can still repair an exact OPEN candidate after the original
// conflict was addressed. Redelivery must not reopen that original source or fence the new work.
{
	const f = copyFixture(publishedTemplate);
	await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]));
	const original = correctionsOf(f)[0];
	if (!original) throw new Error('published conflict fixture missing original correction');
	disposeCorrection(f.work, original.id, { kind: 'addressed', note: 'Original disposition remains history.' });
	captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:149-new-after-addressed', relay: 'selfcheck', scope: 'published candidate', reason: 'separate authored repair', text: 'Repair the remaining conflict with this new direction.' });
	const result = await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]));
	const corrections = correctionsOf(f);
	check('addressed conflict does not block a separate authored repair or reopen its source', result.kind === 'open' && corrections.length === 2 && corrections[0].outcome.kind === 'addressed' && corrections[1].kind === 'human' && corrections[1].outcome.kind === 'pending' && readState(f.work)?.step === 'build', JSON.stringify(result));
}

for (const hold of ['held', 'question', 'pending instruction']) {
	const f = copyFixture(publishedTemplate);
	if (hold === 'held') writeState(f.work, () => ({ step: 'held' }));
	if (hold === 'question') writeState(f.work, (state) => addQuestion(state, { to: 'user', text: 'Keep this question open.', source: 'test:149-question' }));
	if (hold === 'pending instruction') captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:149-pending', relay: 'selfcheck', scope: 'round', reason: 'retain instruction', text: 'Keep this instruction verbatim.' });
	const before = readState(f.work);
	const calls = remoteOf(f).calls.length;
	const next = attempt(f, ['next']);
	const after = readState(f.work);
	if (hold === 'pending instruction') {
		check('pending instruction: refresh retains exact original words and source without publication', JSON.stringify(after?.corrections?.[0]) === JSON.stringify(before?.corrections?.[0]) && remoteOf(f).creates === 1 && remoteOf(f).edits === 0 && !after?.delivery, next.out);
	} else {
		check(`${hold}: next preserves hold/question without remote refresh`, remoteOf(f).calls.length === calls && JSON.stringify(after?.corrections) === JSON.stringify(before?.corrections) && JSON.stringify(after?.questions) === JSON.stringify(before?.questions) && after?.step === before?.step && !next.out.startsWith('work build'), next.out);
	}
}

// Reconciliation queries outside state.json's lock. Actual writes at the gh boundary must invalidate
// the observation rather than allow stale evidence to manufacture repair authority.
const races: Array<[string, (f: Fixture) => void]> = [
	['instruction', (f) => { captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:149-race', relay: 'selfcheck', scope: 'round', reason: 'concurrent instruction', text: 'Concurrent instruction must survive.' }); }],
	['index', (f) => { writeFileSync(join(f.work, 'product.txt'), 'staged during lookup\n'); must(f.work, 'add', 'product.txt'); }],
	['hold', (f) => { writeState(f.work, () => ({ step: 'held' })); }],
];
for (const [name, change] of races) {
	const f = copyFixture(publishedTemplate);
	const result = await reconcile(f, () => { change(f); return answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]); });
	check(`${name} during lookup: stale conflict authorizes no repair`, result.kind === 'refused' && !readState(f.work)?.pr_repair && !correctionsOf(f).some((c) => c.kind === 'system'), JSON.stringify(result));
}
{
	const f = copyFixture(publishedTemplate);
	const lock = acquireProcessLock(must(f.work, 'rev-parse', '--path-format=absolute', '--git-path', 'wf-deliver.lock'));
	if (lock.kind !== 'acquired') throw new Error(`published conflict fixture lock: ${JSON.stringify(lock)}`);
	try {
		const calls = remoteOf(f).calls.length;
		const next = attempt(f, ['next']);
		check('next shares delivery process exclusion and cannot mistake busy delivery for idle PR', remoteOf(f).calls.length === calls && correctionsOf(f).length === 0 && /lock|another|running|busy|progress/i.test(next.out) && !/remains open for human merge/.test(next.out), next.out);
	} finally { lock.release(); }
}

// A human merge wins even if GitHub has not refreshed mergeability. Recover the published identity
// before considering repairs, then keep subsequent words on the fresh-follow-up route.
{
	const f = copyFixture(publishedTemplate);
	captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:149-human-merge', relay: 'selfcheck', scope: 'round', reason: 'late instruction', text: 'Retain these exact follow-up words.' });
	const opened = await reconcile(f, () => answerRows([rowOf(f, { mergeable: 'CONFLICTING' })]));
	check('merge race: first OPEN observation releases scoped repair', opened.kind === 'open', JSON.stringify(opened));
	writeFileSync(join(f.work, 'product.txt'), 'later local repair not included in human merge\n');
	must(f.work, 'add', 'product.txt'); must(f.work, 'commit', '-qm', 'later local repair');
	setRows(f, [rowOf(f, { mergeable: 'UNKNOWN', baseRefOid: undefined })]);
	const beforeMerge = remoteOf(f);
	saveRemote(f, { ...beforeMerge, mergeOnList: beforeMerge.calls.filter((args) => args[1] === 'list').length + 1 });
	const merged = attempt(f);
	const next = attempt(f, ['next']);
	check('human merge recovery precedes conflict metadata and retains follow-up instruction', merged.code === 0 && readState(f.work)?.delivery?.head === f.publishedHead && readState(f.work)?.step === 'merged' && next.out.startsWith('follow-up:') && next.out.includes('Retain these exact follow-up words.'), merged.out + next.out);
	check('merge recovery never republishes or merges automatically', remoteOf(f).creates === 1 && remoteOf(f).edits === 0 && remoteOf(f).merges === 0, JSON.stringify(remoteOf(f)));
}

if (failures) console.error(`published conflict fixtures retained for diagnosis: ${ROOT}`);
else rmSync(ROOT, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall published conflict arms green');
process.exit(failures ? 1 : 0);
