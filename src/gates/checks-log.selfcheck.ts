// checks-log.selfcheck.ts — the log protocol and its reader-facing measurements.
import { checkRunLine, parseChecksLog, suitesLine } from './checks-log.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const logLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`repro`', tasks: [{ label: 'ruff check x.py', exit: 0 }, { label: 'npx playwright test r.spec.ts', exit: 1 }], result: 'red' }));
check('checks.log line carries row, the row check, each task exit and the result', logLine.row === '2' && logLine.rowCheck === '`repro`' && logLine.tasks[1].exit === 1 && logLine.result === 'red', JSON.stringify(logLine));
// #109: the red-base run's own verdict rides the line, so validate and the friction line can tell a
// behavioral failure from a runner failure from evidence that could not prove the intended assertion.
const evidenceLine = JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: '`a/b.py::test_x@7`', result: 'red', tasks: [{ label: 'red-base a/b.py::test_x@7', exit: 1, expect: 'red', evidence: { verdict: 'unavailable', say: 'not proof of the intended defect: the run failed at b.py:2' } }] }));
check('the red-base evidence rides the checks.log line', evidenceLine.tasks[0].evidence.verdict === 'unavailable' && evidenceLine.tasks[0].evidence.say.includes('b.py:2'), JSON.stringify(evidenceLine));

check('the cause rides the red line, and a green line has none', JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'stack', exit: null, missing: 'the stack never answered' }], result: 'red', cause: 'environment' })).cause === 'environment' && !('cause' in JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'x', exit: 0 }], result: 'green' }))));

const reproLog = JSON.parse(checkRunLine({ ts: 't', row: 'repro', rowCheck: null, tasks: [], result: 'stable', content: 'tree:measured' }));
check('the repro log names measured content, never a retired research handoff token', reproLog.content === 'tree:measured' && !('token' in reproLog));


// wf check --suites: one line, the head it measured, a red suite's output tail.
const sl = JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [{ label: 'suite one', exit: 0, output: 'x\n3201 passed' }, { label: 'suite two', exit: 1, output: `${'line\n'.repeat(60)}FAIL src/x.test.ts` }] }));
check('suites line: row suites, its head, red when any suite is', sl.row === 'suites' && sl.head === 'abc' && sl.result === 'red');
check('suites line: a green suite keeps no output, a red one its last 40 lines', sl.tasks[0].output === undefined && sl.tasks[1].output.split('\n').length === 40 && sl.tasks[1].output.endsWith('FAIL src/x.test.ts'));
check('suites line: green when every suite exits 0', JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [{ label: 'a', exit: 0, output: '' }] })).result === 'green');
check('suites line: a diff that reaches no suite is recorded, with no tasks, so wf next moves on', JSON.stringify(JSON.parse(suitesLine({ ts: 't', head: 'abc', runs: [] }))) === '{"ts":"t","row":"suites","head":"abc","tasks":[],"result":"green"}');
// A suite whose runner never started is the environment, not a suite of failing tests; one that ran
// and failed is the code, and a real failure beside an unrunnable suite keeps the line about the code.
const suitesCause = (runs: { label: string; exit: number | null; output: string }[]) => JSON.parse(suitesLine({ ts: 't', head: 'abc', runs })).cause;
check('suites line: a runner that never started is the environment', suitesCause([{ label: 'a', exit: null, output: 'spawn failed' }]) === 'environment' && suitesCause([{ label: 'a', exit: 1, output: 'FAIL' }]) === undefined && suitesCause([{ label: 'a', exit: null, output: 'spawn failed' }, { label: 'b', exit: 1, output: 'FAIL' }]) === undefined);


check('last evidence reads the case and the suites apart, skipping a line cut mid-write', JSON.stringify(parseChecksLog('{"row":1,"result":"green","content":"tree:c"}\nnot json\n{"row":"suites","result":"red"}\n').latest) === JSON.stringify({ case: { row: 1, result: 'green', content: 'tree:c' }, suites: { row: 'suites', result: 'red' } }));

// The reader accepts older sparse object records without requiring today's writer envelope.
const sparse = parseChecksLog('{}\n{"row":2,"result":"green"}\n{"row":"repro","result":"outside"}\n');
check('sparse historical records remain cases, and repro stays separate', sparse.cases.length === 2 && sparse.cases[1].result === 'green' && sparse.repro[0].result === 'outside' && sparse.latest.case?.row === 2);
check('non-record JSON and interrupted appends add no measurements', parseChecksLog('null\n[]\n42\n"text"\n{"row":\n').cases.length === 0);
const malformed = parseChecksLog('{"row":1,"result":["green"],"content":["tree:c"]}\n').cases[0];
check('display coercion cannot mint a green or identity for gates', malformed.result === undefined && malformed.content === undefined);

const kinds = [1, 'suites', 'repro'] as const;
let roundtrips = true;
let ordering = true;
for (const scope of [undefined, 'unit:2', 'integration']) {
	for (const row of [null, 1, '2']) {
		const input = { ts: 't', row, rowCheck: 'test::case@7', tasks: [{ label: 'runner', exit: 0, missing: undefined }], result: 'green', content: 'tree:c', scope };
		const parsed = parseChecksLog(checkRunLine(input)).cases[0];
		roundtrips &&= parsed.row === row && parsed.rowCheck === input.rowCheck && parsed.scope === scope && parsed.result === input.result && parsed.content === input.content && parsed.tasks?.[0].exit === 0;
	}
}
// All 27 three-measurement streams: latest evidence is independent per kind, in append order.
for (const a of kinds) for (const b of kinds) for (const c of kinds) {
	const sequence = [a, b, c];
	const lines = sequence.map((row, i) => checkRunLine({ ts: 't', row, rowCheck: null, tasks: [], result: i % 2 ? 'red' : 'green', content: `tree:${i}` }));
	for (const newline of ['\n', '\r\n']) {
		const parsed = parseChecksLog(`${lines.join(newline)}${newline}{"cut":`);
		ordering &&= parsed.cases.length === sequence.filter((row) => row === 1).length && parsed.suites.length === sequence.filter((row) => row === 'suites').length && parsed.repro.length === sequence.filter((row) => row === 'repro').length;
		for (const [row, last] of [[1, parsed.latest.case], ['suites', parsed.latest.suites]] as const) {
			const index = sequence.findLastIndex((r) => r === row);
			ordering &&= index < 0 ? last === null : last?.content === `tree:${index}` && last.result === (index % 2 ? 'red' : 'green');
		}
	}
}
check('writer/reader roundtrips retain case, check cell, scope, result and measured identity', roundtrips);
check('classification and latest evidence preserve order across mixed streams and newline styles', ordering);

process.exit(failures ? 1 : 0);
