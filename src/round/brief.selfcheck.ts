// brief.selfcheck.ts — node brief.selfcheck.ts → exit 0 when green.
// runBrief in a temp round, with the stack plugged in: a brief that is held back by a stack that does
// not answer (and then cut off by its caller) is not counted as an agent; one that goes out is.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { briefCount, runBrief } from './brief.ts';

// Lines are printed once stdout is back: the arms below mute it.
let failures = 0;
const lines: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
	lines.push(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wf-brief-')));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q', '-b', 'fix/r');
git('commit', '-q', '--allow-empty', '-m', 'base');
mkdirSync(join(dir, '.wf'));
mkdirSync(join(dir, 'bug-reports', 'r'), { recursive: true });
writeFileSync(join(dir, 'bug-reports', 'r', 'TICKET.md'), '# X-1\n\n## Intent\n\n> the order cancel confirm stays open — Shay\n');
writeFileSync(join(dir, '.wf', 'state.json'), JSON.stringify({ round: 'fix/r', id: 'X-1', folder: 'bug-reports/r', step: 'research', class: 'A', base: 'HEAD' }));
const briefs = () => JSON.parse(readFileSync(join(dir, '.wf', 'state.json'), 'utf8')).briefs?.research as { count: number } | undefined;

// JX-1221 (2026-10-07): validate's count is per validated tree. Six briefs over heads A, A, A, B, B, then C.
const at = (head: string, count: number) => ({ head, count });
const v = (head: string, last: { head?: string; count?: number } | undefined) => briefCount({ phase: 'validate', fresh: false, again: false, last, lastValidate: last, head });
check('a validate on the same head counts on: the second agent of that tree', v('A', at('A', 1)) === 2);
check('an --answer on the same head counts too', v('A', at('A', 2)) === 3);
check('count 6 on head A, a validate on head B is a first', v('B', at('A', 6)) === 1);
check('the new head counts on from there', v('B', at('B', 1)) === 2);
check('a record with no head counts as before', v('B', { count: 3 }) === 4);
check('other phases ignore the head', briefCount({ phase: 'plan', fresh: false, again: false, last: at('A', 1), lastValidate: at('A', 6), head: 'B' }) === 2);

const cwd = process.cwd();
const write = process.stdout.write;
const error = console.error;
let out = '';
process.chdir(dir);
// runBrief ends the process on a refusal: print whatever was checked, and what it said.
process.on('exit', () => { process.stdout.write = write; console.log(lines.join('\n')); });
try {
	// Muted: the brief is the prompt, and the stack line goes to stderr.
	process.stdout.write = ((s: string) => { out += s; return true; }) as typeof process.stdout.write;
	console.error = () => {};
	const never = () => new Promise<string>(() => {});
	void runBrief(['research'], { stack: never });
	await new Promise((r) => setTimeout(r, 300));
	check('a brief held back by a stack that does not answer is not recorded (nor printed)', briefs() === undefined && out === '', `${JSON.stringify(briefs())} ${out.length} bytes`);

	await runBrief(['research'], { stack: () => Promise.resolve('wf serve: the stack answers') });
	check('the brief that went out is the round\'s first agent', briefs()?.count === 1 && out.includes('<!-- brief: '), `${JSON.stringify(briefs())}`);

	await runBrief(['research'], { stack: () => Promise.reject(new Error('wf serve: the stack did not answer within 180 s')) });
	check('a stack that gave up does not stop the brief, which then counts as the second agent', briefs()?.count === 2, JSON.stringify(briefs()));

	// wf decide --research: the next research is a new first agent, and its prompt carries the request.
	const stateFile = join(dir, '.wf', 'state.json');
	const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
	writeFileSync(stateFile, JSON.stringify({ ...saved, researchRequests: [{ text: 'the three duplicate wishlist rows on QA', at: new Date(Date.now() + 1000).toISOString() }] }));
	out = '';
	await runBrief(['research'], { stack: () => Promise.resolve('wf serve: the stack answers') });
	check('a research asked for again is the first agent of its ask, and its prompt says what to measure', briefs()?.count === 1 && out.includes('## This is a second research') && out.includes('- the three duplicate wishlist rows on QA'), `${JSON.stringify(briefs())} ${out.slice(-600)}`);
} finally {
	process.stdout.write = write;
	console.error = error;
	process.chdir(cwd);
	rmSync(dir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
