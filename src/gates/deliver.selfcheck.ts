// deliver.selfcheck.ts — node deliver.selfcheck.ts → exit 0 when green.
// Fixture PLAN.md → the PR title, the PR body, the tracker note.
import { deliveryResume, existingNoteAction, githubPrRepo, githubRepo, hookRefused, noteComplete, originTarget, prBody, prCommitRows, prLookup, prTitle, redactRemote, refusedPushSection, t2Gap } from './deliver.ts';
import type { State } from '../round/state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// JX-1221's shape: the title is TICKET.md's, the header is the plan as it stands, the revision log is
// history, and the plan's commit rows list every file they touch.
const ticket = ['# BJEW-1 — the code never arrives', '', '## Intent', '- Shay, 2026-01-01: "the code never arrives"'].join('\r\n');
const plan = [
	'# BJEW-1 — plan',
	'Class: A',
	'Cause: the send result is discarded at auth.py:599',
	'Approach: capture it and raise where the caller already lands',
	'Revision (T2, 2026-01-02): the raise moves to the caller',
	'',
	'## Build',
	'  POST /api/v1/auth/2fa/send',
	' +    send_otp_code()            ← str → bool',
	' ~    auth.py:599                bool CAPTURED instead of discarded',
	'',
	'## Verification',
	'| # | message | files | check |',
	'|---|---|---|---|',
	'| 1 | fix(auth): x | packages/backend/app/api/auth.py | repro |',
	'',
	'Row 1: commit only auth.py; the fence matches it verbatim.',
	'',
	'## Not doing',
	'- the SMS provider',
	'',
	'## T2 walk',
	'open: /login',
	'',
	'## Decisions',
	'- 2026-01-02 which port → user: 8080',
	'',
	'## Revisions',
	'2026-01-02 Shay — the raise moves to the caller',
].join('\r\n');
const validation = [
	'# BJEW-1 — validation',
	'Verdict: matches plan',
	'',
	'## Suites',
	'green: abc123 — backend pytest',
	'',
	'## Unplanned',
	'none',
	'',
	'## Intent',
	'- "the code never arrives": met',
	'',
	'## Live',
	'VERIFIED — the code arrives',
].join('\n');
const commitLines = ['- abc1234 fix(auth): x', '- def5678 docs(BJEW-1): round folder: ticket, agreement, assessment, repro'];
const body = prBody({ ticket, plan, commitLines, validation, planPath: 'bug-reports/bjew-1/PLAN.md' });
const visible = body.slice(0, body.indexOf('<details>'));

check('the PR title is the ticket\u2019s own title', prTitle({ ticket, plan, commitLines }) === 'BJEW-1 — the code never arrives');
check('with no TICKET.md the title is the newest commit, never the oldest', prTitle({ ticket: '', plan, commitLines }) === 'fix(auth): x');
check('the body leads with the round folder, then Intent, the agreement and the plan header', body.startsWith('Round folder: `bug-reports/bjew-1/`\n\n## Intent\n\n- Shay, 2026-01-01: "the code never arrives"\n\n## Agreement\n\n- Shay, 2026-01-01: "the code never arrives"\n\n## Approach\n\nClass: A\nCause: the send result'));
check('the commits are one line each, joined to the pushed hash, with no files cell', body.includes('| 1 | abc1234 | fix(auth): x | repro |') && !body.includes('packages/backend/app/api/auth.py'));
check('a commit no row names is listed too, and the Row N: instructions are not', body.includes('| — | def5678 | docs(BJEW-1): round folder: ticket, agreement, assessment, repro | — |') && !body.includes('Row 1: commit only auth.py'));
check('the T2 walk and Not doing are there, as the plan wrote them', body.includes('## T2 walk\n\nopen: /login') && body.includes('## Not doing\n\n- the SMS provider'));
check('ASSESSMENT.md\u2019s verdict, suites and intent sections are there', body.includes('## Assessment\n\nVerdict: matches plan\n\ngreen: abc123 — backend pytest') && body.includes('### Unplanned\n\nnone') && body.includes('### Intent\n\n- "the code never arrives": met') && body.includes('### Live\n\nVERIFIED — the code arrives'));
check('the call stack and the plan history are folded, not cut', body.includes('<summary>Build — the call stack (3 lines)</summary>') && body.includes('+    send_otp_code()') && body.includes('<summary>Plan history — 2 revisions, 1 decisions</summary>'));
check('the revision log is history: not in what the reviewer reads first', !visible.includes('Revision (T2') && !visible.includes('## Revisions'));
check('a body under the budget is not called shortened', !body.includes('Shortened:') && body.trimEnd().endsWith('</details>'));
check('an empty PLAN.md gives a table of the pushed commits alone', JSON.stringify(prCommitRows('', ['- abc1234 one'])) === JSON.stringify(['| — | abc1234 | one | — |']));

// Over the budget the folds go first, then VALIDATION.md's detail, then the oldest commits — and the
// body says where the round folder's own text is.
const row = (n: number) => `| ${n} | feat(x): row ${n} | a.ts | node --test |`;
const bigTicket = ['# JX-1 — a big round', '', '## Intent', '- the ask'].join('\n');
const bigPlan = ['# JX-1 — plan', 'Class: A', 'Cause: c', 'Approach: a', '## Build', 'b'.repeat(40000), '', '## Verification', '| # | message | files | check |', ...Array.from({ length: 18 }, (_, i) => row(i + 1)), '', '## Not doing', 'nothing else', '', '## T2 walk', 'open: /users/1', '', '## Decisions', 'd'.repeat(30000)].join('\n');
const bigCommits = Array.from({ length: 18 }, (_, i) => `- c${i}abcd feat(x): row ${i + 1}`);
const bigValidation = `# JX-1 — validation\nVerdict: matches plan\n\n## Suites\ngreen\n\n## Unplanned\n${'u'.repeat(2000)}\n\n## Live\n${'l'.repeat(2000)}`;
const fit = prBody({ ticket: bigTicket, plan: bigPlan, commitLines: bigCommits, validation: bigValidation, planPath: 'bug-reports/jx-1/PLAN.md' });
check('a 70k plan gives a body under the GitHub limit', bigPlan.length > 65536 && fit.length < 65536, `${bigPlan.length} -> ${fit.length}`);
check('the shortened body keeps Intent, Approach, the commits, T2 walk, Not doing and the verdict', fit.includes('- the ask') && fit.includes('Approach: a') && fit.includes('| 18 | c17abcd | feat(x): row 18 | node --test |') && fit.includes('nothing else') && fit.includes('open: /users/1') && fit.includes('Verdict: matches plan'));
check('the plan history goes first, and the body says where PLAN.md is', !fit.includes('dddddddddd') && fit.includes('bbbbbbbbbb') && fit.includes('`bug-reports/jx-1/PLAN.md`'));

const hugePlan = bigPlan.replace('b'.repeat(40000), 'b'.repeat(70000));
const huge = prBody({ ticket: bigTicket, plan: hugePlan, commitLines: bigCommits, validation: bigValidation, planPath: 'bug-reports/jx-1/PLAN.md' });
check('a plan still over with the history gone cuts the call stack too', huge.length < 65536 && !huge.includes('bbbbbbbbbb') && huge.includes('Verdict: matches plan') && huge.includes('earlier commits in the branch') === false, `${huge.length}`);

// A VALIDATION.md over the budget on one section, with no fold left to give: the marker names the
// file and the verdict and the other sections stay.
const longValidation = `# JX-1 — validation\nVerdict: matches plan\n\n## Unplanned\n${'u'.repeat(62000)}\n\n## Intent\n- the ask: met\n\n## Live\nVERIFIED`;
const cutValidation = prBody({ ticket, plan, commitLines, validation: longValidation, planPath: 'bug-reports/jx-1/PLAN.md' });
check('a huge Unplanned is cut with a marker, keeping the verdict and the Intent judgement', cutValidation.length < 65536 && cutValidation.includes('### Unplanned\n\n(cut here, in `bug-reports/jx-1/ASSESSMENT.md`)') && !cutValidation.includes('uuuuuuuuuu') && cutValidation.includes('Verdict: matches plan') && cutValidation.includes('### Intent\n\n- the ask: met'));
check('a plan that fits is not shortened', !prBody({ ticket, plan, commitLines: ['- a b'], validation: '' }).includes('Shortened:'));

// The commits alone over the budget: the oldest go, a quarter at a time, and the count says how many.
const hugeCommits = Array.from({ length: 3000 }, (_, i) => `- c${i} feat(x): a long commit message to fill the list ${i}`);
const hugeBody = prBody({ ticket: bigTicket, plan, commitLines: hugeCommits, validation: '' });
check('thousands of commits are cut down to the newest, with a count of the rest', hugeBody.length < 65536 && hugeBody.includes('| — | c0 | feat(x): a long commit message to fill the list 0 | — |') && !hugeBody.includes('list 2999') && hugeBody.includes('earlier commits in the branch'), `${hugeBody.length}`);
check('no round-folder phrase is copied in word by word', !body.includes('## As built') && !/missing:|unplanned:/.test(body));

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
