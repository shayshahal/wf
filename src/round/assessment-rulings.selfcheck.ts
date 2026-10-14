// assessment-rulings.selfcheck.ts — #126, JX-275: a fix ruling must survive dispatch,
// restart and a moved HEAD, and green checks alone cannot hand off an open live repair.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { agreementSha } from './agreement.ts';
import { initializeSlices, parseBuildUnits } from './build-units.ts';
import { readState, writeState } from './state.ts';
import type { Question } from './state.ts';
import { assessmentRulingSource, verificationFixRulings, verificationGapsHash } from './assessment-rulings.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) failures++;
};

// Measurement-only work can leave HEAD unchanged: a later ruling on A+B must supersede
// the earlier fix on A, while a ruling about B alone cannot silently waive A.
{
	const a = 'INCONCLUSIVE — scenario A';
	const b = 'NOT VERIFIED — scenario B';
	const text = `head: H4\n## Live\n- ${a}\n- ${b}\n`;
	const context = { kind: 'single' } as const;
	const source = assessmentRulingSource(text, context);
	const ruling = (n: number, gaps: string[], answer: string): Question => ({ n, to: 'user', asked: 't', answered: 't', text: `open: ${gaps.join(' · ')}`, answer, source: `${source}#open:${verificationGapsHash(gaps)}`, verification_gaps: gaps });
	const first = ruling(1, [a], 'fix A');
	const accepted = ruling(2, [a, b], 'accept: defer both scenarios');
	check('a later accept of an expanded gap set at the same HEAD supersedes the earlier fix', verificationFixRulings(text, context, [first, accepted]).length === 0);
	const replacement = ruling(3, [a, b], 'fix: use the new scenario setup');
	check('the latest fix on the same lines replaces earlier instructions rather than demanding duplicate proof', verificationFixRulings(text, context, [first, replacement]).map((q) => q.n).join() === '3');
	check('an accept for B alone cannot waive the pending fix for A', verificationFixRulings(text, context, [first, ruling(4, [b], 'accept B')]).map((q) => q.n).join() === '1');
}

for (const route of ['ordinary', 'consequential', 'unit', 'integration']) {
	const repo = mkdtempSync(join(tmpdir(), 'wf-verification-fix-'));
	try {
		const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@e.invalid', ...args], { encoding: 'utf8' }).trim();
		const cli = (...args: string[]) => {
			const result = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
			return { code: result.status, out: `${result.stdout}${result.stderr}` };
		};
		git('init', '-q', '-b', 'main');
		writeFileSync(join(repo, '.gitignore'), '.wf/\n');
		writeFileSync(join(repo, 'a.txt'), 'before\n');
		git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
		const folder = 'bug-reports/r';
		mkdirSync(join(repo, folder, 'proof'), { recursive: true });
		const ticket = '# r\n## Intent\n- verify the requested behavior\n';
		const cases = '## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | fix: behavior | a.txt | manual: drive the behavior |\n';
		const units = '## Units\n| # | unit | cases | depends on | review after |\n|---|---|---|---|---|\n| 1 | behavior | 1 | — | behavior |\n';
		const agreement = route === 'ordinary' ? `${ticket}\n## Notes\n- T2 walk: none — the API test is the proof.\n${cases}` : '# r\nClass: B\n## Observed\n- before at a.txt:1\n## Agreed\n- Behavior: verify the behavior. Excluding: other behavior.\n- Choice: use the current flow (rejected: replacement).\n- T2 walk: none — the API test is the proof.\n' + cases + (route === 'unit' || route === 'integration' ? units : '');
		writeFileSync(join(repo, folder, 'TICKET.md'), route === 'ordinary' ? agreement : ticket);
		if (route !== 'ordinary') writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement);
		const klass = route === 'ordinary' ? 'A' : 'B';
		const plan = parseBuildUnits(agreement);
		const initialHead = git('rev-parse', 'HEAD');
		writeState(repo, () => ({ wf_version: 2, round: 'fix/r', id: 'r', folder, base: 'main', class: klass, step: 'assess', ...(plan.kind === 'units' ? { slices: initializeSlices(plan, initialHead) } : {}) }));
		if (klass === 'B') writeFileSync(join(repo, folder, 'AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(repo, klass, folder)}\nverdict: approved\n`);
		writeFileSync(join(repo, 'a.txt'), 'fixed\n'); git('add', 'a.txt'); git('commit', '-qm', 'fix');
		const assessedHead = git('rev-parse', 'HEAD');
		const assessmentFile = route === 'unit' ? 'ASSESSMENT-unit-1.md' : 'ASSESSMENT.md';
		const scope = route === 'unit' ? 'unit:1' : route === 'integration' ? 'integration' : undefined;
		if (route === 'integration' && plan.kind === 'units') writeState(repo, () => ({ slices: { planSha: plan.sha, unit: null, base: assessedHead, reviewBase: assessedHead, completed: [{ n: 1, head: assessedHead, reviewed: true }] } }));
		const assessment = (head: string, live: string) => `# r\nVerdict: clean\nhead: ${head}\n${scope ? `scope: ${scope}\nbase: ${initialHead}\n` : ''}## Intent\n- "behavior": met: a.txt:1 · before: before · after: fixed\n## Live\n- ${live}\n`;
		const gap = 'INCONCLUSIVE — requested click not driven; missing scenario capability';
		writeFileSync(join(repo, folder, assessmentFile), assessment(assessedHead, gap));
		const logGreen = () => {
			const content = worktreeContentSha(repo, folder, null, 'row');
			appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ row: scope ? 1 : null, rowCheck: scope ? 'manual: drive the behavior' : null, scope, content, result: 'green', tasks: [] }) + '\n');
			if (route === 'integration') appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ row: 'suites', content, result: 'green', tasks: [] }) + '\n');
		};
		logGreen();
		check(`${route}: next records the actual open verification`, cli('next').out.includes(gap) && readState(repo)?.questions?.length === 1);
		const beforeAgreement = readFileSync(join(repo, folder, klass === 'A' ? 'TICKET.md' : 'AGREEMENT.md'), 'utf8');
		const answer = 'fix — add the missing scenario capability, then drive the requested click with proof.\n`wf check` alone is not the live proof; keep {{literal}} as written.';
		check(`${route}: decide records the person's exact answer`, cli('decide', answer).code === 0 && readState(repo)?.answered?.[0]?.answer === answer);
		check(`${route}: an assessment ruling does not become an agreement decision`, readFileSync(join(repo, folder, klass === 'A' ? 'TICKET.md' : 'AGREEMENT.md'), 'utf8') === beforeAgreement);
		const dispatch = cli('next');
		check(`${route}: the repair dispatch carries the gap and ruling verbatim`, dispatch.code === 0 && dispatch.out.includes(answer) && dispatch.out.includes(gap), dispatch.out);
		const brief = cli('brief', 'build');
		check(`${route}: a new build process receives clean assessment findings and the ruling`, brief.code === 0 && brief.out.includes(answer) && brief.out.includes(gap), brief.out);
		check(`${route}: the brief says a check green alone cannot complete this live repair`, brief.out.includes('verification-q1.md') && brief.out.includes('BLOCKED.md'));
		check(`${route}: the question freezes the exact verification lines`, readState(repo)?.answered?.[0]?.verification_gaps?.join('\n') === gap);
		writeFileSync(join(repo, folder, assessmentFile), assessment(assessedHead, 'NOT VERIFIED — another scenario'));
		check(`${route}: a closed gap does not replay an older fix when a different gap remains at the same HEAD`, !cli('prompt', 'build').out.includes(answer));
		writeFileSync(join(repo, folder, assessmentFile), assessment(assessedHead, gap));
		// Installed pre-#126 questions have no structured gap list; keep their saved feedback readable.
		writeState(repo, (current) => ({ answered: current.answered?.map(({ verification_gaps, ...q }) => q) }));
		check(`${route}: legacy answered questions still carry pending feedback after restart`, cli('brief', 'build').out.includes(answer));
		writeState(repo, (current) => ({ answered: current.answered?.map((q) => ({ ...q, verification_gaps: [gap] })) }));
		const stateFile = join(repo, '.wf/state.json');
		const goodStateText = readFileSync(stateFile, 'utf8');
		const goodState = readState(repo);
		for (const invalid of [[], [42], ['changed gap without its source hash']]) {
			const corrupt = JSON.stringify({ ...goodState, answered: goodState?.answered?.map((q) => ({ ...q, verification_gaps: invalid })) });
			writeFileSync(stateFile, corrupt);
			const refused = cli('next');
			check(`${route}: corrupt verification metadata refuses without rewriting authority (${JSON.stringify(invalid)})`, refused.code === 1 && refused.out.includes('verification_gaps') && readFileSync(stateFile, 'utf8') === corrupt, refused.out);
			writeFileSync(stateFile, goodStateText);
		}
		const invalidNumber = JSON.stringify({ ...goodState, answered: goodState?.answered?.map((q) => ({ ...q, n: 0 })) });
		writeFileSync(stateFile, invalidNumber);
		check(`${route}: verification question numbers cannot corrupt the proof path`, cli('next').code === 1 && readFileSync(stateFile, 'utf8') === invalidNumber);
		writeFileSync(stateFile, goodStateText);
		const proof = join(repo, folder, 'proof/verification-q1.md');
		const question = readState(repo)?.answered?.[0];
		const report = (head: string, content: string) => `source: ${question?.source}\nhead: ${head}\ncontent-sha: ${content}\n## Measurement\nScenario capability created; requested click driven. Evidence: proof/click.txt\n`;
		writeFileSync(join(repo, folder, 'proof/click.txt'), 'fixture live-check observation\n');
		writeFileSync(proof, report(assessedHead, worktreeContentSha(repo, folder, null, 'row')));
		// Reproduce the second failure: check freshness wins the dispatch, but must not erase the ruling.
		writeFileSync(join(repo, 'a.txt'), 'fixed after rebase\n'); git('add', 'a.txt'); git('commit', '-qm', 'moved implementation');
		writeState(repo, () => ({ step: 'assess' }));
		const rebased = cli('next');
		check(`${route}: freshness sends the changed implementation back to build`, (rebased.out.includes('changed since') || rebased.out.includes('no current green')) && readState(repo)?.step === 'build', rebased.out);
		const rebasedBrief = cli('brief', 'build');
		check(`${route}: the ruling and original gaps survive the freshness-driven dispatch`, rebasedBrief.code === 0 && rebasedBrief.out.includes(answer) && rebasedBrief.out.includes(gap), rebasedBrief.out);
		logGreen();
		const staleProof = cli('step', 'assess');
		check(`${route}: old proof cannot hand off a changed HEAD`, staleProof.code === 2 && staleProof.out.includes('verification-q1.md') && readState(repo)?.step === 'build', staleProof.out);
		rmSync(proof);
		const noProof = cli('step', 'assess');
		check(`${route}: green checks without live repair proof refuse handoff without mutation`, noProof.code === 2 && noProof.out.includes('verification-q1.md') && readState(repo)?.step === 'build', noProof.out);
		const head = git('rev-parse', 'HEAD');
		const content = worktreeContentSha(repo, folder, null, 'row');
		writeFileSync(proof, report(head, 'wrong-content'));
		check(`${route}: proof of other implementation bytes refuses`, cli('step', 'assess').code === 2);
		writeFileSync(proof, report(head, content).replace(`source: ${question?.source}`, 'source: unrelated-question'));
		check(`${route}: proof of another ruling refuses`, cli('step', 'assess').code === 2);
		writeFileSync(proof, report(head, content).replace('Scenario capability created; requested click driven. Evidence: proof/click.txt', 'INCONCLUSIVE — still cannot drive it'));
		check(`${route}: an unmeasured repair record refuses`, cli('step', 'assess').code === 2);
		writeFileSync(proof, report(head, content));
		const handoff = cli('step', 'assess');
		check(`${route}: current question-bound measurement proof permits independent assessment`, handoff.code === 0 && readState(repo)?.step === 'assess', handoff.out);
		const assessPrompt = cli('prompt', 'assess');
		check(`${route}: the independent assessor receives the ruling and proof path`, assessPrompt.out.includes(answer) && assessPrompt.out.includes('verification-q1.md'), assessPrompt.out);
		writeFileSync(join(repo, folder, assessmentFile), assessment(head, 'VERIFIED — drove the requested click; proof/click.txt'));
		check(`${route}: independent closure restores review`, cli('next').out.startsWith('review: T2'));
		check(`${route}: resolved verification does not replay the old fix in a later build`, !cli('prompt', 'build').out.includes('## Verification repair rulings'));
		// Explicit accept stays an acceptance, never a repair obligation/proof requirement.
		writeFileSync(join(repo, folder, assessmentFile), assessment(head, 'NOT VERIFIED — another optional scenario'));
		cli('next'); cli('decide', 'accept: defer the optional scenario');
		check(`${route}: acceptance still opens review without repair proof`, cli('next').out.startsWith('review: T2') && !cli('prompt', 'build').out.includes('## Verification repair rulings'));
		if (route === 'ordinary') {
			writeFileSync(join(repo, folder, assessmentFile), assessment(head, 'VERIFIED — requested click driven'));
			appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ row: 'suites', content, result: 'red', tasks: [{ label: 'affected suite', exit: 1 }] }) + '\n');
			cli('next');
			const suiteAnswer = 'fix — run and repair the affected suite, not only the selected case';
			cli('decide', suiteAnswer); cli('next');
			const suiteBrief = cli('brief', 'build');
			check('suite-only: the ruling and failed suite reach the build without a measurement artifact', suiteBrief.out.includes(suiteAnswer) && suiteBrief.out.includes('affected suite') && !suiteBrief.out.includes('verification-q3.md'), suiteBrief.out);
			const uncheckedSuite = cli('step', 'assess');
			check('suite-only: a selected-case green does not finish an explicit suite fix', uncheckedSuite.code === 2 && readState(repo)?.step === 'build', uncheckedSuite.out);
			appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ row: 'suites', content, result: 'green', tasks: [{ label: 'affected suite', exit: 0 }] }) + '\n');
			check('suite-only: a current suite green hands off without an extra measurement artifact', cli('step', 'assess').code === 0);
		}

	} finally { rmSync(repo, { recursive: true, force: true }); }
}

// #134 (JX-1069): a repair receipt binds the implementation's bytes, not the commit that carries the
// receipt. The builder writes proof/verification-q1.md after committing the implementation, then
// commits that paperwork; HEAD moves, the measured product/test bytes do not, and the handoff must
// accept the record as written rather than demand it name the new HEAD. A rebase that rewrites the
// commits but keeps those bytes (an empty base commit here) leaves the receipt valid too.
// Another ruling's source, other implementation bytes and a changed product still refuse.
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-verification-proof-'));
	try {
		const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@e.invalid', ...args], { encoding: 'utf8' }).trim();
		const cli = (...args: string[]) => {
			const result = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
			return { code: result.status, out: `${result.stdout}${result.stderr}` };
		};
		git('init', '-q', '-b', 'main');
		writeFileSync(join(repo, '.gitignore'), '.wf/\n');
		writeFileSync(join(repo, 'a.txt'), 'before\n');
		git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
		const folder = 'bug-reports/r';
		mkdirSync(join(repo, folder, 'proof'), { recursive: true });
		writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- verify the requested behavior\n');
		writeFileSync(join(repo, 'a.txt'), 'fixed\n'); git('add', 'a.txt'); git('commit', '-qm', 'fix the behavior');
		const measuredHead = git('rev-parse', 'HEAD');
		writeState(repo, () => ({ wf_version: 2, round: 'fix/r', id: 'r', folder, base: 'main', class: 'A', step: 'build' }));
		const gap = 'INCONCLUSIVE — requested click not driven';
		const source = `ASSESSMENT.md#${measuredHead}#open:${verificationGapsHash([gap])}`;
		writeFileSync(join(repo, folder, 'ASSESSMENT.md'), `# r\nVerdict: clean\nhead: ${measuredHead}\n## Live\n- ${gap}\n`);
		writeState(repo, () => ({ answered: [{ n: 1, to: 'user', text: `open: ${gap}`, source, verification_gaps: [gap], answer: 'fix — drive the requested click with proof', asked: 't', answered: 't' }] }));
		const content = worktreeContentSha(repo, folder, null, 'row');
		appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ content, result: 'green', tasks: [] }) + '\n');
		const proof = join(repo, folder, 'proof/verification-q1.md');
		writeFileSync(join(repo, folder, 'proof/click.txt'), 'fixture live-check observation\n');
		const receipt = (head: string, sha: string) => `source: ${source}\nhead: ${head}\ncontent-sha: ${sha}\n## Measurement\nScenario capability created; the requested click was driven. Evidence: proof/click.txt\n`;
		writeFileSync(proof, receipt(measuredHead, content));
		// The builder commits the round's paperwork: HEAD moves, the measured bytes do not.
		git('add', folder); git('commit', '-qm', 'paperwork: verification q1 proof');
		const paperworkHead = git('rev-parse', 'HEAD');
		check('paperwork commit moves HEAD without changing the measured implementation', paperworkHead !== measuredHead && worktreeContentSha(repo, folder, null, 'row') === content);
		const handoff = cli('step', 'assess');
		check('a committed receipt hands off without being rewritten to the new HEAD', handoff.code === 0 && readState(repo)?.step === 'assess' && readFileSync(proof, 'utf8') === receipt(measuredHead, content), handoff.out);
		// Provenance remains a real commit id, even though it need not be current HEAD.
		for (const badHead of ['', 'not-a-commit']) {
			writeFileSync(proof, receipt(badHead, content));
			const before = readFileSync(join(repo, '.wf/state.json'), 'utf8');
			const malformed = cli('step', 'assess');
			check(`missing/malformed measured head refuses without rewriting authority (${badHead || 'empty'})`, malformed.code === 2 && malformed.out.includes('head:') && readFileSync(join(repo, '.wf/state.json'), 'utf8') === before, malformed.out);
		}
		// Another ruling's source and other implementation bytes still refuse.
		writeFileSync(proof, receipt(measuredHead, content).replace(`source: ${source}`, 'source: ASSESSMENT.md#deadbeef#open:00000000'));
		const wrongSource = cli('step', 'assess');
		check('a receipt for another ruling refuses', wrongSource.code === 2 && wrongSource.out.includes('source'), wrongSource.out);
		writeFileSync(proof, receipt(measuredHead, 'tree:other-bytes'));
		const wrongContent = cli('step', 'assess');
		check('a receipt of other implementation bytes refuses', wrongContent.code === 2 && wrongContent.out.includes('content-sha'), wrongContent.out);
		// A product change is other bytes even when a fresh green of them is in checks.log.
		writeFileSync(join(repo, 'a.txt'), 'tampered\n');
		appendFileSync(join(repo, '.wf/checks.log'), JSON.stringify({ content: worktreeContentSha(repo, folder, null, 'row'), result: 'green', tasks: [] }) + '\n');
		const changedProduct = cli('step', 'assess');
		check('a product change refuses even with a fresh green of it', changedProduct.code === 2 && changedProduct.out.includes('content-sha') && readState(repo)?.step === 'assess', changedProduct.out);
		git('checkout', '--', 'a.txt');
		writeFileSync(proof, receipt(measuredHead, content));
		// A rebase that rewrites the commits while keeping the measured bytes keeps the receipt.
		git('checkout', '-q', 'main'); git('commit', '--allow-empty', '-qm', 'base advance'); git('checkout', '-q', 'fix/r'); git('rebase', '-q', 'main');
		const rebasedHead = git('rev-parse', 'HEAD');
		check('the rebase rewrote HEAD while the measured implementation stayed', rebasedHead !== paperworkHead && worktreeContentSha(repo, folder, null, 'row') === content);
		const afterRebase = cli('step', 'assess');
		check('a rebase that keeps the measured bytes keeps the receipt', afterRebase.code === 0 && readFileSync(proof, 'utf8') === receipt(measuredHead, content), afterRebase.out);
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
