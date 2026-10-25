// deliver-recovery.selfcheck.ts — node deliver-recovery.selfcheck.ts → exit 0 when green.
// The interruption boundaries around `wf deliver`'s remote half (issue 108), through the real CLI
// dispatcher in a temporary repository with a local bare origin and a fake `gh` plugged as the remote
// adapter (`run(['deliver'], { gh })`, seams.ts). No production remote: the fake records the PRs it
// was asked to create, edit and merge, so a retry that duplicates work is visible in its records, and
// the bare origin shows a branch a retry pushed back. Nothing here contacts GitHub or a tracker.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackerNote } from '../project.ts';
import { captureCorrection, disposeCorrection } from '../round/corrections.ts';
import { WF_ROOT } from '../paths.ts';
import { seams, plug } from '../seams.ts';
import { approvalIdentity, headContentSha, trackerNotePath } from './content-identity.ts';
import { publishedDeliveryVerdict, reconcilePublishedDelivery } from './deliver.ts';
import { writeState } from '../round/state.ts';
import type { GhResult } from '../seams.ts';
import type { PrLookup } from './deliver.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-deliver-recovery-'));
const BRANCH = 'fix/108';
const FOLDER = 'bug-reports/bjew-1';
const NOTE = `${FOLDER}/JIRA.md`;
const PR_URL = 'https://github.com/o/r/pull/108';
// origin's identity (issue 108): deliver reads the configured remote url as the repository to pin
// gh to, so the fixture's origin must look like GitHub's while git's transport goes to the local bare
// repo (url.<local>.insteadOf). `git config --get remote.origin.url` stays the GitHub url.
const GITHUB = 'https://github.com/o/r.git';
const GITHUB_FORK = 'https://github.com/o/r-fork.git';
const GITHUB_OTHER = 'https://github.com/o/r-other.git';
// Git runs a hook with GIT_DIR absolute and it would point every command here at the invoked clone;
// selfcheck.ts strips GIT_* already, this keeps a by-hand run honest too. A2A/T3 credentials are
// stripped for the same reason (#190): a fixture is not the thread's workspace, so the live session
// identity must not reach a disposable round's CLI.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && !k.startsWith('T3_') && !k.startsWith('T3CODE_')));
ENV.GIT_CONFIG_GLOBAL = join(ROOT, 'empty-gitconfig');
ENV.GIT_CONFIG_SYSTEM = join(ROOT, 'empty-gitconfig');
writeFileSync(ENV.GIT_CONFIG_GLOBAL, '');
// The identity a fixture records is computed in this process too, so its git must see the same empty
// global/system config the harness child does.
process.env.GIT_CONFIG_GLOBAL = ENV.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_SYSTEM = ENV.GIT_CONFIG_SYSTEM;

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const git = (args: string[], cwd: string) => spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
const must = (args: string[], cwd: string) => {
	const r = git(args, cwd);
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
	return (r.stdout ?? '').trim();
};
const remoteBranches = (work: string) => must(['ls-remote', '--heads', 'origin'], work).split('\n').map((l) => l.split('refs/heads/')[1]).filter(Boolean);
const headsOf = (remote: string, work: string) => must(['ls-remote', '--heads', remote], work).split('\n').map((l) => l.split('refs/heads/')[1]).filter(Boolean);

// The harness the temporary repository runs: the real dispatcher with a fake gh over a JSON file. It
// models the remote across invocations so a retry meets the same PR a first run left, and it answers
// the metadata the real query asks for (head, base, cross-repository) so deliver's checks run for real.
const HARNESS = `
import { run } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../run.ts', import.meta.url))).href)};
import { captureCorrection } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../round/corrections.ts', import.meta.url))).href)};
import { writeState } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../round/state.ts', import.meta.url))).href)};
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const remoteFile = process.env.WF_TEST_REMOTE;
const mode = process.env.WF_TEST_GH_MODE || 'ok';
const branch = process.env.WF_TEST_BRANCH;
const readRemote = () => (existsSync(remoteFile) ? JSON.parse(readFileSync(remoteFile, 'utf8')) : { prs: {}, create: 0, edit: 0, merge: 0, edits: [] });
const writeRemote = (r) => writeFileSync(remoteFile, JSON.stringify(r, null, 2));
const head = (cwd) => execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const row = (state, oid) => ({ number: 108, url: 'https://github.com/o/r/pull/108', state, headRefOid: oid, headRefName: branch, baseRefName: 'dev', isCrossRepository: false });

// GitHub moves an open PR's head when its branch is pushed; a merged PR's head is fixed. The
// stale-open and crash-edit modes hold an OPEN PR at its stored head, to model a PR the branch has
// outrun — crash-edit then records the push itself and dies inside gh pr edit (#190).
const storedHead = (p) => p.state !== 'OPEN' || mode === 'stale-open' || mode === 'crash-edit';
const effectiveHead = (p, cwd) => (storedHead(p) ? p.headRefOid : head(cwd));
const correct = (cwd, event) => {
  const result = captureCorrection(cwd, { kind: 'human', author: 'Shay', source: 'test:' + event, relay: 'test delivery adapter', text: 'Keep this late instruction verbatim.', scope: 'the round', reason: 'Explicit post-approval correction' });
  if (result.kind === 'refused') throw new Error(result.reason);
};
const gh = (args, cwd) => {
  if (mode === 'no-remote') throw new Error('receipt recovery attempted a remote request');
  if (mode === 'fail') return { status: 1, stdout: '', stderr: 'error connecting to api.github.com' };
  if (mode === 'garbage') return { status: 0, stdout: 'not json', stderr: '' };
  if (mode === 'junk-list') return { status: 0, stdout: '[{}]', stderr: '' };
  const r = readRemote();
  if (args[0] === 'pr' && args[1] === 'list') {
    r.lists = (r.lists ?? []).concat([args]);
    if (mode === 'correct-before-merge' && r.lists.length === 2) correct(cwd, mode);
    if (mode === 'correct-unknown-merge' && r.uncertain) return { status: 1, stdout: '', stderr: 'connection lost' };
    if (mode === 'race-correction') correct(cwd, mode);
    if (mode === 'race-subject') writeFileSync('README.md', 'changed during lookup\\n');
    if (mode === 'race-candidate') writeState(cwd, (s) => ({ pr_handoff: { ...s.pr_handoff, url: 'https://github.com/o/r/pull/999' } }));
    if (mode === 'race-hold') writeState(cwd, () => ({ step: 'held' }));
    if (mode === 'race-index') { writeFileSync('INDEX.md', 'staged during lookup\\n'); execFileSync('git', ['add', 'INDEX.md'], { cwd }); }
    writeRemote(r);
    return { status: 0, stdout: JSON.stringify((r.prs[branch] ?? []).map((p) => ({ ...p, headRefOid: effectiveHead(p, cwd) }))), stderr: '' };
  }
  if (args[0] === 'pr' && args[1] === 'create') {
    r.create++;
    r.bodies = (r.bodies ?? []).concat([readFileSync(args[args.indexOf('--body-file') + 1], 'utf8')]);
    if (mode === 'correct-create') correct(cwd, mode);
    r.creates = (r.creates ?? []).concat([args]);
    if ((r.prs[branch] ?? []).length) { writeRemote(r); return { status: 1, stdout: '', stderr: 'a pull request for branch already exists' }; }
    // A create that also changes the product (a hook, or a concurrent task): deliver's approval
    // recheck after the PR roundtrip must catch it before the merge (#106/#108).
    if (mode === 'mutate-create') writeFileSync('CHANGED.md', 'gh mutated the product\\n');
    r.prs[branch] = [row('OPEN', head(cwd))];
    writeRemote(r);
    return { status: 0, stdout: 'https://github.com/o/r/pull/108\\n', stderr: '' };
  }
  if (args[0] === 'pr' && args[1] === 'edit') {
    // The push that precedes this edit has already moved the branch; the handoff write never lands.
    if (mode === 'crash-edit') { const landed = Object.values(r.prs).flat().find((p) => p.url === args[2]); if (landed) landed.headRefOid = head(cwd); r.edit++; r.edits = (r.edits ?? []).concat([args]); writeRemote(r); process.exit(137); }
    r.bodies = (r.bodies ?? []).concat([readFileSync(args[args.indexOf('--body-file') + 1], 'utf8')]);
    if (mode === 'correct-edit') correct(cwd, mode);
    r.edit++; r.edits = (r.edits ?? []).concat([args]);
    // An edit that commits a new HEAD: the merge must be refused because the approved commit is no
    // longer the one the merge would land.
    if (mode === 'commit-edit') { writeFileSync('README.md', 'gh mutated on edit\\n'); execFileSync('git', ['-C', cwd, 'add', '-A']); execFileSync('git', ['-C', cwd, 'commit', '-qm', 'gh mutated on edit']); }
    writeRemote(r); return { status: 0, stdout: '', stderr: '' };
  }
  if (args[0] === 'pr' && args[1] === 'merge') {
    r.merges = (r.merges ?? []).concat([args]);
    if (mode.startsWith('correct-') && mode.endsWith('-merge')) correct(cwd, mode);
    if (mode === 'correct-open-merge' || mode === 'correct-unknown-merge') {
      r.uncertain = mode === 'correct-unknown-merge'; writeRemote(r);
      return { status: 1, stdout: '', stderr: 'merge request interrupted' };
    }
    const pr = Object.values(r.prs).flat().find((p) => p.url === args[2]);
    if (!pr) { writeRemote(r); return { status: 1, stdout: '', stderr: 'no pull request found' }; }
    const i = args.indexOf('--match-head-commit');
    const want = i >= 0 ? args[i + 1] : null;
    const landed = effectiveHead(pr, cwd);
    if (want && want !== landed) { writeRemote(r); return { status: 1, stdout: '', stderr: 'head commit does not match' }; }
    if (pr.state === 'MERGED') { writeRemote(r); return { status: 1, stdout: '', stderr: 'Pull request is already merged' }; }
    r.merge++;
    pr.state = 'MERGED';
    pr.headRefOid = landed;
    writeRemote(r);
    // The remote merge happened; the process dies before the note and the step are written. This is
    // the interruption itself, not a hand-set state (issue 108).
    if (mode === 'crash-merge') process.exit(137);
    return { status: 0, stdout: '', stderr: '' };
  }
  return { status: 1, stdout: '', stderr: 'fake gh: unhandled ' + args.join(' ') };
};

process.env.WF_TEST_DELIVER_PID = String(process.pid);
await run(JSON.parse(process.env.WF_TEST_ARGS || '["deliver"]'), { gh });
`;
writeFileSync(join(ROOT, 'harness.mjs'), HARNESS);

type RemotePr = { number: number; url: string; state: string; headRefOid: string | null; headRefName: string; baseRefName: string; isCrossRepository: boolean };
type Remote = { prs: Record<string, RemotePr[]>; create: number; edit: number; merge: number; lists?: string[][]; creates?: string[][]; edits?: string[][]; merges?: string[][]; bodies?: string[] };

const UI_EVIDENCE = '## UI evidence\n\n### The changed view — 1280px, LTR\n\n| Before | After |\n|---|---|\n| ![Before](https://example.com/before.png) | ![After](https://example.com/after.png) |\n';
const TICKET = ['# BJEW-1 — the thing', '## Intent', '', '- the thing', '', '## Verification', '| # | case | files | check |', '|---|---|---|---|', '| 1 | fix(x): y | a.ts | — |', '', UI_EVIDENCE].join('\n');
const ASSESSMENT = ['# BJEW-1 — assessment', 'Verdict: clean', '', '## Intent', '- the thing: met: a.ts:1 \u00b7 before: broken \u00b7 after: fixed'].join('\n');

// A temporary repository with a local bare origin, on the round's branch, its folder and its state at
// step pr with T2 approved: exactly where `wf deliver` runs. `opts.base` is what .wf/state.json pins
// (default `dev`); `opts.dropOriginDev` removes origin/dev, so the project's base branch does not
// resolve while the round's own base still does (a round started with `wf new --base main`).
function makeRepo(name: string, opts: { base?: string; dropOriginDev?: boolean } = {}) {
	const base = opts.base ?? 'dev';
	const root = join(ROOT, name);
	const origin = join(root, 'origin.git');
	const work = join(root, 'work');
	mkdirSync(root, { recursive: true });
	must(['init', '-q', '--bare', origin], root);
	must(['init', '-q', '-b', 'dev', work], root);
	must(['config', 'core.autocrlf', 'false'], work);
	must(['config', 'user.name', 'wf'], work);
	must(['config', 'user.email', 'wf@selfcheck'], work);
	writeFileSync(join(work, 'README.md'), 'base\n');
	must(['add', '-A'], work);
	must(['commit', '-qm', 'base'], work);
	// The round's own base must resolve locally when it is a local branch (main), before origin/dev is
	// dropped: origin/dev is the project's base branch, not the round's base.
	if (base === 'main') must(['branch', 'main'], work);
	// origin's identity is a GitHub url; git's transport is redirected to the local bare repo, so no
	// test touches GitHub. `git config --get remote.origin.url` still answers the GitHub url.
	must(['remote', 'add', 'origin', GITHUB], work);
	must(['config', `url.${pathToFileURL(origin).href}.insteadOf`, GITHUB], work);
	must(['push', '-q', '-u', 'origin', 'dev'], work);
	if (opts.dropOriginDev) must(['update-ref', '-d', 'refs/remotes/origin/dev'], work);
	must(['checkout', '-qb', BRANCH], work);
	mkdirSync(join(work, FOLDER), { recursive: true });
	writeFileSync(join(work, FOLDER, 'TICKET.md'), TICKET);
	writeFileSync(join(work, FOLDER, 'ASSESSMENT.md'), `head: ${must(['rev-parse', 'HEAD'], work)}\n${ASSESSMENT}`);
	mkdirSync(join(work, '.wf'), { recursive: true });
	const state = { wf_version: 3, round: BRANCH, class: 'A', id: 'BJEW-1', ids: ['BJEW-1'], folder: FOLDER, base, step: 'pr', made_by: 'kit' };
	writeFileSync(join(work, '.wf', 'state.json'), JSON.stringify(state, null, 2) + '\n');
	// The approval REVIEW.md must record (#106): the worktree and HEAD identities as they are at T2, so
	// deliver's approval recheck runs against a real binding rather than refusing an unbound verdict.
	const identity = approvalIdentity(work, FOLDER, trackerNotePath(FOLDER));
	writeFileSync(join(work, FOLDER, 'REVIEW.md'), `round: ${BRANCH}\nbase: ${base}\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\n\nverdict: approved\n`);
	return { work, remote: join(root, 'remote.json'), head: must(['rev-parse', 'HEAD'], work) };
}

type Fixture = ReturnType<typeof makeRepo>;
const setState = (f: Fixture, patch: Record<string, unknown>) => {
	const file = join(f.work, '.wf', 'state.json');
	writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...patch }, null, 2) + '\n');
};
const setRemote = (f: Fixture, remote: Remote) => writeFileSync(f.remote, JSON.stringify(remote, null, 2));
const readRemote = (f: Fixture): Remote => (existsSync(f.remote) ? JSON.parse(readFileSync(f.remote, 'utf8')) : empty());
const readState = (f: Fixture): Record<string, unknown> => JSON.parse(readFileSync(join(f.work, '.wf', 'state.json'), 'utf8'));
const empty = (): Remote => ({ prs: {}, create: 0, edit: 0, merge: 0 });
const pr = (state: string, oid: string | null): RemotePr => ({ number: 108, url: PR_URL, state, headRefOid: oid, headRefName: BRANCH, baseRefName: 'dev', isCrossRepository: false });
const mergedAt = (head: string): Remote => ({ prs: { [BRANCH]: [pr('MERGED', head)] }, create: 1, edit: 0, merge: 1 });

// One delivery attempt through the real CLI. `mode` drives the fake gh's answer.
function attempt(f: Fixture, mode = 'ok', args = ['deliver']) {
	const r = spawnSync(process.execPath, [join(ROOT, 'harness.mjs')], { cwd: f.work, env: { ...ENV, WF_TEST_REMOTE: f.remote, WF_TEST_BRANCH: BRANCH, WF_TEST_GH_MODE: mode, WF_TEST_ARGS: JSON.stringify(args) }, encoding: 'utf8' });
	return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// #190: continuous publish -> human merge -> pre-receipt correction -> reconcile, and the remote
// answers that must keep repair fenced. One real publish is cloned per scenario: publishing costs ~90
// git children, reconciling does not, so the remote matrix and the races run in-process through the
// exported seam with wf's own `gh` seam plugged. Two scenarios still drive the real CLI end to end.
const publishedBase = (() => {
	const f = makeRepo('190-base');
	setRemote(f, empty());
	const r = attempt(f);
	check('#190 CLI publishes a real open handoff', r.code === 0 && !!readState(f).pr_handoff && !readState(f).delivery, r.out);
	if (r.code !== 0) throw new Error(`#190 base publish failed: ${r.out}`);
	return { work: f.work, remote: f.remote, head: must(['rev-parse', 'HEAD'], f.work) };
})();
let cloneSeq = 0;
function clonePublished(): Fixture {
	const name = `190-clone-${++cloneSeq}`;
	const dir = join(ROOT, name);
	// Every clone shares one bare origin, so a scenario starts from the published state, not from a
	// branch a previous scenario moved: the remote branch is dropped, as a merged delivery drops it.
	spawnSync('git', ['-C', publishedBase.work, 'push', '-q', 'origin', '--delete', BRANCH], { env: ENV, encoding: 'utf8' });
	cpSync(publishedBase.work, dir, { recursive: true });
	const clone: Fixture = { work: dir, remote: join(ROOT, `${name}.remote.json`), head: publishedBase.head };
	setRemote(clone, empty());
	return clone;
}
const handoffRow = (over: Partial<RemotePr> = {}): RemotePr => ({ number: 108, url: PR_URL, state: 'OPEN', headRefOid: publishedBase.head, headRefName: BRANCH, baseRefName: 'dev', isCrossRepository: false, ...over });
// wf's own seam: the reconciliation asks whatever gh is plugged in, so a scenario never captures it.
// Commands inside the seam resolve their round from the working directory (runStep does), so the run
// happens inside the fixture — never in this checkout, which is a round of its own.
async function withGh<T>(answer: () => GhResult, body: () => Promise<T>): Promise<T> {
	const held = seams.gh;
	const cwd = process.cwd();
	plug({ gh: (args) => (args[0] === 'pr' && args[1] === 'list' ? answer() : { status: 1, stdout: '', stderr: `unexpected gh call ${args.join(' ')}` }) });
	try { process.chdir(fixtureCwd()); return await body(); } finally { process.chdir(cwd); plug({ gh: held }); }
}
let fixtureDirectory = process.cwd();
const fixtureCwd = () => fixtureDirectory;
/** Run an in-process seam call with the fixture as the working directory it resolves its round from. */
async function inFixture<T>(f: Fixture, body: () => Promise<T>): Promise<T> {
	const held = fixtureDirectory;
	fixtureDirectory = f.work;
	try { return await body(); } finally { fixtureDirectory = held; }
}
const rowsAnswer = (rows: unknown[]): GhResult => ({ status: 0, stdout: JSON.stringify(rows), stderr: '' });
const lateInstruction = (source = 'test:190') => ['correct', '--source', source, '--author', 'Shay', '--relay', 'selfcheck', '--scope', 'round', '--reason', 'late feedback', 'Keep this late instruction verbatim.'];
const pendingOf = (f: Fixture) => ((readState(f).corrections ?? []) as Array<{ id: string; outcome: { kind: string } }>).filter((c) => c.outcome.kind === 'pending').map((c) => c.id);

// The remote's answer as a decision: pure, so every variant is one table row and no fixture.
{
	const handoff = { url: PR_URL, head: publishedBase.head, contentSha: 'tree:' + 'c'.repeat(40) };
	const cases: Array<[string, PrLookup, string, string]> = [
		['merged at the published head', { kind: 'found', url: PR_URL, state: 'MERGED', headRefOid: publishedBase.head }, 'merged', ''],
		['open at the published head', { kind: 'found', url: PR_URL, state: 'OPEN', headRefOid: publishedBase.head }, 'open', ''],
		['merged at this round’s own later HEAD', { kind: 'found', url: PR_URL, state: 'MERGED', headRefOid: 'd'.repeat(40) }, 'merged', ''],
		['open at this round’s own later HEAD', { kind: 'found', url: PR_URL, state: 'OPEN', headRefOid: 'd'.repeat(40) }, 'superseded', ''],
		['merged at a third head', { kind: 'found', url: PR_URL, state: 'MERGED', headRefOid: 'f'.repeat(40) }, 'refused', 'neither the published head'],
		['open at a third head', { kind: 'found', url: PR_URL, state: 'OPEN', headRefOid: 'f'.repeat(40) }, 'refused', 'neither the published head'],
		['merged with no head recorded', { kind: 'found', url: PR_URL, state: 'MERGED', headRefOid: null }, 'refused', 'no commit'],
		['another PR on the branch', { kind: 'found', url: 'https://github.com/o/r/pull/999', state: 'OPEN', headRefOid: publishedBase.head }, 'refused', 'not the published candidate'],
		['closed', { kind: 'found', url: PR_URL, state: 'CLOSED', headRefOid: publishedBase.head }, 'refused', 'not open or merged'],
		['the known candidate absent', { kind: 'none' }, 'refused', 'was not found'],
		['gh failed', { kind: 'unknown', why: 'gh pr list exited 1' }, 'refused', 'could not be asked'],
	];
	for (const [name, lookup, kind, why] of cases) {
		const verdict = publishedDeliveryVerdict(lookup, handoff, 'd'.repeat(40));
		check(`#190 verdict: ${name} → ${kind}`, verdict.kind === kind && (why === '' || ('why' in verdict && verdict.why.includes(why))), JSON.stringify(verdict));
	}
}

// Intake is durable and local; only reconciliation can release repair, and it never guesses.
{
	const f = clonePublished();
	const captured = attempt(f, 'no-remote', lateInstruction());
	const bytes = readFileSync(join(f.work, '.wf/state.json'), 'utf8');
	check('#190 admits without remote work and does not route published work to build', captured.code === 0 && readState(f).step === 'pr' && bytes.includes('Keep this late instruction verbatim.'), captured.out);
	const duplicate = attempt(f, 'no-remote', lateInstruction());
	check('#190 duplicate intake keeps exact durable identity and bytes', duplicate.code === 0 && duplicate.out.includes('duplicate') && readFileSync(join(f.work, '.wf/state.json'), 'utf8') === bytes, duplicate.out);
	for (const args of [['next'], ['brief', 'build'], ['step', 'build'], ['correct', '--address', (JSON.parse(bytes).corrections[0].id), '--note', 'not yet reconciled']]) {
		const r = attempt(f, 'no-remote', args);
		check('#190 fences repair/disposition before reconciliation: ' + args.slice(0, 2).join(' '), !r.out.startsWith('work build') && r.out.includes('reconcil'), r.out);
	}
}

// The remote answers that cannot settle the candidate leave every durable fact where it was.
{
	const variants: Array<[string, () => GhResult]> = [
		['gh failed', () => ({ status: 1, stdout: '', stderr: 'error connecting to api.github.com' })],
		['not JSON', () => ({ status: 0, stdout: 'not json', stderr: '' })],
		['unreadable row', () => rowsAnswer([{}])],
		['the candidate absent', () => rowsAnswer([])],
		['another head', () => rowsAnswer([handoffRow({ headRefOid: 'f'.repeat(40) })])],
		['another PR', () => rowsAnswer([handoffRow({ url: 'https://github.com/o/r/pull/999' })])],
		['two PRs', () => rowsAnswer([handoffRow(), handoffRow()])],
		['closed', () => rowsAnswer([handoffRow({ state: 'CLOSED' })])],
		['another repository', () => rowsAnswer([handoffRow({ url: 'https://github.com/other/repo/pull/108' })])],
		['another base', () => rowsAnswer([handoffRow({ baseRefName: 'wrong' })])],
	];
	// One fixture: a refusal leaves the round exactly as it found it, so the next variant starts where
	// the last one did. A variant that changed anything would have to earn its own clone.
	const f = clonePublished();
	attempt(f, 'no-remote', lateInstruction());
	for (const [name, answer] of variants) {
		const before = { handoff: JSON.stringify(readState(f).pr_handoff), corrections: JSON.stringify(readState(f).corrections) };
		const result = await inFixture(f, () => withGh(answer, () => reconcilePublishedDelivery(f.work)));
		const after = readState(f);
		check(`#190 ${name}: reconciliation refuses and retains candidate, instruction and no repair authority`,
			result.kind === 'refused' && after.pr_repair == null && after.delivery == null && JSON.stringify(after.pr_handoff) === before.handoff && JSON.stringify(after.corrections) === before.corrections,
			JSON.stringify(result));
	}
	check('#190 no refusal released repair: wf next still asks for reconciliation', attempt(f, 'no-remote', ['next']).out.startsWith('deliver:'), '');
}

// The two answers that do settle it: a merge recovers the published delivery, an open candidate
// permits ordinary scoped repair under the existing approval rules.
{
	const f = clonePublished();
	attempt(f, 'no-remote', lateInstruction());
	const merged = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow({ state: 'MERGED' })]), () => reconcilePublishedDelivery(f.work)));
	const next = attempt(f, 'no-remote', ['next']);
	check('#190 merge recovers the published delivery and routes the retained words to a fresh follow-up',
		merged.kind === 'finished' && readState(f).step === 'merged' && JSON.stringify(readState(f).delivery).includes(publishedBase.head) && next.out.startsWith('follow-up:') && next.out.includes('Keep this late instruction verbatim.'),
		JSON.stringify(merged) + ' STEP ' + String(readState(f).step) + ' ' + next.out);
	check('#190 recovery republishes nothing', readRemote(f).create === 0 && readRemote(f).edit === 0, JSON.stringify(readRemote(f)));
	const post = attempt(f, 'no-remote', lateInstruction('test:190-after-receipt'));
	check('#190 post-receipt correction stays a fresh follow-up', post.code === 0 && readState(f).step === 'merged' && attempt(f, 'no-remote', ['next']).out.startsWith('follow-up:'), post.out);
}
{
	const f = clonePublished();
	attempt(f, 'no-remote', lateInstruction());
	const open = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow()]), () => reconcilePublishedDelivery(f.work)));
	check('#190 a matching OPEN candidate permits ordinary scoped repair', open.kind === 'open' && readState(f).step === 'build' && JSON.stringify(readState(f).pr_repair).includes(publishedBase.head) && attempt(f, 'no-remote', ['next']).out.startsWith('work build'), JSON.stringify(open));
	// OPEN is an observation, not a lease: a later instruction rides the confirmed candidate.
	const idsBefore = pendingOf(f);
	const later = attempt(f, 'no-remote', lateInstruction('test:190-open-later'));
	const laterId = pendingOf(f).find((id) => !idsBefore.includes(id));
	const routed = JSON.stringify(readState(f).build_reason).includes(laterId ?? 'no-id');
	check('#190 a correction after confirmed OPEN routes to ordinary build without another lookup', later.code === 0 && readState(f).step === 'build' && routed, later.out + JSON.stringify(readState(f).build_reason));
	writeFileSync(join(f.work, 'README.md'), 'scoped repair\n');
	let addressed = true;
	const ids = pendingOf(f);
	for (const id of ids) addressed = attempt(f, 'no-remote', ['correct', '--address', id, '--note', 'measured scoped repair']).code === 0 && addressed;
	check('#190 disposition after OPEN keeps the instruction history and stays in ordinary repair', addressed && ids.length === 2 && JSON.stringify(readState(f).corrections).includes('measured scoped repair'), JSON.stringify(readState(f).corrections));
	setRemote(f, { ...empty(), create: 1, prs: { [BRANCH]: [handoffRow()] } });
	const staleApproval = attempt(f, 'stale-open');
	check('#190 a changed reviewed subject still needs fresh approval', staleApproval.code === 2 && readRemote(f).edit === 0 && /approved/.test(staleApproval.out), staleApproval.out);
	must(['add', 'README.md'], f.work); must(['commit', '-qm', 'later local repair'], f.work);
	const merged = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow({ state: 'MERGED' })]), () => reconcilePublishedDelivery(f.work)));
	check('#190 a later human merge recovers the published head, never the changed local HEAD',
		merged.kind === 'finished' && JSON.stringify(readState(f).delivery).includes(publishedBase.head) && (readState(f).delivery as { head: string }).head !== must(['rev-parse', 'HEAD'], f.work) && readRemote(f).edit === 0,
		JSON.stringify(merged));
}

// A lookup is not a lease: anything that changes the round, the instructions or the subject while gh
// is being asked makes the answer stale, and a stale answer authorizes nothing.
{
	type Race = [string, (f: Fixture) => void];
	const races: Race[] = [
		['a new instruction', (f) => { const r = captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:race', relay: 'selfcheck', text: 'Admitted during the lookup.', scope: 'round', reason: 'concurrent intake' }); if (r.kind === 'refused') throw new Error(r.reason); }],
		['an uncommitted product edit', (f) => writeFileSync(join(f.work, 'README.md'), 'changed during lookup\n')],
		['a staged product edit', (f) => { writeFileSync(join(f.work, 'INDEX.md'), 'staged during lookup\n'); must(['add', 'INDEX.md'], f.work); }],
		['a moved candidate', (f) => writeState(f.work, (s) => ({ pr_handoff: { ...s.pr_handoff!, url: 'https://github.com/o/r/pull/999' } }))],
		['a held round', (f) => writeState(f.work, () => ({ step: 'held' }))],
	];
	for (const [name, change] of races) {
		const f = clonePublished();
		attempt(f, 'no-remote', lateInstruction());
		const result = await inFixture(f, () => withGh(() => { change(f); return rowsAnswer([handoffRow()]); }, () => reconcilePublishedDelivery(f.work)));
		const after = readState(f);
		check(`#190 stale lookup authorizes no repair after ${name}`,
			result.kind === 'refused' && after.pr_repair == null && after.delivery == null && !attempt(f, 'no-remote', ['next']).out.startsWith('work build'),
			JSON.stringify(result));
		if (name === 'a new instruction') check('#190 words admitted during a stale lookup survive it', JSON.stringify(readState(f).corrections).includes('Admitted during the lookup.'));
	}
}

// A push whose handoff write never lands leaves the PR carrying this round's own later head while the
// recorded handoff names the earlier one. That is stale bookkeeping, not an ambiguous remote: the head
// T2 approved is adopted, repair continues, and unreviewed bytes are never announced as awaiting merge.
// The fixture's remote is seeded OPEN at the published head so the interrupted attempt really reaches
// the push; `crash-edit` records the push and dies inside `gh pr edit` (#190 review R1/R4/R5).
{
	const f = clonePublished();
	setRemote(f, { ...empty(), create: 1, prs: { [BRANCH]: [handoffRow()] } });
	attempt(f, 'no-remote', lateInstruction());
	const open = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow()]), () => reconcilePublishedDelivery(f.work)));
	if (open.kind !== 'open') throw new Error(`#190 interrupted-push setup: ${JSON.stringify(open)}`);
	writeFileSync(join(f.work, 'README.md'), 'repair\n');
	must(['add', 'README.md'], f.work); must(['commit', '-qm', 'repair the instruction'], f.work);
	for (const id of pendingOf(f)) attempt(f, 'no-remote', ['correct', '--address', id, '--note', 'repaired in the fixture']);
	// The repaired round goes back through wf's own assess/review steps in real use; this case is about
	// the push boundary, so the fixture records only the step those steps would have reached.
	setState(f, { step: 'pr' });
	const identity = approvalIdentity(f.work, FOLDER, trackerNotePath(FOLDER));
	writeFileSync(join(f.work, FOLDER, 'REVIEW.md'), ['round: ' + BRANCH, 'base: dev', 'content-sha: ' + identity.worktree, 'head-sha: ' + identity.head, '', 'verdict: approved', ''].join(String.fromCharCode(10)));
	const interrupted = attempt(f, 'crash-edit');
	// Deliver commits the round folder before it pushes, so the pushed commit is the branch's HEAD.
	const pushedHead = must(['rev-parse', 'HEAD'], f.work);
	const onOrigin = must(['ls-remote', '--heads', 'origin'], f.work).split(String.fromCharCode(10)).some((line) => line.startsWith(pushedHead));
	check('#190 an interrupted push moves the branch while the handoff still names the earlier head',
		interrupted.code === 137 && onOrigin && pushedHead !== publishedBase.head && (readState(f).pr_handoff as { head: string }).head === publishedBase.head && !readState(f).delivery,
		`code=${interrupted.code} onOrigin=${onOrigin} pushed=${pushedHead} handoff=${(readState(f).pr_handoff as { head: string }).head} ${interrupted.out}`);
	// A later instruction needs the published outcome again; the PR carries the head T2 approved, so the
	// round repairs instead of refusing its own pushed branch.
	attempt(f, 'no-remote', lateInstruction('test:190-after-interrupt'));
	const reconciled = attempt(f);
	const next = attempt(f, 'no-remote', ['next']);
	check('#190 a new instruction after an interrupted push adopts the approved head and repairs',
		reconciled.code === 0 && (readState(f).pr_handoff as { head: string }).head === pushedHead && next.out.startsWith('work build'),
		reconciled.out + next.out);
}

// The same stale handoff over bytes T2 never saw must not be adopted: repairing is allowed, publishing
// still asks for the review (#190 review R2).
{
	const f = clonePublished();
	writeFileSync(join(f.work, 'README.md'), 'unreviewed\n');
	must(['add', 'README.md'], f.work); must(['commit', '-qm', 'unreviewed change'], f.work);
	const headNow = must(['rev-parse', 'HEAD'], f.work);
	setRemote(f, { ...empty(), create: 1, prs: { [BRANCH]: [handoffRow({ headRefOid: headNow })] } });
	const reconciled = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow({ headRefOid: headNow })]), () => reconcilePublishedDelivery(f.work)));
	check('#190 a PR at this round’s own head over unreviewed bytes is refused, not recorded',
		reconciled.kind === 'refused' && /not approved/.test(reconciled.why) && (readState(f).pr_handoff as { head: string }).head === publishedBase.head,
		JSON.stringify(reconciled));
	const refused = attempt(f);
	check('#190 unreviewed bytes are never announced as awaiting merge', refused.code === 2 && /approved/.test(refused.out) && (readState(f).pr_handoff as { head: string }).head === publishedBase.head && readRemote(f).edit === 0, refused.out);
}

// A failed refresh cannot leave the earlier OPEN answer standing: the authorization goes first, and a
// refusal writes nothing back.
{
	const f = clonePublished();
	attempt(f, 'no-remote', lateInstruction());
	const first = await inFixture(f, () => withGh(() => rowsAnswer([handoffRow()]), () => reconcilePublishedDelivery(f.work)));
	const before = JSON.stringify(readState(f).pr_repair);
	const failed = await inFixture(f, () => withGh(() => ({ status: 1, stdout: '', stderr: 'connection lost' }), () => reconcilePublishedDelivery(f.work)));
	check('#190 a failed refresh clears the earlier OPEN authorization',
		first.kind === 'open' && JSON.parse(before) !== null && failed.kind === 'refused' && readState(f).pr_repair == null && !attempt(f, 'no-remote', ['next']).out.startsWith('work build'),
		JSON.stringify(failed));
}

// End to end through the real CLI: publish, a human merge, a correction before the receipt, recovery.
{
	const f = clonePublished();
	const publishedHead = publishedBase.head;
	setRemote(f, mergedAt(publishedHead));
	check('#190 CLI retains the instruction', attempt(f, 'no-remote', lateInstruction()).code === 0);
	check('#190 CLI fences repair before reconciliation', attempt(f, 'no-remote', ['next']).out.startsWith('deliver:'));
	const recovered = attempt(f);
	const next = attempt(f, 'no-remote', ['next']);
	check('#190 CLI recovers the merged delivery and keeps the instruction for follow-up',
		recovered.code === 0 && readState(f).step === 'merged' && JSON.stringify(readState(f).delivery).includes(publishedHead) && next.out.startsWith('follow-up:') && next.out.includes('Keep this late instruction verbatim.'),
		recovered.out + next.out);
	check('#190 CLI recovery creates no second PR and merges nothing', readRemote(f).create === 1 && readRemote(f).merge === 1 && readRemote(f).edit === 0, JSON.stringify(readRemote(f)));
}

// A crash after the merge is recognized but before the receipt is written retries from that identity.
{
	const f = clonePublished();
	const publishedHead = publishedBase.head;
	check('#190 crash setup retains the instruction', attempt(f, 'no-remote', lateInstruction()).code === 0);
	setRemote(f, mergedAt(publishedHead));
	// The receipt write follows the merged-branch delete, so the published branch must be there for the
	// hook to run. This disposable hook kills its own fixture's delivery worker at that boundary.
	must(['push', '-q', '-f', 'origin', `HEAD:refs/heads/${BRANCH}`], f.work);
	const hook = join(f.work, '.git/hooks/pre-push');
	writeFileSync(hook, '#!/bin/sh\nnode -e "process.kill(Number(process.env.WF_TEST_DELIVER_PID))"\n');
	must(['update-index', '--refresh'], f.work);
	const interrupted = attempt(f);
	unlinkSync(hook);
	check('#190 a crash after recognition keeps the candidate and the instruction before the receipt', interrupted.code !== 0 && !readState(f).delivery && !!readState(f).pr_handoff && JSON.stringify(readState(f).corrections).includes('test:190'), interrupted.out);
	const retry = attempt(f);
	check('#190 the retry finishes once without republishing', retry.code === 0 && readState(f).step === 'merged' && !!readState(f).delivery && readRemote(f).create === 1 && readRemote(f).edit === 0, retry.out);
}

// ── the merge completed remotely, before the note and the step were written ──────────────────────
// This is the reported interruption: GitHub merged, the process died, and a retry must recognize the
// merge and finish the note and the step — never push the deleted branch back or merge again.
{
	const f = makeRepo('merged-before-note');
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a retry after a completed merge exits clean', r.code === 0, `${r.code}: ${r.out}`);
	check('…finishes the local step at merged', readState(f).step === 'merged', JSON.stringify(readState(f)));
	const receipt = readState(f).delivery;
	check('…records the actual remote PR, merged head and product content for follow-up detection', receipt !== null && typeof receipt === 'object' && 'url' in receipt && receipt.url === PR_URL && 'head' in receipt && receipt.head === f.head && 'contentSha' in receipt && receipt.contentSha === headContentSha(f.work, FOLDER, null, 'row'), JSON.stringify(receipt));
	check('…writes the tracker note and records it', readState(f).note === NOTE && readFileSync(join(f.work, NOTE), 'utf8').includes(`## BJEW-1`) && readFileSync(join(f.work, NOTE), 'utf8').includes(PR_URL));
	check('…does not merge a merged PR again', readRemote(f).merge === 1, JSON.stringify(readRemote(f)));
	check('…does not push the merged branch back', !remoteBranches(f.work).includes(BRANCH), remoteBranches(f.work).join(','));
	check('…does not create a second PR', readRemote(f).create === 1, JSON.stringify(readRemote(f)));
	check('…the lookup that recognized the merge was pinned to the repository', (readRemote(f).lists ?? []).some((a) => a.includes('--repo') && a.includes('o/r')), JSON.stringify(readRemote(f).lists));
	console.log(`    (stdout) ${r.out.trim().split('\n').join(' | ')}`);
}

// The same, one boundary earlier: the merge finished while the branch still existed remotely (the
// task died before the delete), so finishing it also removes the merged branch.
{
	const f = makeRepo('merged-branch-kept');
	must(['push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], f.work);
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a retry with the merged branch still there finishes', r.code === 0 && readState(f).step === 'merged' && readRemote(f).merge === 1, `${r.code}: ${r.out}`);
	check('…and deletes the merged branch it left behind', !remoteBranches(f.work).includes(BRANCH), remoteBranches(f.work).join(','));
}

// Publishing and retrying must never invoke merge, even when its adapter would crash.
{
 const f = makeRepo('open-handoff-retry');
 setRemote(f, empty());
 const first = attempt(f, 'crash-merge');
 check('delivery leaves the PR and branch open with a durable handoff', first.code === 0 && readRemote(f).merge === 0 && readState(f).step === 'pr' && !!readState(f).pr_handoff && !readState(f).delivery && remoteBranches(f.work).includes(BRANCH), first.out);
 const next = wfSync(['next'], { cwd: f.work, env: ENV });
 check('open handoff routes to tracker posting', next.stdout.startsWith('post:'), next.stdout + next.stderr);
 const second = attempt(f);
 check('retry retains one open PR without merging', second.code === 0 && readRemote(f).create === 1 && readRemote(f).merge === 0 && !!readState(f).pr_handoff, second.out);
 const bodies = readRemote(f).bodies ?? [];
 check('delivery publishes both UI images on create and retry', bodies.length === 2 && bodies.every((body) => body.includes(UI_EVIDENCE)), JSON.stringify(bodies));
 setRemote(f, mergedAt(must(['rev-parse', 'HEAD'], f.work)));
 const reconciled = attempt(f);
 check('human merge is reconciled into the existing merged lifecycle', reconciled.code === 0 && readState(f).step === 'merged' && !!readState(f).delivery, reconciled.out);
}

// ── an open PR was created but not merged: resume it, do not create a second one ──────────────────
{
	const f = makeRepo('open-pr');
	setRemote(f, { prs: { [BRANCH]: [pr('OPEN', f.head)] }, create: 0, edit: 0, merge: 0 });
	const r = attempt(f);
	const landed = must(['rev-parse', 'HEAD'], f.work);
	check('a retry with an open PR exits clean', r.code === 0, `${r.code}: ${r.out}`);
	check('…edits the existing PR, never creates a second', readRemote(f).create === 0 && readRemote(f).edit === 1, JSON.stringify(readRemote(f)));
	check('…names the selected PR url on the edit, not the current branch default', (readRemote(f).edits ?? []).some((a) => a[1] === 'edit' && a.includes(PR_URL) && a.includes('--body-file')), JSON.stringify(readRemote(f).edits));
	check('…the lookups are pinned to the repository and the handoff to the pushed head', (readRemote(f).lists ?? []).every((a) => a.includes('--repo') && a.includes('o/r')) && !!readState(f).pr_handoff && must(['rev-parse', 'HEAD'], f.work) === landed, JSON.stringify(readRemote(f)));
	check('…keeps it open and writes the note without claiming a merge', readRemote(f).merge === 0 && readState(f).step === 'pr' && readState(f).note === NOTE, JSON.stringify(readRemote(f)));
}

// The push was done and the task died before the PR existed: the retry creates exactly one.
{
	const f = makeRepo('pushed-before-pr');
	must(['push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	const landed = must(['rev-parse', 'HEAD'], f.work);
	check('a retry after push, before PR, creates exactly one PR', r.code === 0 && readRemote(f).create === 1 && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
	check('…the create is pinned to the repository and the handoff to the pushed head', (readRemote(f).creates ?? []).some((a) => a.includes('--repo') && a.includes('o/r')) && !!readState(f).pr_handoff && must(['rev-parse', 'HEAD'], f.work) === landed, JSON.stringify(readRemote(f)));
}

// A prior run got as far as deliver's own round-folder commit and died before the PR: HEAD now carries
// the approved worktree, not the reviewed HEAD. The retry must resume without asking for a fresh
// review — the approval covers the bytes HEAD carries (#106/#108).
{
	const f = makeRepo('round-folder-committed');
	must(['add', '--', FOLDER, `:(exclude)${FOLDER}/REVIEW.md`], f.work);
	must(['commit', '-qm', `docs(BJEW-1): round folder: ticket, agreement, assessment, repro`], f.work);
	must(['push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	check('a retry after the round-folder commit resumes without a fresh review', r.code === 0 && readState(f).step === 'pr' && readRemote(f).create === 1 && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
}

// ── the round's own base, not the project's base branch ───────────────────────────────────────────
// deliver's commit list is measured from the round's base (state.base), not from origin/<project
// baseBranch>. A round started with `wf new --base main` in a project whose base branch is dev has a
// resolving state.base and no origin/dev; measuring from origin/dev after the push failed and left
// the round stuck with a pushed branch and no PR (O3, 2026-10-10). The delivery uses the round's base
// and completes; a base that does not resolve refuses before the push, mutating nothing.
{
	const f = makeRepo('round-base-main', { base: 'main', dropOriginDev: true });
	setRemote(f, empty());
	const r = attempt(f);
	check('a round whose base is main (origin/dev absent) delivers', r.code === 0 && readState(f).step === 'pr' && readRemote(f).create === 1 && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
	check('…the open PR branch stays pushed', remoteBranches(f.work).includes(BRANCH), remoteBranches(f.work).join(','));
	// A worker died after signalling cleanup but before clearing ownership. Delivery is already
	// open; a fresh worker must finish that release without merging (#154).
	writeFileSync(join(f.work, '.wf', 'serve.pid'), '2000000000');
	writeFileSync(join(f.work, '.wf', 'serve-owner.json'), JSON.stringify({ token: 'interrupted-delivery', state: 'releasing', processes: [{ pid: 2000000000, parent: 1, born: '2026-10-15T10:00:00Z' }] }));
	const again = attempt(f);
	check('a fresh delivery worker confirms an interrupted cleanup and clears its ownership', !existsSync(join(f.work, '.wf', 'serve.pid')) && !existsSync(join(f.work, '.wf', 'serve-owner.json')), `${again.code}: ${again.out}`);
	check('…a retry neither creates a second PR nor merges again', again.code === 0 && readRemote(f).create === 1 && readRemote(f).merge === 0 && /remains open/.test(again.out), `${again.code}: ${again.out}`);
}
{
	const f = makeRepo('round-base-origin-dev');
	setRemote(f, empty());
	const r = attempt(f);
	check('control: a round whose base is origin/dev, with origin/dev present, delivers', r.code === 0 && readState(f).step === 'pr' && readRemote(f).create === 1 && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
}
{
	const f = makeRepo('round-base-unresolved', { base: 'no-such-base' });
	setRemote(f, empty());
	const r = attempt(f);
	check('an unresolved round base refuses before the push', r.code === 2 && readState(f).step === 'pr' && readRemote(f).create === 0 && readRemote(f).edit === 0 && readRemote(f).merge === 0 && !remoteBranches(f.work).includes(BRANCH), `${r.code}: ${r.out}; branches ${remoteBranches(f.work).join(',')}`);
	check('…the refusal is one actionable line naming the base', /^wf deliver: the round's base `no-such-base` does not resolve/m.test(r.out) && r.out.trim().split('\n').length === 1, r.out.trim());
}

// ── the PR roundtrip changed the implementation before the merge: refuse, do not merge ─────────────
// The push hook is not the only mutation boundary: the final approval recheck runs after the PR
// create/edit and lookup roundtrip, immediately before the merge, so a gh adapter (a hook, a
// concurrent task) that changes the product or HEAD is caught. An unchanged control still merges.
{
	const f = makeRepo('mutate-on-create');
	setRemote(f, empty());
	const r = attempt(f, 'mutate-create');
	check('a product change during gh pr create is refused before the merge', r.code !== 0 && readRemote(f).merge === 0 && !readState(f).note && readState(f).step === 'pr', `${r.code}: ${r.out}`);
	check('\u2026the refusal names the implementation the approval no longer covers', /changed the implementation T2 approved/.test(r.out), r.out.trim());
}
{
	const f = makeRepo('commit-on-edit');
	setRemote(f, { prs: { [BRANCH]: [pr('OPEN', f.head)] }, create: 0, edit: 0, merge: 0 });
	const r = attempt(f, 'commit-edit');
	check('a commit during gh pr edit is refused before the merge', r.code !== 0 && readRemote(f).merge === 0 && readState(f).step === 'pr', `${r.code}: ${r.out}`);
}

// ── the tracker note is written once ──────────────────────────────────────────────────────────────
{
	const f = makeRepo('note-kept');
	writeFileSync(join(f.work, NOTE), '## BJEW-1 (posted)\nתוקן ✅\n\nמה שונה: now\n');
	setState(f, { note: NOTE });
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a retry does not overwrite a filled, posted note', r.code === 0 && readFileSync(join(f.work, NOTE), 'utf8').startsWith('## BJEW-1 (posted)') && readState(f).step === 'merged', `${r.code}: ${r.out}`);
}

// A note file that exists but is not this round's (or was cut off mid-write) is refused, not wiped:
// its sections may be the only posted copy (issue 108).
{
	const f = makeRepo('wrong-round-note');
	writeFileSync(join(f.work, NOTE), '## BJEW-999\nתוקן ✅\n');
	setState(f, { note: NOTE });
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check("a note that is not this round's is refused, not overwritten", r.code !== 0 && readFileSync(join(f.work, NOTE), 'utf8').startsWith('## BJEW-999') && readState(f).step === 'pr', `${r.code}: ${r.out}`);
	check("…the refusal says the note is truncated or another round's", /truncated or another round/i.test(r.out), r.out.trim());
}
{
	const f = makeRepo('truncated-note');
	writeFileSync(join(f.work, NOTE), '<!-- wf: the note was being written when it stopped -->\n');
	setState(f, { note: NOTE });
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a truncated note (an interrupted write) is refused, not treated as complete', r.code !== 0 && readFileSync(join(f.work, NOTE), 'utf8').startsWith('<!-- wf:') && readState(f).step === 'pr', `${r.code}: ${r.out}`);
}
{
	const f = makeRepo('heading-only-note');
	writeFileSync(join(f.work, NOTE), '## BJEW-1\n');
	setState(f, { note: NOTE });
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a section heading with no body is refused, not treated as filled', r.code !== 0 && readFileSync(join(f.work, NOTE), 'utf8') === '## BJEW-1\n' && readState(f).step === 'pr', `${r.code}: ${r.out}`);
}

// A legacy note cut off by the old non-atomic write, left by a run from before notes were written
// atomically (issue 108). Deliver's own write is atomic now; a prefix of the note it would write is
// still recognized as its own and completed, so an old interrupted note is not refused forever.
{
	const f = makeRepo('legacy-partial-note');
	const expected = trackerNote({ ids: ['BJEW-1'], url: PR_URL }).text;
	const partial = expected.slice(0, expected.indexOf('\n', expected.indexOf('תוקן')) + 1);
	writeFileSync(join(f.work, NOTE), partial);
	setState(f, { note: NOTE });
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a legacy cut-off note is completed on retry, not refused forever', r.code === 0 && readFileSync(join(f.work, NOTE), 'utf8') === expected && readState(f).step === 'merged', `${r.code}: ${r.out}`);
}

// An open PR whose recorded head is not the commit the branch now carries (a force-push, or a PR the
// branch has outrun) must not be merged: the fresh read before the merge refuses it (issue 108).
{
	const f = makeRepo('stale-open');
	setRemote(f, { prs: { [BRANCH]: [pr('OPEN', '0'.repeat(40))] }, create: 1, edit: 0, merge: 0 });
	const r = attempt(f, 'stale-open');
	check('a stale OPEN head is refused, not merged', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).merge === 0 && (readRemote(f).merges ?? []).length === 0, `${r.code}: ${r.out}`);
	check('…the branch was pushed, only the merge was stopped', remoteBranches(f.work).includes(BRANCH), remoteBranches(f.work).join(','));
	check('…the refusal names the stale head and the current one', /is open at 000000000000/.test(r.out) && /nothing was merged/.test(r.out), r.out.trim());
}

// origin's push destination must be the repository gh addresses (issue 108). A pushurl that differs
// from origin's url means git push and gh would address different repositories, so deliver refuses
// before it pushes, creates, edits or merges anything.
{
	const f = makeRepo('pushurl-mismatch');
	const fork = join(ROOT, 'pushurl-mismatch', 'fork.git');
	must(['init', '-q', '--bare', fork], ROOT);
	must(['config', 'remote.origin.pushurl', GITHUB_FORK], f.work);
	must(['config', `url.${pathToFileURL(fork).href}.insteadOf`, GITHUB_FORK], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	check('a pushurl naming another repository refuses before any mutation', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).create === 0 && readRemote(f).merge === 0 && (readRemote(f).lists ?? []).length === 0, `${r.code}: ${r.out}`);
	check('…nothing reached the fetch remote or the fork', !remoteBranches(f.work).includes(BRANCH) && !headsOf(pathToFileURL(fork).href, f.work).includes(BRANCH), `${remoteBranches(f.work)} / ${headsOf(pathToFileURL(fork).href, f.work)}`);
	check('…the refusal names both repositories', /o\/r/.test(r.out) && /o\/r-fork/.test(r.out), r.out.trim());
}

// Two url values make git push to both, so two different repositories are refused the same way.
{
	const f = makeRepo('multiurl-mismatch');
	const other = join(ROOT, 'multiurl-mismatch', 'other.git');
	must(['init', '-q', '--bare', other], ROOT);
	must(['config', '--add', 'remote.origin.url', GITHUB_OTHER], f.work);
	must(['config', `url.${pathToFileURL(other).href}.insteadOf`, GITHUB_OTHER], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	check('two url values naming different repositories refuse before any mutation', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).create === 0 && readRemote(f).merge === 0 && (readRemote(f).lists ?? []).length === 0, `${r.code}: ${r.out}`);
	check('…nothing reached either remote', !remoteBranches(f.work).includes(BRANCH) && !headsOf(pathToFileURL(other).href, f.work).includes(BRANCH), `${remoteBranches(f.work)} / ${headsOf(pathToFileURL(other).href, f.work)}`);
}

// A url rewrite git applies on push but the configured values never show (issue 108): a
// `pushInsteadOf` that sends origin's github url to a different github.com repository. deliver must
// read git's effective push url and refuse, or gh would answer for origin while git pushed another
// project. The rewritten url carries a fake token that must not reach the diagnostic.
{
	const f = makeRepo('github-rewrite');
	must(['config', 'url.https://ghp-canary-token@github.com/evil/r.git.pushInsteadOf', GITHUB], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	check('a pushInsteadOf to another github.com repository refuses before any mutation', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).create === 0 && readRemote(f).merge === 0 && (readRemote(f).lists ?? []).length === 0, `${r.code}: ${r.out}`);
	check('…the refusal names the other repository and hides the credential', /evil\/r/.test(r.out) && !r.out.includes('ghp-canary-token'), r.out.trim());
}

// Control: the trusted local transport remap the fixtures use (a github origin rewritten to a local
// bare repo) is accepted, not refused. The effective push url is not a github.com endpoint deliver
// could read, so it is trusted rather than proven.
{
	const f = makeRepo('local-remap-control');
	setRemote(f, mergedAt(f.head));
	const r = attempt(f);
	check('a github origin remapped to a local bare transport is accepted', r.code === 0 && readState(f).step === 'merged', `${r.code}: ${r.out}`);
}

// A remote that is not a github.com repository is refused, and its credentials never reach the log
// (issue 108). The token is an obvious fake canary, not a real credential.
{
	const f = makeRepo('unsupported-remote');
	must(['remote', 'set-url', 'origin', 'https://user:secret-canary-token@gitlab.com/o/r.git?token=secret-canary-token'], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	check('an unsupported remote is refused before any mutation', r.code !== 0 && readState(f).step === 'pr', `${r.code}: ${r.out}`);
	check('…the diagnostic names the host but no credential', /gitlab\.com\/o\/r\.git/.test(r.out) && !r.out.includes('secret-canary-token'), r.out.trim());
}

// origin's identity pins the remote (issue 108): a merged PR whose url is another repository is
// gh answering about the wrong repo, and deliver refuses rather than finishing this round on it.
{
	const f = makeRepo('wrong-repo');
	setRemote(f, { prs: { [BRANCH]: [{ number: 1, url: 'https://github.com/evil/other/pull/1', state: 'MERGED', headRefOid: f.head, headRefName: BRANCH, baseRefName: 'dev', isCrossRepository: false }] }, create: 0, edit: 0, merge: 0 });
	const r = attempt(f);
	check('a merged PR from another repository is refused, not finished here', r.code !== 0 && readState(f).step === 'pr' && !readState(f).note && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
	check('…the refusal names both the other PR and the repository deliver asked for', /evil\/other/.test(r.out) && /o\/r/.test(r.out), r.out.trim());
}

// ── the remote could not be asked, or answered something unusable: refuse, never guess ────────────
for (const [mode, why] of [['fail', 'a gh failure'], ['garbage', 'a gh answer that is not JSON'], ['junk-list', 'a nonempty list deliver cannot read']] as const) {
	const f = makeRepo(mode);
	setRemote(f, empty());
	const r = attempt(f, mode);
	check(`${why} refuses instead of guessing`, r.code !== 0 && readState(f).step === 'pr', `${r.code}: ${r.out}`);
	check(`…names the remote it could not ask`, /could not be asked/i.test(r.out), r.out.trim());
	check(`…writes no note and pushes nothing`, !remoteBranches(f.work).includes(BRANCH) && !readState(f).note, remoteBranches(f.work).join(','));
}

// ── remote and local disagree: the merged PR is not this commit ───────────────────────────────────
{
	const f = makeRepo('merged-other-commit');
	setRemote(f, mergedAt('0000000000000000000000000000000000000000'));
	const r = attempt(f);
	check('a merged PR for another commit is surfaced, not completed', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).merge === 1 && !readState(f).note, `${r.code}: ${r.out}`);
	check('…the refusal says the merge is not this commit', /not this commit/i.test(r.out), r.out.trim());
	check('…and the branch is not pushed back', !remoteBranches(f.work).includes(BRANCH), remoteBranches(f.work).join(','));
}

// A merged PR that records no head commit is no proof this commit landed: finish would be a guess.
{
	const f = makeRepo('merged-no-head');
	setRemote(f, { prs: { [BRANCH]: [pr('MERGED', null)] }, create: 1, edit: 0, merge: 1 });
	const r = attempt(f);
	check('a merged PR with no head commit is refused, not completed', r.code !== 0 && readState(f).step === 'pr' && !readState(f).note, `${r.code}: ${r.out}`);
	check('…the refusal says the merge cannot be proven to be this commit', /cannot be proven/i.test(r.out), r.out.trim());
}

// A PR for this branch that was closed without merging is not this delivery's merge.
{
	const f = makeRepo('closed-pr');
	setRemote(f, { prs: { [BRANCH]: [pr('CLOSED', f.head)] }, create: 1, edit: 0, merge: 0 });
	const r = attempt(f);
	check('a PR closed without merging is surfaced, not merged', r.code !== 0 && readState(f).step === 'pr' && readRemote(f).merge === 0, `${r.code}: ${r.out}`);
	check('…the refusal names the closed PR', /CLOSED/.test(r.out), r.out.trim());
}

// ── branch reuse: an old merged PR beside a fresh open one is ambiguous; deliver fails closed ─────
// Selecting the merged one would write this round's note and step for a merge that is not this round's.
{
	const f = makeRepo('reused-branch');
	setRemote(f, { prs: { [BRANCH]: [pr('MERGED', 'f'.repeat(40)), pr('OPEN', f.head)] }, create: 2, edit: 0, merge: 1 });
	const r = attempt(f);
	check('an old merged PR beside a fresh open one is refused, not selected', r.code !== 0 && readState(f).step === 'pr', `${r.code}: ${r.out}`);
	check("…the refusal says the branch's PRs cannot be told apart", /cannot be told/i.test(r.out), r.out.trim());
	check('…nothing was pushed, created, edited, merged or noted', !remoteBranches(f.work).includes(BRANCH) && readRemote(f).create === 2 && readRemote(f).edit === 0 && readRemote(f).merge === 1 && !readState(f).note, JSON.stringify(readRemote(f)));
}

// #150: replay the crash boundary after a real receipt write but before the final step write.
// One case admits during merge; the other admits only after the receipt exists. Recovery must be
// local-only: a failing remote adapter proves it cannot accidentally authorize another merge.
for (const timing of ['after-receipt']) {
	const f = makeRepo(`receipt-interrupted-${timing}`);
	setRemote(f, mergedAt(f.head));
	const initial = attempt(f);
	check(`${timing}: real delivery established the receipt prerequisite`, initial.code === 0 && !!readState(f).delivery, initial.out);
	// Preserve the receipt/note produced by actual delivery, replaying just the incomplete step.
	setState(f, { step: 'pr', history: [], merge_attempt: null });
	if (timing === 'after-receipt') {
		const admitted = captureCorrection(f.work, { kind: 'human', author: 'Shay', source: 'test:after-confirmed-receipt', relay: 'test receiving agent', text: 'Keep this late instruction verbatim.', scope: 'a fresh follow-up', reason: 'Explicit correction after confirmed delivery' });
		check('late admission after receipt stays durable without reopening build', admitted.kind === 'recorded' && readState(f).step === 'pr', JSON.stringify(admitted));
	}
	const receipt = JSON.stringify(readState(f).delivery);
	const instructions = JSON.stringify(readState(f).corrections);
	const review = readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8');
	const note = readFileSync(join(f.work, NOTE), 'utf8');
	const remote = readFileSync(f.remote, 'utf8');
	const next = () => wfSync(['next'], { cwd: f.work, env: ENV });
	check(`${timing}: incomplete local step calls for receipt reconciliation`, next().stdout.startsWith('deliver:'));
	const recovered = attempt(f, 'no-remote');
	check(`${timing}: receipt recovery completes despite pending correction and unavailable remote`, recovered.code === 0 && readState(f).step === 'merged' && !readState(f).merge_attempt, recovered.out);
	check(`${timing}: receipt, original approval, note and pending instruction remain exact`, JSON.stringify(readState(f).delivery) === receipt && JSON.stringify(readState(f).corrections) === instructions && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review && readFileSync(join(f.work, NOTE), 'utf8') === note);
	check(`${timing}: recovery makes no remote request or branch recreation`, readFileSync(f.remote, 'utf8') === remote && !remoteBranches(f.work).includes(BRANCH));
	const followup = next();
	check(`${timing}: next directs the untouched instruction into a fresh round`, followup.status === 0 && followup.stdout.startsWith('follow-up:') && followup.stdout.includes('Keep this late instruction verbatim.'), followup.stdout + followup.stderr);
	const repeat = attempt(f, 'no-remote');
	check(`${timing}: repeated delivery remains completed, not a new merge`, repeat.code === 2 && readState(f).step === 'merged' && JSON.stringify(readState(f).delivery) === receipt && JSON.stringify(readState(f).corrections) === instructions && readFileSync(f.remote, 'utf8') === remote, repeat.out);
}

// #150: real dispatcher and state lock, with incoming events delivered at the remote seam.
for (const mode of ['correct-create', 'correct-edit', 'correct-before-merge']) {
	const f = makeRepo(mode);
	setRemote(f, mode === 'correct-edit' ? { prs: { [BRANCH]: [pr('OPEN', f.head)] }, create: 1, edit: 0, merge: 0 } : empty());
	const review = readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8');
	const r = attempt(f, mode);
	check(`${mode}: state-only instruction blocks merge`, r.code !== 0 && readState(f).step === 'build' && readRemote(f).merge === 0 && !readState(f).merge_attempt, r.out);
	check(`${mode}: original approval bytes survive`, readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review);
	const retry = attempt(f);
	check(`${mode}: direct retry cannot bypass the instruction`, retry.code !== 0 && readRemote(f).merge === 0, retry.out);
}
{
	const f = makeRepo('system-hook-correction');
	setRemote(f, empty());
	const review = readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8');
	writeFileSync(join(f.work, '.git', 'hooks', 'pre-push'), '#!/bin/sh\necho "pre-push: error: repair this hook failure" >&2\nexit 1\n', { mode: 0o755 });
	const r = attempt(f);
	const state = readState(f);
	check('actual pre-push refusal becomes system correction without verdict mutation', r.code !== 0 && state.step === 'build' && Array.isArray(state.corrections) && state.corrections[0]?.kind === 'system' && state.corrections[0]?.text.includes('repair this hook failure') && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review, r.out);
	unlinkSync(join(f.work, '.git', 'hooks', 'pre-push'));
	const corrections = state.corrections;
	if (!Array.isArray(corrections) || typeof corrections[0]?.id !== 'string') throw new Error('hook correction missing');
	const disposed = disposeCorrection(f.work, corrections[0].id, { kind: 'addressed', note: 'Transient hook environment repaired; reviewed implementation unchanged.' });
	const retry = attempt(f);
	check('unchanged transient hook recovery reuses original approval', disposed.kind === 'recorded' && retry.code === 0 && readState(f).step === 'pr' && !!readState(f).pr_handoff && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review, retry.out);
}
{
	const f = makeRepo('network-push-retry');
	setRemote(f, empty());
	const local = pathToFileURL(join(f.work, '..', 'origin.git')).href;
	must(['config', '--unset-all', `url.${local}.insteadOf`], f.work);
	const unavailable = pathToFileURL(join(f.work, '..', 'unavailable.git')).href;
	must(['config', `url.${unavailable}.insteadOf`, GITHUB], f.work);
	const review = readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8');
	const first = attempt(f);
	check('network-only push failure does not manufacture product repair', first.code !== 0 && readState(f).step === 'pr' && !readState(f).corrections && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review, first.out);
	must(['config', '--unset-all', `url.${unavailable}.insteadOf`], f.work);
	must(['config', `url.${local}.insteadOf`, GITHUB], f.work);
	const retry = attempt(f);
	check('unchanged network retry retains approval', retry.code === 0 && readState(f).step === 'pr' && !!readState(f).pr_handoff && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === review, retry.out);
}

rmSync(ROOT, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
