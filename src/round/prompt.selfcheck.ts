// prompt.selfcheck.ts — node prompt.selfcheck.ts → exit 0 when green.
// The agreement's `## Verification` cases, the agreed material a build reads, {{...}} substitution,
// TICKET.md's `## Intent`, and the state merge.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { agreedMaterial, renderPrompt, ticketIntent } from './prompt.ts';
import { caseFiles, verificationCases } from './agreement.ts';
import { readState, writeState } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const agreement = [
	'# BJEW-1 — agreement',
	'Class: B',
	'',
	'## Observed',
	'- the header renders at the top — `src/Page.svelte:12`',
	'',
	'## Agreed',
	'- Behavior: two columns with a sidebar. Excluding: the data shown.',
	'',
	'## Verification',
	'| # | case | files | check |',
	'| --- | --- | --- | --- |',
	'| 1 | layout: sidebar renders | src/Page.svelte | src/Page.spec.ts::sidebar renders@42 |',
	'| 2 | layout: content renders | src/Content.svelte | src/Content.spec.ts::content renders@7 |',
	'',
	'## Not doing',
	'| not a case | x |',
].join('\r\n');

const cases = verificationCases(agreement);
check('two verification cases parsed, header and separator skipped', cases.length === 2, JSON.stringify(cases.map((c) => c.n)));
check('case 1 line is verbatim', cases[0].line === '| 1 | layout: sidebar renders | src/Page.svelte | src/Page.spec.ts::sidebar renders@42 |', cases[0].line);
check('case cells split', cases[1].message === 'layout: content renders' && cases[1].check === 'src/Content.spec.ts::content renders@7');
check('cases after the section are not picked up', !cases.some((c) => c.line.includes('not a case')));
check('files cell splits on whitespace and strips backticks', JSON.stringify(caseFiles({ files: '`a.ts` b.ts, c.ts' })) === '["a.ts","b.ts","c.ts"]', JSON.stringify(caseFiles({ files: '`a.ts` b.ts, c.ts' })));
check('no ## Verification section → no cases', verificationCases('# x\nnothing here').length === 0);

check('agreedMaterial for B/C is Observed + Agreed, never the cases', agreedMaterial(agreement, 'B').includes('the header renders at the top') && agreedMaterial(agreement, 'B').includes('two columns') && !agreedMaterial(agreement, 'B').includes('sidebar renders'), agreedMaterial(agreement, 'B'));
check('agreedMaterial carries the person\u2019s ## Decisions too (a wf decide ruling binds the build)', agreedMaterial(`${agreement}\n## Decisions\n- 2026-10-10 which port \u2192 user: 8080\n`, 'B').includes('## Decisions') && agreedMaterial(`# t\n## Intent\n- the ask\n## Decisions\n- 2026-10-10 which port \u2192 user: 8080\n`, 'A').includes('8080'), agreedMaterial(`# t\n## Intent\n- the ask\n## Decisions\n- x\n`, 'A'));
check('a decide ruling has one projection in the agreed material', (agreedMaterial(`${agreement}\n## Decisions\n- 2026-10-10 keep the existing button\n`, 'B').match(/keep the existing button/g) ?? []).length === 1, agreedMaterial(`${agreement}\n## Decisions\n- 2026-10-10 keep the existing button\n`, 'B'));

const out = renderPrompt('round {{round}} folder {{folder}} file {{file}}\n{{agreement}}\n{{unknown}}', { round: 'BJEW-1', folder: 'bug-reports/x', file: 'AGREEMENT.md', agreement: 'x' });
check('every known placeholder substituted', out.includes('round BJEW-1 folder bug-reports/x file AGREEMENT.md'), out);
check('unknown placeholder left alone', out.includes('{{unknown}}'));

const dir = mkdtempSync(join(tmpdir(), 'wf-prompt-'));
writeState(dir, () => ({ round: 'r', id: 'BJEW-1', folder: 'bug-reports/x' }));
writeState(dir, () => ({ repairs: 2 }));
const state = readState(dir);
check('writeState merges instead of replacing', state!.id === 'BJEW-1' && state!.repairs === 2, JSON.stringify(state));
const ticket = '# BJEW-1 — x\r\n\r\n## Intent\r\n\r\n- Einat, 2026-09-22: «the heart is cut»\r\n\r\n## Thread\r\n1. …\r\n';
check('ticketIntent is the section body, verbatim, CRLF or not', ticketIntent(ticket) === '- Einat, 2026-09-22: «the heart is cut»', JSON.stringify(ticketIntent(ticket)));
check('an Intent at the end of the file', ticketIntent('# t\n## Intent\nShay: hide deleted users\n') === 'Shay: hide deleted users');
check('no ## Intent → null', ticketIntent('# t\n## Thread\n1. x\n') === null);
check('an empty ## Intent → null', ticketIntent('# t\n## Intent\n\n## Thread\nx\n') === null);
check('## Intent in a sub-heading does not count', ticketIntent('# t\n### Intent\nx\n') === null);
check('readState of a stateless dir is null', readState(join(dir, 'nope')) === null);
rmSync(dir, { recursive: true, force: true });

// `wf decide` without --revise keeps the step, records state.decisions and reaches the build and the
// assessment exactly once (2026-10-10 closure, F2): a local correction needs no renewed T1, and the
// prompt carries it through one projection. Real CLI, throwaway repo.
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-decide-'));
	try {
		const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@e.invalid', ...args], { encoding: 'utf8' }).trim();
		git('init', '-q', '-b', 'main');
		writeFileSync(join(repo, 'a.txt'), 'base\n'); git('add', '-A'); git('commit', '-qm', 'base');
		git('checkout', '-qb', 'fix/dec');
		const folder = 'bug-reports/dec';
		mkdirSync(join(repo, folder), { recursive: true });
		mkdirSync(join(repo, '.wf'), { recursive: true });
		writeFileSync(join(repo, folder, 'TICKET.md'), '# T\n\n## Intent\n- a thing should change — the requester said so\n');
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), '# AGREEMENT — DEC\n\n## Observed\n- a fact at `a.txt:1`\n\n## Agreed\n\n- **Behavior.** the thing changes\n- **T2 walk.** open: `b2b /catalog as buyer`\n\n## Verification\n\n| # | case | files | check |\n|---|---|---|---|\n| 1 | fix(dec): thing | `a.txt` | `a.spec.ts::x@1` |\n');
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, made_by: 'kit', round: 'fix/dec', id: 'dec', folder, base: 'main', class: 'B', step: 'build', since: '2026-10-10T00:00:00Z' }));
		const run = join(WF_ROOT, 'wf.mjs');
		const wf = (...args: string[]) => execFileSync(process.execPath, [run, ...args], { cwd: repo, encoding: 'utf8' });
		wf('decide', 'keep the existing button');
		const st = JSON.parse(readFileSync(join(repo, '.wf', 'state.json'), 'utf8')) as { step?: string; decisions?: { text: string }[] };
		check('a non-revise decide keeps the step and records state.decisions', st.step === 'build' && st.decisions?.[0]?.text === 'keep the existing button', JSON.stringify(st));
		for (const phase of ['build', 'assess']) {
			const prompt = wf('prompt', phase);
			const count = (prompt.match(/keep the existing button/g) ?? []).length;
			check(`the decision reaches the ${phase} prompt exactly once`, count === 1, `count=${count}`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
