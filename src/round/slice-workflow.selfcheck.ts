// slice-workflow.selfcheck.ts — node slice-workflow.selfcheck.ts → exit 0 when green.
// Regression coverage for the sliced build workflow: the `## Units` plan a class A ticket can carry
// (build-units.selfcheck.ts owns the pure walk), the per-unit actions of `wf next` (assigned cases
// green at the same implementation content and slice scope, the scope/base/head binding, the
// checkpoint pause, the integration's suites), the per-unit build prompt's own review file, and a real
// CLI temp repo driving `wf next`, `wf step assess`, `wf review --done` and `wf step build
// --restart-units`, reading the persisted `.wf/state.json` back through the public constructors.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificationCases } from './agreement.ts';
import { advanceSlice, initializeSlices, parseBuildUnits, sliceContext } from './build-units.ts';
import type { BuildPlan, SliceContext, UnitSlice } from './build-units.ts';
import { nextAction } from './next.ts';
import type { Snapshot } from './next.ts';
import { readState } from './state.ts';
import { sliceDeliveryGap } from '../gates/deliver.ts';
import { reviewTarget } from '../gates/review.ts';
import { checkGap } from './step.ts';
import type { ChecksEvidence } from './step.ts';
import { approvalIdentity, trackerNotePath, worktreeContentSha } from '../gates/content-identity.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the plan: a class A ticket whose `## Verification` cases are fenced or manual, so no project
// runtime is needed to check the workflow itself.
const CHECK1 = '—';
const CHECK2 = 'manual: open the page and see the count';
const CHECK3 = '—';
const TICKET = `# r — ticket
## Intent
- "x": the modal keeps its scroll position
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | first: the schema | src/one.ts | ${CHECK1} |
| 2 | second: the API | src/two.ts | ${CHECK2} |
| 3 | third: the list | src/three.ts | ${CHECK3} |
## Units
| # | unit | cases | depends on | review after |
|---|---|---|---|---|
| 1 | the schema | 1 | — | — |
| 2 | the API | 2 | 1 | early look |
| 3 | the list | 3 | 2 | late look |
`;
const UNIT1_CASES = [{ n: 1, check: CHECK1 }];
const UNIT2_CASES = [{ n: 2, check: CHECK2 }];
const UNIT3_CASES = [{ n: 3, check: CHECK3 }];
const ALL_CASES = [...UNIT1_CASES, ...UNIT2_CASES, ...UNIT3_CASES];

check('the ticket\'s three cases carry the cells the arms use', verificationCases(TICKET).map((c) => c.check).join('|') === `${CHECK1}|${CHECK2}|${CHECK3}`);

// The plan and a legitimate progress walk, built only from public constructors.
const plan = parseBuildUnits(TICKET) as BuildPlan;
const p0 = initializeSlices(plan, 'h0');
const c1 = sliceContext(TICKET, p0) as UnitSlice;
const p1 = advanceSlice(c1, p0, 'h1', { reviewed: false });
const c2 = sliceContext(TICKET, p1) as UnitSlice;
const p2 = advanceSlice(c2, p1, 'h2', { reviewed: true });
const c3 = sliceContext(TICKET, p2) as UnitSlice;
const p3 = advanceSlice(c3, p2, 'h3', { reviewed: true });
const integration = sliceContext(TICKET, p3);
const changedAgreement = TICKET.replace('| 3 | the list |', '| 3 | the bigger list |');

check('a three-unit plan parses with each unit\'s cases and checkpoint', plan.units.map((u) => `${u.n}:${u.cases.join('.')}:${u.reviewAfter ?? '-'}`).join(' ') === '1:1:- 2:2:early look 3:3:late look', JSON.stringify(plan.units));
check('unit 1 has no review after it; units 2 and 3 do', plan.units[0].reviewAfter === null && plan.units[1].reviewAfter === 'early look' && plan.units[2].reviewAfter === 'late look');
check('each unit names its own assessment and review file, scope and start head', ['ASSESSMENT-unit-1.md', 'h0'].join() === [c1.assessmentFile, c1.base].join() && ['REVIEW-unit-1.md', 'ASSESSMENT-unit-2.md', 'h1'].join() === [c1.reviewFile, c2.assessmentFile, c2.base].join() && ['ASSESSMENT-unit-3.md', 'h2'].join() === [c3.assessmentFile, c3.base].join(), JSON.stringify([c1, c2, c3]));
check('the integration writes the round\'s own assessment and review, from the last reviewed head', integration.kind === 'integration' && integration.base === 'h3' && integration.assessmentFile === 'ASSESSMENT.md' && integration.reviewFile === 'REVIEW.md', JSON.stringify(integration));

// ── evidence helpers: the checks.log shape step.ts checksEvidence reads (a row and its exact cell,
// a content identity and a slice scope), so invalid evidence can be written independently.
const logLine = (o: Record<string, unknown>) => JSON.stringify({ ts: 't', row: null, rowCheck: null, tasks: [], ...o });
const caseGreen = (n: number, checkCell: string, content: string, scope: string) => logLine({ row: n, rowCheck: checkCell, result: 'green', content, scope });
const suitesGreen = (content: string) => logLine({ row: 'suites', result: 'green', content, tasks: [] });
const evUnit = (log: string[], n: number, cases: { n: number; check: string }[], content = 'tree:w1'): ChecksEvidence => ({ log: log.map((l) => `${l}\n`).join(''), content, scope: `unit:${n}`, cases, requireSuites: false });
const evIntegration = (log: string[], cases: { n: number; check: string }[], content = 'tree:w1'): ChecksEvidence => ({ log: log.map((l) => `${l}\n`).join(''), content, scope: 'integration', cases, requireSuites: true });

// ── the pure `wf next` snapshot builders. `assessment` is the file shape next.ts reads.
const assessment = (o: { head: string; scope: string; base?: string; verdict?: string; intent?: string }) => `# r — assessment
Verdict: ${o.verdict ?? 'clean'}
head: ${o.head}
scope: ${o.scope}
${o.base ? `base: ${o.base}\n` : ''}## Intent
${o.intent ?? '- "x": met: src/one.ts:1 · before: red · after: green'}
`;
const snap = (patch: Partial<Snapshot> = {}): Snapshot => ({
	branch: 'fix/r', entry: 'C:/wf/wf.mjs', step: 'build', klass: 'A', check: false, questions: [], answered: [],
	files: { agreement: TICKET, assessment: null, review: null, blocked: null },
	t1: { sha: null, reviewed: null, verdict: null },
	head: 'h1', note: null, repairs: 0,
	...patch,
});
const filesWith = (a: string | null, r: string | null = null) => ({ agreement: TICKET, assessment: a, review: r, blocked: null });
const say = (s: Snapshot) => nextAction(s).say;
const steps = (s: Snapshot) => nextAction(s).effects.filter((e) => e.step).map((e) => e.step!.join(' '));
const advances = (s: Snapshot) => nextAction(s).effects.filter((e) => e.advance).map((e) => e.advance!);
const unit1 = (checks: ChecksEvidence, a = assessment({ head: 'h1', scope: 'unit:1', base: 'h0' }), patch: Partial<Snapshot> = {}) =>
	snap({ step: 'assess', head: 'h1', slices: p0, checks, files: filesWith(a), ...patch });
const unit2 = (checks: ChecksEvidence, a = assessment({ head: 'h2', scope: 'unit:2', base: 'h1' }), patch: Partial<Snapshot> = {}) =>
	snap({ step: 'assess', head: 'h2', slices: p1, checks, files: filesWith(a), ...patch });
const integrationSnap = (checks: ChecksEvidence, a = assessment({ head: 'h3', scope: 'integration' }), patch: Partial<Snapshot> = {}) =>
	snap({ step: 'assess', head: 'h3', slices: p3, checks, files: filesWith(a), ...patch });

// ── starting the plan
check('a planned build with no progress starts the first bounded unit', say(snap({ step: 'build' })).startsWith('dispatch build') && say(snap({ step: 'build' })).includes('first bounded unit') && steps(snap({ step: 'build' })).join() === 'build', say(snap({ step: 'build' })));

// ── unit 1: no checkpoint, advances the moment its assessment is clean
const g1 = evUnit([caseGreen(1, CHECK1, 'tree:w1', 'unit:1')], 1, UNIT1_CASES);
check('a clean unit 1 assessment advances once to unit 2', say(unit1(g1)).startsWith('advance: unit 1 assessed') && JSON.stringify(advances(unit1(g1))) === JSON.stringify([{ unit: 1, head: 'h1' }]), say(unit1(g1)));

// ── before handing off, every case assigned to the unit must have a current green at the same
// content and the same slice scope — not the last single green, and not another slice's
const noGreen = evUnit([], 1, UNIT1_CASES);
check('a unit with no wf check on record goes back to build, not to the assessor', steps(unit1(noGreen)).join() === 'build' && say(unit1(noGreen)).includes('case 1'), say(unit1(noGreen)));
const wrongSliceScope = evUnit([caseGreen(1, CHECK1, 'tree:w1', 'unit:2')], 1, UNIT1_CASES);
check('a green of this case at another slice\'s scope is not this unit\'s green', steps(unit1(wrongSliceScope)).join() === 'build', say(unit1(wrongSliceScope)));
const staleContent = evUnit([caseGreen(1, CHECK1, 'tree:w0', 'unit:1')], 1, UNIT1_CASES);
check('a green of other bytes is stale: back to build', steps(unit1(staleContent)).join() === 'build', say(unit1(staleContent)));
const notACaseRow = evUnit([logLine({ result: 'green', content: 'tree:w1', scope: 'unit:1' })], 1, UNIT1_CASES);
check('a whole-run green with no case row is not the assigned case\'s green', steps(unit1(notACaseRow)).join() === 'build', say(unit1(notACaseRow)));
const wrongCell = evUnit([caseGreen(1, 'other cell', 'tree:w1', 'unit:1')], 1, UNIT1_CASES);
check('a green whose check cell is another row\'s is not this case\'s green', steps(unit1(wrongCell)).join() === 'build', say(unit1(wrongCell)));

// a unit owning several cases needs every one of them, not the green that happens to be last
const TICKET2 = `# r2 — ticket
## Intent
- "x": the modal keeps its scroll position
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | one | src/a.ts | — |
| 2 | two | src/b.ts | — |
| 3 | three | src/c.ts | — |
## Units
| # | unit | cases | depends on | review after |
|---|---|---|---|---|
| 1 | both | 1 2 | — | — |
| 2 | third | 3 | 1 | — |
`;
const plan2 = parseBuildUnits(TICKET2) as BuildPlan;
const p0b = initializeSlices(plan2, 'h0');
const twoCases = [{ n: 1, check: '—' }, { n: 2, check: '—' }];
const unitBoth = (checks: ChecksEvidence) => snap({ step: 'assess', head: 'h1', slices: p0b, checks, files: { agreement: TICKET2, assessment: assessment({ head: 'h1', scope: 'unit:1', base: 'h0' }), review: null, blocked: null } });
check('a unit owning two cases needs both of them green', steps(unitBoth(evUnit([caseGreen(1, '—', 'tree:w1', 'unit:1')], 1, twoCases))).join() === 'build' && say(unitBoth(evUnit([caseGreen(1, '—', 'tree:w1', 'unit:1')], 1, twoCases))).includes('case 2'), say(unitBoth(evUnit([caseGreen(1, '—', 'tree:w1', 'unit:1')], 1, twoCases))));
check('a unit with both its cases green advances', say(unitBoth(evUnit([caseGreen(1, '—', 'tree:w1', 'unit:1'), caseGreen(2, '—', 'tree:w1', 'unit:1')], 1, twoCases))).startsWith('advance: unit 1'), say(unitBoth(evUnit([caseGreen(2, '—', 'tree:w1', 'unit:1')], 1, twoCases))));

// ── unit 2: a checkpoint pauses the round for the chunk review, and the assessment is bound to the
// unit's own scope, its start head, and the HEAD it judged
const g2 = evUnit([caseGreen(2, CHECK2, 'tree:w1', 'unit:2')], 2, UNIT2_CASES);
check('a clean checkpoint unit 2 asks for its T2 chunk, not final, and does not advance', say(unit2(g2)).startsWith('review: T2 chunk — early look') && say(unit2(g2)).includes('approval continues the build, not delivery') && nextAction(unit2(g2)).effects.length === 0, say(unit2(g2)));
check('unit 2 must name its scope unit:2', say(unit2(g2, assessment({ head: 'h2', scope: 'unit:1', base: 'h1' }))).startsWith('dispatch assess') && say(unit2(g2, assessment({ head: 'h2', scope: 'unit:1', base: 'h1' }))).includes('must name scope: unit:2'), say(unit2(g2, assessment({ head: 'h2', scope: 'unit:1', base: 'h1' }))));
check('unit 2 must judge its diff from its own start head', say(unit2(g2, assessment({ head: 'h2', scope: 'unit:2', base: 'h0' }))).startsWith('dispatch assess') && say(unit2(g2, assessment({ head: 'h2', scope: 'unit:2', base: 'h0' }))).includes("must judge this unit's diff from base: h1"), say(unit2(g2, assessment({ head: 'h2', scope: 'unit:2', base: 'h0' }))));
check('an assessment of an earlier HEAD does not hand off the unit', say(unit2(g2, assessment({ head: 'h1', scope: 'unit:2', base: 'h1' }))).startsWith('dispatch assess') && say(unit2(g2, assessment({ head: 'h1', scope: 'unit:2', base: 'h1' }))).includes('HEAD is h2'), say(unit2(g2, assessment({ head: 'h1', scope: 'unit:2', base: 'h1' }))));

// ── deferral: a unit may defer an intent line to a later unit; the integration may not defer any
const deferOnly = unit1(g1, assessment({ head: 'h1', scope: 'unit:1', base: 'h0', intent: '- "y": deferred: unit 2' }));
check('a unit assessment whose every intent line is deferred has no current measurement', say(deferOnly).startsWith('dispatch assess') && say(deferOnly).includes('every line was deferred'), say(deferOnly));
const deferLater = unit1(g1, assessment({ head: 'h1', scope: 'unit:1', base: 'h0', intent: '- "x": met: src/one.ts:1 · before: red · after: green\n- "y": deferred: unit 2' }));
check('a unit may defer a later unit\'s intent and still advance', say(deferLater).startsWith('advance: unit 1 assessed'), say(deferLater));
const deferSelf = unit2(g2, assessment({ head: 'h2', scope: 'unit:2', base: 'h1', intent: '- "x": met: src/two.ts:1 · before: red · after: green\n- "y": deferred: unit 2' }));
check('a unit may not defer to itself (only later units are future)', say(deferSelf).startsWith('dispatch assess'), say(deferSelf));
const deferNext = unit2(g2, assessment({ head: 'h2', scope: 'unit:2', base: 'h1', intent: '- "x": met: src/two.ts:1 · before: red · after: green\n- "y": deferred: unit 3' }));
check('a unit may defer the next unit', say(deferNext).startsWith('review: T2 chunk'), say(deferNext));

// ── the integration: every case of the whole agreement green at the integration scope, plus the
// suites, and the final assessment scoped `integration`
const gInt = evIntegration([caseGreen(1, CHECK1, 'tree:w1', 'integration'), caseGreen(2, CHECK2, 'tree:w1', 'integration'), caseGreen(3, CHECK3, 'tree:w1', 'integration'), suitesGreen('tree:w1')], ALL_CASES);
check('the integration with every case and the suites green opens its final T2', say(integrationSnap(gInt)).startsWith('review: T2 final delivery'), say(integrationSnap(gInt)));
check('the integration must name scope integration', say(integrationSnap(gInt, assessment({ head: 'h3', scope: 'unit:3' }))).startsWith('dispatch assess') && say(integrationSnap(gInt, assessment({ head: 'h3', scope: 'unit:3' }))).includes('must name scope: integration'), say(integrationSnap(gInt, assessment({ head: 'h3', scope: 'unit:3' }))));
const noSuites = evIntegration([caseGreen(1, CHECK1, 'tree:w1', 'integration'), caseGreen(2, CHECK2, 'tree:w1', 'integration'), caseGreen(3, CHECK3, 'tree:w1', 'integration')], ALL_CASES);
check('the integration needs a current green of wf check --suites', steps(integrationSnap(noSuites)).join() === 'build' && say(integrationSnap(noSuites)).includes('suites'), say(integrationSnap(noSuites)));
const missingCase = evIntegration([caseGreen(1, CHECK1, 'tree:w1', 'integration'), caseGreen(3, CHECK3, 'tree:w1', 'integration'), suitesGreen('tree:w1')], ALL_CASES);
check('the integration needs every case green, not the ones that happen to be', steps(integrationSnap(missingCase)).join() === 'build' && say(integrationSnap(missingCase)).includes('case 2'), say(integrationSnap(missingCase)));
const caseGreenRounded = evIntegration([caseGreen(1, CHECK1, 'tree:w1', 'unit:1'), caseGreen(2, CHECK2, 'tree:w1', 'integration'), caseGreen(3, CHECK3, 'tree:w1', 'integration'), suitesGreen('tree:w1')], ALL_CASES);
check('a case green of a unit scope does not count for the integration', steps(integrationSnap(caseGreenRounded)).join() === 'build', say(integrationSnap(caseGreenRounded)));
const deferFinal = integrationSnap(gInt, assessment({ head: 'h3', scope: 'integration', intent: '- "x": met: src/one.ts:1 · before: red · after: green\n- "y": deferred: unit 1' }));
check('the final integration may not defer a unit, only a unit assessment may', say(deferFinal).startsWith('dispatch assess'), say(deferFinal));

// ── a unit is never delivery; only the integration is
check('wf next at a unit\'s pr waits on the units and integration', say(snap({ step: 'pr', slices: p1 })) === 'wait user: unit approval is not delivery approval — finish the units and integration');
check('wf next at the integration\'s pr delivers', say(snap({ step: 'pr', slices: p3 })).startsWith('deliver: T2 approved'));

// ── a changed plan refuses the old progress and names the explicit restart
check('a changed ## Units refuses the old progress and names the restart flag', say(snap({ step: 'build', slices: p1, files: { agreement: changedAgreement, assessment: null, review: null, blocked: null } })).includes('changed since this build started') && say(snap({ step: 'build', slices: p1, files: { agreement: changedAgreement, assessment: null, review: null, blocked: null } })).includes('--restart-units'), say(snap({ step: 'build', slices: p1, files: { agreement: changedAgreement, assessment: null, review: null, blocked: null } })));

// ── checkpoint routing (wf review's target) and the delivery boundary (wf deliver's t2Gap): a unit
// with no review after it has nothing to approve, a chunk writes REVIEW-unit-<n>.md, and only an
// integration-scoped approval with every unit complete may deliver
const rtUnit2 = reviewTarget(TICKET, p1, 'main');
check('reviewTarget routes a checkpoint to REVIEW-unit-2.md scoped unit:2 from the last checkpoint', rtUnit2.kind === 'unit' && rtUnit2.reviewFile === 'REVIEW-unit-2.md' && rtUnit2.assessmentFile === 'ASSESSMENT-unit-2.md' && rtUnit2.scope === 'unit:2' && rtUnit2.base === 'h0' && rtUnit2.expectedBase === 'h0' && JSON.stringify(rtUnit2.caseNs) === '[1,2]' && rtUnit2.assessmentFiles.join(',') === 'ASSESSMENT-unit-1.md,ASSESSMENT-unit-2.md', JSON.stringify(rtUnit2));
const rtUnit1 = reviewTarget(TICKET, p0, 'main');
check('reviewTarget refuses a checkpoint for a unit with no review after it', rtUnit1.kind === 'refuse' && rtUnit1.why.includes('no checkpoint review'), JSON.stringify(rtUnit1));
const rtInt = reviewTarget(TICKET, p3, 'main');
check('reviewTarget routes the integration to REVIEW.md scoped integration from the round base', rtInt.kind === 'integration' && rtInt.reviewFile === 'REVIEW.md' && rtInt.scope === 'integration' && rtInt.base === 'main', JSON.stringify(rtInt));
const REVIEW_INT = '# Review — r\nverdict: approved\nscope: integration\n';
check('sliceDeliveryGap permits delivery only with every unit done and an integration verdict', sliceDeliveryGap(parseBuildUnits(TICKET), p3, REVIEW_INT) === null, String(sliceDeliveryGap(parseBuildUnits(TICKET), p3, REVIEW_INT)));
check('sliceDeliveryGap refuses a unit-scoped verdict', (sliceDeliveryGap(parseBuildUnits(TICKET), p3, '# Review — r\nverdict: approved\nscope: unit:3\n') ?? '').includes('not integration'));
check('sliceDeliveryGap refuses while a unit is still being built', (sliceDeliveryGap(parseBuildUnits(TICKET), p1, REVIEW_INT) ?? '').includes('unit 2 is still being built'));
const unreviewed = { ...p3, completed: [{ n: 1, head: 'h1', reviewed: false }, { n: 2, head: 'h2', reviewed: false }, { n: 3, head: 'h3', reviewed: true }] };
check('sliceDeliveryGap refuses a checkpoint that was never approved', (sliceDeliveryGap(parseBuildUnits(TICKET), unreviewed, REVIEW_INT) ?? '').includes('checkpoint review'));
check('sliceDeliveryGap refuses progress bound to another plan', (sliceDeliveryGap(parseBuildUnits(changedAgreement), p3, REVIEW_INT) ?? '').includes('after its units were built'));
check('sliceDeliveryGap leaves a single-build round alone and refuses a plan with no progress', sliceDeliveryGap(parseBuildUnits('# t\n'), undefined, null) === null && (sliceDeliveryGap(parseBuildUnits(TICKET), undefined, null) ?? '').includes('none was built'));

// ── checkGap, the shared reader, independently
check('checkGap: the assigned case needs its row, its cell, the content and the scope', checkGap(evUnit([caseGreen(2, CHECK2, 'tree:w1', 'unit:2')], 2, UNIT2_CASES)) === null && checkGap(evUnit([], 2, UNIT2_CASES))?.kind === 'check' && checkGap(evUnit([caseGreen(2, CHECK2, 'tree:w1', 'unit:1')], 2, UNIT2_CASES))?.kind === 'check' && checkGap(evUnit([caseGreen(2, CHECK2, 'tree:w0', 'unit:2')], 2, UNIT2_CASES))?.kind === 'check' && checkGap(evUnit([logLine({ result: 'green', content: 'tree:w1', scope: 'unit:2' })], 2, UNIT2_CASES))?.kind === 'check');

// ── the CLI: real temp repos drive the workflow and its persisted state
const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const cli = (repo: string, ...args: string[]) => {
	try {
		return { out: execFileSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' }), code: 0 };
	} catch (e) {
		const err = e as { stdout?: string; stderr?: string; status?: number };
		return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
	}
};
const writeRoundState = (repo: string, patch: Record<string, unknown> = {}) =>
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'A', ...patch }, null, 2)}\n`);
const sliceOf = (repo: string): SliceContext | null => {
	const st = readState(repo);
	if (!st?.slices) return null;
	return sliceContext(readFileSync(join(repo, 'bug-reports', 'r', 'TICKET.md'), 'utf8'), st.slices);
};
const freshRepo = (prefix: string): string => {
	const repo = mkdtempSync(join(tmpdir(), prefix));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports', 'r'), { recursive: true });
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports', 'r', 'TICKET.md'), TICKET);
	writeRoundState(repo);
	return repo;
};
const headOf = (repo: string) => git(repo, 'rev-parse', 'HEAD').trim();
const commit = (repo: string, file: string, body: string) => {
	mkdirSync(join(repo, file.split('/').slice(0, -1).join('/')), { recursive: true });
	writeFileSync(join(repo, file), body);
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', `unit: ${file}`);
	return headOf(repo);
};

const repo = freshRepo('wf-slice-');
try {
	// start: the plan is initialized at HEAD, bound to the parsed plan sha
	const start = cli(repo, 'next');
	const head0 = headOf(repo);
	const s0 = readState(repo);
	check('CLI: a planned class A round starts unit 1 at HEAD', start.code === 0 && start.out.startsWith('dispatch build') && start.out.includes('first bounded unit') && s0?.step === 'build' && s0?.slices?.unit === 1 && s0?.slices?.base === head0 && s0?.slices?.reviewBase === head0 && s0?.slices?.completed?.length === 0, start.out + JSON.stringify(s0?.slices));
	check('CLI: the recorded progress binds the parsed plan sha', s0?.slices?.planSha === plan.sha, JSON.stringify(s0?.slices?.planSha));
	const startAgain = cli(repo, 'next');
	check('CLI: wf next at an unstarted unit is idempotent', startAgain.code === 0 && JSON.stringify(readState(repo)?.slices) === JSON.stringify(s0?.slices) && readState(repo)?.step === 'build', startAgain.out);
	const ctx0 = sliceOf(repo);
	check('CLI: the persisted state reconstructs to unit 1 with its own files', ctx0 !== null && ctx0.kind === 'unit' && ctx0.unit.n === 1 && ctx0.base === head0 && ctx0.assessmentFile === 'ASSESSMENT-unit-1.md' && ctx0.reviewFile === 'REVIEW-unit-1.md', JSON.stringify(ctx0));

	// unit 1: the handoff needs the assigned case's green, then wf next advances once and resets repairs
	const h1 = commit(repo, 'src/one.ts', 'export const one = 1;\n');
	const refused = cli(repo, 'step', 'assess');
	check('CLI: wf step assess refuses a unit with no wf-recorded green of it', refused.code === 2 && refused.out.includes('wf check') && readState(repo)?.step === 'build', refused.out);
	const content1 = worktreeContentSha(repo, 'bug-reports/r', null, 'row');
	appendFileSync(join(repo, '.wf', 'checks.log'), `${caseGreen(1, CHECK1, content1, 'unit:1')}\n`);
	const assessed = cli(repo, 'step', 'assess');
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT-unit-1.md'), assessment({ head: h1, scope: 'unit:1', base: head0 }));
	check('CLI: with its assigned case green, wf step assess hands off', assessed.code === 0 && readState(repo)?.step === 'assess', assessed.out);
	writeRoundState(repo, { ...(readState(repo) ?? {}), repairs: 5 });
	const advanced = cli(repo, 'next');
	const s1 = readState(repo);
	check('CLI: wf next persists the advance once, resets repairs, base = the unit head', advanced.code === 0 && s1?.step === 'build' && s1?.slices?.unit === 2 && s1?.slices?.base === h1 && s1?.slices?.reviewBase === head0 && s1?.slices?.completed?.[0]?.n === 1 && s1?.slices?.completed?.[0]?.head === h1 && s1?.slices?.completed?.[0]?.reviewed === false && s1?.repairs === 0, advanced.out + JSON.stringify(s1?.slices));
	check('CLI: the advance dispatches the next unit', advanced.out.startsWith('dispatch build'), advanced.out);
	const advancedAgain = cli(repo, 'next');
	check('CLI: wf next after the advance does not advance twice', advancedAgain.code === 0 && JSON.stringify(readState(repo)?.slices) === JSON.stringify(s1?.slices), advancedAgain.out);
	const ctx1 = sliceOf(repo);
	check('CLI: the advanced state reconstructs to unit 2 from base h1', ctx1 !== null && ctx1.kind === 'unit' && ctx1.unit.n === 2 && ctx1.base === h1 && ctx1.assessmentFile === 'ASSESSMENT-unit-2.md', JSON.stringify(ctx1));

	// unit 2's build prompt: its own review file, its own cases, the whole plan still in view
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW-unit-2.md'), `# Review — r\nbase: ${head0}\nscope: unit:2\nverdict: changes-requested\n\n## 2026-01-01\n\nsrc/two.ts:1 — the early look needs the count\nverdict: changes-requested\n`);
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW.md'), `# Review — r\nbase: main\nverdict: changes-requested\n\n## 2026-01-01\n\nsrc/three.ts:1 — the final review must not leak here\nverdict: changes-requested\n`);
	const prompt = cli(repo, 'prompt', 'build');
	check('CLI: the unit 2 build prompt carries its own review corrections, not REVIEW.md\'s', prompt.code === 0 && prompt.out.includes('the early look needs the count') && !prompt.out.includes('the final review must not leak here'), prompt.out);
	check('CLI: the unit 2 prompt names its scope and owns only its cases', prompt.out.includes('scope: unit:2') && prompt.out.includes('Own only verification cases 2') && prompt.out.includes('src/two.ts') && !prompt.out.includes('src/three.ts'), prompt.out);
	check('CLI: the unit 2 prompt still carries the whole execution plan', prompt.out.includes('| 1 | the schema |') && prompt.out.includes('| 2 | the API |') && prompt.out.includes('| 3 | the list |'), prompt.out);
	const brief = cli(repo, 'brief', 'build');
	check('CLI: the dispatched unit 2 brief owns only its cases and ends with the wf step assess handoff', brief.code === 0 && brief.out.includes('scope: unit:2') && brief.out.includes('Own only verification cases 2') && brief.out.includes('src/two.ts') && !brief.out.includes('src/three.ts') && brief.out.includes('## Handoff') && brief.out.includes('wf step assess'), brief.out.slice(0, 200));

	// unit 2: assessment pauses at its chunk; the approved checkpoint advances it and starts unit 3
	let h2 = commit(repo, 'src/two.ts', 'export const two = 2;\n');
	const content2 = worktreeContentSha(repo, 'bug-reports/r', null, 'row');
	appendFileSync(join(repo, '.wf', 'checks.log'), `${caseGreen(2, CHECK2, content2, 'unit:2')}\n`);
	const assessed2 = cli(repo, 'step', 'assess');
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT-unit-2.md'), assessment({ head: h2, scope: 'unit:2', base: h1, intent: '- "x": met: src/two.ts:1 · before: red · after: green\n- "y": deferred: unit 3' }));
	const pause = cli(repo, 'next');
	const s2 = readState(repo);
	check('CLI: unit 2 hands off and wf next pauses at its T2 chunk, not final', assessed2.code === 0 && pause.code === 0 && pause.out.startsWith('review: T2 chunk — early look') && pause.out.includes('approval continues the build, not delivery') && s2?.step === 'assess' && s2?.slices?.unit === 2, pause.out + JSON.stringify(s2?.slices));
	const reviewBase2 = s2?.slices?.reviewBase ?? head0;
	// The first checkpoint covers units 1 and 2. Feedback about unit 1 must be repairable here,
	// and the handoff must remeasure both cases, not borrow unit 1's previous green.
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW-unit-2.md'), `# Review — r\nbase: ${reviewBase2}\nscope: unit:2\nsrc/one.ts:1 — repair the earlier schema in this chunk\nverdict: changes-requested\n`);
	const repairChunk = cli(repo, 'review', 'fix/r', '--done');
	const chunkState = readState(repo);
	check('CLI: chunk criticism keeps unit 2 active and enables chunk repair, never pr', repairChunk.code === 0 && chunkState?.step === 'build' && chunkState.slices?.unit === 2 && chunkState.slices.reviewRepair === true, repairChunk.out);
	const repairPrompt = cli(repo, 'prompt', 'build');
	check('CLI: chunk repair owns the earlier unreviewed unit too, not future units', repairPrompt.code === 0 && repairPrompt.out.includes('Repair the reviewed chunk (units 1, 2)') && repairPrompt.out.includes('own verification cases 1, 2') && repairPrompt.out.includes('repair the earlier schema') && !repairPrompt.out.includes('src/three.ts'), repairPrompt.out);
	check('CLI: chunk repair cannot hand off on only the active unit case green', cli(repo, 'step', 'assess').code === 2 && readState(repo)?.step === 'build');
	h2 = commit(repo, 'src/one.ts', 'export const one = 3;\n');
	const repairedContent = worktreeContentSha(repo, 'bug-reports/r', null, 'row');
	appendFileSync(join(repo, '.wf', 'checks.log'), `${caseGreen(1, CHECK1, repairedContent, 'unit:2')}\n${caseGreen(2, CHECK2, repairedContent, 'unit:2')}\n`);
	const premature = approvalIdentity(repo, 'bug-reports/r', trackerNotePath('bug-reports/r'));
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW-unit-2.md'), `# Review — r\nbase: ${reviewBase2}\nscope: unit:2\ncontent-sha: ${premature.worktree}\nhead-sha: ${premature.head}\nverdict: approved\n`);
	const unassessed = cli(repo, 'review', 'fix/r', '--done');
	check('CLI: direct checkpoint approval cannot skip reassessment of the repair HEAD', unassessed.code === 2 && unassessed.out.includes('dispatch assess') && readState(repo)?.slices?.unit === 2, unassessed.out);
	const repairAssessed = cli(repo, 'step', 'assess');
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT-unit-2.md'), assessment({ head: h2, scope: 'unit:2', base: h1 }));
	check('CLI: every repaired chunk case green and a fresh assessment reach its review', repairAssessed.code === 0 && cli(repo, 'next').out.startsWith('review: T2 chunk'), repairAssessed.out);
	const identity2 = approvalIdentity(repo, 'bug-reports/r', trackerNotePath('bug-reports/r'));
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW-unit-2.md'), `# Review — r\nbase: ${reviewBase2}\nscope: unit:2\ncontent-sha: ${identity2.worktree}\nhead-sha: ${identity2.head}\nverdict: approved\n`);
	const done2 = cli(repo, 'review', 'fix/r', '--done');
	const s3 = readState(repo);
	check('CLI: an approved checkpoint records the reviewed unit and starts the next build', done2.code === 0 && done2.out.includes('checkpoint approved') && s3?.step === 'build' && s3?.slices?.unit === 3 && s3?.slices?.base === h2 && s3?.slices?.reviewBase === h2 && s3?.slices?.completed?.[1]?.reviewed === true && s3?.repairs === 0, done2.out + JSON.stringify(s3?.slices));
	check('CLI: wf next after the checkpoint dispatches unit 3', cli(repo, 'next').out.startsWith('dispatch build'));
	check('CLI: checkpoint advancement clears chunk repair; unit 3 owns only case 3 again', !s3?.slices?.reviewRepair && (() => { const c = sliceOf(repo); return c?.kind === 'unit' && c.cases.join(',') === '3'; })());

	// unit 3: the last checkpoint, then the integration is active
	const h3 = commit(repo, 'src/three.ts', 'export const three = 3;\n');
	const content3 = worktreeContentSha(repo, 'bug-reports/r', null, 'row');
	appendFileSync(join(repo, '.wf', 'checks.log'), `${caseGreen(3, CHECK3, content3, 'unit:3')}\n`);
	const assessed3 = cli(repo, 'step', 'assess');
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT-unit-3.md'), assessment({ head: h3, scope: 'unit:3', base: h2 }));
	const pause3 = cli(repo, 'next');
	check('CLI: unit 3 hands off and pauses at its own T2 chunk', assessed3.code === 0 && pause3.out.startsWith('review: T2 chunk — late look'), pause3.out);
	const identity3 = approvalIdentity(repo, 'bug-reports/r', trackerNotePath('bug-reports/r'));
	writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW-unit-3.md'), `# Review — r\nbase: ${h2}\nscope: unit:3\ncontent-sha: ${identity3.worktree}\nhead-sha: ${identity3.head}\nverdict: approved\n`);
	const done3 = cli(repo, 'review', 'fix/r', '--done');
	const s4 = readState(repo);
	check('CLI: approving the last checkpoint makes the integration active at its head', done3.code === 0 && s4?.slices?.unit === null && s4?.slices?.completed?.length === 3 && s4?.slices?.base === h3 && s4?.slices?.reviewBase === h3 && s4?.slices?.completed.at(-1)?.reviewed === true, done3.out + JSON.stringify(s4?.slices));
	const ctxInt = sliceOf(repo);
	check('CLI: the integration state reconstructs to ASSESSMENT.md / REVIEW.md from h3', ctxInt !== null && ctxInt.kind === 'integration' && ctxInt.base === h3 && ctxInt.assessmentFile === 'ASSESSMENT.md' && ctxInt.reviewFile === 'REVIEW.md', JSON.stringify(ctxInt));
	check('CLI: wf next dispatches the integration build', cli(repo, 'next').out.startsWith('dispatch build'));
	const intPrompt = cli(repo, 'prompt', 'build');
	check('CLI: the integration build prompt names scope integration and owns every case', intPrompt.code === 0 && intPrompt.out.includes('scope: integration') && intPrompt.out.includes('src/one.ts') && intPrompt.out.includes('src/two.ts') && intPrompt.out.includes('src/three.ts'), intPrompt.out);
	check('CLI: the integration build prompt reads REVIEW.md (the final review), not a unit chunk', intPrompt.out.includes('the final review must not leak here'), intPrompt.out);

	// Final approval needs an integration assessment, not a copied last-unit verdict. Delivery
	// repeats this guard even if someone directly advances the persisted phase to pr.
	const finalContent = worktreeContentSha(repo, 'bug-reports/r', null, 'row');
	appendFileSync(join(repo, '.wf', 'checks.log'), `${ALL_CASES.map((c) => caseGreen(c.n, c.check, finalContent, 'integration')).join('\n')}\n${suitesGreen(finalContent)}\n`);
	const finalHandoff = cli(repo, 'step', 'assess');
	check('CLI: final integration hands off before its independent assessment', finalHandoff.code === 0, finalHandoff.out);
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT.md'), assessment({ head: h3, scope: 'unit:3', base: h2 }));
	const finalReview = () => {
		const identity = approvalIdentity(repo, 'bug-reports/r', trackerNotePath('bug-reports/r'));
		writeFileSync(join(repo, 'bug-reports', 'r', 'REVIEW.md'), `# Review — r\nbase: main\nscope: integration\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\nverdict: approved\n`);
	};
	finalReview();
	const wrongFinal = cli(repo, 'review', 'fix/r', '--done');
	check('CLI: final approval refuses a unit assessment copied as ASSESSMENT.md', wrongFinal.code === 2 && wrongFinal.out.includes('must name scope: integration') && readState(repo)?.step !== 'pr', wrongFinal.out);
	cli(repo, 'step', 'pr');
	const wrongDelivery = cli(repo, 'deliver');
	check('CLI: delivery independently refuses a unit assessment before any remote operation', wrongDelivery.code === 2 && wrongDelivery.out.includes('ASSESSMENT.md must judge scope: integration'), wrongDelivery.out);
	writeFileSync(join(repo, 'bug-reports', 'r', 'ASSESSMENT.md'), assessment({ head: h3, scope: 'integration' }));
	finalReview();
	const finalDone = cli(repo, 'review', 'fix/r', '--done');
	check('CLI: final integration assessment and explicit final approval reach pr', finalDone.code === 0 && readState(repo)?.step === 'pr', finalDone.out);
	cli(repo, 'step', 'build');

	// a changed plan refuses the old progress, and the explicit restart re-initializes at HEAD
	writeFileSync(join(repo, 'bug-reports', 'r', 'TICKET.md'), TICKET.replace('| 3 | the list |', '| 3 | the bigger list |'));
	const planChanged = cli(repo, 'next');
	check('CLI: a changed ## Units stops the round and names the restart flag', planChanged.code === 0 && planChanged.out.includes('wait user: units') && planChanged.out.includes('--restart-units') && readState(repo)?.slices?.unit === null, planChanged.out);
	const restarted = cli(repo, 'step', 'build', '--restart-units');
	const hEnd = headOf(repo);
	const sRestart = readState(repo);
	check('CLI: wf step build --restart-units re-initializes the units at HEAD', restarted.code === 0 && sRestart?.step === 'build' && sRestart?.slices?.unit === 1 && sRestart?.slices?.base === hEnd && sRestart?.slices?.reviewBase === hEnd && sRestart?.slices?.completed?.length === 0 && sRestart?.repairs === 0, restarted.out + JSON.stringify(sRestart?.slices));
	const ctxRestart = sliceOf(repo);
	check('CLI: the restarted state reconstructs to unit 1', ctxRestart !== null && ctxRestart.kind === 'unit' && ctxRestart.unit.n === 1 && ctxRestart.base === hEnd, JSON.stringify(ctxRestart));
} finally {
	rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
