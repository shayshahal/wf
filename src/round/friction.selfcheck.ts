// friction.selfcheck.ts — node friction.selfcheck.ts → exit 0 when green.
import { agentsPerPhase, duration, frictionLine, refusalLine, stepHistory, timeInSteps } from './friction.ts';
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
check('the line: total time, time per step, agents, checks, refusals, questions, T2s', line === "- 2026-09-28 TJEW-670.11 (class B, merged): 1h30m | research 30m, implement 40m, review 20m | agents: research 1 | checks 3 (1 red) | wf refused 2: review cr/x: wf review: class B round without proof/CALL-STACK-AS-BUILT.md — … | questions 2 | T2 3 (1 changes-requested), push refused 1", line);

const old = frictionLine({ state: { round: 'fix/y', class: 'A', step: 'merged' }, checksLog: '', eventsLog: '', reviewText: '', end: '2026-09-28T09:30:00.000Z' });
check('a round from before history was recorded still gets a line', old.includes('fix/y (class A, merged)') && old.includes('steps not recorded') && old.includes('T2 0'), old);

check('wf check is not a refusal: checks.log has its runs', refusalLine({ ts: 't', argv: ['check'], code: 1, message: 'x' }) === null);
check('exit 0 is not a refusal', refusalLine({ ts: 't', argv: ['next'], code: 0, message: '' }) === null);
const r = JSON.parse(refusalLine({ ts: 't', argv: ['brief', 'plan', '--revise'], code: 2, message: 'wf brief plan: no RESEARCH.md\nsecond line' })!);
check('a refusal keeps the command and the first line of its message', r.cmd === 'brief plan' && r.exit === 2 && r.msg === 'wf brief plan: no RESEARCH.md', JSON.stringify(r));

process.exit(failures ? 1 : 0);
