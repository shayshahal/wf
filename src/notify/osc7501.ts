// osc7501.ts — the Program Status Protocol (OSC 7501): what wf writes to the pty it already has, so a
// terminal or an agent inbox can show a round without reading the screen. Spec 0.3 (2026-10-07),
// superlogical.com/rex/docs/build/program-status. Pi reports its own session with the same protocol
// from pi-coding-agent 1.1.0 (docs/terminal-setup.md, `PI_PROGRAM_STATUS`), so wf writes no root
// record: every report here carries an id under `wf/`. An id-less report replaces the root record pi
// is using, and an id-less `clear` removes every record on the terminal.
//
// Nothing here touches a tty: the adapter inside seams.notify asks the terminal SUPPORT_QUERY and
// writes the lines (Shay's env keeps one in env/adapters/). A terminal that does not implement the
// protocol ignores unknown OSCs, so a machine without one shows nothing and nothing breaks.
import type { State } from '../round/state.ts';

export const WF_APP = 'wf';
// The support query, and the only bytes a terminal writes back. Pi asks the same question first unless
// PI_PROGRAM_STATUS=1: one terminal, one answer, so wf may read pi's reply too.
export const SUPPORT_QUERY = '\x1b]7501;?\x1b\\';

export type Status = 'idle' | 'working' | 'done' | 'blocked' | 'error';
export type Kind = 'permission' | 'question' | 'auth';
// One record: a report replaces its record whole, so every key the record should keep is here.
export type Report = {
	state: Status | 'clear';
	id: string;
	kind?: Kind;
	progress?: number;
	app?: string;
	title?: string;
	msg?: string;
};

// The spec's caps, decoded: msg 2048, title 192, app 32, id 128 over 8 levels of 32. A report over a
// cap is discarded whole, so wf cuts its own text to fit rather than lose the state with it.
const MSG_BYTES = 2048;
const TITLE_BYTES = 192;
const APP_BYTES = 32;
const ID_BYTES = 128;
const SEGMENT_BYTES = 32;
const ID_LEVELS = 8;

// Pure: one line the protocol can carry — control characters out (a report whose text decodes to one
// is refused whole, spec "Syntax"), cut to `max` UTF-8 bytes without splitting a code point.
export function wireText(text: string, max: number): string {
	const clean = String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
	let out = '';
	for (const ch of clean) {
		if (Buffer.byteLength(out + ch, 'utf8') > max) break;
		out += ch;
	}
	return out;
}

// Pure: the id of a record — `wf/<round>`, or a child of it. Segments are [A-Za-z0-9_.+-]{1,32} over at
// most 8 levels and 128 bytes. A byte outside that becomes `-` and levels past the caps are dropped,
// because an id outside the grammar is ignored whole (the spec will not fall back to the root record,
// which is pi's), and an empty segment is never valid.
export function idFor(...segments: (string | number)[]): string {
	const one = (s: string) => wireText(s, SEGMENT_BYTES).replace(/[^A-Za-z0-9_.+-]/g, '-') || 'x';
	const kept: string[] = [];
	for (const s of segments) {
		for (const part of String(s).split('/')) {
			if (kept.length >= ID_LEVELS) break;
			const seg = one(part);
			if (Buffer.byteLength([...kept, seg].join('/'), 'utf8') > ID_BYTES) break;
			kept.push(seg);
		}
	}
	return kept.length ? kept.join('/') : one('');
}

// Pure: a free-text value — base64 of UTF-8, cut to the cap first (the caps are decoded sizes).
function base64Of(text: string, max: number): string {
	return Buffer.from(wireText(text, max), 'utf8').toString('base64');
}

// Pure: one report as the bytes to write: `OSC 7501 ; key=value (:key=value)* ST`. A key that cannot
// be sent validly is left out rather than taking the report down with it — the state is the payload.
// `kind` is only sent with `blocked` and `progress` only with `working` or `blocked` (spec "Keys",
// where anything else is ignored).
export function encode(r: Report): string {
	const pairs = [`state=${r.state}`, `id=${r.id.trim() || WF_APP}`];
	if (r.kind && r.state === 'blocked') pairs.push(`kind=${r.kind}`);
	if (typeof r.progress === 'number' && Number.isFinite(r.progress) && (r.state === 'working' || r.state === 'blocked')) {
		pairs.push(`progress=${Math.max(0, Math.min(100, Math.round(r.progress)))}`);
	}
	const app = wireText(r.app ?? '', APP_BYTES).replace(/[^A-Za-z0-9_.+-]/g, '');
	if (app) pairs.push(`app=${app}`);
	if (r.title) pairs.push(`title=${base64Of(r.title, TITLE_BYTES)}`);
	if (r.msg) pairs.push(`msg=${base64Of(r.msg, MSG_BYTES)}`);
	return `\x1b]7501;${pairs.join(':')}\x1b\\`;
}

// Pure: a round's state.json as reports. The round's own record is `wf/<round>`; each open question
// gets a child, and each answered one a `clear` — a report replaces its record whole, so an answer has
// to take its record down (`wf decide` moves a question from `questions` to `answered`, ask.ts). A
// round can be working while a gate is blocked: that is what the ids are for.
//
// Lifetime (spec "States"): `working` and `blocked` are dropped when the pty's process exits or a new
// shell prompt begins (OSC 133 A); `done` and `error` survive both. wf's commands are short-lived
// children of the round's pane, so a report written by `wf next` at a bare shell is gone when the
// prompt returns, while the same report from a phase inside pi — which owns the pane — stands.
//
// No report says `idle`: a round is working or waiting on someone, and `done` already means the user
// has not looked yet. `wf reap` clears the records instead (reapReport).
export function reportsFor(state: State, o: { progress?: number; msg?: string } = {}): Report[] {
	// `wf reap` has no round left to report: it hands the notify seam the state it read with step
	// 'reaped' (reap.ts), and the round's records come down as one clear.
	if (state.step === 'reaped') return [reapReport(state)];
	const round = idFor(WF_APP, state.id ?? state.round ?? 'round');
	const step = state.step ?? 'new';
	const waiting = state.waiting_on ?? null;
	// A person, or the user: anything but the CI the round is waiting on, which is not a human block.
	const onHuman = waiting !== null && waiting !== 'ci';
	const open = state.questions ?? [];
	// T1 and T2 are approvals: SPEC.md or the diff is on screen and the round cannot go on.
	const gate = step === 'design' ? 'T1 on SPEC.md' : step === 'review' ? 'T2 on the diff' : null;
	const blockedOn = step === 'held' ? 'held' : onHuman ? (open[0]?.text ?? gate ?? `waiting on ${waiting}`) : open[0]?.text ?? null;
	const status: Status = step === 'merged' ? 'done' : blockedOn ? 'blocked' : 'working';
	const msg = o.msg ?? blockedOn ?? (status === 'done' ? 'merged' : waiting === 'ci' ? 'checks' : gate ?? step);
	const head: Report = {
		state: status,
		id: round,
		kind: status === 'blocked' ? (gate ? 'permission' : 'question') : undefined,
		progress: o.progress,
		app: WF_APP,
		title: state.id ?? state.round ?? 'round',
		msg,
	};
	// Children carry no `app`: a record without one takes it from its nearest ancestor that has one.
	const asked: Report[] = open.map((q) => ({ state: 'blocked', id: idFor(round, `q${q.n}`), kind: 'question', title: `q${q.n}`, msg: q.text }));
	const closed: Report[] = (state.answered ?? []).map((q) => ({ state: 'clear', id: idFor(round, `q${q.n}`) }));
	return [head, ...asked, ...closed];
}

// Pure: what `wf reap` leaves behind — a `clear` for the round, which removes its record and every
// record beneath it (its questions). It carries the id for the same reason every other report does.
export function reapReport(state: State): Report {
	return { state: 'clear', id: idFor(WF_APP, state.id ?? state.round ?? 'round') };
}

// Pure: the terminal answered SUPPORT_QUERY. The body is `?` and nothing else; a future revision may
// add pairs after it, so only the `?` is read. tmux and screen do not forward the escape at all, so no
// reply is the common case and means the protocol is not there to use.
export function isSupportReply(data: string): boolean {
	const body = /\]7501;([^\x07\x1b]*)/.exec(String(data))?.[1];
	return body !== undefined && body.trim().startsWith('?');
}

// Pure: pi's switch for the same protocol (pi-coding-agent 1.1.0, docs/terminal-setup.md): unset means
// pi asks the terminal first, `1` reports without asking, `0` does not report. wf reads it to say what
// a round's session already tells the terminal — pi owns the root record and wf only adds ids under
// `wf/`, so the two never replace each other — and, with it off, that only wf's records show.
export function piProgramStatus(env: Record<string, string | undefined> = process.env): 'on' | 'off' | 'ask' {
	return env.PI_PROGRAM_STATUS === '1' ? 'on' : env.PI_PROGRAM_STATUS === '0' ? 'off' : 'ask';
}
