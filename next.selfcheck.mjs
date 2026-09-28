// next.selfcheck.mjs — node next.selfcheck.mjs → exit 0 when green.
// Pure arms: wf next's action for each row of what was the round skill's *On each result* table
// (next.mjs nextAction), from a fixture round. Nothing is run.
import { nextAction } from './next.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const tok = (t) => `\n<!-- brief: ${t} -->\n`;
const RESEARCH = `# r — research\n## Repro\ncommand: pnpm --dir verification exec playwright test -c ../bug-reports/r/repro/playwright.config.ts\n${tok('aaa111')}`;
const plan = ({ klass = 'A', asks = 'none', token = 'bbb222' } = {}) => `# r — plan\nClass: ${klass}\nCause: x\n\n## Commits\n| # | message | files | check |\n|---|---|---|---|\n| 1 | fix(x): one | a.ts | repro |\n| 2 | fix(x): two | b.ts | repro |\n\n## Asks\n- ${asks}\n${tok(token)}`;
const VALID = (v = 'matches plan', t = 'ccc333') => `# r — validation\nVerdict: ${v}\n## Build stack\n- hop 1: differs: returns null\n## Intent\n"one": met: a.ts:1 \u00b7 before: red \u00b7 after: green\n${tok(t)}`;
const green = (n) => ({ row: n, result: 'green' });
const base = (patch = {}) => ({
	branch: 'fix/r', entry: 'C:/wf/wf.mjs', step: 'classify', klass: 'A', questions: [], answered: [], commit: null,
	briefs: { research: { token: 'aaa111', count: 1 }, plan: { token: 'bbb222', count: 1 }, validate: { token: 'ccc333', count: 1 } },
	files: { research: null, plan: null, blocked: null, asBuilt: null, validation: null, review: null },
	t1: { spec: null, reviewed: null, verdict: null }, subjects: [], checks: [], ...patch,
	...(patch.files ? { files: { research: null, plan: null, blocked: null, asBuilt: null, validation: null, review: null, ...patch.files } } : {}),
});
const say = (s) => nextAction(s).say;
const steps = (s) => nextAction(s).effects.filter((e) => e.step).map((e) => e.step.join(' '));
const asks = (s) => nextAction(s).effects.filter((e) => e.ask).map((e) => e.ask);
const done2 = { subjects: ['fix(x): one', 'fix(x): two'], checks: [green(1), green(2)] };

// ── start → research
const fresh = base({ briefs: {} });
check('a new round: dispatch research, through wf brief', say(fresh) === 'dispatch research: run `node C:/wf/wf.mjs brief research` in this worktree and do exactly what it prints', say(fresh));
check('research briefed, no RESEARCH.md: again, saying why', say(base()).includes('(again: no RESEARCH.md)'));
check('RESEARCH.md from an earlier brief is not the answer', say(base({ files: { research: RESEARCH.replace('aaa111', 'old999') } })).includes('not the answer to the last brief'));
check('a phase briefed twice without a handoff goes to Shay, not a third agent', say(base({ briefs: { research: { token: 'aaa111', count: 2 } } })).startsWith('wait shay: research was briefed 2 times'));

// research finished
const researched = base({ files: { research: RESEARCH } });
check('research → wf step plan, dispatch plan', steps(researched).join() === 'plan' && say(researched).startsWith('dispatch plan: run `node C:/wf/wf.mjs brief plan`'), say(researched));

// a check (wf new --check): research first, then Shay; his go is `wf step plan`
check('a check with no RESEARCH.md yet: research, as a round', say(base({ check: true, briefs: {} })).startsWith('dispatch research:'));
const checked = base({ check: true, files: { research: RESEARCH } });
check('a check, research in: it waits on Shay, no plan', steps(checked).join() === 'research --waiting-on shay' && say(checked).startsWith('wait shay: check') && say(checked).includes('`node C:/wf/wf.mjs step plan`') && say(checked).includes('WF_FORCE_REAP=1 node C:/wf/wf.mjs reap fix/r'), say(checked));
check('a check already waiting: the same line, no step again', !steps({ ...checked, step: 'research' }).length && say({ ...checked, step: 'research' }) === say(checked));
check('a check Shay said go to: the plan, as a round', say({ ...checked, step: 'plan' }).startsWith('dispatch plan:'));

// plan finished, class A
const planned = base({ step: 'plan', files: { research: RESEARCH, plan: plan() } });
check('plan, class A → wf step implement, dispatch implement 1', steps(planned).join() === 'implement' && say(planned).startsWith('dispatch implement 1:'), say(planned));

// plan, Asks non-empty
const withAsk = base({ step: 'plan', files: { research: RESEARCH, plan: plan({ asks: 'round to 2 places? — default: 2' }) } });
check('plan with an Ask: recorded as a question to Shay, the round waits', asks(withAsk).length === 1 && asks(withAsk)[0].text === 'round to 2 places?' && asks(withAsk)[0].dflt === '2' && say(withAsk) === 'wait shay: round to 2 places? (default: 2)', say(withAsk));
const answeredAsk = (answer, token = 'bbb222') => base({ ...withAsk, answered: [{ n: 1, source: asks(withAsk)[0].source.replace('bbb222', token), text: 'round to 2 places?', default: '2', answer }] });
check('an Ask answered with its default is not put again: implement', steps(answeredAsk('2')).join() === 'implement' && steps(answeredAsk('default')).join() === 'implement', steps(answeredAsk('2')).join());
check('an Ask answered against its default: the plan is revised first', say(answeredAsk('3')).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`') && !steps(answeredAsk('3')).includes('implement'), say(answeredAsk('3')));
const revised = base({ ...answeredAsk('3', 'old000'), files: { research: RESEARCH, plan: plan() } });
check('once revised (a new plan brief, the answered Asks gone), implement', steps(revised).join() === 'implement', say(revised));
check('an open question: wait on its person, nothing else', say(base({ ...withAsk, questions: [{ n: 4, to: 'einat', text: 'which label?' }] })) === 'wait einat: q4 which label?');

// plan, class B/C → T1
const planB = base({ step: 'plan', files: { research: RESEARCH, plan: plan({ klass: 'B' }) } });
check('plan says B: wf step plan --class B, then the design session', steps(planB).join() === 'plan --class B' && say(planB).startsWith('design: start the design session'), say(planB));
const design = (t1) => base({ step: 'design', klass: 'B', files: { research: RESEARCH, plan: plan({ klass: 'B' }) }, t1 });
check('T1 not reviewed yet: wait on Shay with wf design', say(design({ spec: 's1', reviewed: null, verdict: null })) === 'wait shay: T1 on SPEC.md — `node C:/wf/wf.mjs design fix/r`');
check('T1 approved the current SPEC.md → wf step implement, implement 1', steps(design({ spec: 's1', reviewed: 's1', verdict: 'approved' })).join() === 'implement' && say(design({ spec: 's1', reviewed: 's1', verdict: 'approved' })).startsWith('dispatch implement 1:'));
check('T1 annotated → dispatch plan --revise', say(design({ spec: 's1', reviewed: 's1', verdict: 'changes-requested' })).startsWith('dispatch plan --revise: run `node C:/wf/wf.mjs brief plan --revise`'));
check('SPEC.md revised after its review: T1 again', say(design({ spec: 's2', reviewed: 's1', verdict: 'changes-requested' })).startsWith('wait shay: T1'));

// implement
const impl = (patch) => base({ step: 'implement', commit: 1, files: { research: RESEARCH, plan: plan(), ...(patch.files ?? {}) }, ...patch, ...(patch.files ? { files: { research: RESEARCH, plan: plan(), ...patch.files } } : {}) });
check('commit 1 committed with a green check → dispatch implement 2', say(impl({ subjects: ['fix(x): one'], checks: [green(1)] })).startsWith('dispatch implement 2:'));
check('committed but never green is not done', say(impl({ briefs: { ...base().briefs, 'implement 1': { token: 'x', count: 1 } }, subjects: ['fix(x): one'], checks: [{ row: 1, result: 'red' }] })).startsWith('dispatch implement 1:'));
check('BLOCKED: its Question recorded for Shay, the round waits', asks(impl({ files: { blocked: 'Question: which table?' } }))[0]?.source === 'BLOCKED.md' && say(impl({ files: { blocked: 'Question: which table?' } })) === 'wait shay: blocked at commit 1 — which table?');
check('BLOCKED answered → the same row again, fresh agent', say(impl({ files: { blocked: 'Question: which table?\n\n## Answer\n2026-09-27 orders' } })).startsWith('dispatch implement 1:'));
check('last commit, class A → validate', say(impl({ ...done2, files: {} })).startsWith('dispatch validate:'));
check('last commit, class B → as-built first', say(impl({ ...done2, klass: 'B', files: {} })).startsWith('dispatch as-built:'));
check('validation matches plan → T2, local, before any PR', say(impl({ ...done2, files: { validation: VALID() } })).startsWith('review: T2'));
const deviates = impl({ ...done2, files: { validation: VALID('deviates') } });
check('validation deviates: fix or accept, recorded for Shay with the deviating lines', asks(deviates)[0]?.text === 'fix or accept: hop 1: differs: returns null' && say(deviates).startsWith('wait shay: fix or accept'), say(deviates));
const ruled = (answer) => impl({ ...done2, files: { validation: VALID('deviates') }, answered: [{ n: 3, source: 'VALIDATION.md#ccc333', answer }] });
check('ruled accept → T2', say(ruled('accept, the label is fine')).startsWith('review: T2'));
check('ruled fix → fix-review from VALIDATION.md', say(ruled('fix it')).startsWith('dispatch fix-review --from VALIDATION.md: run `node C:/wf/wf.mjs brief fix-review --from VALIDATION.md`'));
check('the fix committed → validate again', say(impl({ ...done2, subjects: [...done2.subjects, 'fix(review): the label'], files: { validation: VALID('deviates') }, answered: [{ n: 3, source: 'VALIDATION.md#ccc333', answer: 'fix' }] })).startsWith('dispatch validate:'));

// T2 (local) → deliver: push, PR, merge → the tracker, last
check('delivered: T2, then wf review and --done', say(base({ step: 'review' })) === 'review: T2 — see the fix first (ROUND.md\'s T2, as the round skill\'s *Dispatch in this harness* says), then `node C:/wf/wf.mjs review fix/r`; once it has a verdict, `node C:/wf/wf.mjs review fix/r --done`');
check('T2 annotated (step back to implement) → fix-review', say(impl({ ...done2, files: { validation: VALID(), review: 'verdict: changes-requested\n' } })).startsWith('dispatch fix-review: run `node C:/wf/wf.mjs brief fix-review`'));
check('the T2 fix committed → T2 again', say(impl({ ...done2, subjects: [...done2.subjects, 'fix(review): x'], files: { validation: VALID(), review: 'verdict: changes-requested\n' } })).startsWith('review: T2'));
check('T2 dismissed: nothing merges, wait on Shay', say(base({ step: 'review', files: { review: 'verdict: dismissed\n' } })).startsWith('wait shay: T2 was closed'));
check('T2 approved → deliver (push, PR, merge), then the tracker note, then reap', say(base({ step: 'pr' })) === 'deliver: T2 approved — `node C:/wf/wf.mjs deliver` (push, PR, merge), then post the tracker note it wrote and set the delivered status (ROUND.md), then `node C:/wf/wf.mjs reap fix/r`', say(base({ step: 'pr' })));
check('merged → done', say(base({ step: 'merged' })) === 'done');
check('held → wait on Shay', say(base({ step: 'held' })).startsWith('wait shay: the round is held'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
