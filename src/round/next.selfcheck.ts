// next.selfcheck.ts — node next.selfcheck.ts → exit 0 when green.
// Pure arms: wf next's action for each row of what was the round skill's *On each result* table
// (next.ts nextAction), from a fixture round. Nothing is run.
import { lastSuites, nextAction, unpostedSections } from './next.ts';
import type { Snapshot } from './next.ts';
import { researchState, revisionText, reviseState } from './ask.ts';
import { briefsAfter } from './handoff.ts';
import type { Brief, Question } from './state.ts';

type Fixture = Partial<Omit<Snapshot, 'files' | 'briefs' | 'questions' | 'answered'>> & { files?: Partial<Snapshot['files']>; briefs?: Record<string, Partial<Brief>>; questions?: Partial<Question>[]; answered?: Partial<Question>[] };

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const tok = (t: string) => `\n<!-- brief: ${t} -->\n`;
const RESEARCH = `# r — research\n## Repro\ncommand: pnpm --dir verification exec playwright test -c ../bug-reports/r/repro/playwright.config.ts\n${tok('aaa111')}`;
const plan = ({ klass = 'A', asks = 'none', token = 'bbb222' } = {}) => `# r — plan\nClass: ${klass}\nCause: x\n\n## Commits\n| # | message | files | check |\n|---|---|---|---|\n| 1 | fix(x): one | a.ts | repro |\n| 2 | fix(x): two | b.ts | repro |\n\n## Asks\n- ${asks}\n${tok(token)}`;
const VALID = (v = 'matches plan', t = 'ccc333') => `# r — validation\nVerdict: ${v}\n## Build stack\n- hop 1: differs: returns null\n## Intent\n"one": met: a.ts:1 \u00b7 before: red \u00b7 after: green\n${tok(t)}`;
// The critic agreed with validation ccc333 (gates/critique.ts): every arm below it is past the critique.
const CRIT = (v = 'AGREE', t = 'fff666') => `# r — critique of the validation\n\n## Rows\n- ${v === 'AGREE' ? 'AGREE · Verdict: matches plan' : `${v} · hop 1: differs · a.ts:3 — it returns 0`}\n\nVerdict: ${v}\n${tok(t)}`;
const green = (n: number) => ({ row: n, result: 'green' });
const base = (patch: Fixture = {}) => ({
	branch: 'fix/r', entry: 'C:/wf/wf.mjs', step: 'classify', klass: 'A', questions: [], answered: [], commit: null,
	briefs: { research: { token: 'aaa111', count: 1 }, plan: { token: 'bbb222', count: 1 }, validate: { token: 'ccc333', count: 1 }, critique: { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 } },
	files: { research: null, plan: null, blocked: null, asBuilt: null, validation: null, critique: CRIT(), review: null },
	t1: { spec: null, reviewed: null, verdict: null }, subjects: [], checks: [], repro: { aaa111: 'stable' }, note: null, ...patch,
	...(patch.files ? { files: { research: null, plan: null, blocked: null, asBuilt: null, validation: null, critique: CRIT(), review: null, ...patch.files } } : {}),
}) as Snapshot;
const say = (s: Snapshot) => nextAction(s).say;
const steps = (s: Snapshot) => nextAction(s).effects.filter((e) => e.step).map((e) => e.step!.join(' '));
const asks = (s: Snapshot) => nextAction(s).effects.filter((e) => e.ask).map((e) => e.ask!);
const done2 = { subjects: ['fix(x): one', 'fix(x): two'], checks: [green(1), green(2)] };

// ── start → research
const fresh = base({ briefs: {} });
check('a new round: dispatch research, through wf brief', say(fresh) === 'dispatch research: run `node C:/wf/wf.mjs brief research` in this worktree and do exactly what it prints', say(fresh));
check('research briefed, no RESEARCH.md: again, saying why', say(base()).includes('(again: no RESEARCH.md)'));
check('RESEARCH.md from an earlier brief is not the answer', say(base({ files: { research: RESEARCH.replace('aaa111', 'old999') } })).includes('not the answer to the last brief'));
check('a phase briefed twice without a handoff goes to the user, not a third agent', say(base({ briefs: { research: { token: 'aaa111', count: 2 } } })).startsWith('wait user: research was briefed 2 times'));

// research finished
const researched = base({ files: { research: RESEARCH } });
check('research → wf step plan, dispatch plan', steps(researched).join() === 'plan' && say(researched).startsWith('dispatch plan: run `node C:/wf/wf.mjs brief plan`'), say(researched));

// a check (wf new --check): research first, then Shay; his go is `wf step plan`
check('a check with no RESEARCH.md yet: research, as a round', say(base({ check: true, briefs: {} })).startsWith('dispatch research:'));
// The repro is a measurement before plan: wf check --repro found it red at one place on every run (TJEW-665).
check('research in, its repro never found stable for this brief: research again, saying why', say(base({ files: { research: RESEARCH }, repro: {} })) === 'dispatch research: run `node C:/wf/wf.mjs brief research` in this worktree and do exactly what it prints (again: `node C:/wf/wf.mjs check --repro` has not found its repro red at one place on every run)', say(base({ files: { research: RESEARCH }, repro: {} })));
check('a stable repro from an earlier brief does not count', say(base({ files: { research: RESEARCH }, repro: { old999: 'stable' } })).startsWith('dispatch research:'));
const notReproduced = base({ files: { research: RESEARCH }, repro: { aaa111: 'green' } });
check('green on every run: wait on the user, no second research', say(notReproduced).startsWith('wait user: it does not reproduce — `node C:/wf/wf.mjs check --repro` was green on every run') && steps(notReproduced).join() === 'research --waiting-on user', say(notReproduced));
check('green on every run: the line names the way back to research, beside go on and stop', say(notReproduced).includes('Go on anyway: `node C:/wf/wf.mjs step plan`; new evidence to measure: `node C:/wf/wf.mjs decide --research "<what research must now measure>"`; stop: `WF_FORCE_REAP=1 node C:/wf/wf.mjs reap fix/r`'), say(notReproduced));
// BJEW-669 (2026-10-06): green on seeded data, then the cause found in QA's database; the repro verdict is keyed by the brief, which new evidence does not change.
const askedAgain = researchState({ step: 'research', briefs: { research: { token: 'aaa111', count: 1, at: '2026-10-06T10:00:00.000Z' } } }, '  the three duplicate wishlist rows on QA ', '2026-10-06T11:00:00.000Z');
const evidenced = { ...notReproduced, researchRequests: askedAgain.researchRequests, briefs: { ...notReproduced.briefs, research: { token: 'aaa111', count: 1, at: '2026-10-06T10:00:00.000Z' } } } as Snapshot;
check('decide --research: a fresh research, though the repro of the old brief is green', say(evidenced) === 'dispatch research: run `node C:/wf/wf.mjs brief research` in this worktree and do exactly what it prints' && !steps(evidenced).length && askedAgain.researchRequests?.[0].text === 'the three duplicate wishlist rows on QA' && askedAgain.step === 'research', say(evidenced));
const briefedAgain = { ...evidenced, briefs: { ...evidenced.briefs, research: { token: 'ddd444', count: 1, at: '2026-10-06T11:05:00.000Z' } }, files: { ...evidenced.files, research: RESEARCH.replace('aaa111', 'ddd444') }, repro: { aaa111: 'green' } } as Snapshot;
check('the new research briefed: the old token\'s green does not count, the new brief\'s own verdict does', say(briefedAgain).startsWith('dispatch research:') && steps({ ...briefedAgain, repro: { ddd444: 'stable' } }).join() === 'plan' && steps({ ...briefedAgain, repro: { ddd444: 'green' } }).join() === 'research --waiting-on user' && say({ ...briefedAgain, repro: { ddd444: 'green' } }).startsWith('wait user: it does not reproduce'), say(briefedAgain));
check('a request already answered by a research brief is not sent again', !say({ ...notReproduced, researchRequests: [{ text: 'x', at: '2026-10-06T09:00:00.000Z' }], briefs: { research: { token: 'aaa111', count: 1, at: '2026-10-06T10:00:00.000Z' } } } as Snapshot).startsWith('dispatch'));
check('unstable for this brief: research again', say(base({ files: { research: RESEARCH }, repro: { aaa111: 'unstable' } })).startsWith('dispatch research:'));
// BJEW-461 (2026-10-06): red three times in the shared setup's login, and plan was dispatched.
const outside = say(base({ files: { research: RESEARCH }, repro: { aaa111: 'outside' } }));
check('red outside the repro for this brief: no plan; research again once the precondition is fixed', outside.startsWith('dispatch research:') && outside.includes('a precondition (login, setup, data) and not the defect'), outside);
check('a check round needs no stable repro: green is its answer', say(base({ check: true, files: { research: RESEARCH }, repro: {} })).startsWith('wait user: check'));
const checked = base({ check: true, files: { research: RESEARCH } });
check('a check, research in: it waits on the user, no plan', steps(checked).join() === 'research --waiting-on user' && say(checked).startsWith('wait user: check') && say(checked).includes('`node C:/wf/wf.mjs step plan`') && say(checked).includes('WF_FORCE_REAP=1 node C:/wf/wf.mjs reap fix/r'), say(checked));
check('a check already waiting: the same line, no step again', !steps({ ...checked, step: 'research' }).length && say({ ...checked, step: 'research' }) === say(checked));
check('a check the user said go to: the plan, as a round', say({ ...checked, step: 'plan' }).startsWith('dispatch plan:'));

// plan finished, class A
const planned = base({ step: 'plan', files: { research: RESEARCH, plan: plan() } });
check('plan, class A → wf step implement, dispatch implement 1', steps(planned).join() === 'implement' && say(planned).startsWith('dispatch implement 1:'), say(planned));
// The project's rule on the plan's rows (BJEW-617, 2026-10-06): a fix/ plan listing a verification/ file goes back to the plan agent, not on to implement.
const oraclePlan = base({ step: 'plan', files: { research: RESEARCH, plan: plan().replace('| a.ts |', '| verification/tests/x.spec.ts |') } });
check('plan: a fix/ row listing a verification/ file is redispatched with the rule of the guard, not built', say(oraclePlan).startsWith('dispatch plan') && say(oraclePlan).includes('oracle-guard') && steps(oraclePlan).length === 0, say(oraclePlan));

// plan, Asks non-empty
const withAsk = base({ step: 'plan', files: { research: RESEARCH, plan: plan({ asks: 'round to 2 places? — default: 2' }) } });
check('plan with an Ask: recorded as a question to the user, the round waits', asks(withAsk).length === 1 && asks(withAsk)[0].text === 'round to 2 places?' && asks(withAsk)[0].dflt === '2' && say(withAsk) === 'wait user: round to 2 places? (default: 2)', say(withAsk));
const answeredAsk = (answer: string, token = 'bbb222') => base({ ...withAsk, answered: [{ n: 1, source: asks(withAsk)[0].source.replace('bbb222', token), text: 'round to 2 places?', default: '2', answer }] });
check('an Ask answered with its default is not put again: implement', steps(answeredAsk('2')).join() === 'implement' && steps(answeredAsk('default')).join() === 'implement', steps(answeredAsk('2')).join());
check('an Ask answered against its default: the plan is revised first', say(answeredAsk('3')).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`') && !steps(answeredAsk('3')).includes('implement'), say(answeredAsk('3')));
const revised = base({ ...answeredAsk('3', 'old000'), files: { research: RESEARCH, plan: plan() } });
check('once revised (a new plan brief, the answered Asks gone), implement', steps(revised).join() === 'implement', say(revised));
check('an open question: wait on its person, nothing else', say(base({ ...withAsk, questions: [{ n: 4, to: 'einat', text: 'which label?' }] })) === 'wait einat: q4 which label?');

// plan, class B/C → T1
const planB = base({ step: 'plan', files: { research: RESEARCH, plan: plan({ klass: 'B' }) } });
check('plan says B: wf step plan --class B, then the design session', steps(planB).join() === 'plan --class B' && say(planB).startsWith('design: start the design session'), say(planB));
const design = (t1: Snapshot['t1']) => base({ step: 'design', klass: 'B', files: { research: RESEARCH, plan: plan({ klass: 'B' }) }, t1 });
check('T1 not reviewed yet: wait on the user with wf design', say(design({ spec: 's1', reviewed: null, verdict: null })) === 'wait user: T1 on SPEC.md — `node C:/wf/wf.mjs design fix/r`');
check('T1 approved the current SPEC.md → wf step implement, implement 1', steps(design({ spec: 's1', reviewed: 's1', verdict: 'approved' })).join() === 'implement' && say(design({ spec: 's1', reviewed: 's1', verdict: 'approved' })).startsWith('dispatch implement 1:'));
check('T1 annotated → dispatch plan --revise', say(design({ spec: 's1', reviewed: 's1', verdict: 'changes-requested' })).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`'));
check('SPEC.md revised after its review: T1 again', say(design({ spec: 's2', reviewed: 's1', verdict: 'changes-requested' })).startsWith('wait user: T1'));
// BJEW-669 (2026-10-06): T1 approved a SPEC whose design replaced the plan's commit 1, and `wf next` still dispatched implement 1.
const approvedB = { spec: 's1', reviewed: 's1', verdict: 'approved' };
const planBefore = (spec: string | null) => ({ ...base().briefs, plan: { token: 'bbb222', count: 1, at: '2026-10-06T14:14:42.202Z', spec } });
const designBriefed = (spec: string | null, t1: Snapshot['t1'] = approvedB, step = 'design') => base({ step, klass: 'B', files: { research: RESEARCH, plan: plan({ klass: 'B' }) }, briefs: planBefore(spec), t1 });
const stale = designBriefed(null);
const revise = (s: Snapshot) => nextAction(s).effects.find((e) => e.revise)?.revise;
check('T1 approved a SPEC the plan was written before: plan --revise first, naming the SPEC, no implement', say(stale).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`') && !steps(stale).includes('implement') && revise(stale)?.includes('T1 approved SPEC.md (s1') === true, say(stale));
const staleState = reviseState({ step: 'design', briefs: planBefore(null), history: [] }, revise(stale) ?? '', '2026-10-06T14:30:51.805Z');
check('the revision is pending until a plan brief is newer: plan --revise again, no second revision recorded', say({ ...stale, step: 'plan', revisions: staleState.revisions } as Snapshot).startsWith('dispatch plan --revise:') && !revise({ ...stale, step: 'plan', revisions: staleState.revisions } as Snapshot));
check('a plan briefed with the SPEC sha (what plan --revise records) goes on to implement, no second revise', say(designBriefed('s1')).startsWith('dispatch implement 1:') && !revise(designBriefed('s1')));
check('a plan briefed before wf recorded the SPEC sha (no field) is not sent back', say(designBriefed(undefined as unknown as null)).startsWith('dispatch implement 1:'));
check('a plan revised after T1 annotated it (its brief held a SPEC sha) is not revised again when the new SPEC is approved', say(designBriefed('s1', { spec: 's2', reviewed: 's2', verdict: 'approved' })).startsWith('dispatch implement 1:'));
// wf decide --revise on a round whose T1 approved the current SPEC: the step is plan, the SPEC has not moved.
check('plan --revise done on a round whose T1 approved the current SPEC.md: implement, no second design session or T1', steps(designBriefed('s1', approvedB, 'plan')).join() === 'implement' && say(designBriefed('s1', approvedB, 'plan')).startsWith('dispatch implement 1:'), say(designBriefed('s1', approvedB, 'plan')));
check('a SPEC.md changed since its approval, at step plan: the design session', say(designBriefed('s1', { spec: 's2', reviewed: 's1', verdict: 'approved' }, 'plan')).startsWith('design: start the design session'));
check('no SPEC.md at step plan: the design session', say(designBriefed('s1', { spec: null, reviewed: null, verdict: null }, 'plan')).startsWith('design: start the design session'));
check('changes-requested on the current SPEC.md at step plan: still the design session', say(designBriefed('s1', { spec: 's1', reviewed: 's1', verdict: 'changes-requested' }, 'plan')).startsWith('design: start the design session'));

// implement
const impl = (patch: Fixture) => base({ step: 'implement', commit: 1, files: { research: RESEARCH, plan: plan(), ...(patch.files ?? {}) }, ...patch, ...(patch.files ? { files: { research: RESEARCH, plan: plan(), ...patch.files } } : {}) });
check('commit 1 committed with a green check → dispatch implement 2', say(impl({ subjects: ['fix(x): one'], checks: [green(1)] })).startsWith('dispatch implement 2:'));
check('committed but never green is not done', say(impl({ briefs: { ...base().briefs, 'implement 1': { token: 'x', count: 1 } }, subjects: ['fix(x): one'], checks: [{ row: 1, result: 'red' }] })).startsWith('dispatch implement 1:'));
check('BLOCKED: its Question recorded for the user, the round waits', asks(impl({ files: { blocked: 'Question: which table?' } }))[0]?.source === 'BLOCKED.md' && say(impl({ files: { blocked: 'Question: which table?' } })) === 'wait user: blocked at commit 1 — which table?');
check('BLOCKED answered → the same row again, fresh agent', say(impl({ files: { blocked: 'Question: which table?\n\n## Answer\n2026-09-27 orders' } })).startsWith('dispatch implement 1:'));
// BJEW-461 (2026-10-06): the agent briefed after the answer blocked again, and wf next dispatched it again.
const answeredBlock = { files: { blocked: 'Question: stop and ask QA?\n\n## Answer\n2026-10-06 default' }, answered: [{ n: 3, to: 'user', text: 'stop and ask QA?', source: 'BLOCKED.md', asked: '2026-10-06T09:04:46Z', answer: 'default', answered: '2026-10-06T09:05:21Z' }] };
const before = impl({ ...answeredBlock, briefs: { ...base().briefs, 'implement 1': { token: 'aaa', at: '2026-10-06T09:00:00Z', count: 1 } } });
check('BLOCKED answered after its agent was briefed → that row again, to follow the answer', say(before).startsWith('dispatch implement 1:'));
const again = impl({ ...answeredBlock, briefs: { ...base().briefs, 'implement 1': { token: '8aba1d', at: '2026-10-06T09:05:34Z', count: 2 } } });
check('blocked again by the agent that had the answer → no dispatch: the user answers anew, holds or ends the round', say(again).startsWith('wait user: commit 1 is still blocked after the answer: stop and ask QA?') && say(again).includes('step held') && say(again).includes('reap') && asks(again)[0]?.source === 'BLOCKED.md#8aba1d', say(again));
const reanswered = impl({ ...answeredBlock, answered: [...answeredBlock.answered, { n: 4, to: 'user', text: 'still blocked', source: 'BLOCKED.md#8aba1d', asked: '2026-10-06T09:20:00Z', answer: 'use QA commit abc', answered: '2026-10-06T09:21:00Z' }], briefs: { ...base().briefs, 'implement 1': { token: '8aba1d', at: '2026-10-06T09:05:34Z', count: 2 } } });
check('a new answer after that → the row again', say(reanswered).startsWith('dispatch implement 1:'), say(reanswered));
// BJEW-461 (2026-10-06): commit 1 (the repro) was red and committed; the user's measurement said the
// planned fix (commit 2) was the wrong one, and from implement nothing led back to plan.
const bjew = { subjects: ['fix(x): one'], checks: [green(1)], briefs: { ...base().briefs, plan: { token: 'bbb222', at: '2026-10-06T08:56:27Z', count: 1 }, 'implement 1': { token: 'i1', at: '2026-10-06T09:14:48Z', count: 3 }, 'implement 2': { token: 'i2', at: '2026-10-06T09:17:35Z', count: 1 } } };
check('implement, commit 1 done: row 2 again, whatever was said about the plan', say(impl(bjew)).startsWith('dispatch implement 2'), say(impl(bjew)));
const revisedState = reviseState({ step: 'implement', briefs: bjew.briefs, history: [] }, 'the confirm opens behind the order modal (stacking): plan that fix', '2026-10-06T09:30:00Z');
const toPlan = base({ ...bjew, step: revisedState.step!, revisions: revisedState.revisions, files: { research: RESEARCH, plan: plan() } });
check('an answer that revises the plan → dispatch plan --revise, nothing built', say(toPlan).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`') && !steps(toPlan).includes('implement'), say(toPlan));
check('a revision without its answer in the state is no revision (the old plan stands)', steps(base({ ...bjew, step: 'plan', files: { research: RESEARCH, plan: plan() } })).join() === 'implement');
const briefedPlan = { ...briefsAfter('plan', ['--revise'], bjew.briefs), plan: { token: 'bbb222', at: '2026-10-06T09:31:00Z', count: 2 } };
check('the revision voids the implement briefs, not the plan, research or validate ones', Object.keys(briefsAfter('plan', ['--revise'], bjew.briefs)).sort().join() === 'critique,plan,research,validate' && briefsAfter('plan', [], bjew.briefs) === bjew.briefs && briefsAfter('implement', ['2'], bjew.briefs) === bjew.briefs);
const revisedPlan = base({ ...bjew, briefs: briefedPlan, step: 'plan', revisions: revisedState.revisions, files: { research: RESEARCH, plan: plan() } });
check('plan briefed after the answer and handed off → implement; the committed row stands, the other is fresh (no "again")', steps(revisedPlan).join() === 'implement' && say(revisedPlan) === 'dispatch implement 2: run `node C:/wf/wf.mjs brief implement 2` in this worktree and do exactly what it prints', say(revisedPlan));
check('plan briefed after the answer but not handed off → plan again, saying why', say(base({ ...revisedPlan, files: { research: RESEARCH, plan: plan({ token: 'old000' }) } })).includes('not the answer to the last brief'));
check('last commit, class A → validate', say(impl({ ...done2, files: {} })).startsWith('dispatch validate:'));
// wf check --suites (2026-10-05): a project that names suites runs them on this HEAD before validate.
const suiteRun = { ts: '2026-10-05T12:00:00.000Z', head: 'h2', result: 'green' as const };
const suited = (suites: Snapshot['suites'], patch: Fixture = {}) => impl({ ...done2, files: {}, head: 'h2', suites, ...patch });
check('suites named, never run → run them before validate', say(suited(null)) === 'suites: `node C:/wf/wf.mjs check --suites` (the whole suites of what this round changed, on this HEAD), then `node C:/wf/wf.mjs next`');
check('suites run on an older HEAD (a fix since) → run them again', say(suited({ ...suiteRun, head: 'h1' })).startsWith('suites: '));
check('suites run on this HEAD, green or red → validate, which reads the line', say(suited(suiteRun)).startsWith('dispatch validate:') && say(suited({ ...suiteRun, result: 'red' })).startsWith('dispatch validate:'));
check('a fix asked for comes before the suites', say(suited(null, { files: { validation: VALID('deviates') }, answered: [{ n: 3, source: 'VALIDATION.md#ccc333', answer: 'fix' }] })).startsWith('dispatch fix-review'));
const validatedSuite = (at: string, result: 'green' | 'red' = 'green', validation = VALID()) => suited({ ...suiteRun, result }, { files: { validation }, briefs: { ...base().briefs, validate: { ...base().briefs.validate, at } } });
check('resumed or rerun: suites newer than validation → validate again', say(validatedSuite('2026-10-05T11:00:00.000Z')).startsWith('dispatch validate:') && say(validatedSuite('2026-10-05T11:00:00.000Z', 'red')).startsWith('dispatch validate:'));
check('validation after suites → T2 without another run', say(validatedSuite('2026-10-05T13:00:00.000Z')).startsWith('review: T2'));
check('red suite reported by validation → fix-or-accept question names it', asks(validatedSuite('2026-10-05T13:00:00.000Z', 'red', VALID('deviates') + '\n## Suites\n- red: suite one — failing.test.ts\n'))[0]?.text.includes('red: suite one — failing.test.ts') === true);
check('checks.log: the last suites line, past others and a cut-off one', JSON.stringify(lastSuites('{"ts":"t","row":"suites","head":"h1","result":"red"}\n{"row":1,"result":"green"}\n{"ts":"t","row":"suites","head":"h2","result":"green"}\n{"row":"sui')) === '{"ts":"t","head":"h2","result":"green"}' && lastSuites('') === null);
check('checks.log: malformed suites entries and JSON primitives are ignored', lastSuites('null\n42\n{"row":"suites","head":1,"result":"green"}\n{"row":"suites","ts":"t","head":"h","result":"maybe"}') === null);
const suiteFix = { ...validatedSuite('2026-10-05T13:00:00.000Z', 'red', VALID('deviates')), answered: [{ n: 1, to: 'user', text: 'fix or accept', asked: 't', source: 'VALIDATION.md#ccc333', answer: 'fix' }] };
check('red suite ruled fix → fix-review from validation', say(suiteFix).includes('brief fix-review --from VALIDATION.md'));
const suiteFixed = { ...suiteFix, head: 'h3', subjects: [...done2.subjects, 'fix(review): the suite failure'], fixesAfterValidate: 1 };
check('suite fix committed → rerun suites on the new HEAD', say(suiteFixed).startsWith('suites: '));
check('suites rerun after the fix → validate again', say({ ...suiteFixed, suites: { ...suiteRun, ts: '2026-10-05T14:00:00.000Z', head: 'h3' } }).startsWith('dispatch validate:'));
check('last commit, class B → as-built first', say(impl({ ...done2, klass: 'B', files: {} })).startsWith('dispatch as-built:'));
check('validation matches plan → T2, local, before any PR', say(impl({ ...done2, files: { validation: VALID() } })).startsWith('review: T2'));
const deviates = impl({ ...done2, files: { validation: VALID('deviates') } });
check('validation deviates: fix or accept, recorded for the user with the deviating lines', asks(deviates)[0]?.text === 'fix or accept: hop 1: differs: returns null' && say(deviates).startsWith('wait user: fix or accept'), say(deviates));
const ruled = (answer: string) => impl({ ...done2, files: { validation: VALID('deviates') }, answered: [{ n: 3, source: 'VALIDATION.md#ccc333', answer }] });
check('ruled accept → T2', say(ruled('accept, the label is fine')).startsWith('review: T2'));
check('ruled fix → fix-review from VALIDATION.md', say(ruled('fix it')).startsWith('dispatch fix-review --from VALIDATION.md: run `node C:/wf/wf.mjs brief fix-review --from VALIDATION.md`'));
check('the fix committed → validate again', say(impl({ ...done2, subjects: [...done2.subjects, 'fix(review): the label'], files: { validation: VALID('deviates') }, answered: [{ n: 3, source: 'VALIDATION.md#ccc333', answer: 'fix' }] })).startsWith('dispatch validate:'));
// TJEW-670 (2026-10-06): a fix ruling recorded with `wf decide --revise --q` is built by a plan row whose subject is not fix(review):.
const viaPlan: Partial<Question> = { n: 6, to: 'user', text: 'fix or accept: x differs', source: 'VALIDATION.md#ccc333', answer: 'fix, differently: single-flight' };
const viaPlanRevisions = [{ text: revisionText(viaPlan as Question, viaPlan.answer!), at: '2026-10-06T19:38:53.305Z' }];
const viaPlanRound = (patch: Fixture = {}) => impl({ ...done2, subjects: [...done2.subjects, 'fix(admin): update the cached formula'], files: { validation: VALID('deviates') }, answered: [viaPlan], revisions: viaPlanRevisions, ...patch });
check('fix ruling built by a plan row (decide --revise --q) → no fix-review, on to validate', !say(viaPlanRound()).includes('fix-review') && say(viaPlanRound()).startsWith('dispatch validate:'), say(viaPlanRound()));
check('the same ruling, not revised through plan → still a fix(review) owed', say(viaPlanRound({ revisions: [] })).startsWith('dispatch fix-review --from VALIDATION.md'));
check('a revise through plan does not excuse another ruling', say(viaPlanRound({ answered: [viaPlan, { n: 7, source: 'VALIDATION.md#ccc333', answer: 'fix' }] })).startsWith('dispatch fix-review --from VALIDATION.md'));

const onModels = (s: Snapshot) => say({ ...s, models: { low: 'sonnet', medium: 'opus' } });
// the critic: a fresh agent audits the validation before the person sees it (gates/critique.ts)
const critiqued = (critique: string | null, cb: Partial<Brief> | undefined, vb: Partial<Brief> = { token: 'ccc333', count: 1 }, validation = VALID()) => impl({ ...done2, files: { validation, critique }, briefs: { ...base().briefs, validate: vb, critique: cb } as Fixture['briefs'] });
check('validated, never critiqued → dispatch critique', say(critiqued(null, undefined)) === 'dispatch critique: run `node C:/wf/wf.mjs brief critique` in this worktree and do exactly what it prints', say(critiqued(null, undefined)));
check('a critique of an earlier validation is not this one\'s: critique again, a new chain', say(critiqued(CRIT(), { token: 'fff666', count: 1, of: 'old999', exchange: 1 })).startsWith('dispatch critique: run'));
check('critique briefed, no CRITIQUE.md: again, saying why', say(critiqued(null, { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 })).includes('(again: no CRITIQUE.md)'));
check('a critic briefed twice without its handoff goes to the user', say(critiqued(null, { token: 'fff666', count: 2, of: 'ccc333', exchange: 1 })).startsWith('wait user: critique was briefed 2 times'));
check('a critique that agrees: on to the validation\'s verdict, as before', say(critiqued(CRIT(), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 })).startsWith('review: T2') && say(critiqued(CRIT(), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 }, undefined, VALID('deviates'))).startsWith('wait user: fix or accept'));
check('the critic disagrees: validate answers it, before any fix-or-accept question', say(critiqued(CRIT('DISAGREE_EVIDENCE'), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 }, undefined, VALID('deviates'))) === 'dispatch validate --answer: run `node C:/wf/wf.mjs brief validate --answer` in this worktree and do exactly what it prints' && asks(critiqued(CRIT('DISAGREE_EVIDENCE'), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 }, undefined, VALID('deviates'))).length === 0);
check('a concern is answered too', say(critiqued(CRIT('DISAGREE_CONCERN'), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 })).startsWith('dispatch validate --answer:'));
const answered1 = (critiqued(CRIT('DISAGREE_EVIDENCE'), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 }, { token: 'abc777', count: 2, answers: 1 }, VALID('matches plan', 'abc777')));
check('the answer handed off → the next exchange\'s critique', say(answered1).startsWith('dispatch critique: run'));
check('an answer that did not hand off is briefed again as an answer', say(critiqued(CRIT('DISAGREE_EVIDENCE'), { token: 'fff666', count: 1, of: 'ccc333', exchange: 1 }, { token: 'abc777', count: 1, answers: 1 })).startsWith('dispatch validate --answer: run') );
check('still disagreeing after the last exchange: the dispute goes on to T2, wf does not settle it', say(critiqued(CRIT('DISAGREE_EVIDENCE', 'def888'), { token: 'def888', count: 1, of: 'abc777', exchange: 2 }, { token: 'abc777', count: 2, answers: 1 }, VALID('matches plan', 'abc777'))).startsWith('review: T2'));
check('the critic is another model than validate: medium, where validate is low', onModels(critiqued(null, undefined)).startsWith('dispatch critique (model: opus): '));

// the model: this machine's for the phase's effort level (models.ts), named in the dispatch line
check('a dispatch names the model for its phase\'s level: medium for research, a commit, a revised plan', onModels(fresh) === 'dispatch research (model: opus): run `node C:/wf/wf.mjs brief research` in this worktree and do exactly what it prints' && onModels(planned).startsWith('dispatch implement 1 (model: opus): ') && onModels(answeredAsk('3')).startsWith('dispatch plan --revise (model: opus): '), onModels(fresh));
check('low for the read-only judges', onModels(impl({ ...done2, files: {} })).startsWith('dispatch validate (model: sonnet): ') && onModels(impl({ ...done2, klass: 'B', files: {} })).startsWith('dispatch as-built (model: sonnet): '));
check('a wait names no model', onModels(base({ briefs: { research: { token: 'aaa111', count: 2 } } })).startsWith('wait user: research was briefed 2 times'));

// the standards axis: one fresh agent per .agents/checks rule that covers the diff, after spec is settled
const REPORT = (t = 'ddd444') => `# r — standards: perf\nCheck: .agents/checks/perf.md\nResult: pass\n\n## Issues\nnone\n${tok(t)}`;
const rules = (perf: string | null, errors: string | null = null, fixesAfter = 0) => [{ id: 'perf', text: perf, fixesAfter }, { id: 'api/errors', text: errors, fixesAfter: 0 }];
const ruled2 = (standards: Snapshot['standards'], briefs = {}) => impl({ ...done2, files: { validation: VALID() }, standards, briefs: { ...base().briefs, ...briefs } });
check('validated, rules cover the diff: the first rule, by its id', say(ruled2(rules(null))) === 'dispatch standards perf: run `node C:/wf/wf.mjs brief standards perf` in this worktree and do exactly what it prints', say(ruled2(rules(null))));
check('validation deviating and unruled: spec is settled first, no standards yet', say(impl({ ...done2, files: { validation: VALID('deviates') }, standards: rules(null) })).startsWith('wait user: fix or accept'));
check('one at a time: the next rule once the first handed off', say(ruled2(rules(REPORT()), { 'standards perf': { token: 'ddd444', count: 1 } })).startsWith('dispatch standards api/errors:'), say(ruled2(rules(REPORT()), { 'standards perf': { token: 'ddd444', count: 1 } })));
check('a report from an earlier brief is not the answer', say(ruled2(rules(REPORT('old999')), { 'standards perf': { token: 'ddd444', count: 1 } })).includes('(again: standards/perf.md is not the answer to the last brief'));
check('a rule briefed twice without its report goes to the user', say(ruled2(rules(null), { 'standards perf': { token: 'ddd444', count: 2 } })).startsWith('wait user: standards perf was briefed 2 times'));
const allIn = { 'standards perf': { token: 'ddd444', count: 1 }, 'standards api/errors': { token: 'eee555', count: 1 } };
check('every rule reported, issues or not → T2: the reports go to the person as they are', say(ruled2(rules(REPORT(), REPORT('eee555').replace('Result: pass', 'Result: issues').replace('none', '- high · api/o.ts:4 — x · fix: y')), allIn)).startsWith('review: T2'));
check('a fix(review) after a rule\'s brief: that rule again', say(ruled2(rules(REPORT(), REPORT('eee555'), 1), allIn)).startsWith('dispatch standards perf:'));
check('no rule covers the diff (no .agents/checks): T2 as before', say(ruled2([])).startsWith('review: T2') && say(ruled2(undefined)).startsWith('review: T2'));

// T2 (local) → deliver: push, PR, merge → the tracker, last
check('delivered: T2, then wf review and --done', say(base({ step: 'review' })) === 'review: T2 — see the fix first (ROUND.md\'s T2, as the round skill\'s *Dispatch in this harness* says), then `node C:/wf/wf.mjs review fix/r`; once it has a verdict, `node C:/wf/wf.mjs review fix/r --done`');
check('T2 annotated (step back to implement) → fix-review', say(impl({ ...done2, files: { validation: VALID(), review: 'verdict: changes-requested\n' } })).startsWith('dispatch fix-review: run `node C:/wf/wf.mjs brief fix-review`'));
const t2Fixed = { ...done2, subjects: [...done2.subjects, 'fix(review): x'], files: { validation: VALID(), review: 'verdict: changes-requested\n' } };
check('the T2 fix committed → validate again: the PR carries VALIDATION.md (TJEW-670)', say(impl({ ...t2Fixed, fixesAfterValidate: 1 })) === 'dispatch validate: run `node C:/wf/wf.mjs brief validate` in this worktree and do exactly what it prints', say(impl({ ...t2Fixed, fixesAfterValidate: 1 })));
check('a second T2 fix re-validates too, never escalating as a missing handoff', say(impl({ ...t2Fixed, fixesAfterValidate: 1, briefs: { ...base().briefs, validate: { token: 'ccc333', count: 3 } } })).startsWith('dispatch validate:'));
check('validated after the fix → T2 again', say(impl({ ...t2Fixed, fixesAfterValidate: 0 })).startsWith('review: T2'));
check('T2 dismissed: nothing merges, wait on the user', say(base({ step: 'review', files: { review: 'verdict: dismissed\n' } })).startsWith('wait user: T2 was closed'));
check('T2 approved → deliver (push, PR, merge, the note), then wf next', say(base({ step: 'pr' })) === 'deliver: T2 approved — `node C:/wf/wf.mjs deliver` (push, PR, merge, the tracker note), then `node C:/wf/wf.mjs next`', say(base({ step: 'pr' })));
// The tracker note: a section per item, each marked once posted, so a resumed round never posts one twice.
const NOTE = '<!-- one per ## -->\n\n## TJEW-670.2\nתוקן ✅\nPR: u\n\n## TJEW-670.3\nתוקן ✅\nPR: u\n';
const merged = (text: string | null) => base({ step: 'merged', note: { file: 'bug-reports/r/MONDAY.md', text } });
check('merged, nothing posted → post every section', say(merged(NOTE)) === 'post: TJEW-670.2, TJEW-670.3 — each section of bug-reports/r/MONDAY.md on its own item, with the delivered status (ROUND.md); right after each, its heading gets ` (posted)`. Then `node C:/wf/wf.mjs next`', say(merged(NOTE)));
check('one posted → only the other', say(merged(NOTE.replace('## TJEW-670.2', '## TJEW-670.2 (posted)'))).startsWith('post: TJEW-670.3 — '));
check('all posted → done: reap', say(merged(NOTE.replace(/^## (\S+)$/gm, '## $1 (posted)'))) === 'done: `node C:/wf/wf.mjs reap fix/r`');
check('no note recorded (delivered before wf recorded it) → done: reap', say(base({ step: 'merged' })) === 'done: `node C:/wf/wf.mjs reap fix/r`');
check('a recorded note gone from disk → done, not a crash', say(merged(null)).startsWith('done: '));
check('the ## lines of a section body are not sections', unpostedSections('## A\ntext ## B\n').join() === 'A');
check('held → wait on the user', say(base({ step: 'held' })).startsWith('wait user: the round is held'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
