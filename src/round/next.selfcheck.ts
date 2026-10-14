// next.selfcheck.ts — node next.selfcheck.ts → exit 0 when green.
// Pure arms: wf next's action for the smaller route (#110-#113) — ordinary (class A), consequential
// (B/C) with T1, build, one final assessment with bounded repair, unmet-intent T2 refusal and
// material-change escalation. A real CLI arm builds a temp git repo and drives wf step/next through
// the ordinary and complex examples (the command path, not only the pure snapshot).
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextAction, unpostedSections } from './next.ts';
import type { Snapshot } from './next.ts';
import { checkGap, suitesGap } from './step.ts';
import { readState, legacyStateGap } from './state.ts';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';

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
- T2 walk: open: /catalog as buyer
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | layout: sidebar renders | src/Page.svelte | src/Page.spec.ts::sidebar renders@42 |
`;
const TICKET = `# r — ticket
## Intent
- "x": the modal keeps its scroll position
`;
// A class A round's ticket carries the T2 walk the build recorded before T2 (#139). Nothing visible
// to walk here, so the explicit none; a separate arm below covers an `open:` ticket.
const TICKET_WALK = `${TICKET}\n## Notes\n- **T2 walk.** none — nothing visible this round\n`;
const ASSESS = (patch: { verdict?: string; head?: string; material?: string; intent?: string } = {}) => `# r — assessment
Verdict: ${patch.verdict ?? 'clean'}
head: ${patch.head ?? 'H4'}
## Intent
${patch.intent ?? '- "x": met: src/Page.svelte:1 · before: red · after: green'}
## Agreement
${patch.material ? `material: ${patch.material}` : '(none)'}
`;

const base = (patch: Partial<Snapshot> = {}): Snapshot => ({
	branch: 'fix/r', entry: 'C:/wf/wf.mjs', step: 'classify', klass: 'A', check: false, questions: [], answered: [],
	files: { agreement: null, assessment: null, review: null, blocked: null },
	t1: { sha: null, reviewed: null, verdict: null },
	head: 'H4', note: null, repairs: 0,
	...patch,
});
const say = (s: Snapshot) => nextAction(s).say;
const steps = (s: Snapshot) => nextAction(s).effects.filter((e) => e.step).map((e) => e.step!.join(' '));
const asks = (s: Snapshot) => nextAction(s).effects.filter((e) => e.ask).map((e) => e.ask!);
const repairs = (s: Snapshot) => nextAction(s).effects.filter((e) => e.repair).length;

// ── ordinary (class A): the ticket is the agreement, no T1, straight to build
check('class A: the ticket is the agreement → step build and dispatch build', steps(base()) .join() === 'build' && say(base()).startsWith('dispatch build'), say(base()));
check('class A build: one phase, resumed in place (no per-commit dispatch)', say(base({ step: 'build' })) === 'dispatch build: run `node C:/wf/wf.mjs brief build` in this worktree and do exactly what it prints', say(base({ step: 'build' })));
check('a blocked build waits on the user with the question', say(base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } })) === 'wait user: blocked — which label?');

// ── a check round: it writes ## Repro, then wf check --repro is the answer
check('a check round with no ## Repro: dispatch agree to write it', say(base({ check: true })).startsWith('dispatch agree') && say(base({ check: true })).includes('no `## Repro`'), say(base({ check: true })));
check('a check round with ## Repro: run wf check --repro and wait on the user', say(base({ check: true, files: { agreement: TICKET + '\n## Repro\ncommand: yarn repro\n', assessment: null, review: null, blocked: null } })).startsWith('check: run `node C:/wf/wf.mjs check --repro`'), say(base({ check: true })));

// ── consequential (B/C): one agreement, one T1
check('B/C with no agreement: dispatch agree with the gap', say(base({ klass: 'B' })).startsWith('dispatch agree') && say(base({ klass: 'B' })).includes('no AGREEMENT.md'), say(base({ klass: 'B' })));
check('B/C agreement not yet approved: wait on the user for T1 with wf agree', say(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: null, verdict: null } })) === 'wait user: T1 on AGREEMENT.md — `node C:/wf/wf.mjs agree fix/r`', say(base({ klass: 'B' })));
check('B/C T1 approved: step build and dispatch build', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build', say(base({ klass: 'B' })));
check('B/C T1 changes-requested: dispatch agree again', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'changes-requested' } })).startsWith('dispatch agree'));
check('B/C a new agreement sha (material changed): T1 again, not approved', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));

// ── the assessment
check('no ASSESSMENT.md: dispatch assess', say(base({ step: 'assess' })).startsWith('dispatch assess') && say(base({ step: 'assess' })).includes('no ASSESSMENT.md'), say(base({ step: 'assess' })));
check('an assessment of an earlier HEAD is re-run', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).includes('HEAD is H4'), say(base({ step: 'assess' })));
check('clean assessment → T2 review', say(base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS(), review: null, blocked: null } })).startsWith('review: T2'), say(base({ step: 'assess' })));

// ── #139, JX-1068: a class A round (TICKET.md is the agreement, so agreementGap never asks it) records
// its T2 walk before T2 — an `open:` line or an explicit `none — <why>`. The build owns it; T2 refuses.
const cleanA = (agreement: string) => base({ step: 'assess', files: { agreement, assessment: ASSESS(), review: null, blocked: null } });
check('class A with no T2 walk: T2 refuses and dispatches the build to record it', say(cleanA(TICKET)).startsWith('dispatch build') && say(cleanA(TICKET)).includes('T2 walk') && steps(cleanA(TICKET)).join() === 'build', say(cleanA(TICKET)));
check('class A with an explicit none reaches T2', say(cleanA(TICKET_WALK)).startsWith('review: T2'), say(cleanA(TICKET_WALK)));
const TICKET_OPEN = `${TICKET}\n## Notes\n- **T2 walk.** open: b2b /catalog as buyer\n  setup: api createVariant {} as seller\n`;
check('class A with an open: walk reaches T2 (with or without setup lines)', say(cleanA(TICKET_OPEN)).startsWith('review: T2'), say(cleanA(TICKET_OPEN)));
check('class A at review with no T2 walk refuses too, dispatching the build', say(base({ step: 'review', files: { agreement: TICKET, assessment: ASSESS(), review: null, blocked: null } })).startsWith('dispatch build') && steps(base({ step: 'review', files: { agreement: TICKET, assessment: ASSESS(), review: null, blocked: null } })).join() === 'build', say(base({ step: 'review' })));
check('a B/C agreement still uses agreementGap, not the class A walk gate (unchanged)', say(base({ klass: 'B', step: 'assess', files: { agreement: AGREEMENT, assessment: ASSESS(), review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).startsWith('review: T2'));
check('an intent line without a verdict is not a clean assessment', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ intent: '- "x": looks fine' }), review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ intent: '- "x": looks fine' }), review: null, blocked: null } })).includes('has no verdict'), say(base({ step: 'assess' })));

// repair: back to build, bounded
const repair = base({ step: 'assess', repairs: 0, files: { agreement: null, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('a repair assessment returns to build, counted', repairs(repair) === 1 && steps(repair).join() === 'build' && say(repair).includes('repair 1 of 2'), say(repair));
const spent = base({ step: 'assess', repairs: 2, files: { agreement: TICKET_WALK, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('two unsuccessful repairs: one contextual escalation, not another build', repairs(spent) === 0 && steps(spent).length === 0 && asks(spent).length === 1 && asks(spent)[0].source.startsWith('ASSESSMENT.md#') && asks(spent)[0].text.includes('answer `accept`'), say(spent));

// blocked: unmet intent / still-reproducing symptom cannot pass to T2 silently
const blocked = base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ verdict: 'blocked', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a blocked assessment asks one fix-or-accept ruling, not T2', asks(blocked).length === 1 && asks(blocked)[0].text.startsWith('fix or accept:') && !say(blocked).startsWith('review: T2'), say(blocked));
const accepted = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an explicit accept goes to T2 with the ruling recorded', say(accepted).startsWith('review: T2'), say(accepted));
const toFix = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'fix it', asked: 't', answered: 't' }] };
check('a fix ruling returns to build, not an endless question', steps(toFix).join() === 'build' && asks(toFix).length === 0, say(toFix));

// material change: one renewed-agreement escalation
const material = base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ material: 'the round also changes the API shape' }), review: null, blocked: null } });
check('a material change is one renewed-agreement escalation, not a repair', asks(material).length === 1 && asks(material)[0].text.includes('Answer `accept`') && asks(material)[0].text.includes('--revise') && repairs(material) === 0, say(material));
check('N-5: the material question offers only accept and --revise, not hold/end', !/hold\/end|hold or end/i.test(asks(material)[0].text), asks(material)[0].text);

// ── T2 / delivery
check('an open question holds the round before anything else', say(base({ step: 'assess', questions: [{ n: 3, to: 'einat', text: 'which label?', asked: 't' }] })) === 'wait einat: q3 which label?');
check('a review dismissed without a verdict waits on the user', say(base({ step: 'review', files: { agreement: null, assessment: ASSESS(), review: 'verdict: dismissed\n', blocked: null } })).startsWith('wait user: T2 was closed'), say(base({ step: 'review' })));
check('pr → deliver', say(base({ step: 'pr' })).startsWith('deliver: T2 approved'));
check('merged with no note sections left → done and reap', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1 (posted)\n' } })) === 'done: `node C:/wf/wf.mjs reap fix/r`');
check('merged with an unposted section → post it first', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1\n' } })).startsWith('post: JX-1'));

// ── the class is measured from the agreement, not assumed: a declared `Class:` line, or a case whose
// files reach a contract path, upgrades A→B so T1 cannot be skipped by how the worktree was opened
check('an A round whose agreement declares Class: B steps classify --class B before any build', steps(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).join() === 'classify --class B' && say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).startsWith('classify:'), say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })));
const noClass = AGREEMENT.replace('Class: B\n', '');
check('a case on a contract path upgrades A→B without a Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })));
check('R-4: a changed file on a contract path upgrades A→B with no case and no Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })));
check('R-4: the actual diff is measured at step build too, not only at classify/agree', steps(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B');
check('R-4: a round-paperwork-only change is not a contract-path change (control)', say(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: [], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).startsWith('dispatch build'));
check('a B round with an approved agreement stays B (never downgrades)', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build');

// ── T1 stays live after the build starts: a changed agreed material (or a recorded revision) sends the
// round back to a fresh T1, while a progress edit (same sha) does not
const liveB = (patch: Partial<Snapshot>) => base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, ...patch });
check('B/C build: a changed ## Agreed sends back to T1, not build', say(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1') && steps(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).join() === 'agree --waiting-on user');
check('B/C assess: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'assess', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C review: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'review', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C build: an approved agreement at the same sha builds (progress does not renew T1)', say(liveB({ step: 'build', t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })) === 'dispatch build: run `node C:/wf/wf.mjs brief build` in this worktree and do exactly what it prints');

// ── a recorded revision (`wf decide --revise`) reaches a fresh agreement before any build, and an
// unchanged agreement cannot leave the old T1 approval in force
const revised = liveB({ step: 'agree', revisions: [{ text: 'the header must also show the count', at: 't', sha: 's1' }], t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } });
check('a recorded revision dispatches a fresh agreement before build', say(revised).startsWith('dispatch agree') && say(revised).includes('asked the agreement to change'), say(revised));
check('a revision whose material sha moved is answered (no re-dispatch)', !say({ ...revised, t1: { sha: 's2', reviewed: 's2', verdict: 'approved' } }).startsWith('dispatch agree'));
check('R-3: an unchanged agreement after --revise cannot build on the old T1', say({ ...revised, step: 'build' }).startsWith('dispatch agree') && steps({ ...revised, step: 'build' }).join() === 'agree --waiting-on user', say({ ...revised, step: 'build' }));
check('R-3: an unchanged agreement after --revise also refuses at assess', say({ ...revised, step: 'assess' }).startsWith('dispatch agree'));
const revisedA = base({ step: 'agree', klass: 'A', revisions: [{ text: 'change x', at: 't', sha: null }], files: { agreement: TICKET, assessment: null, review: null, blocked: null } });
check('a revision on a class A round also dispatches a fresh agreement', say(revisedA).startsWith('dispatch agree'));

// ── an answered BLOCKED.md resumes the build once; the same answer never loops
const blockedBuild = base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } });
check('a blocked build with no answer waits on the user', say(blockedBuild) === 'wait user: blocked — which label?');
const answeredBlocked = { ...blockedBuild, answered: [{ n: 1, to: 'user', text: 'which label?', source: 'BLOCKED.md', answer: 'cancel', asked: 't', answered: 't' }] };
check('an answered BLOCKED.md resumes the build once', say(answeredBlocked).startsWith('dispatch build') && say(answeredBlocked).includes('answered'), say(answeredBlocked));
check('the same answer does not resume a second time', say({ ...answeredBlocked, blockedAnswered: 1 }) === 'wait user: blocked — which label?');

// ── the assessment must name the HEAD it judged, and a clean verdict cannot carry an unmet item
check('an assessment with no head: line is refused', say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).includes('head:'));
const cleanNotMet = base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ verdict: 'clean', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a clean assessment that states an unmet item is refused', say(cleanNotMet).startsWith('dispatch assess') && say(cleanNotMet).includes('says clean but states an unmet item'), say(cleanNotMet));

// ── the material and repair-cap escalations are recorded, so the same question cannot repeat, and a
// material change needs an EXPLICIT accept to reach T2 (R-2): hold/end/no/looks fine/fix do not
const materialAnswered = { ...material, answered: [{ n: 1, to: 'user', text: 'the assessment found a material change', source: asks(material)[0].source, answer: 'accept: ship it', asked: 't', answered: 't' }] };
check('an explicit accept of a material change opens T2', asks(materialAnswered).length === 0 && say(materialAnswered).startsWith('review: T2'), say(materialAnswered));
for (const answer of ['hold the round until n', 'end it, drop this round', 'no', 'looks fine, carry on', 'fix: tighten the API']) {
	const ruled = { ...material, answered: [{ n: 1, to: 'user', text: 'the assessment found a material change', source: asks(material)[0].source, answer, asked: 't', answered: 't' }] };
	check(`R-2: a material answer "${answer}" does not open T2 (it returns to build)`, asks(ruled).length === 0 && !say(ruled).startsWith('review: T2') && steps(ruled).join() === 'build', say(ruled));
}
check('R-6: the fix-or-accept question names the unmet finding and the literal accept', asks(blocked)[0].text.includes('not met: the modal still jumps') && asks(blocked)[0].text.includes('answer `accept`'), asks(blocked)[0].text);
const spentAnswered = { ...spent, answered: [{ n: 1, to: 'user', text: 'x', source: asks(spent)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an answered repair-cap escalation does not repeat', asks(spentAnswered).length === 0 && say(spentAnswered).startsWith('review: T2'), say(spentAnswered));

// ── verification handoff (JX-1239): a build cannot hand off to assess without a wf-recorded green of
// this implementation; harness trouble stops with a named cause; a clean assessment cannot silently
// pass a stated verification gap or a red suite
const line = (o: object) => JSON.stringify({ ts: 't', row: null, rowCheck: null, tasks: [], ...o });
const GREEN = (content?: string) => line({ result: 'green', ...(content ? { content } : {}) });
const ENV_RED = (content?: string) => line({ tasks: [{ label: 'stack', exit: null, missing: 'the stack would not answer' }], result: 'red', cause: 'environment', ...(content ? { content } : {}) });
const CODE_RED = (content: string) => line({ tasks: [{ label: 'unit', exit: 1 }], result: 'red', cause: 'code', content });
const SUITES = (result: string, content: string, labels = ['unit']) => line({ row: 'suites', head: 'H4', tasks: labels.map((label) => ({ label, exit: result === 'green' ? 0 : 1 })), result, content });
const ev = (log: string[], content: string | null = 'tree:w1') => ({ log: log.map((l) => `${l}\n`).join(''), content });
const filesWith = (assessment: string) => ({ agreement: TICKET_WALK, assessment, review: null, blocked: null });
const cleanLive = ASSESS() + '\n## Live\n- Intent 1: INCONCLUSIVE — mobile/LTR not driven, no scenario setup — proof/none\n';

const noCheck = base({ step: 'assess', checks: ev([]), files: filesWith(ASSESS()) });
check('assess with no wf check on record goes back to build, never to the assessor or T2', steps(noCheck).join() === 'build' && say(noCheck).startsWith('dispatch build') && say(noCheck).includes('wf check'), say(noCheck));
const stale = base({ step: 'assess', checks: ev([GREEN('tree:w0')]), files: filesWith(ASSESS()) });
check('assess whose last green measured other bytes is stale: back to build', steps(stale).join() === 'build' && say(stale).includes('changed since'), say(stale));
check('assess whose last check at these bytes is red: back to build', steps(base({ step: 'assess', checks: ev([GREEN('tree:w0'), CODE_RED('tree:w1')]), files: filesWith(ASSESS()) })).join() === 'build');
check('a green of these bytes (paperwork commits do not move its content) lets the assessment stand', say(base({ step: 'assess', checks: ev([GREEN('tree:w1')]), files: filesWith(ASSESS()) })).startsWith('review: T2'));
const harness = base({ step: 'assess', checks: ev([], null), files: filesWith(ASSESS()) });
check('git cannot compute the tree: an actionable stop naming the harness, not a build dispatch', say(harness).startsWith('wait user: harness') && steps(harness).length === 0, say(harness));
const envRed = base({ step: 'build', checks: ev([ENV_RED('tree:w1')]) });
check('a build that ended on an environment red of these bytes stops on the harness, not another dispatch', say(envRed).startsWith('wait user: harness') && say(envRed).includes('the stack would not answer'), say(envRed));
check('an environment red of older bytes is not a stop: the build changed since and is dispatched', say(base({ step: 'build', checks: ev([ENV_RED('tree:w0')]) })).startsWith('dispatch build'));
check('a build with a code red is dispatched again (product trouble, not harness)', say(base({ step: 'build', checks: ev([CODE_RED('tree:w1')]) })).startsWith('dispatch build'));
check('a first build dispatch with an empty log is not a harness stop', say(base({ step: 'build', checks: ev([]) })).startsWith('dispatch build'));

const inconclusive = base({ step: 'assess', checks: ev([GREEN('tree:w1')]), files: filesWith(cleanLive) });
check('a clean assessment with an INCONCLUSIVE item asks one fix-or-accept, not T2', asks(inconclusive).length === 1 && asks(inconclusive)[0].text.includes('INCONCLUSIVE — mobile/LTR') && asks(inconclusive)[0].text.includes('answer `accept`') && !say(inconclusive).startsWith('review: T2'), say(inconclusive));
const gapSource = asks(inconclusive)[0]?.source ?? 'none';
const ruled = (answer: string, src = gapSource, snap = inconclusive) => ({ ...snap, answered: [{ n: 1, to: 'user', text: 'x', source: src, answer, asked: 't', answered: 't' }] });
check('an explicit accept of the gap opens T2', asks(ruled('accept: separate ticket')).length === 0 && say(ruled('accept: separate ticket')).startsWith('review: T2'), say(ruled('accept')));
check('a fix ruling returns to build', steps(ruled('fix the mobile case')).join() === 'build' && say(ruled('fix the mobile case')).startsWith('dispatch build'), say(ruled('fix')));
const latestAcceptance = { ...inconclusive, answered: [...ruled('fix the mobile case').answered, { ...ruled('accept: defer it').answered[0], n: 2 }] };
check('the latest explicit ruling on the same verification source wins', say(latestAcceptance).startsWith('review: T2'), say(latestAcceptance));
const otherGap = { ...inconclusive, files: filesWith(ASSESS() + '\n## Live\n- Intent 1: NOT VERIFIED — LTR header overlaps — proof/none\n') };
check('an accept for another gap on the same HEAD does not carry over', asks(ruled('accept', gapSource, otherGap)).length === 1 && !say(ruled('accept', gapSource, otherGap)).startsWith('review: T2'), say(ruled('accept', gapSource, otherGap)));
check('NOT MEASURED in a clean Intent is a stated gap too', asks({ ...inconclusive, files: filesWith(ASSESS({ intent: '- "x": NOT MEASURED — the app did not start' })) }).length === 1);
check('a clean assessment with every line verified goes to T2 with no ask', asks(base({ step: 'assess', checks: ev([GREEN('tree:w1')]), files: filesWith(ASSESS() + '\n## Live\n- Intent 1: VERIFIED — drove it — proof/a.png\n') })).length === 0);
const redSuite = base({ step: 'assess', checks: ev([GREEN('tree:w1'), SUITES('red', 'tree:w1', ['unit', 'e2e'])]), files: filesWith(ASSESS() + '\n## Behavior and evidence\nthe 3 red cases are in a file this round never touched, so unrelated\n') });
check('a red suite at these bytes is not waived by prose ("file untouched, unrelated"): one fix-or-accept ask', asks(redSuite).length === 1 && asks(redSuite)[0].text.includes('suites red') && asks(redSuite)[0].text.includes('unit, e2e') && !say(redSuite).startsWith('review: T2'), say(redSuite));
check('a user accept of the red suites opens T2', say(ruled('accept: red on base too', asks(redSuite)[0]?.source ?? 'none', redSuite)).startsWith('review: T2'));
check('a red suites line of other bytes is not this implementation\'s gap', asks({ ...redSuite, checks: ev([GREEN('tree:w1'), SUITES('red', 'tree:w0')]) }).length === 0);
check('a green suites line is no gap', asks({ ...redSuite, checks: ev([GREEN('tree:w1'), SUITES('green', 'tree:w1')]) }).length === 0);

// #127, JX-275: review and the assess policy must agree after HEAD/check evidence moves.
for (const [name, snapshot] of [
	['moved HEAD', base({ step: 'assess', checks: ev([GREEN('tree:w1')]), files: filesWith(ASSESS({ head: 'H3' })) })],
	['changed implementation', stale],
	['code red', base({ step: 'assess', checks: ev([CODE_RED('tree:w1')]), files: filesWith(ASSESS()) })],
	['missing assessment', base({ step: 'assess', checks: ev([GREEN('tree:w1')]) })],
	['harness failure', harness],
	['open verification', inconclusive],
] satisfies [string, Snapshot][]) {
	const assessed = nextAction(snapshot);
	const reviewed = nextAction({ ...snapshot, step: 'review' });
	check(`#127: review applies the assess policy for ${name}`, reviewed.say === assessed.say && !reviewed.say.startsWith('review: T2'), reviewed.say);
	if (assessed.say.startsWith('dispatch assess')) check(`#127: ${name} moves review back to assess`, reviewed.effects.some((e) => e.step?.join(' ') === 'assess'));
}
check('#127: dismissed but stale review still repairs freshness first', say({ ...stale, step: 'review', files: { ...stale.files, review: 'verdict: dismissed\n' } }).startsWith('dispatch build'));
check('#127: fresh review continues to T2 without state effects', say(base({ step: 'review', checks: ev([GREEN('tree:w1')]), files: filesWith(ASSESS()) })).startsWith('review: T2') && steps(base({ step: 'review', checks: ev([GREEN('tree:w1')]), files: filesWith(ASSESS()) })).length === 0);

// ── helpers
check('unpostedSections names the sections without (posted)', unpostedSections('## A (posted)\n## B\n').join() === 'B');

// ── the version guard: an old round state is refused, not reinterpreted
check('a state with no wf_version is refused with an actionable line', (legacyStateGap({ step: 'implement' }) ?? '').includes('older wf') && (legacyStateGap({ step: 'implement' }) ?? '').includes('wf_version'));
check('a versionless state at a shared step (classify/review/pr/held/merged) is refused too', ['classify', 'review', 'pr', 'held', 'merged'].every((step) => (legacyStateGap({ step }) ?? '').includes('older wf')));
check('a versionless state with no step is refused too', (legacyStateGap({ round: 'r' }) ?? '').includes('older wf'));
check('a state at the current version is accepted', legacyStateGap({ wf_version: 2, step: 'build' }) === null);
check('no state is not a legacy round', legacyStateGap(null) === null);

// ── real CLI: an ordinary class A round reaches build through wf next; a legacy state is refused
const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const cli = (repo: string, ...args: string[]) => {
	try { return { out: execFileSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' }), code: 0 }; } catch (e) {
		const err = e as { stdout?: string; stderr?: string; status?: number };
		return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
	}
};
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-next-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'A' }, null, 2)}\n`);
	const next = cli(repo, 'next');
	check('CLI: an ordinary class A round steps to build and dispatches it', next.code === 0 && next.out.includes('dispatch build') && readState(repo)?.step === 'build', next.out);
	// the class is measured: a ticket declaring Class: B upgrades the round before any build
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), `${TICKET}\nClass: B\n`);
	mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
	writeFileSync(join(repo, 'docs', 'agents', 'contract-paths.txt'), 'src/**\n');
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'A' }, null, 2)}\n`);
	const upgraded = cli(repo, 'next');
	check('CLI: an agreement declaring Class: B upgrades the round and takes T1', upgraded.code === 0 && readState(repo)?.class === 'B' && upgraded.out.includes('T1'), upgraded.out);
	// the version guard refuses a mutating command on a legacy state
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ round: 'r', id: 'r', folder: 'bug-reports/r', step: 'implement' }, null, 2)}\n`);
	const refused = cli(repo, 'step', 'build');
	check('CLI: a legacy state refuses a mutating command before it writes', refused.code === 1 && /older wf/.test(refused.out), refused.out);
	check('CLI: the refused legacy state was not rewritten', JSON.parse(readFileSync(join(repo, '.wf', 'state.json'), 'utf8')).step === 'implement');
	// a versionless state parked at a shared step is refused by wf next too (it mutates)
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ round: 'r', id: 'r', folder: 'bug-reports/r', step: 'review' }, null, 2)}\n`);
	const legacyNext = cli(repo, 'next');
	check('CLI: wf next refuses a versionless state parked at review', legacyNext.code === 1 && /older wf/.test(legacyNext.out), legacyNext.out);
	rmSync(repo, { recursive: true, force: true });
}

// pure: the evidence readers next and step share
check('checkGap: a green of these bytes is no gap; null content is a harness gap', checkGap(ev([GREEN('tree:w1')])) === null && checkGap(ev([], null))?.kind === 'harness');
check('checkGap: an unavailable line with no content is the harness; changed or code red are product trouble', checkGap(ev([line({ result: 'unavailable' })]))?.kind === 'harness' && checkGap(ev([line({ result: 'changed', content: 'tree:w1' })]))?.kind === 'check' && checkGap(ev([CODE_RED('tree:w1')]))?.kind === 'check');
check('checkGap: a later green of the same bytes outweighs an earlier environment red; repro and suites lines are not checks', checkGap(ev([ENV_RED('tree:w1'), GREEN('tree:w1')])) === null && checkGap(ev([line({ row: 'repro', result: 'stable', content: 'tree:w1' }), SUITES('green', 'tree:w1')]))?.say === 'no wf check has run in this round');
check('checkGap: a later unavailable check supersedes an older green even without a content identity', checkGap(ev([GREEN('tree:w1'), line({ result: 'unavailable' })]))?.kind === 'harness');
check('checkGap: a truncated log line is skipped, not fatal', checkGap({ log: `${GREEN('tree:w1')}
{"ts":"t","re`, content: 'tree:w1' }) === null);
check('suitesGap names the red suites of these bytes only', suitesGap(ev([SUITES('red', 'tree:w1', ['a', 'b'])])) === 'suites red at this implementation: a, b' && suitesGap(ev([SUITES('red', 'tree:w0')])) === null && suitesGap(ev([SUITES('red', 'tree:w1'), SUITES('green', 'tree:w1')])) === null);

// ── real CLI: the handoff boundary is enforced on a direct `wf step`, not only through wf next
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-handoff-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET_WALK);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'build', class: 'A' }, null, 2)}\n`);
	const logGreen = () => appendFileSync(join(repo, '.wf', 'checks.log'), `${GREEN(worktreeContentSha(repo, 'bug-reports/r', null, 'row'))}\n`);
	writeFileSync(join(repo, 'a.txt'), 'b\n');
	git(repo, 'commit', '-q', '-am', 'fix');
	const noLog = cli(repo, 'step', 'assess');
	check('CLI: wf step assess with no wf check on record is refused and the state stays at build', noLog.code === 2 && noLog.out.includes('wf check') && readState(repo)?.step === 'build', noLog.out);
	appendFileSync(join(repo, '.wf', 'checks.log'), `${ENV_RED()}\n`);
	const envLog = cli(repo, 'step', 'review');
	check('CLI: wf step review is the same boundary, and a harness trouble says BLOCKED.md', envLog.code === 2 && envLog.out.includes('BLOCKED.md') && readState(repo)?.step === 'build', envLog.out);
	logGreen();
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), 'paperwork\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'paper');
	const ok = cli(repo, 'step', 'assess');
	check('CLI: a green of this implementation hands off, and a paperwork-only commit after it does not regress it', ok.code === 0 && readState(repo)?.step === 'assess', ok.out);
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), ASSESS({ head: git(repo, 'rev-parse', 'HEAD').trim() }) + '\n## Live\n- INCONCLUSIVE — mobile path not driven\n');
	const openReview = cli(repo, 'step', 'review');
	check('CLI: direct review cannot bypass an unresolved assessment gap', openReview.code === 2 && openReview.out.includes('INCONCLUSIVE') && readState(repo)?.step === 'assess', openReview.out);
	const question = cli(repo, 'next');
	check('CLI: next records the verification gap as one contextual question', question.out.includes('INCONCLUSIVE') && readState(repo)?.questions?.length === 1, question.out);
	const acceptedReview = cli(repo, 'decide', 'accept: mobile verification deferred');
	const review = cli(repo, 'step', 'review');
	check('CLI: direct review obeys the recorded explicit acceptance', acceptedReview.code === 0 && review.code === 0 && readState(repo)?.step === 'review', acceptedReview.out + review.out);
	writeFileSync(join(repo, 'a.txt'), 'c\n');
	git(repo, 'commit', '-q', '-am', 'product after the check');
	const after = cli(repo, 'step', 'review');
	check('CLI: a product change after the last green is refused at the next boundary', after.code === 2 && after.out.includes('changed since'), after.out);
	const backToBuild = cli(repo, 'next');
	check('#127 CLI: next repairs stale checks at review instead of recommending a refused review', backToBuild.code === 0 && backToBuild.out.startsWith('dispatch build') && readState(repo)?.step === 'build', backToBuild.out);
	logGreen();
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), ASSESS({ head: git(repo, 'rev-parse', 'HEAD').trim() }));
	cli(repo, 'step', 'review');
	git(repo, 'add', 'bug-reports/r'); git(repo, 'commit', '-qm', 'paperwork moves assessed HEAD, not implementation');
	const staleReview = cli(repo, 'step', 'review');
	check('#127 CLI: review gate identifies a moved assessed HEAD with unchanged checks', staleReview.code === 2 && staleReview.out.includes('HEAD is'), staleReview.out);
	const backToAssess = cli(repo, 'next');
	check('#127 CLI: next dispatches assess and persists assess after a moved HEAD', backToAssess.code === 0 && backToAssess.out.startsWith('dispatch assess') && readState(repo)?.step === 'assess', backToAssess.out);
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), ASSESS({ head: git(repo, 'rev-parse', 'HEAD').trim() }));
	const freshReview = cli(repo, 'next');
	check('#127 CLI: a fresh assessment restores a review the step gate accepts', freshReview.out.startsWith('review: T2') && cli(repo, 'step', 'review').code === 0, freshReview.out);
	rmSync(repo, { recursive: true, force: true });
}

// ── #139, JX-1068 real CLI: a class A ticket with no T2 walk is refused at the review boundary — the
// direct `wf step review` and `wf next`, which sends the build back to record it — and reaches T2 only
// once the bullet is there.
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-walk-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	const assessState = `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'assess', class: 'A' }, null, 2)}\n`;
	writeFileSync(join(repo, '.wf', 'state.json'), assessState);
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), ASSESS({ head: git(repo, 'rev-parse', 'HEAD') }));
	appendFileSync(join(repo, '.wf', 'checks.log'), `${GREEN(worktreeContentSha(repo, 'bug-reports/r', null, 'row'))}\n`);
	const refusedReview = cli(repo, 'step', 'review');
	check('#139 CLI: wf step review refuses a class A ticket with no T2 walk, naming TICKET.md', refusedReview.code === 2 && refusedReview.out.includes('T2 walk') && refusedReview.out.includes('TICKET.md'), refusedReview.out);
	const refuseNext = cli(repo, 'next');
	check('#139 CLI: wf next dispatches the build to record the walk, not T2', refuseNext.code === 0 && refuseNext.out.startsWith('dispatch build') && refuseNext.out.includes('T2 walk') && readState(repo)?.step === 'build', refuseNext.out);
	// The build records the walk; a paperwork change does not move the implementation or the assessed HEAD.
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET_WALK);
	writeFileSync(join(repo, '.wf', 'state.json'), assessState);
	const walked = cli(repo, 'next');
	check('#139 CLI: with the walk recorded, wf next reaches T2', walked.code === 0 && walked.out.startsWith('review: T2'), walked.out);
	rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
