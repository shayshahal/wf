// osc7501.selfcheck.ts — node osc7501.selfcheck.ts → exit 0 when green.
// These are bytes on a wire shared with other programs. A wrong frame is a terminal that shows nothing
// (it ignores an OSC it cannot parse) — or, worse, a record replaced that was not wf's: an id-less
// report replaces the root record pi reports its session in, and an id-less `clear` removes every
// record on the terminal. The spec is version 0.3 (2026-10-07) and its limits are hard caps, so the
// caps here are asserted rather than trusted.
import type { State } from '../round/state.ts';
import { SUPPORT_QUERY, WF_APP, encode, idFor, isSupportReply, piProgramStatus, reapReport, reportsFor, wireText } from './osc7501.ts';

const fails: string[] = [];
function eq(name: string, got: unknown, want: unknown) {
	const pass = JSON.stringify(got) === JSON.stringify(want);
	console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
	if (!pass) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function yes(name: string, pass: boolean, saw = '') {
	console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : ` — ${saw}`}`);
	if (!pass) fails.push(`${name}${saw ? `: ${saw}` : ''}`);
}

// A sequence back as fields, for the arms that are about meaning rather than framing.
function parse(seq: string) {
	const body = /^\x1b\]7501;(.*)\x1b\\$/.exec(seq)?.[1] ?? '';
	const out: Record<string, string> = {};
	for (const pair of body.split(':')) {
		const i = pair.indexOf('=');
		if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
	}
	for (const key of ['msg', 'title']) if (out[key]) out[key] = Buffer.from(out[key], 'base64').toString('utf8');
	return out;
}
// The value charset, so a stray `:` or a raw control character shows up as a parse difference.
const ID_GRAMMAR = /^[A-Za-z0-9_.+-]+(\/[A-Za-z0-9_.+-]+)*$/;
const seqOf = (s: State, o?: { progress?: number; msg?: string }) => reportsFor(s, o).map(encode);

const T2: State = { id: '662', step: 'review', waiting_on: 'user' };
const MERGED: State = { id: '662', step: 'merged' };
const HELD: State = { id: '662', step: 'held' };
const CI: State = { id: '662', step: 'build', waiting_on: 'ci', repairs: 4 };
const QUESTION: State = { id: '662', step: 'build', waiting_on: 'einat', questions: [{ n: 3, to: 'einat', text: 'ship it?', asked: '2026-10-08T00:00:00Z' }] };
const ANSWERED: State = { id: '662', step: 'build', waiting_on: null, answered: [{ n: 3, to: 'einat', text: 'ship it?', asked: '2026-10-08T00:00:00Z', answer: 'yes', answered: '2026-10-08T01:00:00Z' }] };

// The one arm that is about framing: the bytes a T2 gate puts on the wire, whole.
eq('T2 gate: the exact bytes',
	encode(reportsFor(T2)[0]),
	'\x1b]7501;state=blocked:id=wf/662:kind=permission:app=wf:title=NjYy:msg=VDIgb24gdGhlIGRpZmY=\x1b\\');

// The round's record. `done` is the one state the spec keeps across process exit and the next prompt.
eq('merged: done, and it says so', parse(encode(reportsFor(MERGED)[0])), { state: 'done', id: 'wf/662', app: 'wf', title: '662', msg: 'merged' });
eq('held: blocked:question', parse(encode(reportsFor(HELD)[0])), { state: 'blocked', id: 'wf/662', kind: 'question', app: 'wf', title: '662', msg: 'held' });
eq('waiting on ci: working, not blocked', parse(encode(reportsFor(CI, { progress: 40 })[0])), { state: 'working', id: 'wf/662', progress: '40', app: 'wf', title: '662', msg: 'checks' });
eq('T1: the agreement gate is a permission', parse(encode(reportsFor({ id: '662', step: 'agree', waiting_on: 'user' })[0])), { state: 'blocked', id: 'wf/662', kind: 'permission', app: 'wf', title: '662', msg: 'T1 on AGREEMENT.md' });
eq('an agree at a bare shell: working, named by its step', parse(encode(reportsFor({ id: '662', step: 'agree' })[0])), { state: 'working', id: 'wf/662', app: 'wf', title: '662', msg: 'agree' });

// The tree: a round can be working while a gate is blocked, so a question is its own record.
eq('an open question is a child, not the round', seqOf(QUESTION).map(parse), [
	{ state: 'blocked', id: 'wf/662', kind: 'question', app: 'wf', title: '662', msg: 'ship it?' },
	{ state: 'blocked', id: 'wf/662/q3', kind: 'question', title: 'q3', msg: 'ship it?' },
]);
eq('an answered question takes its record down', seqOf(ANSWERED).map(parse).at(-1), { state: 'clear', id: 'wf/662/q3' });
eq('a child inherits `app`, and a clear carries the question id', seqOf(QUESTION).length, 2);

// Reap: the round's records come down as one clear, and nothing else rides with it (reap.ts hands the
// notify seam the state it read with step 'reaped', and no state.json is written).
eq('reap: step reaped is one clear, with the round id', seqOf({ id: '662', step: 'reaped' }), ['\x1b]7501;state=clear:id=wf/662\x1b\\']);
eq('reap: open questions do not ride with the clear', reportsFor({ id: '662', step: 'reaped', questions: [{ n: 3, to: 'einat', text: 'ship it?', asked: '2026-10-08T00:00:00Z' }] }).length, 1);

// Ids. A round id is a branch-like string: spaces, slashes and an em dash all appear in real ones.
eq('id: the round', idFor(WF_APP, '662'), 'wf/662');
eq('id: a child of a built id', idFor('wf/662', 'q3'), 'wf/662/q3');
eq('id: a branch-like round id stays one grammar', idFor(WF_APP, 'feature/662 — fix'), 'wf/feature/662---fix');
yes('id: never empty', idFor(WF_APP, '').length > 0, idFor(WF_APP, ''));
yes('id: never empty for whitespace', idFor(WF_APP, '   ').length > 0, idFor(WF_APP, '   '));
eq('id: 8 levels at most', idFor('wf', ...Array(12).fill('s')).split('/').length, 8);
yes('id: 128 bytes at most', Buffer.byteLength(idFor('wf', ...Array(8).fill('x'.repeat(40))), 'utf8') <= 128, idFor('wf', ...Array(8).fill('x'.repeat(40))));
yes('id: 32 bytes per level', idFor('wf', 'y'.repeat(40)).split('/').every((s) => Buffer.byteLength(s, 'utf8') <= 32));
yes('id: the grammar, always', ['662', 'feature/662 — fix', '', '😀', 'a'.repeat(200)].every((r) => ID_GRAMMAR.test(idFor(WF_APP, r))));
yes('ids: no report is id-less', [T2, MERGED, HELD, CI, QUESTION, ANSWERED].every((s) => seqOf(s).every((seq) => ID_GRAMMAR.test(parse(seq).id ?? ''))));
yes('ids: the round and its child differ', parse(encode(reportsFor(QUESTION)[0])).id !== parse(encode(reportsFor(QUESTION)[1])).id);

// Reap: one clear for the round takes its children with it (spec "States").
eq('reap: one clear, with the round id', parse(encode(reapReport(T2))), { state: 'clear', id: 'wf/662' });
yes('reap: never id-less', (parse(encode(reapReport({ step: 'merged' }))).id ?? '').length > 0);

// Text and caps.
eq('text: control characters become spaces', wireText('a\u0007b\nc', 100), 'a b c');
eq('text: cut by bytes, on a code point', wireText('é'.repeat(10), 5), 'éé');
yes('msg: capped at 2048 decoded', parse(encode({ state: 'working', id: 'wf/1', msg: 'a'.repeat(5000) })).msg.length === 2048);
yes('title: capped at 192 decoded', parse(encode({ state: 'working', id: 'wf/1', title: 't'.repeat(400) })).title.length === 192);
eq('progress: clamped', [parse(encode({ state: 'working', id: 'wf/1', progress: 140 })).progress, parse(encode({ state: 'working', id: 'wf/1', progress: -20 })).progress], ['100', '0']);
eq('progress: dropped when done', parse(encode({ state: 'done', id: 'wf/1', progress: 50 })).progress, undefined);
eq('kind: dropped when not blocked', parse(encode({ state: 'working', id: 'wf/1', kind: 'auth' })).kind, undefined);
yes('framing: no control character reaches the body', (() => {
	const body = encode({ state: 'blocked', id: 'wf/1', msg: 'a\u0007b\u001bc\nd' }).slice('\x1b]7501;'.length, -'\x1b\\'.length);
	return !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body);
})());

// Detection, and pi's switch for the same protocol.
yes('detect: the terminal answered', isSupportReply(SUPPORT_QUERY) && isSupportReply('\x1b]7501;?\x1b\\'));
yes('detect: a different report is not an answer', !isSupportReply('\x1b]7501;idle\x1b\\') && !isSupportReply(''));
yes('detect: a wrapping multiplexer still reads', isSupportReply('noise\x1b]7501;?\x1b\\'));
eq('pi: its switch', [piProgramStatus({ PI_PROGRAM_STATUS: '1' }), piProgramStatus({ PI_PROGRAM_STATUS: '0' }), piProgramStatus({}), piProgramStatus({ PI_PROGRAM_STATUS: 'yes' })], ['on', 'off', 'ask', 'ask']);

if (fails.length) {
	console.log(`\n${fails.length} FAILED`);
	for (const f of fails) console.log(`  - ${f}`);
	process.exit(1);
}
console.log('\nall arms green');
