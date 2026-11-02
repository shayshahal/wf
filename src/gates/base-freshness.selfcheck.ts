// base-freshness.selfcheck.ts — node base-freshness.selfcheck.ts → exit 0 when green.
// freshenBase against real git: a temporary bare origin, the round's clone and a peer clone that moves
// dev the way #657 moved it under #662 (2026-11-02). No network.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { approvalIdentity, trackerNotePath } from './content-identity.ts';
import { approvedIdentity } from './approval-carry.ts';
import { carriedLine, freshenBase, rebaseByHand } from './base-freshness.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-base-freshness-'));
// Fixture git sees no machine config (a global rebase.autostash or hook path would change the run).
process.env.GIT_CONFIG_GLOBAL = join(ROOT, 'gitconfig');
process.env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_GLOBAL;
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_') && !key.startsWith('GIT_CONFIG_')) delete process.env[key];
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = wf\n\temail = wf@selfcheck\n[core]\n\tautocrlf = false\n');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const git = (cwd: string, ...args: string[]) => {
	const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
	return r.stdout.trim();
};
const lines = (edit: Record<number, string> = {}) => Array.from({ length: 12 }, (_, i) => edit[i + 1] ?? `line ${i + 1}`).join('\n') + '\n';
const FOLDER = 'bug-reports/x';
const BRANCH = 'fix/x';

let seq = 0;
// origin/dev with app.txt and other.txt; the round's branch changes app.txt line 6 and commits its
// folder (deliver's round-folder commit). REVIEW.md, the tracker note and .wf/ stay untracked.
function fixture() {
	const dir = join(ROOT, `f${++seq}`);
	const origin = join(dir, 'origin.git');
	const work = join(dir, 'work');
	const peer = join(dir, 'peer');
	mkdirSync(work, { recursive: true });
	git(dir, 'init', '-q', '--bare', origin);
	git(work, 'init', '-q', '-b', 'dev');
	writeFileSync(join(work, '.gitignore'), '.wf/\n');
	writeFileSync(join(work, 'app.txt'), lines());
	writeFileSync(join(work, 'other.txt'), 'other\n');
	git(work, 'add', '-A');
	git(work, 'commit', '-qm', 'base');
	git(work, 'remote', 'add', 'origin', pathToFileURL(origin).href);
	git(work, 'push', '-q', '-u', 'origin', 'dev');
	git(dir, 'clone', '-q', '-b', 'dev', pathToFileURL(origin).href, peer);
	git(work, 'checkout', '-qb', BRANCH);
	writeFileSync(join(work, 'app.txt'), lines({ 6: 'line 6 fixed' }));
	git(work, 'commit', '-qam', 'fix line 6');
	mkdirSync(join(work, FOLDER), { recursive: true });
	writeFileSync(join(work, FOLDER, 'TICKET.md'), '# X\n');
	git(work, 'add', FOLDER);
	git(work, 'commit', '-qm', 'round folder');
	const approved = approvalIdentity(work, FOLDER, trackerNotePath(FOLDER));
	const review = `content-sha: ${approved.worktree}\nhead-sha: ${approved.head}\n\nverdict: approved\n`;
	writeFileSync(join(work, FOLDER, 'REVIEW.md'), review);
	writeFileSync(join(work, FOLDER, 'JIRA.md'), '## X\nnote\n');
	mkdirSync(join(work, '.wf'));
	writeFileSync(join(work, '.wf', 'state.json'), '{}\n');
	const bound = { contentSha: approved.worktree, headSha: approved.head };
	const moveDev = (file: string, text: string) => {
		writeFileSync(join(peer, file), text);
		git(peer, 'commit', '-qam', `dev moves ${file}`);
		git(peer, 'push', '-q', 'origin', 'dev');
		return git(peer, 'rev-parse', 'HEAD');
	};
	const run = () => freshenBase({ toplevel: work, baseBranch: 'dev', branch: BRANCH, folder: FOLDER, notePath: trackerNotePath(FOLDER), bound, previous: null });
	const paperworkKept = () => readFileSync(join(work, FOLDER, 'REVIEW.md'), 'utf8') === review && existsSync(join(work, FOLDER, 'JIRA.md')) && existsSync(join(work, '.wf', 'state.json'));
	const rebasing = () => existsSync(join(work, '.git', 'rebase-merge')) || existsSync(join(work, '.git', 'rebase-apply'));
	return { dir, work, peer, origin, bound, moveDev, run, paperworkKept, rebasing, head: () => git(work, 'rev-parse', 'HEAD') };
}

try {
	{
		const f = fixture();
		const before = f.head();
		const r = f.run();
		check('base unchanged: no rebase', r.kind === 'current' && f.head() === before, JSON.stringify(r));
	}
	{
		const f = fixture();
		const before = f.head();
		const tip = f.moveDev('other.txt', 'other, moved on dev\n');
		const r = f.run();
		const now = approvalIdentity(f.work, FOLDER, trackerNotePath(FOLDER));
		check('base moved elsewhere: rebased and carried', r.kind === 'carried' && f.head() !== before && git(f.work, 'merge-base', '--is-ancestor', tip, 'HEAD') === '' && r.carry.onto === tip, JSON.stringify(r));
		check('…the carry starts at the REVIEW.md binding and covers the rebased tree', r.kind === 'carried' && r.carry.from.worktree === f.bound.contentSha && r.carry.from.head === f.bound.headSha && approvedIdentity(f.bound, r.carry, now) && !approvedIdentity(f.bound, null, now), JSON.stringify(r));
		check('…the line names the tip, the patch id and the hook', r.kind === 'carried' && r.line === carriedLine('origin/dev', r.carry) && r.line.includes(tip.slice(0, 12)) && /patch is identical \(patch-id [a-f0-9]{12}\)/.test(r.line) && /pre-push hook re-runs/.test(r.line), r.kind === 'carried' ? r.line : '');
		check('…untracked paperwork is untouched and stays untracked', f.paperworkKept() && !git(f.work, 'ls-files', `${FOLDER}/REVIEW.md`), git(f.work, 'status', '--porcelain'));
		check('…no remote branch yet: the lease expects none', r.kind === 'carried' && r.lease === '');
		const again = f.run();
		check('…a second run finds the branch current', again.kind === 'current', JSON.stringify(again));
	}
	{
		// Line 4 is outside the change but inside its three context lines: git merges it cleanly, and the
		// patch's context is no longer the one T2 saw.
		const f = fixture();
		const before = f.head();
		f.moveDev('app.txt', lines({ 4: 'line 4 moved on dev' }));
		const r = f.run();
		check('base moved inside the patch context: refused', r.kind === 'refused' && /changed the patch/.test(r.why) && /Rebase by hand/.test(r.why) && /fresh assessment and T2/.test(r.why) && /`wf next`/.test(r.why), JSON.stringify(r));
		check('…HEAD restored, paperwork kept, no rebase in progress', f.head() === before && f.paperworkKept() && !f.rebasing() && !git(f.work, 'status', '--porcelain', '--untracked-files=no'), f.head());
	}
	{
		const f = fixture();
		const before = f.head();
		f.moveDev('app.txt', lines({ 6: 'line 6 changed on dev' }));
		const r = f.run();
		check('conflicting rebase: aborted and refused', r.kind === 'refused' && /did not apply cleanly/.test(r.why) && /Rebase by hand/.test(r.why), JSON.stringify(r));
		check('…HEAD restored, paperwork kept, no rebase in progress', f.head() === before && f.paperworkKept() && !f.rebasing(), f.head());
	}
	{
		const f = fixture();
		const before = f.head();
		git(f.work, 'remote', 'set-url', 'origin', pathToFileURL(join(f.dir, 'missing.git')).href);
		const r = f.run();
		check('a failed fetch refuses: freshness unproven', r.kind === 'refused' && /could not fetch dev/.test(r.why) && /cannot be proven/.test(r.why) && f.head() === before, JSON.stringify(r));
	}
	{
		// The round's earlier push (an interrupted delivery, an open PR): replaced under a lease.
		const f = fixture();
		git(f.work, 'push', '-q', 'origin', 'HEAD');
		const pushed = f.head();
		f.moveDev('other.txt', 'other, moved on dev\n');
		const r = f.run();
		check('own earlier push: carried with a lease on it', r.kind === 'carried' && r.lease === pushed, JSON.stringify(r));
		// That push refused (a hook): the next run finds the branch current, and only with the carry that
		// names the commit the rebase started from may it replace the old-base push.
		const current = freshenBase({ toplevel: f.work, baseBranch: 'dev', branch: BRANCH, folder: FOLDER, notePath: trackerNotePath(FOLDER), bound: f.bound, previous: r.kind === 'carried' ? r.carry : null });
		const bare = f.run();
		check('…a later run is current and still leases the old-base push, from the carry only', current.kind === 'current' && current.lease === pushed && bare.kind === 'current' && bare.lease === null, `${JSON.stringify(current)} ${JSON.stringify(bare)}`);
		if (r.kind === 'carried') {
			const push = spawnSync('git', ['-C', f.work, 'push', '-q', `--force-with-lease=refs/heads/${BRANCH}:${r.lease}`, 'origin', 'HEAD'], { encoding: 'utf8' });
			check('…the leased push replaces it', push.status === 0 && git(f.work, 'ls-remote', 'origin', `refs/heads/${BRANCH}`).startsWith(f.head()), push.stderr);
		}
	}
	{
		// Somebody else's commit on the remote branch is never forced away.
		const f = fixture();
		git(f.work, 'push', '-q', 'origin', 'HEAD');
		git(f.peer, 'fetch', '-q', 'origin', BRANCH);
		git(f.peer, 'checkout', '-qb', BRANCH, `origin/${BRANCH}`);
		writeFileSync(join(f.peer, 'peer.txt'), 'theirs\n');
		git(f.peer, 'add', '-A');
		git(f.peer, 'commit', '-qm', 'theirs');
		git(f.peer, 'push', '-q', 'origin', BRANCH);
		git(f.peer, 'checkout', '-q', 'dev');
		const before = f.head();
		f.moveDev('other.txt', 'other, moved on dev\n');
		const r = f.run();
		check('a remote branch with commits this worktree lacks: refused before rebasing', r.kind === 'refused' && /does not have/.test(r.why) && f.head() === before, JSON.stringify(r));
	}
	check('the hand-rebase refusal names the command and the cost', /git rebase origin\/dev/.test(rebaseByHand('origin/dev', 'a'.repeat(40), 'x')) && /nothing was pushed/.test(rebaseByHand('origin/dev', 'a'.repeat(40), 'x')));
} finally {
	rmSync(ROOT, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
