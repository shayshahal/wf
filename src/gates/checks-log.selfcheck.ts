import assert from 'node:assert/strict';
import { checkRunLine, parseChecksLog } from './checks-log.ts';
let failures = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(cond ? `ok ${name}` : `FAIL ${name}: ${detail}`); if (!cond) failures++; };
check('the cause rides the red line, and a green line has none', JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'stack', exit: null, missing: 'the stack never answered' }], result: 'red', cause: 'environment' })).cause === 'environment' && !('cause' in JSON.parse(checkRunLine({ ts: 't', row: '2', rowCheck: null, tasks: [{ label: 'x', exit: 0 }], result: 'green' }))));

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

const line = JSON.parse(checkRunLine({ ts: 't', row: null, rowCheck: null, result: 'green', content: 'tree:c', tasks: [{label: 'pytest', exit: 0, output: '1 passed', durationMs: 12}] }));
assert.equal(line.tasks[0].output, '1 passed');
assert.equal(line.tasks[0].durationMs, 12);
process.exitCode = failures ? 1 : 0;
