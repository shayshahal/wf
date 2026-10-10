// deliver.selfcheck.ts — node deliver.selfcheck.ts → exit 0 when green.
// Fixture agreement + assessment → the PR title, the PR body, the tracker note.
import { commitRows, deliveryResume, existingNoteAction, githubPrRepo, githubRepo, hookRefused, noteComplete, originTarget, prBody, prLookup, prTitle, redactRemote, refusedPushSection, t2Gap } from './deliver.ts';
import type { State } from '../round/state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// The current contract is process/AGREEMENT-TEMPLATE.md and prompts/assess.md, not a legacy
// PLAN.md/VALIDATION.md: a class B agreement (Observed + Agreed + Verification + Units) and a final
// assessment (Verdict/head + Intent/Behavior and evidence/Design/Standards). The commit subject is
// deliberately NOT the case name: the formatter must list the two independently (#112).
const ticket = ['# BJEW-1 — the code never arrives', '', '## Intent', '- Shay, 2026-01-01: "the code never arrives"'].join('\r\n');
const agreement = [
	'# AGREEMENT — BJEW-1 · «the code never arrives»',
	'',
	'2026-01-01 · Round `fix/bjew-1`, base `dev`. Class `B`.',
	'',
	'## Observed',
	'',
	'- auth.py:599 discards the send result',
	'',
	'## Agreed',
	'',
	'- **Behavior.** capture the result and raise at the caller',
	'- **Excluding.** the SMS provider',
	'- **Choice.** raise at the caller, not the callee',
	'- **Verification.** the cases below',
	'- **T2 walk.** open: /login as shay',
	'',
	'## Verification',
	'',
	'| # | case | files | check |',
	'|---|---|---|---|',
	'| 1 | fix(auth): the send result raises | `packages/backend/app/api/auth.py` | `packages/backend/app/api/auth.spec.ts::raises@12` |',
	'',
	'## Units',
	'',
	'1. capture the result',
	'2. raise at the caller',
].join('\n');
const assessment = [
	'# BJEW-1 — final assessment',
	'Verdict: clean',
	'head: abc123',
	'',
	'## Intent',
	'- the code never arrives: met: auth.py:1 · before: discarded · after: raised',
	'',
	'## Behavior and evidence',
	'`wf check` green on auth.spec.ts::raises@12',
	'',
	'## Design',
	'none',
	'',
	'## Standards',
	'- error handling: followed',
].join('\n');
const commitLines = ['- abc1234 fix(auth): raise at the caller', '- def5678 docs(BJEW-1): round folder: ticket, agreement, assessment, repro'];
const body = prBody({ ticket, agreement, commitLines, assessment, agreementPath: 'bug-reports/bjew-1/AGREEMENT.md' });
const visible = body.slice(0, body.indexOf('<details>'));

check('the PR title is the ticket’s own title', prTitle({ ticket, agreement, commitLines }) === 'BJEW-1 — the code never arrives');
check('with no TICKET.md the title is the newest commit, never the oldest', prTitle({ ticket: '', agreement, commitLines }) === 'fix(auth): raise at the caller');
check('the body leads with the round folder, then Intent and the agreed material', body.startsWith('Round folder: `bug-reports/bjew-1/`\n\n## Intent\n\n- Shay, 2026-01-01: "the code never arrives"\n\n## Agreement\n\n- auth.py:599 discards the send result\n\n- **Behavior.** capture the result and raise at the caller'));
check('the agreed behavior is the reviewer’s material, not the agreement’s template preamble', body.includes('**T2 walk.** open: /login as shay') && !body.includes('Round `fix/bjew-1`, base `dev`. Class `B`'));
check('class A: the ticket is the agreement, so Agreement carries its Intent', prBody({ ticket, agreement: ticket, commitLines, assessment, agreementPath: 'bug-reports/bjew-1/TICKET.md' }).includes('## Agreement\n\n- Shay, 2026-01-01: "the code never arrives"'));
// A commit is not a case (#112): the Commits table lists what landed; the Verification table lists
// what `wf check` proves. The case name here matches no commit subject, and neither names the other.
check('the commits are one row per pushed commit, no case, hash or check joined to them', body.includes('## Commits\n\n| commit | message |\n|---|---|\n| abc1234 | fix(auth): raise at the caller |') && body.includes('| def5678 | docs(BJEW-1): round folder: ticket, agreement, assessment, repro |'));
check('the verification cases are listed separately, with no commit hash in them', body.includes('## Verification\n\n| # | case | check |\n|---|---|---|\n| 1 | fix(auth): the send result raises | `packages/backend/app/api/auth.spec.ts::raises@12` |') && !/## Verification[\s\S]*abc1234/.test(body));
check('the case name and the commit subject need not match, and the files cell and Row instructions are gone', !body.includes('app/api/auth.py |') && !body.includes('Row 1:') && body.indexOf('fix(auth): raise at the caller') < body.indexOf('fix(auth): the send result raises'));
check('the T2 walk and the assessment verdict/head/intent/evidence/design/standards are there', body.includes('## T2 walk\n\nopen: /login as shay') && body.includes('## Assessment\n\nVerdict: clean\nhead: abc123') && body.includes('### Intent\n\n- the code never arrives: met: auth.py:1 · before: discarded · after: raised') && body.includes('### Behavior and evidence\n\n`wf check` green on auth.spec.ts::raises@12') && body.includes('### Design\n\nnone') && body.includes('### Standards\n\n- error handling: followed'));
check('the agreement’s working notes (units) are folded, not in what the reviewer reads first', body.includes('<summary>Working notes — units</summary>') && body.includes('1. capture the result') && !visible.includes('1. capture the result'));
check('no legacy plan/validation machinery survives: no Approach, Not doing, Build, Suites or Plan history', !body.includes('## Approach') && !body.includes('## Not doing') && !body.includes('## Build') && !body.includes('## Suites') && !body.includes('## Unplanned') && !body.includes('Plan history') && !body.includes('Revision ('));
check('a body under the budget is not called shortened', !body.includes('Shortened:') && body.trimEnd().endsWith('</details>'));
check('an empty agreement gives a commits table of the pushed commits alone', JSON.stringify(commitRows(['- abc1234 one'])) === JSON.stringify(['| abc1234 | one |']) && JSON.stringify(commitRows(['not a commit line'])) === '[]');

// Over the budget the working-notes fold goes first, then the assessment’s detail, then the oldest
// commits — and the body says where the round folder’s own text is.
const row = (n: number) => `| ${n} | feat(x): case ${n} | a.ts | node --test |`;
const rows18 = Array.from({ length: 18 }, (_, i) => row(i + 1));
const bigTicket = ['# JX-1 — a big round', '', '## Intent', '- the ask'].join('\n');
const bigAgreement = ['# AGREEMENT — JX-1 · «a big round»', '', '## Observed', '', '- fact:1', '', '## Agreed', '', '- **Behavior.** a', '- **T2 walk.** open: /users/1', '', '## Verification', '| # | case | files | check |', ...rows18, '', '## Units', '', 'u'.repeat(70000)].join('\n');
const bigCommits = Array.from({ length: 18 }, (_, i) => `- c${i}abcd feat(x): case ${i + 1}`);
const bigAssessment = `# JX-1 — final assessment\nVerdict: clean\nhead: abc\n\n## Intent\n- the ask: met: a.ts:1 · before: red · after: green\n\n## Behavior and evidence\n${'e'.repeat(2000)}\n\n## Design\nnone`;
const fit = prBody({ ticket: bigTicket, agreement: bigAgreement, commitLines: bigCommits, assessment: bigAssessment, agreementPath: 'bug-reports/jx-1/AGREEMENT.md' });
check('a 70k working-notes fold gives a body under the GitHub limit', bigAgreement.length > 65536 && fit.length < 65536, `${bigAgreement.length} -> ${fit.length}`);
check('the shortened body keeps Intent, the agreed behavior, the commits, Verification, T2 walk and the verdict', fit.includes('- the ask') && fit.includes('**Behavior.** a') && fit.includes('| c17abcd | feat(x): case 18 |') && fit.includes('## Verification') && fit.includes('open: /users/1') && fit.includes('Verdict: clean'));
check('the working notes go first, and the body says where the agreement is', !fit.includes('uuuuuuuuuu') && fit.includes('`bug-reports/jx-1/AGREEMENT.md`') && !fit.includes('<details>'));

// Still over with the notes gone: the assessment’s detail is cut, least consequential first, and the
// marker names the file. The verdict and the intent judgement stay.
const hugeAssessment = `# JX-1 — final assessment\nVerdict: clean\nhead: abc\n\n## Intent\n- the ask: met: a.ts:1 · before: red · after: green\n\n## Behavior and evidence\n${'e'.repeat(70000)}`;
const huge = prBody({ ticket: bigTicket, agreement: bigAgreement, commitLines: bigCommits, assessment: hugeAssessment, agreementPath: 'bug-reports/jx-1/AGREEMENT.md' });
check('a huge assessment section is cut with a marker, keeping the verdict and the Intent judgement', huge.length < 65536 && !huge.includes('eeeeeeeeee') && huge.includes('### Behavior and evidence\n\n(cut here, in `bug-reports/jx-1/ASSESSMENT.md`)') && huge.includes('Verdict: clean') && huge.includes('### Intent\n\n- the ask: met: a.ts:1 · before: red · after: green'), `${huge.length}`);
check('an agreement that fits is not shortened', !prBody({ ticket, agreement, commitLines: ['- a b'], assessment, agreementPath: 'bug-reports/bjew-1/AGREEMENT.md' }).includes('Shortened:'));

// The commits alone over the budget: the oldest go, a quarter at a time, and the count says how many.
const hugeCommits = Array.from({ length: 3000 }, (_, i) => `- c${i} feat(x): a long commit message to fill the list ${i}`);
const hugeBody = prBody({ ticket: bigTicket, agreement: '', commitLines: hugeCommits, assessment: '', agreementPath: 'bug-reports/jx-1/AGREEMENT.md' });
check('thousands of commits are cut down to the newest, with a count of the rest', hugeBody.length < 65536 && hugeBody.includes('| c0 | feat(x): a long commit message to fill the list 0 |') && !hugeBody.includes('list 2999') && hugeBody.includes('earlier commits in the branch'), `${hugeBody.length}`);

// T2 is local and first: deliver merges, so it runs only after T2 approved (Shay, 2026-09-27).
// A push the pre-push hook refused becomes a T2 fix (TJEW-670, 2026-09-28).
const noise = Array.from({ length: 40 }, (_, i) => `  (node) warning ${i}`).join('\n');
const refusedOutput = `  packages/frontend/admin/src/lib/x.ts\n    :1 probe CRITICAL\n${noise}\n│ fallow-audit\n✗ complexity: 1 finding\nsummary: (done in 60s)\n✘ fallow-audit\nerror: failed to push some refs\nhook: pre-push`;
check('a hook refusal is told from a network one', hookRefused(refusedOutput) && !hookRefused('fatal: unable to access https://github.com/: Could not resolve host'));
const section = refusedPushSection(refusedOutput, '2026-09-28');
check('the refusal is one changes-requested verdict, the one wf next counts', [...`verdict: approved\n${section}`.matchAll(/^verdict:\s*changes-requested\s*$/gm)].length === 1 && section.includes('    ✗ complexity: 1 finding') && section.includes('packages/frontend/admin/src/lib/x.ts') && section.includes(':1 probe CRITICAL') && !section.includes('warning 39'), section);
check('T2 approved: deliver may run', t2Gap({ step: 'pr' }, 'verdict: approved\n') === null);
check('before T2, T2 pending or changes requested: refused', ([[{ step: 'implement' }, null], [{ step: 'review' }, 'verdict: pending'], [{ step: 'pr' }, 'verdict: changes-requested'], [{ step: 'pr' }, null]] satisfies [State, string | null][]).every(([s, r]) => t2Gap(s, r)?.startsWith('T2 has not approved')));

// The remote half (issue 108): a gh that failed, answered junk, or answered a nonempty list deliver
// cannot wholly read is `unknown`, never "no PR"; several PRs for a reused branch are ambiguous; a
// merged PR without the head commit it landed, or for another commit, is not this delivery's.
const gh = (status: number | null, stdout: string, stderr = '') => ({ status, stdout, stderr });
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const prRow = (over: Record<string, unknown>) => ({ url: 'https://x/pull/1', state: 'OPEN', headRefName: 'fix/108', baseRefName: 'dev', isCrossRepository: false, ...over });
check('a gh failure is unknown, not none', prLookup(gh(1, '', 'error connecting to api.github.com')).kind === 'unknown');
check('a non-JSON answer is unknown', prLookup(gh(0, 'not json')).kind === 'unknown');
check('a JSON answer that is not an array is unknown', prLookup(gh(0, '{"url":"x"}')).kind === 'unknown');
check('an empty array is none: the branch has no PR', prLookup(gh(0, '[]')).kind === 'none');
check('a nonempty array of unusable rows is unknown, not none', prLookup(gh(0, '[{}]')).kind === 'unknown');
check('a row without a state is unknown', prLookup(gh(0, JSON.stringify([prRow({ state: undefined })]))).kind === 'unknown');
check('a row in a state deliver cannot act on is unknown', prLookup(gh(0, JSON.stringify([prRow({ state: 'DRAFT' })]))).kind === 'unknown');
check('a head commit that is not a commit id is unknown', prLookup(gh(0, JSON.stringify([prRow({ state: 'MERGED', headRefOid: 'aaa' })]))).kind === 'unknown');
const merged = gh(0, JSON.stringify([prRow({ state: 'MERGED', headRefOid: SHA })]));
check('a lone merged PR is found with its state and head', JSON.stringify(prLookup(merged)) === JSON.stringify({ kind: 'found', url: 'https://x/pull/1', state: 'MERGED', headRefOid: SHA }));
check('the head, base and repository are checked against the query', prLookup(merged, { headRefName: 'fix/108', baseRefName: 'dev' }).kind === 'found' && prLookup(merged, { headRefName: 'other', baseRefName: 'dev' }).kind === 'unknown' && prLookup(merged, { headRefName: 'fix/108', baseRefName: 'main' }).kind === 'unknown' && prLookup(gh(0, JSON.stringify([prRow({ state: 'OPEN', isCrossRepository: true })])), { headRefName: 'fix/108', baseRefName: 'dev' }).kind === 'unknown');
// The repository identity (issue 108): origin's own target, never gh's inferred default. A remote
// deliver cannot read as a github.com repository is no target at all, and a PR url in another
// repository is not this delivery's even when gh says it is not a cross-repository PR.
const expected = { headRefName: 'fix/108', baseRefName: 'dev', repo: { owner: 'o', name: 'r' } };
check('a remote is read as its GitHub owner and name', JSON.stringify(githubRepo('git@github.com:o/r.git')) === JSON.stringify({ owner: 'o', name: 'r' }) && JSON.stringify(githubRepo('https://github.com/o/r.git')) === JSON.stringify({ owner: 'o', name: 'r' }) && JSON.stringify(githubRepo('ssh://git@github.com/o/r')) === JSON.stringify({ owner: 'o', name: 'r' }));
check('a remote that is not a github.com repo is no target', githubRepo('/tmp/origin.git') === null && githubRepo('https://gitlab.com/o/r.git') === null && githubRepo('https://github.com/o/r/extra') === null && githubRepo('') === null);
check('a PR url names the repository it is in', JSON.stringify(githubPrRepo('https://github.com/o/r/pull/108')) === JSON.stringify({ owner: 'o', name: 'r' }) && githubPrRepo('https://github.com/o/r/issues/1') === null && githubPrRepo('https://github.com/evil/other/pull/1') !== null);
// The push destination, not just the fetch url: `git push` uses pushurl when set and every url
// otherwise, so every configured value must name the same repository (issue 108, a fork pushurl).
const repoOf = (result: ReturnType<typeof originTarget>) => (result.kind === 'repo' ? `${result.repo.owner}/${result.repo.name}` : `refuse: ${result.why}`);
check('one url names the repository git push reaches', repoOf(originTarget(['https://github.com/o/r.git'], [])) === 'o/r');
check('a pushurl naming the same repository is allowed', repoOf(originTarget(['https://github.com/o/r.git'], ['https://github.com/o/r.git'])) === 'o/r');
check('several urls naming the same repository are allowed', repoOf(originTarget(['https://github.com/o/r.git', 'git@github.com:o/r.git'], [])) === 'o/r');
check('a fork pushurl beside the upstream url is refused', originTarget(['https://github.com/o/r.git'], ['https://github.com/o/r-fork.git']).kind === 'refuse' && /different repositories/.test(repoOf(originTarget(['https://github.com/o/r.git'], ['https://github.com/o/r-fork.git']))));
check('several urls naming different repositories are refused', originTarget(['https://github.com/o/r.git', 'https://github.com/o/other.git'], []).kind === 'refuse');
check('an unreadable or non-GitHub destination is refused', originTarget([], []).kind === 'refuse' && originTarget(['https://gitlab.com/o/r.git'], []).kind === 'refuse' && originTarget(['/tmp/origin.git'], []).kind === 'refuse');
// Git's effective push url (issue 108): an `insteadOf`/`pushInsteadOf` rewrite invisible in the
// configured values. A rewrite to another github.com repository is refused; a rewrite to a local or
// other non-GitHub transport is trusted (the tests' local bare seam), not proven.
const whyOf = (r: ReturnType<typeof originTarget>) => (r.kind === 'refuse' ? r.why : '');
check('an effective push url naming another github.com repository is refused', originTarget(['https://github.com/o/r.git'], [], ['https://github.com/evil/r.git']).kind === 'refuse' && /evil\/r/.test(whyOf(originTarget(['https://github.com/o/r.git'], [], ['https://github.com/evil/r.git']))));
check('an effective push url naming the same repository is allowed', originTarget(['https://github.com/o/r.git'], [], ['https://github.com/o/r.git']).kind === 'repo');
check('a rewrite to a non-GitHub transport is trusted, not refused', originTarget(['https://github.com/o/r.git'], [], ['file:///tmp/origin.git']).kind === 'repo' && originTarget(['https://github.com/o/r.git'], [], ['/tmp/origin.git']).kind === 'repo');
check('the effective-push-url refusal hides a credential', !whyOf(originTarget(['https://github.com/o/r.git'], [], ['https://user:canary-token@github.com/evil/r.git'])).includes('canary-token'));
check('a diagnostic remote hides userinfo and query secrets', redactRemote('https://user:canary-token@github.com/o/r.git?token=canary-token#x') === 'https://github.com/o/r.git' && redactRemote('git@github.com:o/r.git') === 'github.com:o/r.git' && !redactRemote('https://user:canary-token@gitlab.com/o/r.git').includes('canary-token'));
const otherRepoPr = gh(0, JSON.stringify([prRow({ state: 'MERGED', headRefOid: SHA, url: 'https://github.com/evil/other/pull/1' })]));
check('a PR whose url is another repository is unknown, not this delivery\u2019s', prLookup(otherRepoPr, expected).kind === 'unknown' && prLookup(otherRepoPr, { headRefName: 'fix/108', baseRefName: 'dev' }).kind === 'found');
check('an old merged PR beside a fresh open one is ambiguous, not ranked', prLookup(gh(0, JSON.stringify([prRow({ state: 'MERGED', headRefOid: OTHER }), prRow({ state: 'OPEN', headRefOid: SHA })]))).kind === 'unknown');
check('none or an open PR: deliver creates, an open one is resumed', deliveryResume({ kind: 'none' }, SHA).do === 'deliver' && deliveryResume({ kind: 'found', url: 'u', state: 'OPEN', headRefOid: SHA }, SHA).do === 'resume');
check('a merged PR at this HEAD finishes without another merge', JSON.stringify(deliveryResume({ kind: 'found', url: 'u', state: 'MERGED', headRefOid: SHA }, SHA)) === JSON.stringify({ do: 'finish', url: 'u' }));
check('a merged PR with no head commit refuses: no proof it is this commit', ((r) => r.do === 'refuse' && r.why.includes('cannot be proven'))(deliveryResume({ kind: 'found', url: 'u', state: 'MERGED', headRefOid: null }, SHA)));
check('an unknown answer refuses: the remote could not be asked', deliveryResume({ kind: 'unknown', why: 'timeout' }, SHA).do === 'refuse');
check('a merged PR for another commit refuses, naming both', ((r) => r.do === 'refuse' && r.why.startsWith("this branch's PR u merged bbbbbbbbbbbb"))(deliveryResume({ kind: 'found', url: 'u', state: 'MERGED', headRefOid: OTHER }, SHA)));
check('a CLOSED PR refuses', ((r) => r.do === 'refuse' && r.why.includes('CLOSED'))(deliveryResume({ kind: 'found', url: 'u', state: 'CLOSED', headRefOid: SHA }, SHA)));

// The tracker note a retry keeps (issue 108): a filled section for every id, posted or not; a file
// that exists without them is truncated or another round's, and is not this delivery's note.
check('a note with a filled section for every id is complete', noteComplete('## BJEW-1\nתוקן ✅\n\n## BJEW-2\nמה שונה: x\n', ['BJEW-1', 'BJEW-2']));
check('a posted heading still carries the id', noteComplete('## BJEW-1 (posted)\nתוקן ✅\n', ['BJEW-1']));
check('a truncated note is not complete', !noteComplete('<!-- head -->\n', ['BJEW-1']) && !noteComplete('## BJEW-1\n', ['BJEW-1', 'BJEW-2']) && !noteComplete('## BJEW-1\n', ['BJEW-1']));
check("another round's note is not complete", !noteComplete('## BJEW-2\nx\n', ['BJEW-1']));
check('a longer id is not a prefix match', !noteComplete('## BJEW-10\nx\n', ['BJEW-1']));

// What deliver does with a note file it finds (issue 108): keep a finished one, complete its own
// interrupted write, refuse what it cannot account for. noteComplete alone cannot tell a truncated
// scaffold with one whole section from a finished note; the comparison with the note deliver would
// write is what does.
const scaffold = '<!-- One comment per ## section. -->\n\n## BJEW-1\nתוקן ✅\nמה שונה: x\n\n## BJEW-2\nתוקן ✅\nמה שונה: y\n';
const cutAfterOneLine = scaffold.slice(0, scaffold.indexOf('\n', scaffold.indexOf('תוקן')) + 1);
check('a finished note is kept', existingNoteAction(scaffold, scaffold, ['BJEW-1', 'BJEW-2']) === 'keep' && existingNoteAction('## BJEW-1 (posted)\nתוקן ✅\n', scaffold, ['BJEW-1']) === 'keep');
check('deliver\u2019s own interrupted write is completed, not refused forever', existingNoteAction(scaffold.slice(0, 12), scaffold, ['BJEW-1', 'BJEW-2']) === 'replace' && existingNoteAction('', scaffold, ['BJEW-1']) === 'replace');
// The scaffold cut off after one whole body line: noteComplete calls it complete, but it is a prefix
// of the note deliver would write, so it is completed rather than silently kept (issue 108).
check('a scaffold truncated after one body line is completed though noteComplete calls it complete', noteComplete(cutAfterOneLine, ['BJEW-1']) && existingNoteAction(cutAfterOneLine, scaffold, ['BJEW-1']) === 'replace');
check('a note deliver cannot account for is refused', existingNoteAction('## BJEW-9\nx\n', scaffold, ['BJEW-1']) === 'refuse' && existingNoteAction('<!-- wf: cut off -->\n', scaffold, ['BJEW-1']) === 'refuse');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
