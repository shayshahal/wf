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
import { wfOut, wfSync } from '../in-process-wf.ts';
import { agreementSha } from './agreement.ts';
import { readState, writeState, WF_STATE_VERSION } from './state.ts';

// A separate process receives only the saved round and its phase. Live-stack behavior has its own
// checks; this public capability supplies no product observations for the context-only fixture.
if (process.argv[2] === 'phase-fixture') {
	await runBrief([process.argv[3]], { stack: async () => 'context fixture: no live measurements' });
	process.exit(process.exitCode ?? 0);
}

let failures = 0;
const lines: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
	lines.push(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};

// ── pure: the handoff note and the work-packet guard
check('a build brief ends with the step transition, not a token', handoffText('build', 'bug-reports/r', 'A').includes('wf step assess') && !handoffText('build', 'bug-reports/r', 'A').includes('<!-- brief:'), handoffText('build', 'bug-reports/r', 'A'));
check('a build handoff retains the correction-only next action and points unresolved blockers to the questions procedure', handoffText('build', 'bug-reports/r', 'A').includes('unchanged approved delivery') && handoffText('build', 'bug-reports/r', 'A').includes('questions procedure above') && handoffText('build', 'bug-reports/r', 'A').includes('rather than retrying blindly'));
check('an assess brief ends by naming ASSESSMENT.md', handoffText('assess', 'bug-reports/r', 'A').includes('ASSESSMENT.md'));
check('a class A agree brief names TICKET.md', handoffText('agree', 'bug-reports/r', 'A').includes('TICKET.md'));
check('a class B agree brief names AGREEMENT.md', handoffText('agree', 'bug-reports/r', 'B').includes('AGREEMENT.md'));
check('a brief wf next is not working is refused with the line', (briefGap(['build'], 'wait user: blocked') ?? '').includes('not working'));
check('a brief for a phase wf next is not working is refused out of turn', (briefGap(['build'], 'work assess: run `wf brief assess`') ?? '').includes('not working'));
check('the current work packet is accepted', briefGap(['build'], 'work build: run `wf brief build`') === null && briefGap(['assess'], 'work assess: run `wf brief assess`') === null);
check('the old dispatch/model line is refused, not read as a packet', (briefGap(['build'], 'dispatch build (model: m): run `wf brief build`') ?? '').includes('no longer dispatches'));
check('an assess handoff names the next action without duplicating the report schema', handoffText('assess', 'bug-reports/r', 'A').includes('wf next') && !handoffText('assess', 'bug-reports/r', 'A').includes('Verdict:'));

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
// Cold handoffs: each command starts a new module graph, with no session identity or prior chat.
// The phase reader receives only the worktree, configured entry and phase command.
{
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'wf-cold-brief-')));
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('PI_SESSION') && key !== 'CLAUDE_CODE_SESSION_ID' && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
	const wf = (...args: string[]) => wfOut(args, { cwd: repo, env });
	const phaseBrief = (phase: string) => {
		const result = spawnSync(process.execPath, [join(WF_ROOT, 'src/round/brief.selfcheck.ts'), 'phase-fixture', phase], { cwd: repo, env, encoding: 'utf8' });
		check(`cold ${phase}: the public brief succeeds`, result.status === 0, result.stdout + result.stderr);
		return result.stdout;
	};
	const folder = 'bug-reports/cold';
	const record = (name: string, text: string) => writeFileSync(join(repo, folder, name), text);
	try {
		git('init', '-q', '-b', 'main');
		writeFileSync(join(repo, 'product.txt'), 'unchanged product\n');
		git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/cold');
		mkdirSync(join(repo, folder), { recursive: true });
		writeState(repo, () => ({ wf_version: WF_STATE_VERSION, round: 'fix/cold', id: 'COLD', folder, base: 'main', class: 'A', step: 'agree', made_by: 'kit' }));
		check('cold class A starts at agreement when intent is missing', wf('next').startsWith('work agree:'));
		const ordinary = phaseBrief('agree');
		check('cold class A asks for sourced intent, not a consequential agreement', ordinary.includes('## Intent') && ordinary.includes('verbatim') && !ordinary.includes('## Observed') && !ordinary.includes('## Agreed'), ordinary);
		check('cold agreement identifies the workspace, entry and intake reference', ordinary.includes(repo.replaceAll('\\', '/')) && ordinary.includes(`${wfCommand(seams.entry)} notes`) && ordinary.includes(`${WF_ROOT.replaceAll('\\', '/')}/skills/round/references/start.md`), ordinary);
		record('TICKET.md', '# COLD\n## Intent\nReporter: preserve identifiers while improving the output.\n');
		wf('next');
		const initialBuild = phaseBrief('build');
		check('an empty-diff build points to guidance before newly discovered edits', initialBuild.includes('Before editing a newly discovered area') && !initialBuild.includes('## This project\'s notes for these files'), initialBuild);
		writeState(repo, () => ({ class: 'B', step: 'agree' }));
		const consequential = phaseBrief('agree');
		check('cold B/C agreement retains its format and actual T1 decision', consequential.includes('## Observed') && consequential.includes('## Agreed') && consequential.includes('manual:') && consequential.includes('T1') && consequential.includes('AGREEMENT.md'), consequential);
		record('AGREEMENT.md', '# COLD\n## Observed\n- product.txt has stable identifiers.\n## Agreed\n- **Behavior.** Improve output; preserve identifiers.\n- **Excluding.** EXCLUSION-SENTINEL: no migration.\n- **Choice.** Keep identifiers; reject renumbering.\n- **Not asked for.** none — requested change only.\n- **T2 walk.** none — command-only fixture.\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | output keeps identifiers | product.txt | CHECK-SENTINEL: compare identifiers |\n## Evidence\nEVIDENCE-SENTINEL: see proof/identifiers.log\n');
		record('AGREEMENT-REVIEW.md', `agreement-sha: ${agreementSha(repo, 'B', folder)}\nverdict: approved\n`);
		check('approved B agreement resumes build without a new session requirement', wf('next').startsWith('work build:'));
		record('BLOCKED.md', '# COLD — blocked\nQuestion: Which identifier format should remain?\n');
		wf('ask', '--blocked');
		const held = wfSync(['brief', 'build'], { cwd: repo, env });
		check('an unresolved decision refuses the cold brief without partial instructions', held.status === 2 && held.stdout === '' && held.stderr.includes('wait user: q1'), held.stderr);
		wf('decide', '--q', '1', 'ANSWER-SENTINEL: retain the existing identifier format');
		wf('correct', '--source', 'chat:cold/1', '--author', 'Reporter', '--scope', 'output', '--reason', 'explicit instruction', 'CORRECTION-SENTINEL: retain leading zeros');
		const correction = readState(repo)?.corrections?.[0];
		if (!correction) throw new Error('cold brief fixture: correction was not recorded');
		record('ASSESSMENT.md', `Verdict: repair\nhead: ${git('rev-parse', 'HEAD')}\nassessed-at: 2026-10-20T00:00:00.000Z\nFINDING-SENTINEL: measure the zero-prefixed identifier.\n`);
		record('REVIEW.md', '## 2026-10-20\nT2-SENTINEL: keep the existing label.\nverdict: changes-requested\n');
		wf('next');
		const build = phaseBrief('build');
		check('cold repair build recovers scope, answer, source instruction, findings and T2 feedback', ['EXCLUSION-SENTINEL', 'ANSWER-SENTINEL', 'CORRECTION-SENTINEL', 'chat:cold/1', 'FINDING-SENTINEL', 'T2-SENTINEL', '## Build reason', '## Answered build block'].every((text) => build.includes(text)), build);
		check('cold build directs a full working-document read for verification and evidence', build.includes(`${folder}/AGREEMENT.md`) && build.includes('Read the whole working document') && build.includes('verification') && build.includes('evidence'), build);
		check('cold build scopes phase instructions and names durable question/correction procedures', build.includes('Current phase: build') && build.includes('earlier phase procedures') && build.includes('references/questions.md') && build.includes('references/corrections.md'), build);
		const checkpointGuide = readFileSync(join(WF_ROOT, 'skills/round/references/review.md'), 'utf8');
		check('a build checkpoint reaches intermediate review without final-assessment prerequisites', build.includes('references/review.md#agreed-checkpoints') && checkpointGuide.includes('final T2 walk are not checkpoint prerequisites') && checkpointGuide.includes('wf review <branch> --checkpoint --done'), checkpointGuide);
		check('build completion is stated once, by the handoff', (build.match(/step assess`/g) ?? []).length === 1, build);
		check('a build brief does not impose the assessor product-code restriction', !build.includes('do not change product code'));

		wf('correct', '--address', correction.id, '--note', 'Measured the existing leading zeros; no product edit required.');
		git('add', '-A'); git('commit', '-qm', 'record evidence');
		const head = git('rev-parse', 'HEAD');
		record('ASSESSMENT.md', `Verdict: repair\nhead: ${head}\nassessed-at: 2026-10-20T00:00:00.000Z\nFINDING-SENTINEL: measure the zero-prefixed identifier.\n`);
		wf('step', 'assess');
		check('handoff requests a fresh report despite the old report at the same HEAD', wf('next').startsWith('work assess:'));
		const assess = phaseBrief('assess');
		check('fresh reviewer recovers scope, decisions, addressed instructions and prior findings from disk', ['EXCLUSION-SENTINEL', 'ANSWER-SENTINEL', 'CORRECTION-SENTINEL', 'chat:cold/1', 'addressed', 'FINDING-SENTINEL'].every((text) => assess.includes(text)), assess);
		check('fresh reviewer gets the full evidence location and independent authority up front', assess.includes('Current phase: assess') && assess.includes(`${folder}/AGREEMENT.md`) && assess.includes('Read the whole working document') && assess.indexOf('fresh independent context') < assess.indexOf('## Show the person') && assess.includes('do not change product code'), assess);
		check('assessment reports walk gaps rather than editing the builder agreement', assess.includes('repair findings') && !assess.includes('replace stale `none`'), assess);
		check('assessment excludes build-only correction disposition and implementation handoff', !assess.includes('correct --address') && !assess.includes('step assess`'));
		check('context-only assessment neither mutates the product nor supplies a new verdict', git('rev-parse', 'HEAD') === head && readFileSync(join(repo, 'product.txt'), 'utf8') === 'unchanged product\n' && readFileSync(join(repo, folder, 'ASSESSMENT.md'), 'utf8').includes('FINDING-SENTINEL'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
}
process.exit(failures ? 1 : 0);
