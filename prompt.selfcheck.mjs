// prompt.selfcheck.mjs — node prompt.selfcheck.mjs → exit 0 when green.
// Fixture PLAN.md → row parsing, files cell, {{...}} substitution, and the state merge.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planCommitRows, renderPrompt, rowFiles, ticketIntent } from './prompt.mjs';
import { readState, writeState } from './state.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const plan = [
  '# BJEW-1 — plan',
  'Class: A',
  '',
  '## Commits',
  '| # | message | files | check |',
  '| --- | --- | --- | --- |',
  '| 1 | fix(auth): capture send result | packages/backend/app/api/auth.py | packages/backend/tests/test_auth.py |',
  '| 2 | test(auth): repro green | packages/backend/tests/test_auth.py | repro |',
  '',
  '## Not doing',
  '| not a row | x |',
].join('\r\n');

const rows = planCommitRows(plan);
check('two commit rows parsed, header and separator skipped', rows.length === 2, JSON.stringify(rows.map((r) => r.n)));
check('row 1 line is verbatim', rows[0].line === '| 1 | fix(auth): capture send result | packages/backend/app/api/auth.py | packages/backend/tests/test_auth.py |', rows[0].line);
check('row cells split', rows[1].message === 'test(auth): repro green' && rows[1].check === 'repro');
check('rows after the section are not picked up', !rows.some((r) => r.line.includes('not a row')));
check('files cell splits on whitespace and strips backticks', JSON.stringify(rowFiles({ files: '`a.py` b.py, c.py' })) === '["a.py","b.py","c.py"]', JSON.stringify(rowFiles({ files: '`a.py` b.py, c.py' })));
check('no ## Commits section → no rows', planCommitRows('# x\nnothing here').length === 0);

const out = renderPrompt('round {{round}} folder {{folder}} commit {{n}}/{{total}}\n{{row}}\n{{unknown}}', { round: 'BJEW-1', folder: 'bug-reports/x', n: 1, total: 2, row: rows[0].line });
check('every known placeholder substituted', out.includes('round BJEW-1 folder bug-reports/x commit 1/2') && out.includes(rows[0].line), out);
check('unknown placeholder left alone', out.includes('{{unknown}}'));

const dir = mkdtempSync(join(tmpdir(), 'wf-prompt-'));
writeState(dir, { round: 'r', id: 'BJEW-1', folder: 'bug-reports/x' });
writeState(dir, { commit: 2 });
const state = readState(dir);
check('writeState merges instead of replacing', state.id === 'BJEW-1' && state.commit === 2, JSON.stringify(state));
writeFileSync(join(dir, 'broken.json'), 'x');
const ticket = '# BJEW-1 — x\r\n\r\n## Intent\r\n\r\n- Einat, 2026-09-22: «the heart is cut»\r\n\r\n## Thread\r\n1. …\r\n';
check('ticketIntent is the section body, verbatim, CRLF or not', ticketIntent(ticket) === '- Einat, 2026-09-22: «the heart is cut»', JSON.stringify(ticketIntent(ticket)));
check('an Intent at the end of the file', ticketIntent('# t\n## Intent\nShay: hide deleted users\n') === 'Shay: hide deleted users');
check('no ## Intent → null', ticketIntent('# t\n## Thread\n1. x\n') === null);
check('an empty ## Intent → null', ticketIntent('# t\n## Intent\n\n## Thread\nx\n') === null);
check('## Intent in a sub-heading does not count', ticketIntent('# t\n### Intent\nx\n') === null);
check('readState of a stateless dir is null', readState(join(dir, 'nope')) === null);
rmSync(dir, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
