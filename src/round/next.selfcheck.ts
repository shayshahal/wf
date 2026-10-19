// next.selfcheck.ts — node next.selfcheck.ts → exit 0 when green.
// Pure arms: wf next's action for the smaller route (#110-#113) — ordinary (class A), consequential
// (B/C) with T1, build, one final assessment with bounded repair, the explicit blocked/capped ruling
// and the class A T2 walk. A reviewer's verdict and measured head are the only machine-read claims.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextAction, unpostedSections } from './next.ts';
import type { Snapshot } from './next.ts';
import { readState, legacyStateGap, WF_STATE_VERSION } from './state.ts';
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
- T2 walk: open: /catalog as buyer
- **Not asked for.** none — the ticket names every change
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
${patch.verdict === 'repair' ? '\n## Repairs\n- R1: Intent x | action: strengthen src/Page.spec.ts::scroll to measure the preserved position\n' : ''}
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
check('class A: the ticket is the agreement → step build and dispatch build', steps(base()) .join() === 'build' && say(base()).startsWith('work build'), say(base()));
check('class A build: one phase, resumed in place (no per-commit dispatch)', say(base({ step: 'build' })) === 'work build: run `node "C:/wf/wf.mjs" brief build` in this worktree and do exactly what it prints (again: implement and verify the current agreement)', say(base({ step: 'build' })));

// ── portability: the packet is model-free; the current session may work agree/build, and only the
// assessment requires a fresh independent reviewer context (no fixed model, no forced delegation).
const buildSay = say(base({ step: 'build' }));
check('a work packet names no model and no forced delegation', !/model/.test(buildSay) && !/round-worker/.test(buildSay) && !/subagent/.test(buildSay), buildSay);
check('the current session may work the build: the packet is the whole instruction', buildSay.startsWith('work build:') && buildSay.includes('do exactly what it prints') && steps(base({ step: 'build' })).join() === 'build', buildSay);
const assessSay = say(base({ step: 'assess' }));
check('the assess packet requires a fresh independent reviewer context and names no model', assessSay.startsWith('work assess:') && assessSay.includes('fresh independent reviewer context') && !/model/.test(assessSay), assessSay);
check('the build effects are exactly the step transition, no repair or question', steps(base({ step: 'build' })).join() === 'build' && repairs(base({ step: 'build' })) === 0 && asks(base({ step: 'build' })).length === 0, buildSay);
check('a blocked build waits on the user with the question', say(base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } })) === 'wait user: blocked — which label?');

// ── a check round: it writes ## Repro, then wf check --repro is the answer
check('a check round with no ## Repro: dispatch agree to write and run the repro', say(base({ check: true })).startsWith('work agree') && say(base({ check: true })).includes('no `## Repro`'), say(base({ check: true })));
check('a check round with ## Repro: wait on the person decision, no wf check dispatch', say(base({ check: true, files: { agreement: TICKET + '\n## Repro\ncommand: yarn repro\n', assessment: null, review: null, blocked: null } })).startsWith('wait user: the repro result'), say(base({ check: true })));

// ── consequential (B/C): one agreement, one T1
check('B/C with no agreement: dispatch agree with the gap', say(base({ klass: 'B' })).startsWith('work agree') && say(base({ klass: 'B' })).includes('no AGREEMENT.md'), say(base({ klass: 'B' })));
check('B/C agreement not yet approved: wait on the user for T1 with wf agree', say(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: null, verdict: null } })) === 'wait user: T1 on AGREEMENT.md — `node "C:/wf/wf.mjs" agree fix/r`', say(base({ klass: 'B' })));
check('B/C T1 approved: step build and dispatch build', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build', say(base({ klass: 'B' })));
check('B/C T1 changes-requested: dispatch agree again', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'changes-requested' } })).startsWith('work agree'));
// JX-1367 (2026-10-18): the bullet is required before T1 only; an approved agreement is not reopened.
const NO_UNASKED = AGREEMENT.replace('- **Not asked for.** none — the ticket names every change\n', '');
const preT1 = say(base({ klass: 'B', files: { agreement: NO_UNASKED, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: null, verdict: null } }));
check('JX-1367: no Not asked for bullet goes back to agree before T1, not to the person', preT1.startsWith('work agree') && preT1.includes('Not asked for'), preT1);
check('JX-1367: an agreement approved before the rule is not reopened for the bullet', !say(base({ klass: 'B', step: 'build', files: { agreement: NO_UNASKED, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).includes('Not asked for'));
check('B/C a new agreement sha (material changed): T1 again, not approved', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));

// ── the assessment
check('no ASSESSMENT.md: dispatch assess', say(base({ step: 'assess' })).startsWith('work assess') && say(base({ step: 'assess' })).includes('no ASSESSMENT.md'), say(base({ step: 'assess' })));
check('an assessment of an earlier HEAD is re-run', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).startsWith('work assess') && say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).includes('HEAD is H4'), say(base({ step: 'assess' })));
check('clean assessment → T2 review', say(base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS(), review: null, blocked: null } })).startsWith('review: T2'), say(base({ step: 'assess' })));

// #151: only an explicitly recorded handoff return can recover without a build.
for (const klass of ['A', 'B'] as const) {
	const snapshot = base({ step: 'build', klass, buildReason: { kind: 'handoff', text: 'rename capture' }, assessmentChangedSinceHandoff: true, files: { agreement: klass === 'A' ? TICKET_WALK : AGREEMENT, assessment: ASSESS(), review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } });
	check(`${klass}: a cleared handoff re-evaluates the current clean assessment`, say(snapshot).startsWith('review: T2') && repairs(snapshot) === 0);
	check(`${klass}: an unresolved handoff returns its current reason`, say({ ...snapshot, assessmentHandoffGap: 'rename new capture' }).includes('rename new capture'));
	check(`${klass}: an unchanged pre-handoff report still needs assessment`, say({ ...snapshot, assessmentChangedSinceHandoff: false }).startsWith('work assess'));
	check(`${klass}: a cleared handoff cannot ignore a repair verdict`, say({ ...snapshot, files: { ...snapshot.files, assessment: ASSESS({ verdict: 'repair' }) } }).includes('repair 1 of 2'));
	const work = { ...snapshot, buildReason: { kind: 'work' as const, text: 'implement the repair findings' } };
	check(`${klass}: ordinary work is not mistaken for a transient gap`, say(work).startsWith('work build') && say(work).includes('implement the repair findings'));
}

// ── #139, JX-1068: a class A round (TICKET.md is the agreement, so agreementGap never asks it) records
// its T2 walk before T2 — an `open:` line or an explicit `none — <why>`. The build owns it; T2 refuses.
const cleanA = (agreement: string) => base({ step: 'assess', files: { agreement, assessment: ASSESS(), review: null, blocked: null } });
check('class A with no T2 walk: T2 refuses and dispatches the build to record it', say(cleanA(TICKET)).startsWith('work build') && say(cleanA(TICKET)).includes('T2 walk') && steps(cleanA(TICKET)).join() === 'build', say(cleanA(TICKET)));
check('class A with an explicit none reaches T2', say(cleanA(TICKET_WALK)).startsWith('review: T2'), say(cleanA(TICKET_WALK)));
const TICKET_OPEN = `${TICKET}\n## Notes\n- **T2 walk.** open: b2b /catalog as buyer\n  setup: api createVariant {} as seller\n`;
check('class A with an open: walk reaches T2 (with or without setup lines)', say(cleanA(TICKET_OPEN)).startsWith('review: T2'), say(cleanA(TICKET_OPEN)));
check('class A at review with no T2 walk refuses too, dispatching the build', say(base({ step: 'review', files: { agreement: TICKET, assessment: ASSESS(), review: null, blocked: null } })).startsWith('work build') && steps(base({ step: 'review', files: { agreement: TICKET, assessment: ASSESS(), review: null, blocked: null } })).join() === 'build', say(base({ step: 'review' })));
check('a B/C agreement still uses agreementGap, not the class A walk gate (unchanged)', say(base({ klass: 'B', step: 'assess', files: { agreement: AGREEMENT, assessment: ASSESS(), review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).startsWith('review: T2'));
check('a clean verdict ignores prose: only verdict and head are read', say(base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ intent: '- "x": looks fine' }), review: null, blocked: null } })).startsWith('review: T2'));

// repair: back to build, bounded
const repair = base({ step: 'assess', repairs: 0, files: { agreement: null, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('a repair assessment returns to build, counted', repairs(repair) === 1 && steps(repair).join() === 'build' && say(repair).includes('repair 1 of 2'), say(repair));
const vague = { ...repair, files: { ...repair.files, assessment: ASSESS({ verdict: 'repair', intent: '- "x": NOT MEASURED — no seeded role lacks permission' }).split('## Repairs')[0] } };
check('a repair needs no finding grammar: it returns to build, counted', say(vague).startsWith('work build') && repairs(vague) === 1 && asks(vague).length === 0, say(vague));
const owned = { ...repair, files: { ...repair.files, assessment: `${vague.files.assessment}\n## Repairs\n- R1: Intent x | blocker: request-failure tool unavailable | owner: environment maintainer | next: restore browser routing and rerun the unavailable-rate case\n` } };
check('repair prose of a capability gap does not stop the build on the harness', say(owned).startsWith('work build') && repairs(owned) === 1 && asks(owned).length === 0, say(owned));
const spent = base({ step: 'assess', repairs: 2, files: { agreement: TICKET_WALK, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('two unsuccessful repairs: one contextual escalation, not another build', repairs(spent) === 0 && steps(spent).length === 0 && asks(spent).length === 1 && asks(spent)[0].source.startsWith('ASSESSMENT.md#') && asks(spent)[0].text.includes('answer `accept`'), say(spent));

// blocked: an explicit blocked verdict asks one durable ruling and cannot pass to T2 silently
const blocked = base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ verdict: 'blocked', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a blocked verdict asks one durable ruling, not T2', asks(blocked).length === 1 && asks(blocked)[0].text.startsWith('the reviewer explicitly blocked the round.') && !say(blocked).startsWith('review: T2'), say(blocked));
const accepted = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an explicit accept goes to T2 with the ruling recorded', say(accepted).startsWith('review: T2'), say(accepted));
const toFix = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'fix it', asked: 't', answered: 't' }] };
check('a fix ruling returns to build, not an endless question', steps(toFix).join() === 'build' && asks(toFix).length === 0, say(toFix));

// material: prose under ## Agreement does not route; the verdict owns the gate
const material = base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ material: 'the round also changes the API shape' }), review: null, blocked: null } });
check('clean material prose does not create an escalation', say(material).startsWith('review: T2') && asks(material).length === 0, say(material));

// ── T2 / delivery
check('an open question holds the round before anything else', say(base({ step: 'assess', questions: [{ n: 3, to: 'einat', text: 'which label?', asked: 't' }] })) === 'wait einat: q3 which label?');
check('a review dismissed without a verdict waits on the user', say(base({ step: 'review', files: { agreement: null, assessment: ASSESS(), review: 'verdict: dismissed\n', blocked: null } })).startsWith('wait user: T2 was closed'), say(base({ step: 'review' })));
check('pr → deliver', say(base({ step: 'pr' })).startsWith('deliver: T2 approved'));
check('merged with no note sections left → done and reap', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1 (posted)\n' } })) === 'done: `node "C:/wf/wf.mjs" reap fix/r`');
check('merged with an unposted section → post it first', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1\n' } })).startsWith('post: JX-1'));

// ── the class is measured from the agreement, not assumed: a declared `Class:` line, or a case whose
// files reach a contract path, upgrades A→B so T1 cannot be skipped by how the worktree was opened
check('an A round whose agreement declares Class: B steps classify --class B before any build', steps(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).join() === 'classify --class B' && say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).startsWith('classify:'), say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })));
const noClass = AGREEMENT.replace('Class: B\n', '');
check('a case on a contract path upgrades A→B without a Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })));
check('R-4: a changed file on a contract path upgrades A→B with no case and no Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })));
check('R-4: the actual diff is measured at step build too, not only at classify/agree', steps(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B');
check('R-4: a round-paperwork-only change is not a contract-path change (control)', say(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: [], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).startsWith('work build'));
check('a B round with an approved agreement stays B (never downgrades)', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build');

// ── T1 stays live after the build starts: a changed agreed material (or a recorded revision) sends the
// round back to a fresh T1, while a progress edit (same sha) does not
const liveB = (patch: Partial<Snapshot>) => base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, ...patch });
check('B/C build: a changed ## Agreed sends back to T1, not build', say(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1') && steps(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).join() === 'agree --waiting-on user');
check('B/C assess: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'assess', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C review: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'review', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C build: an approved agreement at the same sha builds (progress does not renew T1)', say(liveB({ step: 'build', t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })) === 'work build: run `node "C:/wf/wf.mjs" brief build` in this worktree and do exactly what it prints (again: implement and verify the current agreement)');

// ── a recorded revision (`wf decide --revise`) reaches a fresh agreement before any build, and an
// unchanged agreement cannot leave the old T1 approval in force
const revised = liveB({ step: 'agree', revisions: [{ text: 'the header must also show the count', at: 't', sha: 's1' }], t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } });
check('a recorded revision dispatches a fresh agreement before build', say(revised).startsWith('work agree') && say(revised).includes('asked the agreement to change'), say(revised));
check('a revision whose material sha moved is answered (no re-dispatch)', !say({ ...revised, t1: { sha: 's2', reviewed: 's2', verdict: 'approved' } }).startsWith('work agree'));
check('R-3: an unchanged agreement after --revise cannot build on the old T1', say({ ...revised, step: 'build' }).startsWith('work agree') && steps({ ...revised, step: 'build' }).join() === 'agree --waiting-on user', say({ ...revised, step: 'build' }));
check('R-3: an unchanged agreement after --revise also refuses at assess', say({ ...revised, step: 'assess' }).startsWith('work agree'));
const revisedA = base({ step: 'agree', klass: 'A', revisions: [{ text: 'change x', at: 't', sha: null }], files: { agreement: TICKET, assessment: null, review: null, blocked: null } });
check('a revision on a class A round also dispatches a fresh agreement', say(revisedA).startsWith('work agree'));
const revA = (recorded: string, now: string) => base({ step: 'agree', klass: 'A', check: true, revisions: [{ text: 'change x', at: 't', sha: recorded }], files: { agreement: TICKET, assessment: null, review: null, blocked: null }, t1: { sha: 'intent', revisionSha: now, reviewed: null, verdict: null } });
check('class A: a revision stays open while the agreed sections are unchanged', say(revA('x1', 'x1')).includes('the person asked the agreement to change'));
check('class A: a revision closes once the agreed sections change (JX-1096)', !say(revA('x1', 'x2')).includes('the person asked the agreement to change'), say(revA('x1', 'x2')));

// ── an answered BLOCKED.md resumes the build once; the same answer never loops
const blockedBuild = base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } });
check('a blocked build with no answer waits on the user', say(blockedBuild) === 'wait user: blocked — which label?');
const answeredBlocked = { ...blockedBuild, files: { ...blockedBuild.files, blocked: 'Question: which label?\n\n## Answer\ncancel\n' }, answered: [{ n: 1, to: 'user', text: 'which label?', source: 'BLOCKED.md', answer: 'cancel', asked: 't', answered: 't' }] };
check('an answered BLOCKED.md resumes the build once', say(answeredBlocked).startsWith('work build') && say(answeredBlocked).includes('answered'), say(answeredBlocked));
check('the same answer does not resume a second time', say({ ...answeredBlocked, blockedAnswered: 1 }) === 'wait user: blocked — which label?');

// ── the assessment must name the HEAD it judged; the verdict, not its prose, owns the call
check('an assessment with no head: line is refused', say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).startsWith('work assess') && say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).includes('head:'));
const cleanNotMet = base({ step: 'assess', files: { agreement: TICKET_WALK, assessment: ASSESS({ verdict: 'clean', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a clean verdict owns the call despite unmet prose, and reaches T2', say(cleanNotMet).startsWith('review: T2') && asks(cleanNotMet).length === 0, say(cleanNotMet));

// ── a capped repair records one explicit ruling: an accept opens T2, anything else builds, and the
// same question cannot repeat
check('a bounded-repair ruling question carries the reason and the whole assessment', asks(spent)[0].text.includes('2 autonomous repairs did not clear the review') && asks(spent)[0].text.includes('## Repairs') && asks(spent)[0].text.includes('answer `accept`') && asks(spent)[0].source.startsWith('ASSESSMENT.md#'), asks(spent)[0].text);
const spentAnswered = { ...spent, answered: [{ n: 1, to: 'user', text: 'x', source: asks(spent)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an answered repair-cap ruling does not repeat and reaches T2', asks(spentAnswered).length === 0 && say(spentAnswered).startsWith('review: T2'), say(spentAnswered));
const spentToFix = { ...spent, answered: [{ n: 1, to: 'user', text: 'x', source: asks(spent)[0].source, answer: 'fix: tighten the API', asked: 't', answered: 't' }] };
check('a repair-cap fix ruling returns to build', steps(spentToFix).join() === 'build' && asks(spentToFix).length === 0, say(spentToFix));
check('R-6: the blocked question carries the whole assessment, including the unmet finding', asks(blocked)[0].text.includes('not met: the modal still jumps') && asks(blocked)[0].text.includes('answer `accept`'), asks(blocked)[0].text);

// #127, JX-275: review applies the same assessment-freshness policy as assess, so a stale or
// missing assessment at review goes back to assess, never to T2.
check("#127: a missing assessment at review dispatches assess, not T2", say(base({ step: "review" })).startsWith("work assess"), say(base({ step: "review" })));
check("#127: an assessment of an earlier HEAD at review dispatches assess", say(base({ step: "review", files: { agreement: null, assessment: ASSESS({ head: "H3" }), review: null, blocked: null } })).includes("HEAD is H4"));

// ── helpers
check('unpostedSections names the sections without (posted)', unpostedSections('## A (posted)\n## B\n').join() === 'B');

// ── the version guard: an old round state is refused, not reinterpreted
check('a state with no wf_version is refused with an actionable line', (legacyStateGap({ step: 'implement' }) ?? '').includes('older wf') && (legacyStateGap({ step: 'implement' }) ?? '').includes('wf_version'));
check('a versionless state at a shared step (classify/review/pr/held/merged) is refused too', ['classify', 'review', 'pr', 'held', 'merged'].every((step) => (legacyStateGap({ step }) ?? '').includes('older wf')));
check('a versionless state with no step is refused too', (legacyStateGap({ round: 'r' }) ?? '').includes('older wf'));
check('a state at the current version is accepted', legacyStateGap({ wf_version: WF_STATE_VERSION, step: 'build' }) === null);
check('a version-2 round without unit progress is accepted, so a protocol cut does not strand it', legacyStateGap({ wf_version: 2, step: 'build' }) === null);
check('a newer version is refused, so an old runtime cannot misread new state', (legacyStateGap({ wf_version: WF_STATE_VERSION + 1, step: 'build' }) ?? '').includes(`version ${WF_STATE_VERSION + 1}`));
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
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: WF_STATE_VERSION, round: "r", id: "r", folder: "bug-reports/r", base: "main", step: "classify", class: "A" }, null, 2)}\n`);
	const next = cli(repo, 'next');
	check('CLI: an ordinary class A round steps to build and dispatches it', next.code === 0 && next.out.includes('work build') && readState(repo)?.step === 'build', next.out);
	// the class is measured: a ticket declaring Class: B upgrades the round before any build
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), `${TICKET}\nClass: B\n`);
	mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
	writeFileSync(join(repo, 'docs', 'agents', 'contract-paths.txt'), 'src/**\n');
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: WF_STATE_VERSION, round: "r", id: "r", folder: "bug-reports/r", base: "main", step: "classify", class: "A" }, null, 2)}\n`);
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


// ── real CLI: the handoff boundary on a direct `wf step` — a committed tree, and no protected oracle
// edit; no wf check green is required (the agent chooses its checks).
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-handoff-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	// The base branch the oracle guard reads (project baseBranch is dev).
	git(repo, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET_WALK);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	const stateAt = (step: string) => writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: WF_STATE_VERSION, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'origin/dev', step, class: 'A' }, null, 2)}\n`);
	stateAt('build');
	// Uncommitted product cannot hand off: the assessment judges a committed implementation.
	writeFileSync(join(repo, 'a.txt'), 'b\n');
	const dirty = cli(repo, 'step', 'assess');
	check('CLI: wf step assess refuses an uncommitted tree', dirty.code === 2 && dirty.out.includes('commit the implementation'), dirty.out);
	git(repo, 'commit', '-q', '-am', 'fix');
	stateAt('build');
	const committed = cli(repo, 'step', 'assess');
	check('CLI: a committed implementation hands off with no wf check required', committed.code === 0 && readState(repo)?.step === 'assess', committed.out);
	// The assessment must name the HEAD it judged; a product change after it is stale at review.
	writeFileSync(join(repo, 'bug-reports/r/ASSESSMENT.md'), ASSESS({ head: git(repo, 'rev-parse', 'HEAD').trim() }));
	stateAt('assess');
	const review = cli(repo, 'step', 'review');
	check('CLI: a clean assessment at this HEAD passes to review', review.code === 0 && readState(repo)?.step === 'review', review.out);
	writeFileSync(join(repo, 'a.txt'), 'c\n');
	git(repo, 'commit', '-q', '-am', 'product after the assessment');
	stateAt('assess');
	const stale = cli(repo, 'step', 'review');
	check('CLI: a product change after the assessment is refused at review', stale.code === 2 && stale.out.includes('HEAD is'), stale.out);
	rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
