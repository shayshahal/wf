// next-reassessment.selfcheck.ts — JX-154: a measurement-only repair needs a new review at the same HEAD.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { readState } from './state.ts';
import { assessmentContentSha, verificationGapsHash } from './assessment-rulings.ts';

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
	writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- "x": the certificate opens\n');
	const head = git(repo, 'rev-parse', 'HEAD');
	const file = join(repo, folder, 'ASSESSMENT.md');
	writeFileSync(file, assessment(head));
	const answerRepairs = () => writeFileSync(join(repo, folder, 'TICKET.md'), `# r\n## Intent\n- "x": the certificate opens\n## Repair responses\nsource: ${assessmentContentSha(readFileSync(file, 'utf8'))}\ncontent-sha: ${worktreeContentSha(repo, folder, null, 'row')}\n- R1: done: drove the missing page check and recorded the second size | evidence: proof/after-certificate.png\n`);
	answerRepairs();
	utimesSync(file, new Date(0), new Date(0));
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 2, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'build', repairs: 2, answered: [{ n: 1, to: 'user', text: 'fix or accept', source: `ASSESSMENT.md#${head}`, answer: 'perform the missing page check', asked: 't', answered: 't' }] }));
	appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ result: 'green', content: worktreeContentSha(repo, folder, null, 'row') })}\n`);
	const handoff = cli(repo, 'step', 'assess');
	check('the measurement-only repair hands off without changing HEAD', handoff.code === 0 && readState(repo)?.step === 'assess' && git(repo, 'rev-parse', 'HEAD') === head, handoff.out);
	const next = cli(repo, 'next');
	check('the old same-HEAD repair verdict cannot undo the fresh assessment handoff', next.code === 0 && next.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess' && readState(repo)?.repairs === 2, next.out);
	// The installed bug already returned JX-154 to build. Keep that exact recovery shape.
	const state = readState(repo);
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...state, step: 'build', history: [...(state?.history ?? []).filter((h) => h.step !== 'build'), { step: 'build', at: new Date().toISOString() }] }));
	const recovery = cli(repo, 'next');
	check('a legacy stale-verdict bounce recovers through next, not a manual workaround', recovery.code === 0 && recovery.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess', recovery.out);
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
	writeFileSync(file, assessment(head).replace('## Intent', `assessed-at: ${new Date().toISOString()}\n## Intent`));
	utimesSync(file, new Date(0), new Date(0));
	const freshRepair = cli(repo, 'next');
	check('a new same-HEAD repair report is consumed even with an old filesystem timestamp', freshRepair.out.startsWith('dispatch build') && readState(repo)?.step === 'build', freshRepair.out);
	answerRepairs();
	const secondHandoff = cli(repo, 'step', 'assess');
	const secondReview = cli(repo, 'next');
	check('the next handoff invalidates even that freshly consumed report', secondHandoff.code === 0 && secondReview.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess', secondHandoff.out + secondReview.out);
	writeFileSync(file, assessment(head, 'clean') + '\n## Live\n- NOT MEASURED — the second size could not be reached\n');
	const measured = cli(repo, 'next');
	check('the new same-HEAD assessment is consumed but its unmeasured case still needs a ruling', measured.out.includes('leaves verification open') && readState(repo)?.questions?.length === 1 && !measured.out.startsWith('review: T2'), measured.out);
	check('reassessment never changes the code or HEAD', git(repo, 'rev-parse', 'HEAD') === head && readFileSync(join(repo, 'a.txt'), 'utf8') === 'fixed code\n');
	// The reviewer reproduced a legacy bounce whose repair proof was still owed. Next must build,
	// not apply a bookkeeping step that exits the process at the handoff gate.
	const gap = 'NOT MEASURED — the second size could not be reached';
	const source = `ASSESSMENT.md#${head}#open:${verificationGapsHash([gap])}`;
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 2, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'build', repairs: 2, history: [{ step: 'assess', at: new Date(0).toISOString() }, { step: 'build', at: new Date().toISOString() }], answered: [{ n: 1, to: 'user', text: gap, source, verification_gaps: [gap], answer: 'measure it', asked: 't', answered: 't' }] }));
	const noProof = cli(repo, 'next');
	check('legacy recovery with missing proof dispatches build rather than hard-exiting', noProof.code === 0 && noProof.out.startsWith('dispatch build') && noProof.out.includes('verification-q1.md') && readState(repo)?.step === 'build', noProof.out);
	const content = worktreeContentSha(repo, folder, null, 'row');
	mkdirSync(join(repo, folder, 'proof'), { recursive: true });
	writeFileSync(join(repo, folder, 'proof/verification-q1.md'), `source: ${source}\nhead: ${head}\ncontent-sha: wrong\n## Measurement\nObserved the requested click\n`);
	const staleProof = cli(repo, 'next');
	check('legacy recovery with stale proof also dispatches build', staleProof.code === 0 && staleProof.out.startsWith('dispatch build') && staleProof.out.includes('content-sha'), staleProof.out);
	appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ row: 'suites', result: 'red', content, tasks: [{ label: 'suite', exit: 1 }] })}\n`);
	const redSuites = cli(repo, 'next');
	check('legacy recovery cannot bypass the ruled suites repair', redSuites.code === 0 && redSuites.out.startsWith('dispatch build') && redSuites.out.includes('suites red'), redSuites.out);
	appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ row: 'suites', result: 'green', content })}\n`);
	writeFileSync(join(repo, folder, 'proof/verification-q1.md'), `source: ${source}\nhead: ${head}\ncontent-sha: ${content}\n## Measurement\nObserved the requested click\n`);
	const proven = cli(repo, 'next');
	check('legacy recovery advances only after the handoff gates actually pass', proven.code === 0 && proven.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess', proven.out);
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
