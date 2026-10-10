// friction.selfcheck.ts — node friction.selfcheck.ts → exit 0 when green.
import { visitsPerStep, duration, frictionLine, outcomeOf, refusalLine, stepHistory, timeInSteps } from './friction.ts';
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

const visits = visitsPerStep(history);
check('visits per step: a step the round came back to is counted twice', visits.join() === 'research 1,implement 2,review 2', visits.join());
check('visits per step: no history is no visits', visitsPerStep(undefined).length === 0);

// A TJEW-670.11-shaped round: two T2s, a push the hook refused, one red check, two wf refusals.
const state = { id: 'TJEW-670.11', class: 'B', step: 'merged', history, answered: [{ n: 1 }, { n: 2 }], questions: [] } as unknown as State;
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
check('the line: total time, time per step, agents, checks, refusals, questions, T2s', line === "- 2026-09-28 TJEW-670.11 (class B, merged): 1h30m | outcome: delivered | research 30m, implement 40m, review 20m | visits: research 1, implement 2, review 2 | checks 3 (1 red) | wf refused 2: review cr/x: wf review: class B round without proof/CALL-STACK-AS-BUILT.md — … | questions 2 | T2 3 (1 changes-requested), push refused 1", line);

// What came of the round, against the step it ended at (BJEW-461, 2026-10-06: its record said `held`,
// which read the same as a round waiting on Shay).
const st = (step: string, history?: { step: string; at: string }[]) => ({ step, history }) as State;
const greenRepro = JSON.stringify({ row: 'repro', result: 'green' });
check('a merged round delivered', outcomeOf(st('merged'), '') === 'delivered');
check('a check round at agree with a green repro is a finding, not a stall', outcomeOf(st('agree'), greenRepro) === 'it does not reproduce');
check('a check round at agree with no repro line is not settled', outcomeOf(st('agree', [{ step: 'agree', at: 't' }]), '') === 'stopped at agree');
const outsideRepro = JSON.stringify({ row: 'repro', result: 'outside' });
check('a repro red outside its own code is not the defect', outcomeOf(st('held'), outsideRepro) === 'not the defect');
check('a round past the check (build) is not settled by a repro', outcomeOf(st('build', [{ step: 'build', at: 't' }]), greenRepro) === 'stopped at build');
check('no history is nothing run', outcomeOf(st('classify'), '') === 'nothing run');
check('no state is stopped at ?', outcomeOf(null, '') === 'stopped at ?');
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
