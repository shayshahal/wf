// deliver-recovery.selfcheck.ts — node deliver-recovery.selfcheck.ts → exit 0 when green.
// The interruption boundaries around `wf deliver`'s remote half (issue 108), through the real CLI
// dispatcher in a temporary repository with a local bare origin and a fake `gh` plugged as the remote
// adapter (`run(['deliver'], { gh })`, seams.ts). No production remote: the fake records the PRs it
// was asked to create, edit and merge, so a retry that duplicates work is visible in its records, and
// the bare origin shows a branch a retry pushed back. Nothing here contacts GitHub or a tracker.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackerNote } from '../project.ts';
import { approvalIdentity, trackerNotePath } from './content-identity.ts';

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
// selfcheck.ts strips GIT_* already, this keeps a by-hand run honest too.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const remoteFile = process.env.WF_TEST_REMOTE;
const mode = process.env.WF_TEST_GH_MODE || 'ok';
const branch = process.env.WF_TEST_BRANCH;
const readRemote = () => (existsSync(remoteFile) ? JSON.parse(readFileSync(remoteFile, 'utf8')) : { prs: {}, create: 0, edit: 0, merge: 0, edits: [] });
const writeRemote = (r) => writeFileSync(remoteFile, JSON.stringify(r, null, 2));
const head = (cwd) => execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const row = (state, oid) => ({ number: 108, url: 'https://github.com/o/r/pull/108', state, headRefOid: oid, headRefName: branch, baseRefName: 'dev', isCrossRepository: false });

// GitHub moves an open PR's head when its branch moves; a merged PR's head is fixed. The
// stale-open mode holds an OPEN PR at its stored head, to model a PR the branch has outrun.
const effectiveHead = (p, cwd) => (p.state !== 'OPEN' || mode === 'stale-open' ? p.headRefOid : head(cwd));
const gh = (args, cwd) => {
  if (mode === 'fail') return { status: 1, stdout: '', stderr: 'error connecting to api.github.com' };
  if (mode === 'garbage') return { status: 0, stdout: 'not json', stderr: '' };
  if (mode === 'junk-list') return { status: 0, stdout: '[{}]', stderr: '' };
  const r = readRemote();
  if (args[0] === 'pr' && args[1] === 'list') {
    r.lists = (r.lists ?? []).concat([args]);
    writeRemote(r);
    return { status: 0, stdout: JSON.stringify((r.prs[branch] ?? []).map((p) => ({ ...p, headRefOid: effectiveHead(p, cwd) }))), stderr: '' };
  }
  if (args[0] === 'pr' && args[1] === 'create') {
    r.create++;
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
    r.edit++; r.edits = (r.edits ?? []).concat([args]);
    // An edit that commits a new HEAD: the merge must be refused because the approved commit is no
    // longer the one the merge would land.
    if (mode === 'commit-edit') { writeFileSync('README.md', 'gh mutated on edit\\n'); execFileSync('git', ['-C', cwd, 'add', '-A']); execFileSync('git', ['-C', cwd, 'commit', '-qm', 'gh mutated on edit']); }
    writeRemote(r); return { status: 0, stdout: '', stderr: '' };
  }
  if (args[0] === 'pr' && args[1] === 'merge') {
    r.merges = (r.merges ?? []).concat([args]);
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

await run(['deliver'], { gh });
`;
writeFileSync(join(ROOT, 'harness.mjs'), HARNESS);

type RemotePr = { number: number; url: string; state: string; headRefOid: string | null; headRefName: string; baseRefName: string; isCrossRepository: boolean };
type Remote = { prs: Record<string, RemotePr[]>; create: number; edit: number; merge: number; lists?: string[][]; creates?: string[][]; edits?: string[][]; merges?: string[][] };

const TICKET = ['# BJEW-1 — the thing', '## Intent', '', '- the thing', '', '## Verification', '| # | case | files | check |', '|---|---|---|---|', '| 1 | fix(x): y | a.ts | — |'].join('\n');
const ASSESSMENT = ['# BJEW-1 — assessment', 'Verdict: clean', '', '## Intent', '- the thing: met: a.ts:1 \u00b7 before: broken \u00b7 after: fixed'].join('\n');

// A temporary repository with a local bare origin, on the round's branch, its folder and its state at
// step pr with T2 approved: exactly where `wf deliver` runs.
function makeRepo(name: string) {
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
	// origin's identity is a GitHub url; git's transport is redirected to the local bare repo, so no
	// test touches GitHub. `git config --get remote.origin.url` still answers the GitHub url.
	must(['remote', 'add', 'origin', GITHUB], work);
	must(['config', `url.${pathToFileURL(origin).href}.insteadOf`, GITHUB], work);
	must(['push', '-q', '-u', 'origin', 'dev'], work);
	must(['checkout', '-qb', BRANCH], work);
	mkdirSync(join(work, FOLDER), { recursive: true });
	writeFileSync(join(work, FOLDER, 'TICKET.md'), TICKET);
	writeFileSync(join(work, FOLDER, 'ASSESSMENT.md'), `head: ${must(['rev-parse', 'HEAD'], work)}\n${ASSESSMENT}`);
	mkdirSync(join(work, '.wf'), { recursive: true });
	const state = { wf_version: 2, round: BRANCH, class: 'A', id: 'BJEW-1', ids: ['BJEW-1'], folder: FOLDER, base: 'dev', step: 'pr', made_by: 'kit' };
	writeFileSync(join(work, '.wf', 'state.json'), JSON.stringify(state, null, 2) + '\n');
	// The approval REVIEW.md must record (#106): the worktree and HEAD identities as they are at T2, so
	// deliver's approval recheck runs against a real binding rather than refusing an unbound verdict.
	const identity = approvalIdentity(work, FOLDER, trackerNotePath(FOLDER));
	writeFileSync(join(work, FOLDER, 'REVIEW.md'), `round: ${BRANCH}\nbase: dev\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\n\nverdict: approved\n`);
	return { work, remote: join(root, 'remote.json'), head: must(['rev-parse', 'HEAD'], work) };
}

type Fixture = ReturnType<typeof makeRepo>;
const setState = (f: Fixture, patch: Record<string, unknown>) => {
	const file = join(f.work, '.wf', 'state.json');
	writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...patch }, null, 2) + '\n');
};
const setRemote = (f: Fixture, remote: Remote) => writeFileSync(f.remote, JSON.stringify(remote, null, 2));
const readRemote = (f: Fixture): Remote => JSON.parse(readFileSync(f.remote, 'utf8'));
const readState = (f: Fixture): Record<string, unknown> => JSON.parse(readFileSync(join(f.work, '.wf', 'state.json'), 'utf8'));
const empty = (): Remote => ({ prs: {}, create: 0, edit: 0, merge: 0 });
const pr = (state: string, oid: string | null): RemotePr => ({ number: 108, url: PR_URL, state, headRefOid: oid, headRefName: BRANCH, baseRefName: 'dev', isCrossRepository: false });
const mergedAt = (head: string): Remote => ({ prs: { [BRANCH]: [pr('MERGED', head)] }, create: 1, edit: 0, merge: 1 });

// One delivery attempt through the real CLI. `mode` drives the fake gh's answer.
function attempt(f: Fixture, mode = 'ok') {
	const r = spawnSync(process.execPath, [join(ROOT, 'harness.mjs')], { cwd: f.work, env: { ...ENV, WF_TEST_REMOTE: f.remote, WF_TEST_BRANCH: BRANCH, WF_TEST_GH_MODE: mode }, encoding: 'utf8' });
	return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
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

// The interruption itself, not a hand-set remote state (issue 108): a real run reaches gh's merge,
// the remote records it, and the process dies before the note and the step are written. The retry
// then starts from what that run actually left.
{
	const f = makeRepo('crash-after-merge');
	setRemote(f, empty());
	const first = attempt(f, 'crash-merge');
	const landed = must(['rev-parse', 'HEAD'], f.work);
	check('a run killed right after the remote merge dies before the local records', first.code !== 0 && readRemote(f).merge === 1 && readState(f).step === 'pr' && !readState(f).note && !existsSync(join(f.work, NOTE)), `${first.code}: ${first.out}`);
	check('…the real run\u2019s merge was constrained to the pushed head', (readRemote(f).merges ?? []).some((a) => a[a.indexOf('--match-head-commit') + 1] === landed), JSON.stringify(readRemote(f).merges));
	const second = attempt(f);
	check('the retry finishes the interrupted delivery', second.code === 0 && readState(f).step === 'merged' && readState(f).note === NOTE && readFileSync(join(f.work, NOTE), 'utf8').includes(`## BJEW-1`), `${second.code}: ${second.out}`);
	check('…without a second merge or a second PR', readRemote(f).merge === 1 && readRemote(f).create === 1, JSON.stringify(readRemote(f)));
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
	check('…the lookups are pinned to the repository and the merge to the URL and pushed head', (readRemote(f).lists ?? []).every((a) => a.includes('--repo') && a.includes('o/r')) && (readRemote(f).merges ?? []).some((a) => a.includes(PR_URL) && a[a.indexOf('--match-head-commit') + 1] === landed), JSON.stringify(readRemote(f)));
	check('…merges it once and finishes the note and step', readRemote(f).merge === 1 && readState(f).step === 'merged' && readState(f).note === NOTE, JSON.stringify(readRemote(f)));
}

// The push was done and the task died before the PR existed: the retry creates exactly one.
{
	const f = makeRepo('pushed-before-pr');
	must(['push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`], f.work);
	setRemote(f, empty());
	const r = attempt(f);
	const landed = must(['rev-parse', 'HEAD'], f.work);
	check('a retry after push, before PR, creates exactly one PR', r.code === 0 && readRemote(f).create === 1 && readRemote(f).merge === 1, `${r.code}: ${r.out}`);
	check('…the create is pinned to the repository and the merge to the pushed head', (readRemote(f).creates ?? []).some((a) => a.includes('--repo') && a.includes('o/r')) && (readRemote(f).merges ?? []).some((a) => a[a.indexOf('--match-head-commit') + 1] === landed), JSON.stringify(readRemote(f)));
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
	check('a retry after the round-folder commit resumes without a fresh review', r.code === 0 && readState(f).step === 'merged' && readRemote(f).create === 1 && readRemote(f).merge === 1, `${r.code}: ${r.out}`);
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

rmSync(ROOT, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
