// deliver.selfcheck.ts — node deliver.selfcheck.ts → exit 0 when green.
// Fixture PLAN.md → the PR title, the PR body, the tracker note.
import { hookRefused, prBody, prCommitRows, prTitle, refusedPushSection, t2Gap } from './deliver.ts';
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
	'## Commits',
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
const commitLines = ['- abc1234 fix(auth): x', '- def5678 docs(BJEW-1): round folder: ticket, research, plan, validation, repro'];
const body = prBody({ ticket, plan, commitLines, validation, planPath: 'bug-reports/bjew-1/PLAN.md' });
const visible = body.slice(0, body.indexOf('<details>'));

check('the PR title is the ticket\u2019s own title', prTitle({ ticket, plan, commitLines }) === 'BJEW-1 — the code never arrives');
check('with no TICKET.md the title is the newest commit, never the oldest', prTitle({ ticket: '', plan, commitLines }) === 'fix(auth): x');
check('the body leads with the round folder, then Intent and the plan\u2019s header', body.startsWith('Round folder: `bug-reports/bjew-1/`\n\n## Intent\n\n- Shay, 2026-01-01: "the code never arrives"\n\n## Approach\n\nClass: A\nCause: the send result'));
check('the commits are one line each, joined to the pushed hash, with no files cell', body.includes('| 1 | abc1234 | fix(auth): x | repro |') && !body.includes('packages/backend/app/api/auth.py'));
check('a commit no row names is listed too, and the Row N: instructions are not', body.includes('| — | def5678 | docs(BJEW-1): round folder: ticket, research, plan, validation, repro | — |') && !body.includes('Row 1: commit only auth.py'));
check('the T2 walk and Not doing are there, as the plan wrote them', body.includes('## T2 walk\n\nopen: /login') && body.includes('## Not doing\n\n- the SMS provider'));
check('VALIDATION.md\u2019s verdict, suites and as-built sections are there', body.includes('## Validation\n\nVerdict: matches plan\n\ngreen: abc123 — backend pytest') && body.includes('### Unplanned\n\nnone') && body.includes('### Intent\n\n- "the code never arrives": met') && body.includes('### Live\n\nVERIFIED — the code arrives'));
check('the call stack and the plan history are folded, not cut', body.includes('<summary>Build — the call stack (3 lines)</summary>') && body.includes('+    send_otp_code()') && body.includes('<summary>Plan history — 2 revisions, 1 decisions</summary>'));
check('the revision log is history: not in what the reviewer reads first', !visible.includes('Revision (T2') && !visible.includes('## Revisions'));
check('a body under the budget is not called shortened', !body.includes('Shortened:') && body.trimEnd().endsWith('</details>'));
check('an empty PLAN.md gives a table of the pushed commits alone', JSON.stringify(prCommitRows('', ['- abc1234 one'])) === JSON.stringify(['| — | abc1234 | one | — |']));

// Over the budget the folds go first, then VALIDATION.md's detail, then the oldest commits — and the
// body says where the round folder's own text is.
const row = (n: number) => `| ${n} | feat(x): row ${n} | a.ts | node --test |`;
const bigTicket = ['# JX-1 — a big round', '', '## Intent', '- the ask'].join('\n');
const bigPlan = ['# JX-1 — plan', 'Class: A', 'Cause: c', 'Approach: a', '## Build', 'b'.repeat(40000), '', '## Commits', '| # | message | files | check |', ...Array.from({ length: 18 }, (_, i) => row(i + 1)), '', '## Not doing', 'nothing else', '', '## T2 walk', 'open: /users/1', '', '## Decisions', 'd'.repeat(30000)].join('\n');
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
check('a huge Unplanned is cut with a marker, keeping the verdict and the Intent judgement', cutValidation.length < 65536 && cutValidation.includes('### Unplanned\n\n(cut here, in `bug-reports/jx-1/VALIDATION.md`)') && !cutValidation.includes('uuuuuuuuuu') && cutValidation.includes('Verdict: matches plan') && cutValidation.includes('### Intent\n\n- the ask: met'));
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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
