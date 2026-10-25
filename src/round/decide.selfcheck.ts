// decide.selfcheck.ts — node src/round/decide.selfcheck.ts → exit 0 when green.
// `wf ask` then `wf decide` through the real CLI before any AGREEMENT.md exists (JX-284, 2026-10-18:
// the agreement write threw ENOENT after the question closed, so the answer never reached state.decisions).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const dir = mkdtempSync(join(tmpdir(), 'wf-decide-'));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q', '-b', 'main');
writeFileSync(join(dir, 'a'), 'a\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
git('checkout', '-q', '-b', 'fix/decide');
mkdirSync(join(dir, 'bug-reports/r'), { recursive: true });
writeFileSync(join(dir, 'bug-reports/r/TICKET.md'), '# r — ticket\n## Intent\n- "x": y\n');
mkdirSync(join(dir, '.wf'), { recursive: true });
writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 3, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'B' }, null, 2)}\n`);
function cli(...args: string[]) {
	const r = wfSync(args, { cwd: dir });
	return r.status === 0 ? { out: r.stdout, code: 0 } : { out: `${r.stdout}${r.stderr}`, code: r.status };
}

const ask = cli('ask', 'x', '--to', 'einat');
check('ask exits 0', ask.code === 0, ask.out);
const decide = cli('decide', '--q', '1', 'y');
check('decide exits 0 with no agreement', decide.code === 0, decide.out);
check('decide says where the answer was kept', /q1 closed · recorded/.test(decide.out), decide.out);
const state = JSON.parse(readFileSync(join(dir, '.wf/state.json'), 'utf8')) as { decisions?: string[]; questions?: unknown[] };
check('question closed', (state.questions ?? []).length === 0);
check('decision in state.decisions', JSON.stringify(state.decisions).includes('x → einat: y'), JSON.stringify(state.decisions));
const next = cli('next');
check('next dispatches agree', /agree/.test(next.out), next.out);

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall green');
