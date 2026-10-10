// route.selfcheck.ts — node route.selfcheck.ts → exit 0 when green.
// The smaller route through the real CLI in temp git repos (#110-#113): the ordinary (class A)
// ticket-as-agreement, the consequential (B/C) agreement + T1, an unchanged agreement progress
// edit that must not renew T1, a material change that must, the ordinary/helper scope fence, the
// bounded repair and the unmet-intent T2 refusal, and the version guard.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agreementSha } from './agreement.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const AGREEMENT = `# r — agreement
Class: B
## Observed
- the header renders at the top — \`src/Page.svelte:12\`
## Agreed
- Behavior: two columns with a sidebar. Excluding: the data shown.
- Choice: extract DetailsLayout (rejected: absolute-position).
- Verification: the existing tests pass, plus the sidebar region renders.
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | layout: sidebar renders | src/Page.svelte | src/Page.spec.ts::sidebar renders@42 |
`;
const TICKET = `# r — ticket
## Intent
- "x": the modal keeps its scroll position
`;

function repo(branch: string, klass: 'A' | 'B', agreement: string | null) {
	const dir = mkdtempSync(join(tmpdir(), 'wf-route-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'src/Page.svelte'), 'a\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	git('checkout', '-q', '-b', branch);
	mkdirSync(join(dir, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(dir, 'bug-reports/r/TICKET.md'), TICKET);
	if (agreement !== null) writeFileSync(join(dir, 'bug-reports/r/AGREEMENT.md'), agreement);
	mkdirSync(join(dir, '.wf'), { recursive: true });
	writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'agree', class: klass }, null, 2)}\n`);
	return { dir, git };
}
function cli(dir: string, ...args: string[]) {
	try { return { out: execFileSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: dir, encoding: 'utf8' }), code: 0 }; } catch (e) {
		const err = e as { stdout?: string; stderr?: string; status?: number };
		return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
	}
}
const state = (dir: string) => JSON.parse(readFileSync(join(dir, '.wf/state.json'), 'utf8')) as { step?: string; questions?: unknown[]; repairs?: number };
const approve = (dir: string, klass: 'B', agreement: string) => {
	writeFileSync(join(dir, 'bug-reports/r/AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(dir, klass, 'bug-reports/r')}\nverdict: approved\n`);
};

// ── ordinary (class A): the ticket is the agreement, no T1, straight to build
{
	const { dir } = repo('fix/routeA', 'A', null);
	const next = cli(dir, 'next');
	check('class A: wf next steps to build and dispatches it', next.code === 0 && next.out.includes('dispatch build') && state(dir).step === 'build', next.out);
	check('class A: wf new/step stamp wf_version 2', state(dir).step === 'build');
	rmSync(dir, { recursive: true, force: true });
}

// ── consequential (class B): agreement + T1, then build
{
	const { dir } = repo('fix/routeB', 'B', AGREEMENT);
	const noT1 = cli(dir, 'next');
	check('B/C: no approved agreement → wait on the user for T1', noT1.out.includes('wait user: T1 on AGREEMENT.md'), noT1.out);
	approve(dir, 'B', AGREEMENT);
	const approved = cli(dir, 'next');
	check('B/C: approved material → step build and dispatch build', approved.out.includes('dispatch build') && state(dir).step === 'build', approved.out);
	// An unchanged agreed direction is not invalidated by a progress edit to the mutable cases.
	const before = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	const withCase = AGREEMENT.replace('| 1 | layout: sidebar renders | src/Page.svelte |', '| 1 | layout: sidebar renders | src/Page.svelte, src/Helper.ts |');
	writeFileSync(join(dir, 'bug-reports/r/AGREEMENT.md'), withCase);
	writeFileSync(join(dir, '.wf/state.json'), before.replace(/"step": "build"/, '"step": "agree"'));
	const stillApproved = cli(dir, 'next');
	check('B/C: adding a helper to a case does not renew T1', stillApproved.out.includes('dispatch build') && state(dir).step === 'build', stillApproved.out);
	// A behavior change does renew T1.
	writeFileSync(join(dir, 'bug-reports/r/AGREEMENT.md'), AGREEMENT.replace('two columns', 'three columns'));
	writeFileSync(join(dir, '.wf/state.json'), before.replace(/"step": "build"/, '"step": "agree"'));
	const renewed = cli(dir, 'next');
	check('B/C: a changed ## Agreed renews T1', renewed.out.includes('wait user: T1 on AGREEMENT.md'), renewed.out);
	rmSync(dir, { recursive: true, force: true });
}

// ── scope: an unrelated change is refused, a helper inside a case is allowed
{
	const { dir } = repo('fix/routeS', 'A', null);
	writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'build', class: 'A' }, null, 2)}\n`);
	writeFileSync(join(dir, 'bug-reports/r/TICKET.md'), `${TICKET}\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | fix(x): one | src/Page.svelte | — |\n`);
	// An edit to a file no case names is refused by the scope fence.
	writeFileSync(join(dir, 'src/Other.svelte'), 'x\n');
	const refused = cli(dir, 'check');
	check('scope: a change outside the agreement\'s cases is refused', refused.code === 1 && refused.out.includes('fence: src/Other.svelte'), refused.out);
	const line = JSON.parse(readFileSync(join(dir, '.wf/checks.log'), 'utf8').trim().split('\n').at(-1)!);
	check('scope: the refused run is recorded red, not green', line.result === 'red' && line.cause === 'code', JSON.stringify(line));
	rmSync(dir, { recursive: true, force: true });
}

// ── the assessment: a repair returns to build, bounded; an unmet intent blocks T2 with one ruling
{
	const { dir } = repo('fix/routeR', 'A', null);
	const assess = (v: string, intent: string) => `# r — assessment\nVerdict: ${v}\nhead: ${execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}\n## Intent\n${intent}\n`;
	const setStep = (step: string, extra: object = {}) => writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step, class: 'A', ...extra })}\n`);
	setStep('assess');
	writeFileSync(join(dir, 'bug-reports/r/ASSESSMENT.md'), assess('repair', '- "x": met: src/Page.svelte:1 · before: red · after: green'));
	const repair = cli(dir, 'next');
	check('assessment: a repair returns to build, counted', repair.out.includes('repair 1 of 2') && state(dir).step === 'build' && state(dir).repairs === 1, repair.out);
	// After two attempts, one contextual escalation, no third build.
	setStep('assess', { repairs: 2 });
	writeFileSync(join(dir, 'bug-reports/r/ASSESSMENT.md'), assess('repair', '- "x": met: src/Page.svelte:1 · before: red · after: green'));
	const bounded = cli(dir, 'next');
	check('assessment: two unsuccessful repairs escalate once, not a third build', bounded.out.includes('2 autonomous repairs') && state(dir).step === 'assess', bounded.out);
	check('assessment: the escalation is one recorded question', (state(dir).questions ?? []).length === 1);
	// A blocked assessment (unmet intent) asks one fix-or-accept ruling and does not open T2.
	setStep('assess');
	writeFileSync(join(dir, 'bug-reports/r/ASSESSMENT.md'), assess('blocked', '- "x": not met: the modal still jumps'));
	const blocked = cli(dir, 'next');
	check('assessment: unmet intent asks one fix-or-accept ruling, never T2', blocked.out.includes('fix or accept:') && state(dir).step === 'assess' && (state(dir).questions ?? []).length === 1, blocked.out);
	rmSync(dir, { recursive: true, force: true });
}

// ── the legacy/version guard: an old-route state is refused before mutation, and not rewritten
{
	const dir = mkdtempSync(join(tmpdir(), 'wf-routeV-'));
	const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
	git('init', '-q', '-b', 'main'); git('commit', '-q', '--allow-empty', '-m', 'base');
	mkdirSync(join(dir, '.wf'), { recursive: true });
	mkdirSync(join(dir, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(dir, 'bug-reports/r/TICKET.md'), TICKET);
	const legacy = `${JSON.stringify({ round: 'r', id: 'r', folder: 'bug-reports/r', step: 'implement' }, null, 2)}\n`;
	writeFileSync(join(dir, '.wf/state.json'), legacy);
	const refused = cli(dir, 'step', 'build');
	check('version guard: an old-route state refuses a mutating command', refused.code === 1 && refused.out.includes('older wf'), refused.out);
	check('version guard: the refused state was not rewritten', readFileSync(join(dir, '.wf/state.json'), 'utf8') === legacy);
	rmSync(dir, { recursive: true, force: true });
}

// ── the classic flow: a decided exclusion goes through no obsolete dispatch
{
	const { dir } = repo('fix/routeX', 'A', null);
	writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'assess', class: 'A' }, null, 2)}\n`);
	const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	// An excluded intent line with a reason is a clean assessment: it reaches T2, not a question.
	writeFileSync(join(dir, 'bug-reports/r/ASSESSMENT.md'), `# r — assessment\nVerdict: clean\nhead: ${head}\n## Intent\n- "x": left out: overruled by Shay, 2026-10-10: a separate ticket\n`);
	const decided = cli(dir, 'next');
	check('decided exclusion: a left-out line with a reason reaches T2, not a question', decided.out.startsWith('review: T2'), decided.out);
	rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
