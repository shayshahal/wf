// deliver-stale-base.selfcheck.ts — node deliver-stale-base.selfcheck.ts → exit 0 when green.
// `wf deliver` on a branch behind its base, end to end (2026-11-02: #662 merged 31 minutes behind a dev
// that had #657). The real dispatcher, a local bare origin, a peer clone that moves dev, and a recording
// gh adapter (seams.gh). Nothing contacts GitHub. The merged-base check runs the project's own commands,
// which cannot install in this fixture: it must say NOT CHECKED, never green.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { disposeCorrection } from '../round/corrections.ts';
import { approvalIdentity, trackerNotePath } from './content-identity.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-deliver-stale-base-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
env.GIT_CONFIG_GLOBAL = join(ROOT, 'gitconfig');
env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_GLOBAL;
writeFileSync(env.GIT_CONFIG_GLOBAL, '[user]\n\tname = wf\n\temail = wf@selfcheck\n[core]\n\tautocrlf = false\n');
process.env.GIT_CONFIG_GLOBAL = env.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_SYSTEM;

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const git = (cwd: string, ...args: string[]) => {
	const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
	return r.stdout.trim();
};
const BRANCH = 'fix/JX-1-stale';
const CHORE = 'chore/stale-base';
const FOLDER = 'bug-reports/stale';
const harness = join(ROOT, 'harness.mjs');
writeFileSync(harness, `
import { run } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)};
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
await run(JSON.parse(process.env.ARGS ?? '["deliver"]'), { gh(args, cwd) {
  appendFileSync('gh.jsonl', JSON.stringify(args) + '\\n');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const pr = (state) => JSON.stringify([{ url: 'https://github.com/o/r/pull/1', state, headRefOid: head, headRefName: process.env.BRANCH, baseRefName: 'dev', isCrossRepository: false, mergeable: 'MERGEABLE', baseRefOid: 'a'.repeat(40) }]);
  if (args[1] === 'create') return { status: 0, stdout: 'https://github.com/o/r/pull/1\\n', stderr: '' };
  if (args[1] === 'edit') return { status: 0, stdout: '', stderr: '' };
  if (args[1] === 'list') {
    const created = readFileSync('gh.jsonl', 'utf8').includes('"create"');
    return { status: 0, stdout: process.env.MERGED ? pr('MERGED') : created ? pr('OPEN') : '[]', stderr: '' };
  }
  return { status: 1, stdout: '', stderr: 'fake gh: unhandled ' + args.join(' ') };
}});
`);
const lines = (edit: Record<number, string> = {}) => Array.from({ length: 12 }, (_, i) => edit[i + 1] ?? `line ${i + 1}`).join('\n') + '\n';

// A round at step pr with T2 approved: the branch changes app.txt line 6; the round folder is not yet
// committed (deliver commits it); REVIEW.md binds the identity as T2 saw it.
// A ticketless (chore) round has no tracker note to post, so `wf next` reaches the merge and done.
function fixture(name: string, branch = BRANCH) {
	const dir = join(ROOT, name);
	const work = join(dir, 'work');
	const peer = join(dir, 'peer');
	const origin = join(dir, 'origin.git');
	mkdirSync(work, { recursive: true });
	git(dir, 'init', '-q', '--bare', origin);
	git(work, 'init', '-q', '-b', 'dev');
	writeFileSync(join(work, '.gitignore'), '.wf/\ngh.jsonl\n');
	writeFileSync(join(work, 'app.txt'), lines());
	writeFileSync(join(work, 'other.txt'), 'other\n');
	git(work, 'add', '-A');
	git(work, 'commit', '-qm', 'base');
	git(work, 'remote', 'add', 'origin', 'https://github.com/o/r.git');
	git(work, 'config', `url.${pathToFileURL(origin).href}.insteadOf`, 'https://github.com/o/r.git');
	git(work, 'push', '-q', 'origin', 'dev');
	git(dir, 'clone', '-q', '-b', 'dev', pathToFileURL(origin).href, peer);
	git(work, 'checkout', '-qb', branch);
	writeFileSync(join(work, 'app.txt'), lines({ 6: 'line 6 fixed' }));
	git(work, 'commit', '-qam', 'JX-1: fix line 6');
	mkdirSync(join(work, FOLDER), { recursive: true });
	writeFileSync(join(work, FOLDER, 'TICKET.md'), '# JX-1 — stale base\n\n## Intent\n- fix line 6\n');
	writeFileSync(join(work, FOLDER, 'ASSESSMENT.md'), `head: ${git(work, 'rev-parse', 'HEAD')}\nVerdict: clean\n\n## Intent\n- fix line 6: met\n`);
	mkdirSync(join(work, '.wf'));
	const statePath = join(work, '.wf/state.json');
	writeFileSync(statePath, JSON.stringify({ wf_version: 3, class: 'A', round: branch, ...(branch === BRANCH ? { id: 'JX-1', ids: ['JX-1'] } : { id: branch }), folder: FOLDER, base: 'origin/dev', step: 'pr', made_by: 'kit' }));
	const approved = approvalIdentity(work, FOLDER, trackerNotePath(FOLDER));
	const review = `content-sha: ${approved.worktree}\nhead-sha: ${approved.head}\n\nverdict: approved\n`;
	writeFileSync(join(work, FOLDER, 'REVIEW.md'), review);
	const moveDev = (file: string, text: string) => {
		writeFileSync(join(peer, file), text);
		git(peer, 'commit', '-qam', `dev moves ${file}`);
		git(peer, 'push', '-q', 'origin', 'dev');
		return git(peer, 'rev-parse', 'HEAD');
	};
	const wf = (extra: Record<string, string> = {}) => {
		const r = spawnSync(process.execPath, [harness], { cwd: work, env: { ...env, BRANCH: branch, ...extra }, encoding: 'utf8' });
		return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '' };
	};
	const state = () => JSON.parse(readFileSync(statePath, 'utf8'));
	const ghCalls = () => (existsSync(join(work, 'gh.jsonl')) ? readFileSync(join(work, 'gh.jsonl'), 'utf8') : '');
	const remoteBranch = () => git(work, 'ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0] ?? '';
	return { work, review, moveDev, wf, state, ghCalls, remoteBranch, head: () => git(work, 'rev-parse', 'HEAD') };
}

try {
	{
		const f = fixture('unchanged');
		const r = f.wf();
		check('base unchanged: delivers as before, no rebase, no carry', r.code === 0 && !/rebased onto/.test(r.out) && !f.state().approval_carry && !!f.state().pr_handoff && f.remoteBranch() === f.head(), r.out);
	}
	{
		const f = fixture('carried', CHORE);
		const tip = f.moveDev('other.txt', 'other, moved on dev\n');
		const r = f.wf();
		const s = f.state();
		check('base moved, identical patch: rebased, approval carried, PR opened', r.code === 0 && /rebased onto origin\/dev [a-f0-9]{12}; the patch is identical \(patch-id [a-f0-9]{12}\), so T2's approval is carried; the pre-push hook re-runs the checks on the rebased tree/.test(r.out) && s.approval_carry?.onto === tip && !!s.pr_handoff && f.ghCalls().includes('"create"'), r.out);
		check('…the pushed branch is the rebased HEAD, on top of the new dev', f.remoteBranch() === f.head() && git(f.work, 'merge-base', '--is-ancestor', tip, 'HEAD') === '' && s.pr_handoff?.head === f.head(), f.remoteBranch());
		check('…REVIEW.md is unchanged and untracked; no tracked change left over', readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === f.review && !git(f.work, 'ls-files', `${FOLDER}/REVIEW.md`) && !git(f.work, 'status', '--porcelain', '--untracked-files=no'));
		const next = f.wf({ ARGS: '["next"]' });
		check('…wf next waits for the human merge (the carried approval is not stale)', next.stdout.startsWith('wait user: PR'), next.out);
		const merged = f.wf({ MERGED: '1' });
		const after = f.state();
		check('…the confirmed merge runs the merged-base check; it cannot run here, so NOT CHECKED, never green', merged.code === 0 && after.step === 'merged' && /the merged base origin\/dev [a-f0-9]{12} was NOT CHECKED/.test(merged.out) && !/is green/.test(merged.out) && after.merged_base_check?.result === 'not-checked' && after.merged_base_check?.delivered === after.delivery?.head, merged.out);
		const done = f.wf({ ARGS: '["next"]' });
		check('…wf next tells the user before reap', done.stdout.startsWith('done: tell the user first: the merged base origin/dev') && /NOT CHECKED/.test(done.stdout) && done.stdout.includes(`reap ${CHORE}`), done.out);
		const again = f.wf({ MERGED: '1' });
		check('…a retry does not run the check again', !/merged base/.test(again.out), again.out);
	}
	{
		const f = fixture('context');
		const tip = f.moveDev('app.txt', lines({ 4: 'line 4 moved on dev' }));
		const r = f.wf();
		check('base moved inside the patch context: refused, nothing pushed or opened', r.code === 2 && /changed the patch/.test(r.out) && /Rebase by hand/.test(r.out) && /fresh assessment and T2/.test(r.out) && !f.remoteBranch() && !f.ghCalls().includes('"create"'), r.out);
		check('…HEAD is not rebased, the tree is clean, REVIEW.md kept', spawnSync('git', ['-C', f.work, 'merge-base', '--is-ancestor', tip, 'HEAD'], { env }).status === 1 && !git(f.work, 'status', '--porcelain', '--untracked-files=no') && readFileSync(join(f.work, FOLDER, 'REVIEW.md'), 'utf8') === f.review && !f.state().approval_carry);
	}
	{
		const f = fixture('conflict');
		const before = f.head();
		f.moveDev('app.txt', lines({ 6: 'line 6 changed on dev' }));
		const r = f.wf();
		check('conflicting base: aborted and refused, nothing pushed', r.code === 2 && /did not apply cleanly/.test(r.out) && /Rebase by hand/.test(r.out) && !f.remoteBranch() && !existsSync(join(f.work, '.git', 'rebase-merge')), r.out);
		check('…HEAD is the round-folder commit on the old base', git(f.work, 'rev-parse', 'HEAD~1') === before, f.head());
	}
	{
		// The pre-push hook refuses the rebased tree once (an environment failure): the existing refusal
		// path records a correction; once it is addressed, a later deliver accepts the carried identity.
		const f = fixture('hook-after-carry');
		f.moveDev('other.txt', 'other, moved on dev\n');
		const hook = join(f.work, '.git', 'hooks', 'pre-push');
		writeFileSync(hook, '#!/bin/sh\necho "pre-push: error: the hook could not start" >&2\nexit 1\n', { mode: 0o755 });
		const r = f.wf();
		const s = f.state();
		check('hook refuses after the carry: correction recorded, carry kept', r.code !== 0 && /rebased onto/.test(r.out) && !!s.approval_carry && s.corrections?.[0]?.kind === 'system' && !f.remoteBranch(), r.out);
		unlinkSync(hook);
		const disposed = disposeCorrection(f.work, s.corrections[0].id, { kind: 'addressed', note: 'hook environment repaired; implementation unchanged' });
		check('…addressing it returns the round to pr on the carried identity', disposed.kind === 'recorded' && f.state().step === 'pr', JSON.stringify(f.state()));
		const retry = f.wf();
		check('…a later deliver accepts the carried identity and opens the PR', retry.code === 0 && !/rebased onto/.test(retry.out) && f.remoteBranch() === f.head() && !!f.state().pr_handoff, retry.out);
	}
	{
		// An open PR on the old base is repaired the same way: rebased, then pushed under a lease.
		const f = fixture('open-pr');
		const first = f.wf();
		const published = f.remoteBranch();
		check('open PR setup', first.code === 0 && !!published, first.out);
		const tip = f.moveDev('other.txt', 'other, moved on dev\n');
		// The published-repair path is entered by a retained repair observation, as reconciliation grants it.
		const s = f.state();
		writeFileSync(join(f.work, '.wf/state.json'), JSON.stringify({ ...s, wf_version: 6, pr_repair: { url: s.pr_handoff.url, head: s.pr_handoff.head } }));
		const r = f.wf();
		check('open PR behind its base: rebased and force-pushed under a lease', r.code === 0 && /rebased onto/.test(r.out) && f.remoteBranch() === f.head() && f.remoteBranch() !== published && git(f.work, 'merge-base', '--is-ancestor', tip, 'HEAD') === '', r.out);
	}
	{
		// The same, but the hook refuses the rebased push once: the remote keeps the old-base push, and a
		// later deliver (now current) still replaces it, because it holds the same patch.
		const f = fixture('open-pr-hook');
		check('open PR setup', f.wf().code === 0 && !!f.remoteBranch());
		const published = f.remoteBranch();
		f.moveDev('other.txt', 'other, moved on dev\n');
		const s = f.state();
		writeFileSync(join(f.work, '.wf/state.json'), JSON.stringify({ ...s, wf_version: 6, pr_repair: { url: s.pr_handoff.url, head: s.pr_handoff.head } }));
		const hook = join(f.work, '.git', 'hooks', 'pre-push');
		writeFileSync(hook, '#!/bin/sh\necho "pre-push: error: the hook could not start" >&2\nexit 1\n', { mode: 0o755 });
		const refused = f.wf();
		unlinkSync(hook);
		check('…the hook refuses the rebased push; the remote keeps the old-base push', refused.code !== 0 && /rebased onto/.test(refused.out) && f.remoteBranch() === published, refused.out);
		// A published PR's correction is reconciled before its repair (#190): deliver first, then dispose.
		const reconciled = f.wf();
		check('…reconciliation keeps the correction for scoped repair', /corrections retained for ordinary scoped repair/.test(reconciled.out), reconciled.out);
		const id = f.state().corrections?.[0]?.id;
		const disposed = typeof id === 'string' ? disposeCorrection(f.work, id, { kind: 'addressed', note: 'hook environment repaired; implementation unchanged' }) : null;
		const retry = f.wf();
		check('…a later deliver replaces it under a lease and repairs the PR', disposed?.kind === 'recorded' && retry.code === 0 && f.remoteBranch() === f.head() && f.ghCalls().includes('"edit"'), `${JSON.stringify(disposed)} ${JSON.stringify(f.state())} ${retry.out}`);
	}
} finally {
	rmSync(ROOT, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
