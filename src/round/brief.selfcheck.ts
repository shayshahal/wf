// brief.selfcheck.ts — node brief.selfcheck.ts → exit 0 when green.
// The handoff a brief ends with, the stale-packet guard, and a real `wf brief build` in a temp
// round: no token, no per-commit bookkeeping.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { briefGap, handoffText, runBrief } from './brief.ts';
import { wfCommand, WF_ROOT } from '../paths.ts';
import { seams } from '../seams.ts';

let failures = 0;
const lines: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
	lines.push(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};

// ── pure: the handoff note and the work-packet guard
check('a build brief ends with the step transition, not a token', handoffText('build', 'bug-reports/r', 'A').includes('wf step assess') && !handoffText('build', 'bug-reports/r', 'A').includes('<!-- brief:'), handoffText('build', 'bug-reports/r', 'A'));
check('a build brief names BLOCKED.md for a check that cannot run and says not to retry blind', handoffText('build', 'bug-reports/r', 'A').includes('checks that matter') && handoffText('build', 'bug-reports/r', 'A').includes('BLOCKED.md') && handoffText('build', 'bug-reports/r', 'A').includes('do not retry blind'));
check('an assess brief ends by naming ASSESSMENT.md', handoffText('assess', 'bug-reports/r', 'A').includes('ASSESSMENT.md'));
check('a class A agree brief names TICKET.md', handoffText('agree', 'bug-reports/r', 'A').includes('TICKET.md'));
check('a class B agree brief names AGREEMENT.md', handoffText('agree', 'bug-reports/r', 'B').includes('AGREEMENT.md'));
check('a brief wf next is not working is refused with the line', (briefGap(['build'], 'wait user: blocked') ?? '').includes('not working'));
check('a brief for a phase wf next is not working is refused out of turn', (briefGap(['build'], 'work assess: run `wf brief assess`') ?? '').includes('not working'));
check('the current work packet is accepted', briefGap(['build'], 'work build: run `wf brief build`') === null && briefGap(['assess'], 'work assess: run `wf brief assess`') === null);
check('the old dispatch/model line is refused, not read as a packet', (briefGap(['build'], 'dispatch build (model: m): run `wf brief build`') ?? '').includes('no longer dispatches'));
check('an assess brief ends by requiring a fresh independent context', handoffText('assess', 'bug-reports/r', 'A').includes('fresh independent context'));

// ── real: the CLI refuses a missing phase with its usage, not with `undefined`
const noPhase = spawnSync(process.execPath, [join(WF_ROOT, 'src', 'round', 'brief.ts')], { encoding: 'utf8' });
check('wf brief with no phase says the usage', noPhase.status === 2 && noPhase.stderr.includes(`wf brief: usage: <agree | build | assess>`) && !noPhase.stderr.includes('undefined'), JSON.stringify({ status: noPhase.status, stderr: noPhase.stderr }));
check('wf brief with a phase that does not exist says the usage', spawnSync(process.execPath, [join(WF_ROOT, 'src', 'round', 'brief.ts'), 'buidl'], { encoding: 'utf8' }).stderr.includes('usage:'));

// ── real: runBrief build in a temp round
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wf-brief-')));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q', '-b', 'fix/r');
git('commit', '-q', '--allow-empty', '-m', 'base');
mkdirSync(join(dir, '.wf'));
mkdirSync(join(dir, 'bug-reports', 'r'), { recursive: true });
writeFileSync(join(dir, 'bug-reports', 'r', 'TICKET.md'), '# X-1\n\n## Intent\n\n- the modal keeps its scroll position — Shay\n');
writeFileSync(join(dir, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 'fix/r', id: 'X-1', folder: 'bug-reports/r', step: 'build', class: 'A', base: 'HEAD' }));

const cwd = process.cwd();
const write = process.stdout.write;
const error = console.error;
let out = '';
process.chdir(dir);
process.on('exit', () => { process.stdout.write = write; console.log(lines.join('\n')); });
try {
	process.stdout.write = ((s: string) => { out += s; return true; }) as typeof process.stdout.write;
	console.error = () => {};
	const harnessEnv = ['PI_SESSION_ID', 'PI_SESSION_FILE', 'CLAUDE_CODE_SESSION_ID'] as const;
	const savedEnv = harnessEnv.map((k) => process.env[k]);
	for (const k of harnessEnv) delete process.env[k];
	try {
		await runBrief(['build'], { stack: () => Promise.resolve('wf serve: the stack answers') });
	} finally {
		harnessEnv.forEach((k, i) => { if (savedEnv[i] === undefined) delete process.env[k]; else process.env[k] = savedEnv[i]; });
	}
	check('wf brief build prints the build prompt (the agreement, the cases)', out.includes('X-1 — build') && out.includes('the modal keeps its scroll position') && out.includes(`${wfCommand(seams.entry)} step assess`), out.slice(0, 400));
	check('a same-context build with no harness env gets its work packet and names no model or fresh worker', out.includes('work build:') && !out.includes('(model:') && !out.includes('round-worker'), out.slice(0, 400));
	check('a same-context build with no harness env records no harness session', JSON.parse(readFileSync(join(dir, '.wf', 'state.json'), 'utf8')).session === undefined);
	check('the standalone handoff needs no global wf alias', !out.slice(out.lastIndexOf('## Handoff')).includes('`wf '));
	check('the build brief mints no token', !out.includes('<!-- brief: '));
	check('the brief does not count per-commit state', JSON.parse(readFileSync(join(dir, '.wf', 'state.json'), 'utf8')).briefs === undefined);
} finally {
	process.stdout.write = write;
	console.error = error;
	process.chdir(cwd);
	rmSync(dir, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
