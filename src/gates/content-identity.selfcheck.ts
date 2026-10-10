// content-identity.selfcheck.ts — node content-identity.selfcheck.ts → exit 0 when green.
// #106 (2026-10-09): the implementation a T2 approval and a `wf check` name, and the boundaries that
// refuse when it changes. Pure arms for the two scopes, the exclusion encoding and the verdict
// binding; real temp-repo CLI arms for approve → change → refuse, unchanged → eligible, the committed-
// but-restored worktree hole, a staged change the round-folder commit must not sweep, a repro
// mutation, a permitted paperwork change, a check that mutates what it measures, and a push hook that
// mutates after approval. The stack a `wf review` opens is served by a throwaway HTTP server on the
// branch's port (a LOCAL seam): this process must not block on spawnSync while it answers, so the CLI
// runs through async spawn.
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { approvalBinding, approvalContentGap, needsFreshReviewHeader, renderSkeleton, lastField } from './review-format.ts';
import { approvalIdentity, approvalPaperworkExcluded, commitContentSha, headContentSha, trackerNotePath, worktreeContentSha } from './content-identity.ts';
import { t2Gap } from './deliver.ts';
import { checkRunLine, identityGap, suitesLine } from './check.ts';
import { basePortForBranch } from '../worktrees/worktree.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the exclusion encoding ───────────────────────────────────────────────────

const folder = 'bug-reports/r';
check('wf metadata, REVIEW.md, the tracker note and live auth are not the implementation', ['.wf/state.json', '.wf/AGREEMENT.html', `${folder}/REVIEW.md`, `${folder}/JIRA.md`, `${folder}/repro/.auth`].every((f) => approvalPaperworkExcluded(f, folder, `${folder}/JIRA.md`)));
check('the round folder is NOT paperwork: a repro/test inside it binds the approval', !approvalPaperworkExcluded(`${folder}/repro/x.spec.ts`, folder) && !approvalPaperworkExcluded(`${folder}/proof/CALL-STACK-AS-BUILT.md`, folder));
check('what the approval was judged against stays bound', !approvalPaperworkExcluded(`${folder}/PLAN.md`, folder) && !approvalPaperworkExcluded(`${folder}/SPEC.md`, folder));
check('a stray executable in .wf is not hidden by a blanket folder exclusion', !approvalPaperworkExcluded('.wf/evil.sh', folder));
// The state lock, its acquisition guard and the atomic-write temps are state.ts's own (issue #107):
// another command reading the implementation must not see a concurrent write as a product change.
check('the state lock, its guard and the state atomic-write temps are wf metadata', ['.wf/state.json.lock', '.wf/state.json.lock.acquiring', '.wf/state.json.1234.5.tmp', '.wf/state.json.lock.1234.5.tmp'].every((f) => approvalPaperworkExcluded(f, folder, `${folder}/JIRA.md`)));
check('deliver\u2019s atomic note temp is wf paperwork too', approvalPaperworkExcluded(`${folder}/JIRA.md.1234.ab12cd.tmp`, folder, `${folder}/JIRA.md`));
check('a hand-made temp-shaped file in .wf is not hidden', !approvalPaperworkExcluded('.wf/state.json.evil.tmp', folder, `${folder}/JIRA.md`) && !approvalPaperworkExcluded('.wf/state.json.tmp', folder));
// The owner rule is exact, not a glob (composition review, 2026-10-09): a temp is wf's only with a
// numeric pid and a dotless token, so `state.json.1evil.2evil.tmp` is source. A git glob `[0-9]*`
// matched it (a digit then anything), hiding unowned content from the identity.
const noteStem = `${folder}/JIRA.md`;
check('the acquisition-guard atomic-write temp is wf metadata', approvalPaperworkExcluded('.wf/state.json.lock.acquiring.1234.5.tmp', folder, noteStem));
check('an unowned numeric-prefix state or lock temp is not hidden', ['.wf/state.json.1evil.2evil.tmp', '.wf/state.json.lock.1evil.2evil.tmp', '.wf/state.json.1.2.3.tmp'].every((f) => !approvalPaperworkExcluded(f, folder, noteStem)));
// The state writer's seq is digits (state.ts): a numeric pid with a non-numeric seq is not a temp
// the #107 writer can produce, so it is source. Only the #108 note temp's token may be alphanumeric.
check('a state temp the #107 writer cannot produce (numeric pid, alphanumeric seq) is not hidden', !approvalPaperworkExcluded('.wf/state.json.1234.2evil.tmp', folder, noteStem) && !approvalPaperworkExcluded('.wf/state.json.lock.1234.2evil.tmp', folder, noteStem));
check('an unowned numeric-prefix note temp is not hidden', [`${folder}/JIRA.md.1evil.2evil.tmp`, `${folder}/JIRA.md.1.2.3.tmp`].every((f) => !approvalPaperworkExcluded(f, folder, noteStem)));
check('a glob-like note stem is matched literally: its own temp is wf\u2019s, the sibling\u2019s is not', approvalPaperworkExcluded('bug-reports/r[1]/JIRA.md.1234.ab12cd.tmp', 'bug-reports/r[1]', 'bug-reports/r[1]/JIRA.md') && !approvalPaperworkExcluded('bug-reports/r1/JIRA.md.1234.ab12cd.tmp', 'bug-reports/r[1]', 'bug-reports/r[1]/JIRA.md'));
check('a lookalike sibling round is not this round\'s REVIEW.md', !approvalPaperworkExcluded('bug-reports/r2/REVIEW.md', folder));
check('the project\'s tracker note path is the project\'s own file name', trackerNotePath(folder) === `${folder}/JIRA.md` && trackerNotePath(null) === null);

// ── the identities on a real repo ────────────────────────────────────────────

const repoOf = () => {
	const repo = mkdtempSync(join(tmpdir(), 'wf-content-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'src.ts'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	mkdirSync(join(repo, folder, 'repro'), { recursive: true });
	writeFileSync(join(repo, folder, 'PLAN.md'), 'plan\n');
	writeFileSync(join(repo, folder, 'repro/x.spec.ts'), 'test\n');
	writeFileSync(join(repo, folder, 'REVIEW.md'), 'review\n');
	return { repo, git };
};
{
	const { repo, git } = repoOf();
	const note = trackerNotePath(folder);
	const base = approvalIdentity(repo, folder, note);
	check('the identity is a git tree hash for both the worktree and HEAD', /^tree:[0-9a-f]+$/.test(base.worktree) && /^tree:[0-9a-f]+$/.test(base.head), JSON.stringify(base));
	// A pure paperwork commit (REVIEW.md, the note, .wf state) leaves both unchanged.
	writeFileSync(join(repo, folder, 'REVIEW.md'), 'review\nverdict: approved\n');
	writeFileSync(join(repo, folder, 'JIRA.md'), 'note\n');
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, '.wf', 'state.json'), '{}\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'docs: round folder');
	const afterPaper = approvalIdentity(repo, folder, note);
	check('a pure paperwork commit leaves the worktree identity alone', afterPaper.worktree === base.worktree, JSON.stringify(afterPaper));
	check('the HEAD identity follows the commit: the paper is now committed', afterPaper.head !== base.head);
	// A product change moves the worktree; the HEAD only moves once committed.
	writeFileSync(join(repo, 'src.ts'), 'b\n');
	const uncommitted = approvalIdentity(repo, folder, note);
	check('an uncommitted product change moves the worktree identity only', uncommitted.worktree !== afterPaper.worktree && uncommitted.head === afterPaper.head);
	git('add', '-A');
	git('commit', '-q', '-m', 'fix(x): evil');
	writeFileSync(join(repo, 'src.ts'), 'a\n');
	const restored = approvalIdentity(repo, folder, note);
	check('a committed change hidden by a restored worktree shows in the HEAD identity', restored.worktree === afterPaper.worktree && restored.head !== afterPaper.head, JSON.stringify(restored));
	// The row scope excludes the whole round folder: product/tests only, so it equals a row commit.
	git('add', '-A');
	git('commit', '-q', '-m', 'restore');
	const rowWorktree = worktreeContentSha(repo, folder, null, 'row');
	const rowCommit = commitContentSha(repo, 'HEAD', folder, null, 'row');
	check('the row scope ignores the round folder', rowWorktree === rowCommit);
	// A repro mutation moves the approval identity but not the row identity.
	writeFileSync(join(repo, folder, 'repro/x.spec.ts'), 'test changed\n');
	check('a repro mutation moves the approval identity but not the row identity', approvalIdentity(repo, folder, note).worktree !== restored.worktree && worktreeContentSha(repo, folder, null, 'row') === rowCommit);
	writeFileSync(join(repo, folder, 'repro/x.spec.ts'), 'test\n');
	// A symlink change moves it (git records the link itself).
	let symlinked = false;
	try { symlinkSync('src.ts', join(repo, 'link.ts')); symlinked = true; } catch { /* symlinks need privileges on Windows: skip */ }
	if (symlinked) {
		check('a new symlink moves the identity', worktreeContentSha(repo, folder, note, 'approval') !== restored.worktree);
		rmSync(join(repo, 'link.ts'));
	}
	if (process.platform !== 'win32') {
		chmodSync(join(repo, 'src.ts'), 0o755);
		check('a mode change moves the identity', worktreeContentSha(repo, folder, note, 'approval') !== restored.worktree);
	}
	// The state lock and its atomic-write temps (issue #107) are wf's own; a file wf did not write
	// under .wf still moves the identity (there is no blanket .wf exclusion).
	writeFileSync(join(repo, '.wf', 'state.json.lock'), '{"pid":1}\n');
	writeFileSync(join(repo, '.wf', 'state.json.1234.5.tmp'), 'x\n');
	check('the state lock and its temps are not the implementation', approvalIdentity(repo, folder, note).worktree === restored.worktree);
	writeFileSync(join(repo, '.wf', 'evil.sh'), 'x\n');
	check('another file under .wf is the implementation', approvalIdentity(repo, folder, note).worktree !== restored.worktree);
	rmSync(join(repo, '.wf', 'evil.sh'));
	writeFileSync(join(repo, `${folder}/JIRA.md.1234.ab12cd.tmp`), 'x\n');
	check('deliver\u2019s atomic note temp is not the implementation', approvalIdentity(repo, folder, note).worktree === restored.worktree);
	rmSync(join(repo, `${folder}/JIRA.md.1234.ab12cd.tmp`));
	rmSync(repo, { recursive: true, force: true });
}

// The identity hides exactly what the one owner predicate calls wf's, on the working tree, HEAD and a
// commit: an owned writer temp moves none of them, an unowned numeric-prefix name moves all three.
{
	const { repo, git } = repoOf();
	const note = trackerNotePath(folder);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	git('add', '-A');
	git('commit', '-q', '-m', 'paper');
	const clean = () => ({ w: worktreeContentSha(repo, folder, note, 'approval'), h: headContentSha(repo, folder, note, 'approval'), c: commitContentSha(repo, 'HEAD', folder, note, 'approval') });
	const baseline = clean();
	const owned = ['.wf/state.json.1234.5.tmp', '.wf/state.json.lock.1234.5.tmp', '.wf/state.json.lock.acquiring.1234.5.tmp', `${folder}/JIRA.md.1234.ab12cd.tmp`];
	for (const f of owned) writeFileSync(join(repo, f), 'x\n');
	check('owned writer temps are hidden from the worktree and HEAD identity', clean().w === baseline.w && clean().h === baseline.h, JSON.stringify({ baseline, now: clean() }));
	git('add', '-A');
	git('commit', '-q', '-m', 'owned writer temps');
	check('owned writer temps are hidden from a commit identity too', clean().h === baseline.h && clean().c === baseline.c);
	// The unowned shapes the old `[0-9]*` glob hid: a numeric first character, then anything.
	for (const f of ['.wf/state.json.1evil.2evil.tmp', '.wf/state.json.lock.1evil.2evil.tmp', `${folder}/JIRA.md.1evil.2evil.tmp`, '.wf/state.json.1.2.3.tmp', '.wf/state.json.1234.2evil.tmp']) {
		writeFileSync(join(repo, f), 'x\n');
		check(`unowned ${f} moves the worktree identity (not hidden)`, worktreeContentSha(repo, folder, note, 'approval') !== baseline.w);
		git('add', '-A');
		git('commit', '-q', '-m', `unowned ${f}`);
		check(`unowned ${f} moves the HEAD and commit identity`, headContentSha(repo, folder, note, 'approval') !== baseline.h && commitContentSha(repo, 'HEAD', folder, note, 'approval') !== baseline.c);
		rmSync(join(repo, f));
		git('add', '-A');
		git('commit', '-q', '-m', `drop ${f}`);
		check(`removing unowned ${f} restores the identity`, JSON.stringify(clean()) === JSON.stringify(baseline));
	}
	rmSync(repo, { recursive: true, force: true });
}

// A glob-like round folder's note temp is matched as a path: `r[1]`\u2019s stem must not hide the
// sibling `r1`\u2019s temp (a stem used as a glob would).
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-note-stem-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'src.ts'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	const globFolder = 'bug-reports/r[1]';
	mkdirSync(join(repo, globFolder), { recursive: true });
	mkdirSync(join(repo, 'bug-reports/r1'), { recursive: true });
	const note = trackerNotePath(globFolder);
	writeFileSync(join(repo, `${globFolder}/JIRA.md.1234.ab12cd.tmp`), 'x\n');
	writeFileSync(join(repo, 'bug-reports/r1/JIRA.md.1234.ab12cd.tmp'), 'y\n');
	const withBoth = worktreeContentSha(repo, globFolder, note, 'approval');
	rmSync(join(repo, `${globFolder}/JIRA.md.1234.ab12cd.tmp`));
	const withoutOwn = worktreeContentSha(repo, globFolder, note, 'approval');
	check('a glob-like round folder\u2019s own note temp is hidden', withoutOwn === withBoth);
	rmSync(join(repo, 'bug-reports/r1/JIRA.md.1234.ab12cd.tmp'));
	check('\u2026but the sibling\u2019s same-shaped temp is source, not hidden by the stem as a glob', worktreeContentSha(repo, globFolder, note, 'approval') !== withBoth);
	rmSync(repo, { recursive: true, force: true });
}

// ── binding the verdict to the identities, in its own section ────────────────

const reviewText = (worktree: string, head: string) => `round: r\nbase: main\ncontent-sha: ${worktree}\nhead-sha: ${head}\n\nverdict: approved\n`;
const same = { worktree: 'tree:w', head: 'tree:h' };
check('an approval that names the current worktree and HEAD passes', approvalContentGap(reviewText('tree:w', 'tree:h'), same) === null);
check('a worktree change is refused, naming both', /working tree changed after T2 approved it/.test(approvalContentGap(reviewText('tree:w', 'tree:h'), { worktree: 'tree:x', head: 'tree:h' }) ?? ''));
check('a committed change a restored worktree hides is refused', /committed implementation changed after T2 approved it/.test(approvalContentGap(reviewText('tree:w', 'tree:h'), { worktree: 'tree:w', head: 'tree:e' }) ?? ''));
check('a review with no shas in its section (legacy) is refused rather than trusted', /no content-sha\/head-sha/.test(approvalContentGap('round: r\nverdict: approved\n', same) ?? ''));
check('a later verdict uses its own section\'s shas', approvalContentGap(`content-sha: tree:a\nhead-sha: tree:a\nverdict: approved\n\n## 2026-10-09\ncontent-sha: tree:w\nhead-sha: tree:h\nverdict: approved\n`, same) === null);
check('a verdict cannot borrow a later header\'s shas across a section boundary', approvalContentGap(`content-sha: tree:w\nhead-sha: tree:h\nverdict: approved\n\n## 2026-10-09\ncontent-sha: tree:z\nhead-sha: tree:z\n`, { worktree: 'tree:z', head: 'tree:z' })?.includes('changed after T2') === true);
check('approvalBinding pairs the verdict with its own section', JSON.stringify(approvalBinding(`content-sha: tree:w\nhead-sha: tree:h\nverdict: approved\n\n## 2026-10-09\ncontent-sha: tree:z\nhead-sha: tree:z\nverdict: pending (…)\n`)) === JSON.stringify({ verdict: 'approved', contentSha: 'tree:w', headSha: 'tree:h' }) && approvalBinding('no verdict\n').verdict === null);

check('deliver: T2 approved the current worktree and HEAD → eligible', t2Gap({ step: 'pr' }, reviewText('tree:w', 'tree:h'), same) === null);
check('deliver: the worktree moved → refused', t2Gap({ step: 'pr' }, reviewText('tree:w', 'tree:h'), { worktree: 'tree:x', head: 'tree:h' })?.includes('working tree changed') === true);
check('deliver: HEAD moved under a restored worktree → refused', t2Gap({ step: 'pr' }, reviewText('tree:w', 'tree:h'), { worktree: 'tree:w', head: 'tree:e' })?.includes('committed implementation changed') === true);
check('deliver: an approved review with no shas → refused', t2Gap({ step: 'pr' }, 'verdict: approved\n', same)?.includes('no content-sha/head-sha') === true);
check('deliver: a caller without an identity still gets the verdict-only arm', t2Gap({ step: 'pr' }, 'verdict: approved\n') === null);

const skel = renderSkeleton({ round: 'r', klass: 'A', base: 'main', contentSha: 'tree:w', headSha: 'tree:h', files: [] });
check('the review header names the worktree and HEAD the verdict binds to', lastField(skel, 'content-sha') === 'tree:w' && lastField(skel, 'head-sha') === 'tree:h', skel);
check('a T1 skeleton (no diff) carries no content-sha', lastField(renderSkeleton({ round: 'r', files: [] }), 'content-sha') === null);
check('a re-open needs a fresh header when either identity moved', needsFreshReviewHeader(null, 'tree:w', 'tree:h') && needsFreshReviewHeader({ contentSha: 'tree:w', headSha: 'tree:e' }, 'tree:w', 'tree:h') && needsFreshReviewHeader({ contentSha: 'tree:x', headSha: 'tree:h' }, 'tree:w', 'tree:h') && !needsFreshReviewHeader({ contentSha: 'tree:w', headSha: 'tree:h' }, 'tree:w', 'tree:h'));

check('a check line records the content when it has one and omits the field when not', JSON.parse(checkRunLine({ ts: 't', row: 1, rowCheck: 'x', tasks: [], result: 'green', content: 'tree:a' })).content === 'tree:a' && !('content' in JSON.parse(checkRunLine({ ts: 't', row: 1, rowCheck: 'x', tasks: [], result: 'green' }))));
check('a suite run that rewrote the tree records `changed`, not green', JSON.parse(suitesLine({ ts: 't', head: 'h', runs: [{ label: 's', exit: 0, output: '' }], gap: 'changed', content: 'tree:a' })).result === 'changed' && JSON.parse(suitesLine({ ts: 't', head: 'h', runs: [{ label: 's', exit: 0, output: '' }] })).result === 'green');
check('an unreadable before/after snapshot is `unavailable`, not green and not silently unchanged', identityGap(undefined, 'tree:a') === 'unavailable' && identityGap('tree:a', undefined) === 'unavailable' && identityGap('tree:a', 'tree:b') === 'changed' && identityGap('tree:a', 'tree:a') === null);

// ── real CLI arms ────────────────────────────────────────────────────────────

const runCli = (cwd: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) => new Promise<{ status: number | null; out: string }>((resolve) => {
	const env: NodeJS.ProcessEnv = { ...process.env, CLAUDECODE: '1', ...extraEnv };
	for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
	const child = spawn(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd, env });
	let out = '';
	child.stdout.on('data', (d) => { out += d; });
	child.stderr.on('data', (d) => { out += d; });
	child.on('close', (status) => resolve({ status, out }));
});
// The two `wf deliver` arms below reach the remote half, which with the real seams would shell out to
// the person's `gh` and read a production remote. A preload plugs seams.gh in the child before run.ts
// so the PR lookup answers [] (no PR) and nothing contacts GitHub; both arms stop before a merge. The
// file lives outside every fixture repo: an untracked file inside one would move the identity #106
// binds the approval to.
const FAKE_GH_DIR = mkdtempSync(join(tmpdir(), 'wf-fake-gh-'));
const fakeGhEnv = (name: string) => {
	const file = join(FAKE_GH_DIR, `${name}.mjs`);
	writeFileSync(file, `import { plug } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src', 'seams.ts')).href)};\nplug({ gh: () => ({ status: 0, stdout: '[]', stderr: '' }) });\n`);
	return { NODE_OPTIONS: `--import=${pathToFileURL(file).href}` };
};
// The stack `wf review` starts: an HTTP server on the branch's port answers its probe, so no servers start.
const withStack = async <T>(branch: string, fn: () => Promise<T>): Promise<T> => {
	const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
	await new Promise<void>((resolve) => server.listen(basePortForBranch(branch), resolve));
	try { return await fn(); } finally { server.close(); }
};
const cliRepo = (branch: string) => {
	const repo = mkdtempSync(join(tmpdir(), 'wf-cli-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src/x.ts'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('checkout', '-q', '-b', branch);
	mkdirSync(join(repo, folder, 'repro'), { recursive: true });
	writeFileSync(join(repo, folder, 'repro/run.spec.ts'), 'test\n');
	writeFileSync(join(repo, folder, 'TICKET.md'), '# 106 - ticket\n\n## Intent\n\n- "x": fix the thing\n');
	writeFileSync(join(repo, folder, 'ASSESSMENT.md'), '# 106 - assessment\nVerdict: clean\n\nhead: deadbeef\n\n## Intent\n- "x": met: src/x.ts:1 - before: a - after: b\n');
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: '106', id: '106', folder, base: 'main', step: 'review', class: 'A' }, null, 2)}\n`);
	return { repo, git };
};
const approve = async (repo: string, branch: string) => {
	await runCli(repo, ['review', branch]);
	writeFileSync(join(repo, folder, 'REVIEW.md'), `${readFileSync(join(repo, folder, 'REVIEW.md'), 'utf8')}\nverdict: approved\n`);
};

// approve → change → refuse; unchanged → eligible; repro mutation refuses; a REVIEW-only change passes.
{
	const branch = 'feat/106';
	const { repo } = cliRepo(branch);
	const reviewFile = join(repo, folder, 'REVIEW.md');
	await withStack(branch, async () => {
		await runCli(repo, ['review', branch]);
		check('wf review opens and records the worktree and HEAD it is judging', readFileSync(reviewFile, 'utf8').includes('content-sha: tree:') && readFileSync(reviewFile, 'utf8').includes('head-sha: tree:'));
		writeFileSync(reviewFile, `${readFileSync(reviewFile, 'utf8')}\nverdict: approved\n`);
		const eligible = await runCli(repo, ['review', branch, '--done']);
		check('unchanged after approval → eligible', eligible.status === 0, eligible.out);
		writeFileSync(join(repo, 'src/x.ts'), 'b\n');
		const changed = await runCli(repo, ['review', branch, '--done']);
		check('a product change after approval → refused', changed.status === 2 && changed.out.includes('the working tree changed after T2 approved it'), changed.out);
		writeFileSync(join(repo, 'src/x.ts'), 'a\n');
		writeFileSync(join(repo, folder, 'repro/run.spec.ts'), 'test changed\n');
		const repro = await runCli(repo, ['review', branch, '--done']);
		check('a repro mutation after approval → refused', repro.status === 2 && repro.out.includes('the working tree changed after T2 approved it'), repro.out);
		writeFileSync(join(repo, folder, 'repro/run.spec.ts'), 'test\n');
		writeFileSync(reviewFile, `${readFileSync(reviewFile, 'utf8')}\ncomments:\nsrc/x.ts:1 — keep this\n`);
		const paperwork = await runCli(repo, ['review', branch, '--done']);
		check('a REVIEW.md-only change keeps the approval', paperwork.status === 0, paperwork.out);
	});
	rmSync(repo, { recursive: true, force: true });
}

// the HIGH hole: commit a change, restore the working tree — the approval must not pass.
{
	const branch = 'feat/106h';
	const { repo, git } = cliRepo(branch);
	await withStack(branch, async () => {
		await approve(repo, branch);
		const ok = await runCli(repo, ['review', branch, '--done']);
		check('the HIGH arm: approved and eligible first', ok.status === 0, ok.out);
		// Commit EVIL, then restore the working tree to the approved bytes.
		writeFileSync(join(repo, 'src/x.ts'), 'evil\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'fix(x): evil');
		writeFileSync(join(repo, 'src/x.ts'), 'a\n');
		const done = await runCli(repo, ['review', branch, '--done']);
		check('a committed change hidden by a restored worktree → refused', done.status === 2 && done.out.includes('the committed implementation changed after T2 approved it'), done.out);
		writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: '106', id: '106', folder, base: 'main', step: 'pr', class: 'A' }, null, 2)}\n`);
		const delivered = await runCli(repo, ['deliver']);
		check('deliver refuses it before any remote', delivered.status === 2 && delivered.out.includes('the committed implementation changed after T2 approved it') && !delivered.out.includes('git push'), delivered.out);
	});
	rmSync(repo, { recursive: true, force: true });
}

// a staged product change is not swept into the round-folder commit.
{
	const branch = 'feat/106s';
	const { repo, git } = cliRepo(branch);
	// A github.com origin deliver can pin, with git's transport rewritten to a path that is not a repo:
	// the round-folder commit and its post-check run, then the push fails as before (#108 reads origin
	// before any mutation, so an origin-less repo would be refused before that commit).
	execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git'], { encoding: 'utf8' });
	execFileSync('git', ['-C', repo, 'config', `url.${pathToFileURL(join(repo, 'nowhere.git')).href}.insteadOf`, 'https://github.com/o/r.git'], { encoding: 'utf8' });
	await withStack(branch, async () => {
		await approve(repo, branch);
		const ok = await runCli(repo, ['review', branch, '--done']);
		check('the staged arm: approved and eligible first', ok.status === 0, ok.out);
	});
	// Stage EVIL, restore the working tree to the approved bytes.
	writeFileSync(join(repo, 'src/x.ts'), 'evil\n');
	git('add', 'src/x.ts');
	writeFileSync(join(repo, 'src/x.ts'), 'a\n');
	const delivered = await runCli(repo, ['deliver'], fakeGhEnv('staged')); // the transport is nowhere: the push fails, but the round-folder commit already ran
	const lastFiles = execFileSync('git', ['-C', repo, 'show', '--name-only', '--format=', 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);
	check('the round-folder commit carries only the round folder, not the staged product', lastFiles.length > 0 && lastFiles.every((f) => f.startsWith(`${folder}/`)), `${delivered.out}\n${lastFiles.join(',')}`);
	check('deliver did not refuse the staged change as swept (it was not)', !delivered.out.includes('changed the implementation T2 approved') || delivered.out.includes('the push hook'), delivered.out);
	rmSync(repo, { recursive: true, force: true });
}

// deliver refuses a stale approval before it touches a remote.
{
	const branch = 'feat/106d';
	const { repo } = cliRepo(branch);
	execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://127.0.0.1:1/nope.git'], { encoding: 'utf8' });
	await withStack(branch, async () => {
		await approve(repo, branch);
	});
	const approved = await runCli(repo, ['review', branch, '--done']);
	check('the stale-deliver arm: approved and eligible first', approved.status === 0, approved.out);
	writeFileSync(join(repo, 'src/x.ts'), 'b\n');
	const stale = await runCli(repo, ['deliver']);
	check('deliver refuses a stale approval before any remote contact', stale.status === 2 && stale.out.includes('the working tree changed after T2 approved it') && !stale.out.includes('git push') && !stale.out.includes('FAILED: gh'), stale.out);
	// A review from before the field is refused rather than trusted.
	writeFileSync(join(repo, folder, 'REVIEW.md'), 'round: 106\nbase: main\nverdict: approved\n');
	const legacy = await runCli(repo, ['deliver']);
	check('deliver refuses an approval with no shas', legacy.status === 2 && legacy.out.includes('no content-sha/head-sha'), legacy.out);
	rmSync(repo, { recursive: true, force: true });
}

// a check that mutates the tree refuses to mint a green for the bytes it did not all measure.
{
	const branch = 'feat/106m';
	const { repo } = cliRepo(branch);
	writeFileSync(join(repo, folder, 'TICKET.md'), `# r\n\n## Intent\n\n- "x": fix the thing\n\n## Verification\n\n| # | case | files | check |\n|---|---|---|---|\n| 1 | fix(x): one | src/x.ts | repro |\n\n## Repro\ncommand: node ${folder}/repro/mutate.mjs\n`);

	writeFileSync(join(repo, folder, 'repro/mutate.mjs'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('src/x.ts', 'mutated\\n');\n");
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: '106', id: '106', folder, base: 'main', step: 'build', class: 'A' }, null, 2)}\n`);
	const before = worktreeContentSha(repo, folder, null, 'row');
	await withStack(branch, async () => {
		const res = await runCli(repo, ['check']);
		check('a mutating check refuses', res.status === 1 && res.out.includes('the check rewrote files'), res.out);
	});
	const after = worktreeContentSha(repo, folder, null, 'row');
	const line = JSON.parse(readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').trim().split('\n').at(-1)!);
	check('the check mutated the tree', after !== before);
	check('the run is recorded `changed`, not green', line.result === 'changed' && line.content === after && line.content !== before, JSON.stringify(line));
	rmSync(repo, { recursive: true, force: true });
}

// a round folder that looks like a glob must not drop its sibling from the identity.
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-glob-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'src.ts'), 'a\n');
	mkdirSync(join(repo, 'bug-reports/r1'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r1/PLAN.md'), 'sibling\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	const globFolder = 'bug-reports/r[1]';
	mkdirSync(join(repo, globFolder), { recursive: true });
	writeFileSync(join(repo, globFolder, 'PLAN.md'), 'plan\n');
	// The row scope excludes the whole round folder; its pathspec must be literal, or `r[1]` globs
	// the sibling `r1` out of the identity.
	const before = worktreeContentSha(repo, globFolder, null, 'row');
	writeFileSync(join(repo, 'bug-reports/r1/PLAN.md'), 'sibling changed\n');
	check('a glob-like round folder does not drop its sibling from the identity', worktreeContentSha(repo, globFolder, null, 'row') !== before);
	rmSync(repo, { recursive: true, force: true });
}

// re-opening review after a committed change records the new content and does not reuse the verdict.
{
	const branch = 'feat/106re';
	const { repo, git } = cliRepo(branch);
	const reviewFile = join(repo, folder, 'REVIEW.md');
	await withStack(branch, async () => {
		await approve(repo, branch);
		const first = await runCli(repo, ['review', branch, '--done']);
		check('re-open arm: the first approval is eligible', first.status === 0, first.out);
		writeFileSync(join(repo, 'src/x.ts'), 'b\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'fix(x): two');
		const reopened = await runCli(repo, ['review', branch]);
		check('re-opening after a committed change records the new content', reopened.status === 0 && readFileSync(reviewFile, 'utf8').split('head-sha: ').at(-1)!.startsWith('tree:'), reopened.out);
		const staleAgain = await runCli(repo, ['review', branch, '--done']);
		check('the old approval is not reused for the changed content', staleAgain.status === 2 && staleAgain.out.includes('after T2 approved it'), staleAgain.out);
		writeFileSync(reviewFile, `${readFileSync(reviewFile, 'utf8')}\nverdict: approved\n`);
		const again = await runCli(repo, ['review', branch, '--done']);
		check('a fresh verdict on the changed content is eligible', again.status === 0, again.out);
	});
	rmSync(repo, { recursive: true, force: true });
}

// uncommitted product is refused at review opening: the review screen shows the committed branch.
{
	const branch = 'feat/106u';
	const { repo } = cliRepo(branch);
	writeFileSync(join(repo, 'src/x.ts'), 'uncommitted\n');
	await withStack(branch, async () => {
		const opened = await runCli(repo, ['review', branch]);
		check('uncommitted product is refused at review opening', opened.status === 2 && opened.out.includes('changed but not committed'), opened.out);
	});
	rmSync(repo, { recursive: true, force: true });
}

// a push hook that mutates after approval cannot keep the approval and reach a merge.
{
	const branch = 'feat/106hk';
	const { repo } = cliRepo(branch);
	const bare = mkdtempSync(join(tmpdir(), 'wf-bare-'));
	execFileSync('git', ['init', '-q', '--bare', bare], { encoding: 'utf8' });
	// A github.com origin deliver can pin, with git's transport rewritten to the local bare repo (#108):
	// the trusted local remap keeps working, and the real push runs the hook below.
	execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/o/r.git'], { encoding: 'utf8' });
	execFileSync('git', ['-C', repo, 'config', `url.${pathToFileURL(bare).href}.insteadOf`, 'https://github.com/o/r.git'], { encoding: 'utf8' });
	writeFileSync(join(repo, folder, 'PLAN.md'), '# plan\n\n## Commits\n\n| # | message | files | check |\n|---|---|---|---|\n| 1 | fix(x): one | src/x.ts | — |\n');
	// The round is docs-only for `wf check` (no product change in the diff), so deliver reaches the push;
	// the hook below mutates a product file after the approval, which the approval recheck must catch.
	await withStack(branch, async () => {
		await approve(repo, branch);
	});
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: '106', id: '106', folder, base: 'main', step: 'pr', class: 'A' }, null, 2)}\n`);
	const hook = join(repo, '.git', 'hooks', 'pre-push');
	mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
	writeFileSync(hook, '#!/bin/sh\necho h >> src/x.ts\n');
	try { chmodSync(hook, 0o755); } catch { /* Windows: git-for-windows runs the hook without the bit */ }
	const delivered = await runCli(repo, ['deliver'], fakeGhEnv('hook'));
	check('a push hook that mutates after approval is refused before the PR/merge', delivered.status === 2 && delivered.out.includes('the push hook changed the implementation T2 approved') && !delivered.out.includes('FAILED: gh'), delivered.out);
	rmSync(repo, { recursive: true, force: true });
	rmSync(bare, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
