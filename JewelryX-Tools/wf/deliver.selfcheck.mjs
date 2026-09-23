// deliver.selfcheck.mjs — node JewelryX-Tools/wf/deliver.selfcheck.mjs → exit 0 when green.
// Fixture PLAN.md → the PR body, MONDAY.md.
import { mondayComment, prBody } from './deliver.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

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
check('PR body has no word-level as-built lines', !body.includes('## As built') && !/missing:|unplanned:/.test(body));

const monday = mondayComment({ planText: plan, url: 'https://github.com/x/y/pull/7' });
check('MONDAY.md is ≤6 lines', monday.trimEnd().split('\n').length <= 6, String(monday.trimEnd().split('\n').length));
check('MONDAY.md carries cause, approach and the PR url', monday.includes('סיבה: the send result is discarded at auth.py:599') && monday.includes('מה שונה: capture it') && monday.includes('pull/7'), monday);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
