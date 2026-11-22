// foreign-paperwork.selfcheck.ts — node foreign-paperwork.selfcheck.ts → exit 0 when green.
// The 2026-11-19 crossover against real git: two worktrees of one repository, each round's agent stashes
// and pops in the order the session logs show, and the first round's REVIEW.md lands in the second's
// worktree. foreignApprovalGap refuses it there; the round's own records and old rounds' records
// committed on the base are not refused.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foreignApprovalGap, foreignApprovalRecords } from './foreign-paperwork.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-foreign-paperwork-'));
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

const A = 'bug-reports/fix-a';
const B = 'bug-reports/feat-b';
try {
	check('another round\'s REVIEW.md, CHECKPOINT-REVIEW.md and AGREEMENT-REVIEW.md are foreign',
		foreignApprovalRecords([`${A}/REVIEW.md`, `${A}/CHECKPOINT-REVIEW.md`, `${A}/AGREEMENT-REVIEW.md`], B, 'bug-reports').length === 3);
	check('the round\'s own records, other files and records outside the rounds folder are not',
		foreignApprovalRecords([`${B}/REVIEW.md`, `${B}/sub/REVIEW.md`, `${A}/TICKET.md`, `${A}/proof/after-x.png`, 'docs/REVIEW.md'], B, 'bug-reports').length === 0);
	check('a folder whose name extends this round\'s is another round', foreignApprovalRecords([`${B}-2/REVIEW.md`], B, 'bug-reports').length === 1);
	check('Windows separators are read as the same path', foreignApprovalRecords(['bug-reports\\fix-a\\REVIEW.md'], 'bug-reports\\feat-b', 'bug-reports').length === 1);

	// One repository, an old round's REVIEW.md committed on the base, and the two rounds' worktrees.
	const main = join(ROOT, 'main');
	mkdirSync(join(main, 'bug-reports', 'old'), { recursive: true });
	git(ROOT, 'init', '-q', '-b', 'dev', main);
	writeFileSync(join(main, 'app.txt'), 'app\n');
	writeFileSync(join(main, 'bug-reports', 'old', 'REVIEW.md'), 'verdict: approved\n');
	git(main, 'add', '-A');
	git(main, 'commit', '-qm', 'base');
	const a = join(ROOT, 'a');
	const b = join(ROOT, 'b');
	git(main, 'worktree', 'add', '-q', '-b', 'fix/a', a);
	git(main, 'worktree', 'add', '-q', '-b', 'feat/b', b);
	mkdirSync(join(a, A), { recursive: true });
	mkdirSync(join(b, B), { recursive: true });
	writeFileSync(join(a, A, 'REVIEW.md'), 'verdict: approved (round a)\n');
	writeFileSync(join(b, B, 'REVIEW.md'), 'verdict: approved (round b)\n');
	writeFileSync(join(b, 'app.txt'), 'app, regenerated\n');
	check('before the crossover each worktree holds only its own records', foreignApprovalGap(a, A, 'dev') === null && foreignApprovalGap(b, B, 'dev') === null);

	git(a, 'stash', 'push', '-u', '-q', '-m', 'review', '--', `${A}/REVIEW.md`); // JX-1266, 17:14:12Z
	git(b, 'stash', '-q'); // JX-705, 17:14:14Z
	git(a, 'stash', 'pop', '-q'); // JX-1266, after its rebase: takes the top entry, round b's
	git(b, 'stash', 'pop', '-q'); // JX-705, after generate:api: takes round a's REVIEW.md
	check('the crossover reproduces: round a\'s REVIEW.md is in round b\'s worktree, not in its own', existsSync(join(b, A, 'REVIEW.md')) && !existsSync(join(a, A, 'REVIEW.md')));
	const gap = foreignApprovalGap(b, B, 'dev');
	check('round b refuses it, naming the file, the stash and what to do', !!gap && gap.startsWith(`${A}/REVIEW.md is another round's approval record, not this round's (${B})`) && /git stash/.test(gap) && /Never commit it here/.test(gap), gap ?? 'null');
	check('…round a, missing its own record, is not refused for it', foreignApprovalGap(a, A, 'dev') === null);

	// Committed on round b's branch, it is still refused; deleted from the worktree, it is not.
	git(b, 'add', `${A}/REVIEW.md`);
	git(b, 'commit', '-qm', 'carry round a\'s review');
	check('a record committed on the branch is refused', foreignApprovalGap(b, B, 'dev')?.startsWith(`${A}/REVIEW.md is another round's`) === true);
	git(b, 'rm', '-q', `${A}/REVIEW.md`);
	git(b, 'commit', '-qm', 'take it out');
	git(b, 'rm', '-q', 'bug-reports/old/REVIEW.md');
	check('removed from the branch, and an old round\'s record deleted, nothing is refused', foreignApprovalGap(b, B, 'dev') === null, foreignApprovalGap(b, B, 'dev') ?? '');
	check('an unreadable base is refused, not passed', /could not list the branch's files/.test(foreignApprovalGap(b, B, 'no-such-ref') ?? ''));
} finally {
	rmSync(ROOT, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
