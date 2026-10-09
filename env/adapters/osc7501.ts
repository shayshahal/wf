// osc7501.ts — the Program Status Protocol on Shay's machine (seams.notify): writes a round's state to
// the pty the command already has, so a terminal or an agent inbox can show it without reading the
// screen. The reports, their ids and their caps are the kit's (src/notify/osc7501.ts); this is the
// writing half, and the only half that touches a tty.
//
// Detection is deliberately not a round trip here. Answering the support query means reading stdin, and
// wf's commands run as short-lived children of the round's pane, where stdin belongs to pi (the
// orchestrator's TUI): one read there takes a keystroke out of a prompt. The spec allows reporting
// without asking ("Detection is optional ... sending reports without detecting support is safe", a
// well-behaved terminal ignores an OSC it does not know), so this writes and lets a terminal that does
// not implement it discard the line. `probe` is the read, for a person-run diagnostic, where stdin is
// theirs; `decide` says whether we are writing at all, and why.
import type { State } from '../../src/round/state.ts';
import { SUPPORT_QUERY, encode, isSupportReply, reportsFor } from '../../src/notify/osc7501.ts';
import type { Report } from '../../src/notify/osc7501.ts';

export type Env = Record<string, string | undefined>;

// Pure: whether to write, and why. A terminal wf cannot reach is a terminal that never sees a report,
// and a report written into a pipe is escape bytes in someone's log, so `isTTY` is checked before the
// force: WF_PROGRAM_STATUS=1 overrides the tmux guess, never the absence of a terminal. tmux and screen
// do not forward the escape (pi's docs say the same of its own reports), so they are off by default.
export function decide({ env = process.env, isTTY }: { env?: Env; isTTY: boolean }): { write: boolean; why: string } {
	if (!isTTY) return { write: false, why: 'stdout is not a terminal' };
	if (env.WF_PROGRAM_STATUS === '0') return { write: false, why: 'WF_PROGRAM_STATUS=0' };
	if (env.WF_PROGRAM_STATUS === '1') return { write: true, why: 'WF_PROGRAM_STATUS=1' };
	if (env.TMUX || env.STY) return { write: false, why: 'tmux or screen does not forward it' };
	return { write: true, why: 'a terminal that may implement the protocol' };
}

// One command's stdout, and whether anything should go into it.
function writer({ env = process.env, stream = process.stdout }: { env?: Env; stream?: NodeJS.WriteStream } = {}) {
	const why = decide({ env, isTTY: Boolean(stream.isTTY) });
	return { writing: why.write, why: why.why, write: (reports: Report[]) => reports.forEach((r) => stream.write(encode(r))) };
}

// seams.notify: after every `wf step`, `wf ask`/`wf decide` and `wf next`, the round's records. Each
// report replaces its record, so what is written is the whole picture rather than a delta.
export function makeNotifier(o: { env?: Env; stream?: NodeJS.WriteStream } = {}) {
	const w = writer(o);
	return (state: State) => {
		if (w.writing) w.write(reportsFor(state));
	};
}

export const notifyRound = makeNotifier();

// The support query, answered: the only authoritative detection (spec "Feature detection"). For a
// person-run diagnostic — never inside a phase, because the read is stdin and stdin is pi's there.
// Sends the query and waits for a reply, restoring the terminal's mode and the stream's flow either
// way; a terminal that does not implement the protocol stays silent, so the timeout is the answer.
// tmux and screen do not forward the query at all, so their silence is also the answer.
export function probe({ stream = process.stdout, input = process.stdin, timeoutMs = 150 }: { stream?: NodeJS.WriteStream; input?: NodeJS.ReadStream; timeoutMs?: number } = {}): Promise<boolean> {
	if (!input.isTTY) return Promise.resolve(false);
	return new Promise<boolean>((resolve) => {
		let answered = false;
		const finish = (answer: boolean) => {
			if (answered) return;
			answered = true;
			clearTimeout(timer);
			input.removeListener('data', onData);
			input.setRawMode(false);
			input.pause();
			resolve(answer);
		};
		const onData = (chunk: Buffer | string) => {
			if (isSupportReply(String(chunk))) finish(true);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		input.setRawMode(true);
		input.resume();
		input.on('data', onData);
		stream.write(SUPPORT_QUERY);
	});
}
