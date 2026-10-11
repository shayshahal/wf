// brief.selfcheck.ts — node brief.selfcheck.ts → exit 0 when green.
// The handoff a brief ends with, the stale-dispatch guard, and a real `wf brief build` in a temp
// round: no token, no per-commit bookkeeping.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { briefGap, handoffText, runBrief } from './brief.ts';

let failures = 0;
const lines: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
	lines.push(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};

// ── pure: the handoff note and the dispatch guard
check('a build brief ends with the step transition, not a token', handoffText('build', 'bug-reports/r', 'A').includes('wf step assess') && !handoffText('build', 'bug-reports/r', 'A').includes('<!-- brief:'), handoffText('build', 'bug-reports/r', 'A'));
check('an assess brief ends by naming ASSESSMENT.md', handoffText('assess', 'bug-reports/r', 'A').includes('ASSESSMENT.md'));
check('a class A agree brief names TICKET.md', handoffText('agree', 'bug-reports/r', 'A').includes('TICKET.md'));
check('a class B agree brief names AGREEMENT.md', handoffText('agree', 'bug-reports/r', 'B').includes('AGREEMENT.md'));
check('a brief wf next is not dispatching is refused with the line', (briefGap(['build'], 'dispatch brief: x') ?? '').includes('not dispatching'));
check('a brief wf next is dispatching is accepted', briefGap(['build'], 'dispatch build: run `wf brief build`') === null && briefGap(['build'], 'dispatch build (model: m): run `wf brief build`') === null);

// ── real: runBrief build in a temp round
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wf-brief-')));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q', '-b', 'fix/r');
git('commit', '-q', '--allow-empty', '-m', 'base');
mkdirSync(join(dir, '.wf'));
mkdirSync(join(dir, 'bug-reports', 'r'), { recursive: true });
writeFileSync(join(dir, 'bug-reports', 'r', 'TICKET.md'), '# X-1\n\n## Intent\n\n- the modal keeps its scroll position — Shay\n');
writeFileSync(join(dir, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, round: 'fix/r', id: 'X-1', folder: 'bug-reports/r', step: 'build', class: 'A', base: 'HEAD' }));

const cwd = process.cwd();
const write = process.stdout.write;
const error = console.error;
let out = '';
process.chdir(dir);
process.on('exit', () => { process.stdout.write = write; console.log(lines.join('\n')); });
try {
	process.stdout.write = ((s: string) => { out += s; return true; }) as typeof process.stdout.write;
	console.error = () => {};
	await runBrief(['build'], { stack: () => Promise.resolve('wf serve: the stack answers') });
	check('wf brief build prints the build prompt (the agreement, the cases)', out.includes('X-1 — build') && out.includes('the modal keeps its scroll position') && out.includes('wf step assess'), out.slice(0, 400));
	check('the build brief mints no token', !out.includes('<!-- brief: '));
	check('the brief does not count per-commit state', JSON.parse(readFileSync(join(dir, '.wf', 'state.json'), 'utf8')).briefs === undefined);
} finally {
	process.stdout.write = write;
	console.error = error;
	process.chdir(cwd);
	rmSync(dir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
