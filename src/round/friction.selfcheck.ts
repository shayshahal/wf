// friction.selfcheck.ts — node friction.selfcheck.ts → exit 0 when green.
import { agentsPerPhase, duration, frictionLine, outcomeOf, refusalLine, stepHistory, timeInSteps } from './friction.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const h1 = stepHistory(undefined, 'research', '2026-09-28T08:00:00.000Z');
const h2 = stepHistory(h1, 'research', '2026-09-28T08:05:00.000Z');
check('a step run again is the same stretch: history keeps its first start', h2 === h1 && h2.length === 1, JSON.stringify(h2));
const h3 = stepHistory(h2, 'plan', '2026-09-28T08:20:00.000Z');
check('a new step is appended', h3.length === 2 && h3[1].step === 'plan', JSON.stringify(h3));

check('durations read as minutes, then hours', duration(12 * 60000) === '12m' && duration(95 * 60000) === '1h35m' && duration(20000) === '0m', `${duration(12 * 60000)} ${duration(95 * 60000)}`);

const history = [
	{ step: 'research', at: '2026-09-28T08:00:00.000Z' },
	{ step: 'implement', at: '2026-09-28T08:30:00.000Z' },
	{ step: 'review', at: '2026-09-28T09:00:00.000Z' },
	{ step: 'implement', at: '2026-09-28T09:10:00.000Z' },
	{ step: 'review', at: '2026-09-28T09:20:00.000Z' },
];
const spent = timeInSteps(history, '2026-09-28T09:30:00.000Z');
check('a step the round came back to is summed (a T2 fix sends it back to implement)', spent.join() === 'research 30m,implement 40m,review 20m', spent.join());

const agents = agentsPerPhase({ research: { count: 1 }, 'implement 1': { count: 1 }, 'implement 2': { count: 2 }, validate: { count: 2 } });
check('agents per phase: the implement rows add up', agents.join() === 'research 1,implement 3,validate 2', agents.join());
// JX-1221 (2026-10-08): the reap line said `plan 16, implement 1` for a round that had briefed 7
// implement rows, because a plan --revise voids the keys the old count was read from (handoff.ts).
const runs = { research: 1, plan: 16, implement: 7, validate: 3, 'fix-review': 3 };
const fromRuns = agentsPerPhase({ research: { count: 1 }, 'implement 18': { count: 1 } }, runs);
check('agents per phase: briefCounts counts what the round did, not what survived', fromRuns.join() === 'research 1,plan 16,implement 7,validate 3,fix-review 3', fromRuns.join());
check('agents per phase: no counts recorded falls back to the surviving briefs', agentsPerPhase({ research: { count: 1 }, 'implement 1': { count: 1 }, 'implement 2': { count: 2 }, validate: { count: 2 } }, null).join() === 'research 1,implement 3,validate 2' && agentsPerPhase({ plan: { count: 2 } }, {}).join() === 'plan 2');

// A TJEW-670.11-shaped round: two T2s, a push the hook refused, one red check, two wf refusals.
const state = { id: 'TJEW-670.11', class: 'B', step: 'merged', history, briefs: { research: { count: 1, at: '2026-09-28T08:01:00.000Z' } }, answered: [{ n: 1 }, { n: 2 }], questions: [] } as unknown as State;
const checksLog = [{ result: 'green' }, { result: 'red' }, { result: 'green' }].map((c) => JSON.stringify(c)).join('\n');
const eventsLog = [
	refusalLine({ ts: 't', argv: ['review', 'cr/x'], code: 2, message: "wf review: class B round without proof/CALL-STACK-AS-BUILT.md — …\nmore" }),
	refusalLine({ ts: 't', argv: ['review', 'cr/x'], code: 2, message: "wf review: class B round without proof/CALL-STACK-AS-BUILT.md — …" }),
].join('\n');
const reviewText = "verdict: changes-requested\n\n## 2026-09-28\nverdict: approved\n\n## 2026-09-28 — the push was refused by the project's pre-push hook\n\nverdict: changes-requested\n\n## 2026-09-28\nverdict: approved\n";
const line = frictionLine({ state, checksLog, eventsLog, reviewText, end: '2026-09-28T09:30:00.000Z' });
const withRepro = frictionLine({ state, checksLog: `${checksLog}\n${JSON.stringify({ row: 'repro', result: 'unstable' })}\n${JSON.stringify({ row: 'repro', result: 'stable' })}`, eventsLog, reviewText, end: '2026-09-28T09:30:00.000Z' });
check('wf check --repro lines are not commit checks: counted apart, unstable ones named', withRepro.includes('checks 3 (1 red), repro unstable 1 |'), withRepro);
const withSuites = frictionLine({ state, checksLog: `${checksLog}\n${JSON.stringify({ row: 'suites', result: 'red' })}\n${JSON.stringify({ row: 'suites', result: 'green' })}`, eventsLog, reviewText, end: '2026-09-28T09:30:00.000Z' });
check('whole suites are not commit checks', withSuites === line, withSuites);
check('the line: total time, time per step, agents, checks, refusals, questions, T2s', line === "- 2026-09-28 TJEW-670.11 (class B, merged): 1h30m | outcome: delivered | research 30m, implement 40m, review 20m | agents: research 1 | checks 3 (1 red) | wf refused 2: review cr/x: wf review: class B round without proof/CALL-STACK-AS-BUILT.md — … | questions 2 | T2 3 (1 changes-requested), push refused 1", line);

// What came of the round, against the step it ended at (BJEW-461, 2026-10-06: its record said `held`,
// which read the same as a round waiting on Shay).
const at = (step: string, briefs?: Record<string, { token: string; at: string; count: number }>) => ({ step, briefs }) as unknown as State;
const greenRepro = JSON.stringify({ row: 'repro', result: 'green', token: 'tk' });
check('a merged round delivered', outcomeOf(at('merged'), '') === 'delivered');
check('a green repro for this round\'s brief is a finding, not a stall', outcomeOf(at('held', { research: { token: 'tk', at: 't', count: 1 } }), greenRepro) === 'it does not reproduce');
check('a green repro under another brief is not this round\'s finding', outcomeOf(at('held', { research: { token: 'other', at: 't', count: 1 } }), greenRepro) === 'stopped at held');
check('delivered wins over a green repro: the round was sent on anyway', outcomeOf(at('merged', { research: { token: 'tk', at: 't', count: 1 } }), greenRepro) === 'delivered');
check('no agent ever briefed is nothing run', outcomeOf(at('classify', {}), '') === 'nothing run');
// fix-bjew-461-cancel-order ended with its repro red outside its own code on every run: a precondition,
// not a defect, and not a stall either (check.ts's NOT THE DEFECT).
const outsideRepro = JSON.stringify({ row: 'repro', result: 'outside', token: 'tk' });
check('a repro red outside its own code is not the defect', outcomeOf(at('research', { research: { token: 'tk', at: 't', count: 1 } }), outsideRepro) === 'not the defect');
check('held on a repro verdict is still waiting on the call about it', outcomeOf(at('held', { research: { token: 'tk', at: 't', count: 1 } }), greenRepro) === 'it does not reproduce');
check('a round that went on past research is not settled by an old verdict', outcomeOf(at('implement', { research: { token: 'tk', at: 't', count: 1 } }), outsideRepro) === 'stopped at implement');
check('anything else is the step it stopped at', outcomeOf(at('implement', { research: { token: 'tk', at: 't', count: 1 } }), '') === 'stopped at implement' && outcomeOf(null, '') === 'stopped at ?', `${outcomeOf(at('implement', { research: { token: 'tk', at: 't', count: 1 } }), '')} / ${outcomeOf(null, '')}`);
const withEnvironment = frictionLine({ state, checksLog: `${checksLog}\n${JSON.stringify({ result: 'red', cause: 'environment' })}`, eventsLog, reviewText, end: '2026-09-28T09:30:00.000Z' });
check('a red that never ran is named apart from a failed check', withEnvironment.includes('checks 4 (2 red, 1 environment) |'), withEnvironment);
// BJEW-461 (2026-10-06): 3 of its 7 refusals were the round agent's own `usage:` and `invalid step`.
const misuse = [
	refusalLine({ ts: 't', argv: ['step', 'bogus'], code: 2, message: 'invalid step ""', kind: 'caller' }),
	refusalLine({ ts: 't', argv: ['decide', '--q'], code: 2, message: 'usage: wf decide [--q <n>] "<the answer>"', kind: 'caller' }),
	refusalLine({ ts: 't', argv: ['brief', 'validate'], code: 2, message: `wf next is not dispatching \`validate\` (it says: wait user: …)` }),
].join('\n');
const withCaller = frictionLine({ state, checksLog, eventsLog: `${eventsLog}\n${misuse}`, reviewText, end: '2026-09-28T09:30:00.000Z' });
check('a refusal wf made before it read the round is counted apart, and its message kept out of the round\'s', withCaller.includes('wf refused 5 (2 not about the round): review cr/x:') && withCaller.includes('brief validate: wf next is not dispatching') && !withCaller.includes('invalid step') && !withCaller.includes('usage: wf decide'), withCaller);

const old = frictionLine({ state: { round: 'fix/y', class: 'A', step: 'merged' }, checksLog: '', eventsLog: '', reviewText: '', end: '2026-09-28T09:30:00.000Z' });
check('a round from before history was recorded still gets a line', old.includes('fix/y (class A, merged)') && old.includes('steps not recorded') && old.includes('T2 0'), old);

check('wf check is not a refusal: checks.log has its runs', refusalLine({ ts: 't', argv: ['check'], code: 1, message: 'x' }) === null);
// A refusal wf made before it read the round says so (refusal.ts); one about the round has no kind.
check('a refusal says when it was not the round\'s', JSON.parse(refusalLine({ ts: 't', argv: ['step', 'bogus'], code: 2, message: 'invalid step ""', kind: 'caller' })!).kind === 'caller' && !('kind' in JSON.parse(refusalLine({ ts: 't', argv: ['next'], code: 2, message: 'x' })!)));
check('exit 0 is not a refusal', refusalLine({ ts: 't', argv: ['next'], code: 0, message: '' }) === null);
const r = JSON.parse(refusalLine({ ts: 't', argv: ['brief', 'plan', '--revise'], code: 2, message: 'wf brief plan: no RESEARCH.md\nsecond line' })!);
check('a refusal keeps the command and the first line of its message', r.cmd === 'brief plan' && r.exit === 2 && r.msg === 'wf brief plan: no RESEARCH.md', JSON.stringify(r));

process.exit(failures ? 1 : 0);
