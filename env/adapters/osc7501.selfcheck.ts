// env/adapters/osc7501.selfcheck.ts — node env/adapters/osc7501.selfcheck.ts → exit 0 when green.
// Pure: `decide` gates every byte this adapter writes, and `probe` is the one place wf reads a
// terminal. Both are checked against fake streams — nothing here touches a real tty, and no report is
// asserted twice (the kit's own selfcheck owns the framing: src/notify/osc7501.selfcheck.ts).
import { EventEmitter } from 'node:events';
import type { State } from '../../src/round/state.ts';
import { decide, makeNotifier, probe } from './osc7501.ts';

const fails: string[] = [];
function eq(name: string, got: unknown, want: unknown) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
  if (!pass) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// A stdout that collects what was written, and nothing else.
function sink(isTTY: boolean) {
  const written: string[] = [];
  return { stream: { isTTY, write: (s: string) => written.push(s) } as unknown as NodeJS.WriteStream, written };
}
// A stdin that answers the support query, or stays silent, and reports the modes it was put in.
function terminal(reply: string | null, { isTTY = true, delayMs = 5 } = {}) {
  const emitter = new EventEmitter();
  const modes: boolean[] = [];
  const input = Object.assign(emitter, {
    isTTY,
    setRawMode: (on: boolean) => modes.push(on),
    resume: () => { if (reply) setTimeout(() => emitter.emit('data', reply), delayMs); },
    pause: () => {},
  }) as unknown as NodeJS.ReadStream;
  return { input, modes };
}

const T2: State = { id: '662', step: 'review', waiting_on: 'user' };
const QUESTION: State = { id: '662', step: 'implement', waiting_on: 'einat', questions: [{ n: 3, to: 'einat', text: 'ship it?', asked: '2026-10-08T00:00:00Z' }] };

// decide: the force overrides the tmux guess, never the absence of a terminal.
eq('decide: a terminal, nothing set', decide({ env: {}, isTTY: true }), { write: true, why: 'a terminal that may implement the protocol' });
eq('decide: off when stdout is a pipe, even forced', decide({ env: { WF_PROGRAM_STATUS: '1' }, isTTY: false }), { write: false, why: 'stdout is not a terminal' });
eq('decide: WF_PROGRAM_STATUS=0 wins', decide({ env: { WF_PROGRAM_STATUS: '0' }, isTTY: true }), { write: false, why: 'WF_PROGRAM_STATUS=0' });
eq('decide: forced past tmux', decide({ env: { WF_PROGRAM_STATUS: '1', TMUX: '/tmp/tmux-1000/default,4242,0' }, isTTY: true }), { write: true, why: 'WF_PROGRAM_STATUS=1' });
eq('decide: tmux off, screen off', [decide({ env: { TMUX: 'x' }, isTTY: true }).write, decide({ env: { STY: '1234.pts-0.host' }, isTTY: true }).write], [false, false]);

// The notifier: the round's records, one line each, into the command's stdout.
const a = sink(true);
makeNotifier({ env: {}, stream: a.stream })(QUESTION);
eq('notify: the round, then its open question', a.written.length, 2);
eq('notify: the round record is the pty\'s', a.written[0], '\x1b]7501;state=blocked:id=wf/662:kind=question:app=wf:title=NjYy:msg=c2hpcCBpdD8=\x1b\\');
const quiet = sink(true);
makeNotifier({ env: { WF_PROGRAM_STATUS: '0' }, stream: quiet.stream })(T2);
eq('notify: nothing when the switch is off', quiet.written.length, 0);
const piped = sink(false);
makeNotifier({ env: {}, stream: piped.stream })(T2);
eq('notify: nothing into a pipe', piped.written.length, 0);

// probe: the only read, and it hands the terminal back as it found it.
eq('probe: not a tty, no query, no answer', await (async () => {
  const { stream, written } = sink(true);
  const { input } = terminal(null, { isTTY: false });
  const answer = await probe({ stream, input, timeoutMs: 200 });
  return [answer, written.length];
})(), [false, 0]);
eq('probe: the terminal answers', await (async () => {
  const { stream } = sink(true);
  const { input, modes } = terminal('\x1b]7501;?\x1b\\');
  const answer = await probe({ stream, input, timeoutMs: 200 });
  return { answer, modes };
})(), { answer: true, modes: [true, false] });
eq('probe: silence is the answer, and the mode is restored', await (async () => {
  const { stream, written } = sink(true);
  const { input, modes } = terminal(null);
  const answer = await probe({ stream, input, timeoutMs: 30 });
  return { answer, modes, asked: written.length };
})(), { answer: false, modes: [true, false], asked: 1 });

if (fails.length) {
  console.log(`\n${fails.length} FAILED`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nall arms green');
