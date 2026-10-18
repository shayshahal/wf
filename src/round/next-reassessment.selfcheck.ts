// next-reassessment.selfcheck.ts — JX-154: a measurement-only repair needs a new review at the same HEAD.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { readState } from './state.ts';
import { assessmentContentSha } from './agreement.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const cli = (repo: string, ...args: string[]) => {
	const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
	return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() };
};
const assessment = (head: string, verdict = 'repair') => `# r — assessment
Verdict: ${verdict}
head: ${head}
## Intent
- "x": met: a.txt:1 · before: red · after: green
## Agreement
(none)
${verdict === 'repair' ? '\n## Repairs\n- R1: certificate opens | action: drive the missing page check and record the second size\n' : ''}
`;
const repo = mkdtempSync(join(tmpdir(), 'wf-reassessment-'));
try {
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'fixed code\n');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'fixed');
	git(repo, 'checkout', '-qb', 'fix/r');
	const folder = 'bug-reports/r';
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- "x": the certificate opens\n## Notes\n- **T2 walk.** none — the certificate check is the proof\n');
	const head = git(repo, 'rev-parse', 'HEAD');
	const file = join(repo, folder, 'ASSESSMENT.md');
	writeFileSync(file, assessment(head));
	utimesSync(file, new Date(0), new Date(0));
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 3, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'build', repairs: 2, answered: [{ n: 1, to: 'user', text: 'fix or accept', source: `ASSESSMENT.md#${head}`, answer: 'perform the missing page check', asked: 't', answered: 't' }] }));
	appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ result: 'green', content: worktreeContentSha(repo, folder, null, 'row') })}\n`);
	const handoff = cli(repo, 'step', 'assess');
	check('the measurement-only repair hands off without changing HEAD', handoff.code === 0 && readState(repo)?.step === 'assess' && git(repo, 'rev-parse', 'HEAD') === head, handoff.out);
	const next = cli(repo, 'next');
	check('the old same-HEAD repair verdict cannot undo the fresh assessment handoff', next.code === 0 && next.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess' && readState(repo)?.repairs === 2, next.out);
	const resumed = cli(repo, 'next');
	check('repeated next keeps requesting assessment without consuming another repair', resumed.out.startsWith('dispatch assess') && readState(repo)?.repairs === 2, resumed.out);
	const directReview = cli(repo, 'step', 'review');
	check('direct review cannot bypass the fresh-assessment handoff', directReview.code === 2 && directReview.out.includes('dispatch assess') && readState(repo)?.step === 'assess', directReview.out);
	const originalBaseline = readState(repo)?.assessment_baseline;
	for (const verdict of ['clean', 'blocked']) {
		writeFileSync(file, assessment(head, verdict));
		writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...readState(repo), assessment_baseline: { file: 'ASSESSMENT.md', sha: assessmentContentSha(assessment(head, verdict)) } }));
		utimesSync(file, new Date(0), new Date(0));
		const stale = cli(repo, 'next');
		check(`a pre-handoff ${verdict} report is not a current assessment either`, stale.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess' && !(readState(repo)?.questions?.length), stale.out);
	}
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...readState(repo), assessment_baseline: originalBaseline }));
	// A filesystem touch or identical rewrite is not evidence of a new independent judgment.
	writeFileSync(file, assessment(head));
	const touched = cli(repo, 'next');
	check('touching or rewriting the old report cannot make it fresh', touched.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess', touched.out);
	writeFileSync(file, assessment(head).replace(/\n/g, '\r\n'));
	const converted = cli(repo, 'next');
	check('checkout newline conversion does not change assessment identity', converted.out.startsWith('dispatch assess'), converted.out);
	const repeatedHandoff = cli(repo, 'step', 'assess');
	check('a repeated assess step preserves its baseline instead of consuming the report', repeatedHandoff.code === 0 && readState(repo)?.assessment_baseline?.sha === originalBaseline?.sha, repeatedHandoff.out);
	// A genuinely new same-HEAD report is consumed; with the bounded repair spent it asks one durable
	// ruling that carries the whole assessment rather than another build or a re-run of the assessor.
	writeFileSync(file, assessment(head).replace('## Intent', `assessed-at: ${new Date().toISOString()}\n## Intent`));
	utimesSync(file, new Date(0), new Date(0));
	const freshRepair = cli(repo, 'next');
	check('a fresh same-HEAD repair report is consumed and caps the bounded repair with one ruling', freshRepair.out.includes('2 autonomous repairs did not clear the review') && readState(repo)?.questions?.length === 1 && readState(repo)?.step === 'assess', freshRepair.out);
	const q = readState(repo)?.questions?.[0];
	check('the ruling question names the assessed head and carries the whole assessment', q?.source?.startsWith('ASSESSMENT.md#') === true && q?.text?.includes('## Repairs') === true, JSON.stringify(q));
	const accepted = cli(repo, 'decide', '--q', String(q?.n), 'accept: carry the capped repair into T2');
	check('an explicit accept of the capped repair opens T2', accepted.code === 0 && cli(repo, 'next').out.startsWith('review: T2'), accepted.out);
	check('reassessment never changes the code or HEAD', git(repo, 'rev-parse', 'HEAD') === head && readFileSync(join(repo, 'a.txt'), 'utf8') === 'fixed code\n');
	const saved = readFileSync(join(repo, '.wf/state.json'), 'utf8');
	for (const baseline of [null, { file: '../ASSESSMENT.md', sha: null }, { file: 'ASSESSMENT.md', sha: 'bad' }]) {
		const raw = JSON.stringify({ ...JSON.parse(saved), assessment_baseline: baseline });
		writeFileSync(join(repo, '.wf/state.json'), raw);
		const corrupt = cli(repo, 'next');
		check('corrupt baseline is refused without rewriting state', corrupt.code === 1 && corrupt.out.includes('assessment_baseline') && readFileSync(join(repo, '.wf/state.json'), 'utf8') === raw, corrupt.out);
	}
	writeFileSync(join(repo, '.wf/state.json'), saved);
} finally {
	rmSync(repo, { recursive: true, force: true });
}
process.exit(failures ? 1 : 0);
