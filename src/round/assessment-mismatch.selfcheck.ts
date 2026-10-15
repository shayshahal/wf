// assessment-mismatch.selfcheck.ts — a known agreed effect cannot become an advisory T2 pass (#130).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agreementSha } from './agreement.ts';
import { readState, writeState } from './state.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { WF_ROOT } from '../paths.ts';
import { assessmentContentSha } from './assessment-rulings.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};
const dir = mkdtempSync(join(tmpdir(), 'wf-agreement-mismatch-'));
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
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | effect removed | src/effect.ts | — |
`;
const report = (verdict: string, intent = '- "remove the effect": met: src/effect.ts:1 · before: fired · after: silent', at = '2026-10-13T13:00:00Z') => `Verdict: ${verdict}
head: ${git('rev-parse', 'HEAD')}
assessed-at: ${at}
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
	writeState(dir, () => ({ wf_version: 2, round: 'fix/r', id: 'r', folder, base: 'main', class: 'B', step: 'assess' }));
	const approve = () => writeFileSync(file('AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(dir, 'B', folder)}\nverdict: approved\n`);
	approve();
	mkdirSync(join(dir, '.wf'), { recursive: true });
	writeFileSync(join(dir, '.wf/checks.log'), JSON.stringify({ row: null, result: 'green', content: worktreeContentSha(dir, folder, null, 'row'), tasks: [] }) + '\n');

	writeFileSync(file('ASSESSMENT.md'), report('clean'));
	const clean = cli('next');
	check('a known agreement mismatch cannot remain a clean advisory pass', clean.stdout.startsWith('dispatch assess') && clean.stdout.includes('surviving') && !clean.stdout.includes('review: T2'), `${clean.stdout}${clean.stderr}`);
	writeFileSync(file('ASSESSMENT.md'), report('repair'));
	const repair = cli('next');
	check('clear agreed repairs return to build without a human question', repair.stdout.includes('repair 1 of 2') && readState(dir)?.step === 'build' && !readState(dir)?.questions?.length, `${repair.stdout}${repair.stderr}`);

	const approvedMaterial = agreementSha(dir, 'B', folder);
	writeFileSync(file('AGREEMENT.md'), `${AGREEMENT}\n## Repair responses\nsource: ${assessmentContentSha(readFileSync(file('ASSESSMENT.md'), 'utf8'))}\ncontent-sha: ${worktreeContentSha(dir, folder, null, 'row')}\n- R1: done: removed the alternate call and measured the silent path | evidence: effect regression check passed\n`);
	check('repair answers do not invalidate unchanged T1 material', agreementSha(dir, 'B', folder) === approvedMaterial);
	const handoff = cli('step', 'assess');
	check('the repaired build can hand off through the normal command', handoff.status === 0, `${handoff.stdout}${handoff.stderr}`);
	writeFileSync(file('ASSESSMENT.md'), report('blocked', '- "remove the effect": not met: alternate path still fires'));
	const beforeBlocked = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	const blocked = cli('next');
	const q = readState(dir)?.questions?.[0];
	check('scope ambiguity records a question containing the actual mismatch', blocked.stdout.includes('fix or revise') && q?.source?.includes('#surviving:') === true && q.text.includes('alternate path still fires') && q.text.includes('--revise'), `${blocked.stdout}${blocked.stderr}`);
	cli('next');
	check('resume sees the same durable question, not another chat decision', readState(dir)?.questions?.length === 1 && readState(dir)?.questions?.[0]?.n === q?.n);
	const before = readFileSync(join(dir, '.wf/state.json'), 'utf8');
	const accept = cli('decide', '--q', String(q?.n), 'accept the alternate path');
	check('plain accept cannot bypass renewed agreement and leaves the question open', accept.status === 2 && accept.stderr.includes('needs --revise') && readFileSync(join(dir, '.wf/state.json'), 'utf8') === before, `${accept.stdout}${accept.stderr}`);
	const fixWords = 'fix every path; keep `wf next` literal in this note';
	const fix = cli('decide', '--q', String(q?.n), fixWords);
	const back = cli('next');
	const prompt = cli('prompt', 'build');
	check('a fix ruling reaches the repair build verbatim, not only the assessment report', fix.status === 0 && back.stdout.startsWith('dispatch build') && prompt.stdout.includes('## Agreement mismatch rulings') && prompt.stdout.includes(fixWords), `${fix.stdout}${back.stdout}${prompt.stderr}`);
	// Exercise the other possible reply from the exact same persisted pending-question snapshot.
	writeFileSync(join(dir, '.wf/state.json'), before);
	const revise = cli('decide', '--revise', '--q', String(q?.n), 'accept the alternate path; remove only the primary path effect');
	check('accepting an exception records the answer and renewed-agreement obligation', revise.status === 0 && readState(dir)?.step === 'agree' && readState(dir)?.questions?.length === 0 && readState(dir)?.answered?.[0]?.source === q?.source && readState(dir)?.revisions?.length === 1, `${revise.stdout}${revise.stderr}`);
	const unchanged = cli('next');
	check('the old agreement/T1 cannot discharge that renewed behavior', unchanged.stdout.startsWith('dispatch agree'), `${unchanged.stdout}${unchanged.stderr}`);
	writeFileSync(file('AGREEMENT.md'), AGREEMENT.replace('remove the effect from every path', 'remove the primary effect; preserve the alternate path'));
	const t1 = cli('next');
	check('changed agreed behavior requires fresh T1 before build', t1.stdout.startsWith('wait user: T1'), `${t1.stdout}${t1.stderr}`);
	approve(); cli('next');
	cli('step', 'assess');
	const fresh = cli('next');
	check('renewed scope still needs a fresh assessment, never the prior report', fresh.stdout.startsWith('dispatch assess') && fresh.stdout.includes('has not changed since handoff'), `${fresh.stdout}${fresh.stderr}`);

	// The material branch precedes blocked routing; it must enforce the same exception rule.
	writeFileSync(join(dir, '.wf/state.json'), beforeBlocked);
	writeFileSync(file('AGREEMENT.md'), AGREEMENT); approve();
	writeFileSync(file('ASSESSMENT.md'), report('blocked').replace('## Agreement\n', '## Agreement\nmaterial: preserve the alternate effect instead\n'));
	cli('next');
	const materialQ = readState(dir)?.questions?.[0];
	check('material plus surviving records one contextual mismatch question', materialQ?.source?.endsWith('#material') === true && materialQ.text.includes('alternate path still fires'));
	const materialAccept = cli('decide', '--q', String(materialQ?.n), 'accept the exception');
	check('material plus surviving also refuses plain acceptance', materialAccept.status === 2 && materialAccept.stderr.includes('needs --revise'));
	const materialRevise = cli('decide', '--revise', '--q', String(materialQ?.n), 'accept the exception');
	check('material plus surviving renews agreement, rather than bypassing it', materialRevise.status === 0 && readState(dir)?.step === 'agree' && cli('next').stdout.startsWith('dispatch agree'));
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
