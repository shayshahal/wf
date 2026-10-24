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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackerNote } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../project.ts";
import { captureCorrection, disposeCorrection } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../round/corrections.ts";
import { WF_ROOT } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../paths.ts";
import { seams, plug } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../seams.ts";
import { approvalIdentity, headContentSha, trackerNotePath } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/./content-identity.ts";
import { publishedDeliveryVerdict, reconcilePublishedDelivery } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/./deliver.ts";
import { writeState } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../round/state.ts";
import type { GhResult } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../seams.ts";
import type { PrLookup } from "file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/./deliver.ts";

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
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PI_') && !k.startsWith('GIT_') && !k.startsWith('T3_') && !k.startsWith('T3CODE_')));
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
import { run } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL("file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../run.ts"))).href)};
import { captureCorrection } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL("file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../round/corrections.ts"))).href)};
import { writeState } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL("file:///C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion/src/gates/../round/state.ts"))).href)};
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

const trackerFile = process.env.WF_TEST_REMOTE + '.tracker';
const trackerRead = () => JSON.parse(readFileSync(trackerFile, 'utf8'));
const trackerWrite = (t) => writeFileSync(trackerFile, JSON.stringify(t));
const json = (o) => new Response(JSON.stringify(o), {status:200});
globalThis.fetch = async (url, init = {}) => {
 const t = trackerRead(), u = String(url), method = init.method ?? 'GET';
 t.calls.push({url:u,method});
 if (u.includes('/changelog')) {trackerWrite(t); return json({values:[],isLast:true});}
 if (u.endsWith('/comment') && method === 'POST') {t.comments.push({body:JSON.parse(init.body).body}); trackerWrite(t);return json({});}
 if (u.includes('/transitions')) {
  if(method === 'POST') {t.transitions++;t.status='Fixed in Local';trackerWrite(t);return new Response(null,{status:204});}
  trackerWrite(t);return json({transitions:t.status==='Fixed in Local'?[]:[{id:'31',to:{name:'Fixed in Local'}}]});
 }
 trackerWrite(t);return json({fields:{status:{name:t.status},attachment:[],comment:{comments:t.comments}}});
};

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
	const r = spawnSync(process.execPath, [join(ROOT, 'harness.mjs')], { cwd: f.work, env: { ...ENV, JIRA_EMAIL: 'fixture@example.invalid', JIRA_TOKEN: 'controlled-not-real', WF_TEST_REMOTE: f.remote, WF_TEST_BRANCH: BRANCH, WF_TEST_GH_MODE: mode, WF_TEST_ARGS: JSON.stringify(args) }, encoding: 'utf8' });
	return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}


const f = makeRepo('191-continuous');
const trackerPath = f.remote + '.tracker';
const tracker = () => JSON.parse(readFileSync(trackerPath,'utf8'));
const run = (args: string[]) => {const r=attempt(f,'ok',args);console.log('$ wf '+args.join(' ')+'\nexit '+r.code+'\n'+r.out);return r;};
try {
 writeFileSync(trackerPath,JSON.stringify({status:'In Progress',comments:[],transitions:0,calls:[]}));
 const published=run(['deliver']);
 check('publish records OPEN handoff, not delivery',published.code===0 && !!readState(f).pr_handoff && !readState(f).delivery,published.out);
 const notePath=join(f.work,NOTE);
 writeFileSync(notePath,readFileSync(notePath,'utf8').replace(/<[^>]*>/g,'filled').replace(/^pictures:.*$/m,'pictures: none'));
 setState(f,{history:[{step:'classify',at:'2026-10-01T00:00:00Z'}]});
 const notified=run(['post']);
 check('OPEN notification posts once and never transitions',notified.code===0 && tracker().comments.length===1 && tracker().transitions===0 && readFileSync(notePath,'utf8').includes('(posted)'),notified.out);
 const remote=readRemote(f);remote.prs[BRANCH][0].state='MERGED';remote.prs[BRANCH][0].headRefOid=must(['rev-parse','HEAD'],f.work);setRemote(f,remote);
 console.log('CONTROLLED HUMAN MERGE: existing published candidate now MERGED');
 const reconciled=run(['deliver']);
 check('delivery reconciliation records confirmed merge',reconciled.code===0 && !!readState(f).delivery && readState(f).step==='merged',reconciled.out);
 const next=run(['next']);
 check('next does not offer reap with tracker incomplete',!next.out.startsWith('done:'),next.out);
 const posted=run(['post']);
 check('previously notified ticket reconciles actual delivered status',posted.code===0 && tracker().status==='Fixed in Local',JSON.stringify(tracker()));
 run(['post']);
 check('retries never duplicate notification',tracker().comments.length===1 && readRemote(f).create===1 && readRemote(f).merge===0,JSON.stringify(tracker()));
 console.log('TRACKER FINAL:',JSON.stringify(tracker()));
} finally {rmSync(ROOT,{recursive:true,force:true});}
process.exitCode=failures?1:0;
