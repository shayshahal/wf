// deliver.selfcheck.ts — node deliver.selfcheck.ts → exit 0 when green.
// Fixture PLAN.md → the PR body, the tracker note.
import { hookRefused, prBody, refusedPushSection, t2Gap } from './deliver.ts';
import type { State } from '../round/state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const plan = [
  '# BJEW-1 — plan',
  'Class: A',
  'Cause: the send result is discarded at auth.py:599',
  'Approach: capture it and raise where the caller already lands',
  '',
  '## Build',
  '  POST /api/v1/auth/2fa/send',
  ' +    send_otp_code()            ← str → bool',
  ' ~    auth.py:599                bool CAPTURED instead of discarded',
  ' ~    AuthClient.sendCode()',
  ' -    legacy_send()',
  '      untouched_hop()',
  '',
  '## Commits',
  '| 1 | fix(auth): x | packages/backend/app/api/auth.py | repro |',
].join('\r\n');

const body = prBody({ planText: plan, commitLines: ['- abc123 fix(auth): x'], validation: '## Validation\n+ send_otp_code: built' });
check('PR body carries PLAN.md verbatim', body.includes('Cause: the send result is discarded at auth.py:599'));
check('PR body carries the pushed commits and VALIDATION.md', body.includes('## Commits (as pushed)\n- abc123 fix(auth): x') && body.includes('## Validation\n+ send_otp_code: built'), body.slice(-160));

// GitHub refuses a PR body over 65,536 characters (JX-1221, 2026-10-08): a ~70k plan still fits, keeps the
// commits, the verdict and the sections T2 reads, and says where the full PLAN.md is.
const row = (n: number) => `| ${n} | feat(x): row ${n} | a.ts | node --test |`;
const bigPlan = ['# JX-1 — plan', 'Class: A', 'Cause: c', '', '## Build', 'b'.repeat(40000), '', '## Commits', '| # | message | files | check |', ...Array.from({ length: 18 }, (_, i) => row(i + 1)), '', '## Not doing', 'nothing else', '', '## T2 walk', 'open: /users/1', '', '## Decisions', 'd'.repeat(30000)].join('\n');
const bigCommits = Array.from({ length: 18 }, (_, i) => `- c${i}abcd feat(x): row ${i + 1}`);
const bigValidation = `# JX-1 — validation\nVerdict: matches plan\n\n${'v'.repeat(6000)}`;
const fit = prBody({ planText: bigPlan, commitLines: bigCommits, validation: bigValidation, planPath: 'bug-reports/jx-1/PLAN.md' });
check('a 70k plan gives a body under the GitHub limit', bigPlan.length > 65536 && fit.length < 65536, `${bigPlan.length} -> ${fit.length}`);
check('the shortened body keeps the commits, the verdict, the table, Not doing and T2 walk', bigCommits.every((c) => fit.includes(c)) && fit.includes('Verdict: matches plan') && fit.includes(row(18)) && fit.includes('nothing else') && fit.includes('open: /users/1'));
check('the shortened body drops Build first and says where the full plan is', !fit.includes('bbbbbbbbbb') && fit.includes('`bug-reports/jx-1/PLAN.md`'));
check('a plan that fits is untouched', prBody({ planText: plan, commitLines: ['- a b'], validation: '' }) === prBody({ planText: plan, commitLines: ['- a b'], validation: '', budget: 1e9 }));
// Build and Decisions cut and still over: the plan's tail goes, not the commits or the verdict.
const bigRows = prBody({ planText: bigPlan.replace('nothing else', 'n'.repeat(70000)), commitLines: bigCommits, validation: bigValidation });
check('a plan whose kept sections are still over is cut at its end', bigRows.length < 65536 && bigCommits.every((c) => bigRows.includes(c)) && bigRows.includes('Verdict: matches plan'), `${bigRows.length}`);
const hugeCommits = Array.from({ length: 3000 }, (_, i) => `- c${i} feat(x): a long commit message to fill the list ${i}`);
const hugeBody = prBody({ planText: bigPlan, commitLines: hugeCommits, validation: bigValidation + 'v'.repeat(90000) });
check('commits and validation over the limit alone are cut too: newest commit and verdict kept', hugeBody.length < 65536 && hugeBody.includes(hugeCommits.at(-1)!) && hugeBody.includes('Verdict: matches plan'), `${hugeBody.length}`);
check('PR body has no word-level as-built lines', !body.includes('## As built') && !/missing:|unplanned:/.test(body));


// T2 is local and first: deliver merges, so it runs only after T2 approved (Shay, 2026-09-27).
// A push the pre-push hook refused becomes a T2 fix (TJEW-670, 2026-09-28).
const noise = Array.from({ length: 40 }, (_, i) => `  (node) warning ${i}`).join('\n');
const refusedOutput = `  packages/frontend/admin/src/lib/x.ts\n    :1 probe CRITICAL\n${noise}\n\u2502 fallow-audit\n\u2717 complexity: 1 finding\nsummary: (done in 60s)\n\u2718 fallow-audit\nerror: failed to push some refs\nhook: pre-push`;
check('a hook refusal is told from a network one', hookRefused(refusedOutput) && !hookRefused('fatal: unable to access https://github.com/: Could not resolve host'));
const section = refusedPushSection(refusedOutput, '2026-09-28');
check('the refusal is one changes-requested verdict, the one wf next counts', [...`verdict: approved\n${section}`.matchAll(/^verdict:\s*changes-requested\s*$/gm)].length === 1 && section.includes('    \u2717 complexity: 1 finding') && section.includes('packages/frontend/admin/src/lib/x.ts') && section.includes(':1 probe CRITICAL') && !section.includes('warning 39'), section);
check('T2 approved: deliver may run', t2Gap({ step: 'pr' }, 'verdict: approved\n') === null);
check('before T2, T2 pending or changes requested: refused', ([[{ step: 'implement' }, null], [{ step: 'review' }, 'verdict: pending'], [{ step: 'pr' }, 'verdict: changes-requested'], [{ step: 'pr' }, null]] satisfies [State, string | null][]).every(([s, r]) => t2Gap(s, r)?.startsWith('T2 has not approved')));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
