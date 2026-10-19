// assessment-mismatch.selfcheck.ts — a reviewer's explicit verdict owns the gate. Disagreement prose
// in ## Agreement no longer routes anything; a blocked (or capped-repair) outcome asks one durable
// question carrying the whole assessment, and the person's ruling — accept → T2, anything else →
// build, `--revise` → renewed agreement — is the only decision.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agreementSha } from './agreement.ts';
import { readState, writeState } from './state.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};
const dir = mkdtempSync(join(tmpdir(), 'wf-assessment-ruling-'));
const folder = 'bug-reports/r';
const file = (name: string) => join(dir, folder, name);
const cli = (...args: string[]) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const AGREEMENT = `# r
Class: B
## Observed
- the effect still runs — src/effect.ts:1
## Agreed
- Behavior: remove the effect from every path. Excluding: unrelated signals.
- Choice: remove the shared call (rejected: mute one caller).
- Verification: all paths no longer fire the effect.
- T2 walk: open: /detail
- **Not asked for.** none — the ticket names every change
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | effect removed | src/effect.ts | — |
`;
const report = (verdict: string, intent = '- "remove the effect": met: src/effect.ts:1 · before: fired · after: silent') => `Verdict: ${verdict}
head: ${git('rev-parse', 'HEAD')}
assessed-at: 2026-10-13T13:00:00Z
## Intent
${intent}
## Agreement
surviving: the alternate path still fires the effect
## Design
- advisory: shared helper could move
${verdict === 'repair' ? '\n## Repairs\n- R1: remove the agreed effect | action: remove the alternate path call and measure that it no longer fires\n' : ''}
`;
try {
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	mkdirSync(join(dir, 'src'));
	writeFileSync(join(dir, 'src/effect.ts'), 'export const effect = true;\n');
	git('add', '-A'); git('commit', '-qm', 'fixture');
	git('checkout', '-qb', 'fix/r');
	mkdirSync(join(dir, folder), { recursive: true });
	writeFileSync(file('TICKET.md'), '# r\n## Intent\n- "remove the effect"\n');
	writeFileSync(file('AGREEMENT.md'), AGREEMENT);
	writeState(dir, () => ({ wf_version: 3, round: 'fix/r', id: 'r', folder, base: 'main', class: 'B', step: 'assess' }));
	writeFileSync(file('AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(dir, 'B', folder)}\nverdict: approved\n`);
	mkdirSync(join(dir, '.wf'), { recursive: true });
	writeFileSync(join(dir, '.wf/checks.log'), JSON.stringify({ row: null, result: 'green', content: worktreeContentSha(dir, folder, null, 'row'), tasks: [] }) + '\n');
	const atAssess = () => writeState(dir, () => ({ step: 'assess', repairs: 0 }));

	// A clean verdict reaches T2 even though ## Agreement carries a disagreement line.
	writeFileSync(file('ASSESSMENT.md'), report('clean'));
	const clean = cli('next');
	check('a clean verdict reaches T2 despite disagreement prose', clean.stdout.startsWith('review: T2') && !clean.stdout.includes('surviving'), `${clean.stdout}${clean.stderr}`);
	// A repair verdict returns to build without a question; prose in ## Agreement is not a ruling.
	atAssess();
	writeFileSync(file('ASSESSMENT.md'), report('repair'));
	const repair = cli('next');
	check('a repair verdict returns to build, counted, without a question', repair.stdout.includes('repair 1 of 2') && readState(dir)?.step === 'build' && !readState(dir)?.questions?.length, `${repair.stdout}${repair.stderr}`);
	// A blocked verdict asks one durable question that carries the whole assessment.
	atAssess();
	writeFileSync(file('ASSESSMENT.md'), report('blocked'));
	const blocked = cli('next');
	const q = readState(dir)?.questions?.[0];
	check('a blocked verdict asks one durable question carrying the whole assessment', blocked.stdout.includes('the reviewer explicitly blocked the round.') && q?.text?.includes('## Intent') === true && q?.source?.startsWith('ASSESSMENT.md#') === true && (readState(dir)?.questions ?? []).length === 1, `${blocked.stdout}${blocked.stderr}`);
	cli('next');
	check('resume sees the same durable question, not another chat decision', readState(dir)?.questions?.length === 1 && readState(dir)?.questions?.[0]?.n === q?.n);
	const before = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	// accept → T2, with the ruling recorded against the assessed head.
	const accept = cli('decide', '--q', String(q?.n), 'accept: the alternate path is a separate ticket');
	const accepted = cli('next');
	check('an explicit accept opens T2', accept.status === 0 && accepted.stdout.startsWith('review: T2') && readState(dir)?.answered?.at(-1)?.source === q?.source, `${accept.stdout}${accepted.stdout}${accept.stderr}`);
	// anything else → build, with the ruling verbatim.
	writeFileSync(join(dir, '.wf/state.json'), before);
	const fixWords = 'remove the alternate call; keep `wf next` literal in this note';
	const fix = cli('decide', '--q', String(q?.n), fixWords);
	const fixed = cli('next');
	check('a non-accept ruling returns to build with the answer verbatim', fix.status === 0 && fixed.stdout.startsWith('work build') && readState(dir)?.step === 'build' && readState(dir)?.answered?.at(-1)?.answer === fixWords, `${fix.stdout}${fixed.stdout}${fix.stderr}`);
	// --revise renews the agreement before any build.
	writeFileSync(join(dir, '.wf/state.json'), before);
	const revise = cli('decide', '--revise', '--q', String(q?.n), 'remove the primary effect; preserve the alternate path');
	const renewed = cli('next');
	check('a --revise ruling renews the agreement before build', revise.status === 0 && readState(dir)?.step === 'agree' && readState(dir)?.revisions?.length === 1 && renewed.stdout.startsWith('work agree'), `${revise.stdout}${renewed.stdout}${revise.stderr}`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
