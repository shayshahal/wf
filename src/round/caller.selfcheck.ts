// caller.selfcheck.ts — node caller.selfcheck.ts → exit 0 when green.
// The caller-level #107 arms, through the real commands and the real state file (not pure reducers):
//   runDecide binds the question it answers, so a competing close/open between its read and its write
//   cannot make the answer land on another question, and a close that loses the race refuses cleanly
//   without mutating PLAN.md;
//   runStep merges class/base against the state under the write lock, so a concurrent classify upgrade
//   and a base another command wrote are kept;
//   a corrupt state blocks the handoff hook, fails the dispatcher, and is not read as "no base" by
//   classify, instead of failing open.
// The races are scheduled, not chance: a real `mutate` child holds the state lock while a real command
// reads the old state and blocks at its write; the parent releases the mutate child only once the
// command is ready, so the read is over before the competing write lands.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateFile } from './state.ts';
import type { State } from './state.ts';
import { WF_ROOT } from '../paths.ts';

// Child modes: the real command, run from `dir` so its toplevel is the temp repo. `arg` is the child's
// argument; a `mutate` child (the competing writer) holds the state lock until the parent drops `dir/.go`.
const [, , mode, dir, arg] = process.argv;
const nap = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
if (mode === 'decide') {
	process.chdir(dir);
	const { runDecide } = await import('./ask.ts');
	// Module loading is done and the state read is next: the parent can schedule the competing write.
	process.stdout.write('READY\n');
	await runDecide([arg]);
	process.exit(0);
}
if (mode === 'step') {
	process.chdir(dir);
	const { runStep } = await import('./step.ts');
	process.stdout.write('READY\n');
	await runStep([arg || 'agree', '--round', 'r']);
	process.exit(0);
}
if (mode === 'ask') {
	process.chdir(dir);
	const { runAsk } = await import('./ask.ts');
	process.stdout.write('READY\n');
	await runAsk([arg]);
	process.exit(0);
}
if (mode === 'mutate') {
	process.chdir(dir);
	const { writeState } = await import('./state.ts');
	const { writeSync } = await import('node:fs');
	writeState(dir, (current) => {
		writeSync(1, 'HELD\n'); // synchronous: the parent sees the lock is held before the event loop matters
		while (!existsSync(join(dir, '.go'))) nap(5);
		if (arg === 'hold') return {};
		const open = current.questions ?? [];
		const last = current.last_question ?? 0;
		if (arg === 'class') return { class: 'B', base: 'b1' };
		const n = last + 1;
		const newQ = { n, to: 'user', text: 'a brand new question', asked: new Date().toISOString() };
		// close-open: close the first open question and open a new one, as a competing `wf decide` + `wf ask` would.
		const first = open[0];
		return { questions: open.filter((q) => q !== first).concat(newQ), answered: [...(current.answered ?? []), { ...first, answer: 'x', answered: new Date().toISOString() }], last_question: n };
	});
	process.exit(0);
}
if (mode === 'hook') {
	process.chdir(dir);
	const { runHandoff } = await import('./handoff-hook.ts');
	await runHandoff(['check']);
	process.exit(0);
}

let failures = 0;
const check = (name: string, cond: boolean, detail: unknown = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const self = fileURLToPath(import.meta.url);

// A git worktree with one empty commit, so `git rev-parse --show-toplevel` and `--abbrev-ref` answer.
const tempRepo = () => {
	const d = mkdtempSync(join(tmpdir(), 'wf-caller-'));
	execFileSync('git', ['init', '-q'], { cwd: d });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: d });
	mkdirSync(join(d, '.wf'), { recursive: true });
	return d;
};
const putState = (d: string, s: State) => writeFileSync(stateFile(d), JSON.stringify(s, null, 2) + '\n');
const readStateFile = (d: string) => JSON.parse(readFileSync(stateFile(d), 'utf8')) as State;

type Kid = { ready: Promise<void>; done: Promise<{ code: number | null; out: string; err: string }> };
// Spawn one of this file's child modes; `ready` resolves when it has printed `token` (READY: it is
// about to read the state; HELD: the competing writer holds the lock).
const spawnKid = (m: string, d: string, a = '', input = '', token = 'READY'): Kid => {
	const c = spawn(process.execPath, [self, m, d, a], { stdio: ['pipe', 'pipe', 'pipe'] });
	let out = '';
	let err = '';
	let seen = false;
	let markReady = () => {};
	const ready = new Promise<void>((resolve) => { markReady = resolve; });
	c.stdout.on('data', (x: Buffer) => {
		out += x;
		if (!seen && out.includes(token)) { seen = true; markReady(); }
	});
	c.stderr.on('data', (x: Buffer) => { err += x; });
	c.stdin.end(input);
	const done = new Promise<{ code: number | null; out: string; err: string }>((resolve) => c.on('close', (code) => resolve({ code, out, err })));
	return { ready, done };
};
// Run a competing writer holding the lock while `start` begins the real command(s) under test: start
// the writer, wait for the command to be ready, give it a margin to finish its read (after READY it
// spawns `git rev-parse --show-toplevel`, which is the slow part under load), then let the writer
// land. The margin scales with a measured spawn so a loaded machine gets a bigger one. The command is
// blocked at its write the whole time, so its read is of the old state.
const raceWith = async (d: string, kind: string, start: () => Kid[]) => {
	const t0 = Date.now();
	execFileSync('git', ['-C', d, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
	const marginMs = Math.max(1500, (Date.now() - t0) * 10);
	const holder = spawnKid('mutate', d, kind, '', 'HELD');
	await holder.ready;
	const kids = start();
	await Promise.all(kids.map((k) => k.ready));
	await sleep(marginMs);
	writeFileSync(join(d, '.go'), '');
	await holder.done;
	return Promise.all(kids.map((k) => k.done));
};

const q5 = { n: 5, to: 'user', text: 'the q5 question', asked: '2026-10-09T00:00:00.000Z' };
const planText = '# plan\n\n## Commits\n\n| 1 | do it | a.ts | x |\n';

// ── runDecide after a competing close/open: it must answer q5 or refuse, never q7.
{
	const d = tempRepo();
	putState(d, { round: 'r', folder: 'round', step: 'plan', questions: [q5], last_question: 5 });
	mkdirSync(join(d, 'round'), { recursive: true });
	writeFileSync(join(d, 'round', 'TICKET.md'), planText);
	const [r] = await raceWith(d, 'close-open', () => [spawnKid('decide', d, 'the answer for q5')]);
	const st = readStateFile(d);
	check('a decide whose question lost the race refuses cleanly', r.code === 2 && /no open question q5/.test(r.err), `code ${r.code} err ${r.err.slice(0, 200)}`);
	check('the refused decide does not answer the new question with q5\'s words', (st.answered ?? []).length === 1 && st.answered![0].answer === 'x', JSON.stringify(st.answered));
	check('the refused decide leaves PLAN.md as it was', readFileSync(join(d, 'round', 'TICKET.md'), 'utf8') === planText);
	rmSync(d, { recursive: true, force: true });
}

// ── a real `wf ask` and a real `wf decide` let go together for one open question: whatever order they
// land in, q5 is answered with the decide's answer, the ask's question is opened once, and neither
// crashes. The old decide closed by position and threw once the ask had made two open.
{
	const d = tempRepo();
	putState(d, { round: 'r', folder: 'round', step: 'plan', questions: [q5], last_question: 5 });
	mkdirSync(join(d, 'round'), { recursive: true });
	writeFileSync(join(d, 'round', 'TICKET.md'), planText);
	const [decide, ask] = await raceWith(d, 'hold', () => [spawnKid('decide', d, 'the answer for q5'), spawnKid('ask', d, 'a second question')]);
	const st = readStateFile(d);
	const answered5 = (st.answered ?? []).filter((q) => q.n === 5);
	const open = (st.questions ?? []).map((q) => q.n);
	check('a competing ask and decide both succeed', decide.code === 0 && ask.code === 0, `decide ${decide.code}: ${decide.err.slice(0, 80)} | ask ${ask.code}: ${ask.err.slice(0, 80)}`);
	check('the decide answers q5 once with its own words', answered5.length === 1 && answered5[0].answer === 'the answer for q5', JSON.stringify(st.answered));
	check('the ask question is opened once and left open', open.length === 1 && open[0] === 6 && (st.questions ?? [])[0].text === 'a second question', JSON.stringify(st.questions));
	check('PLAN.md carries q5 once', (readFileSync(join(d, 'round', 'TICKET.md'), 'utf8').match(/the q5 question/g) ?? []).length === 1, readFileSync(join(d, 'round', 'TICKET.md'), 'utf8'));
	rmSync(d, { recursive: true, force: true });
}

// ── no --q with two open questions still refuses, naming them (the binding must not silently close
// the first when more than one is open).
{
	const d = tempRepo();
	putState(d, { round: 'r', folder: 'round', step: 'plan', questions: [q5, { n: 6, to: 'user', text: 'the q6 question', asked: '2026-10-09T00:00:30.000Z' }], last_question: 6 });
	mkdirSync(join(d, 'round'), { recursive: true });
	writeFileSync(join(d, 'round', 'TICKET.md'), planText);
	const r = await spawnKid('decide', d, 'an answer with no --q').done;
	const st = readStateFile(d);
	check('decide with two open and no --q refuses, naming both', r.code === 2 && /2 questions are open — name one with --q: q5, q6/.test(r.err), `code ${r.code} err ${r.err.slice(0, 200)}`);
	check('the refused decide leaves both questions open', (st.questions ?? []).map((q) => q.n).join() === '5,6', JSON.stringify(st.questions));
	rmSync(d, { recursive: true, force: true });
}

// ── runStep: a concurrent classify upgrade (class B) and a base another command wrote are kept.
{
	const d = tempRepo();
	putState(d, { round: 'r', folder: 'round', step: 'agree', class: 'A', base: 'b0' });
	const [r] = await raceWith(d, 'class', () => [spawnKid('step', d, 'agree')]);
	const st = readStateFile(d);
	check('runStep keeps a concurrent class upgrade (B, not the pre-lock A)', st.class === 'B', `code ${r.code} class ${st.class}`);
	check('runStep keeps a base another command wrote', st.base === 'b1', `base ${st.base}`);
	rmSync(d, { recursive: true, force: true });
}

// ── runStep implement whose class went up to B while it ran: the T1 gate is checked against the class
// the write will leave, so it refuses instead of writing the stale A and bypassing T1.
{
	const d = tempRepo();
	putState(d, { round: 'r', folder: 'round', step: 'agree', class: 'A' });
	mkdirSync(join(d, 'round'), { recursive: true });
	writeFileSync(join(d, 'round', 'TICKET.md'), planText);
	const [r] = await raceWith(d, 'class', () => [spawnKid('step', d, 'build')]);
	const st = readStateFile(d);
	check('an implement whose class became B refuses T1 instead of writing the stale A', r.code === 2 && /T1 \(wf agree\) must approve/.test(r.err), `code ${r.code} err ${r.err.slice(0, 200)}`);
	check('the refused build keeps the concurrent class B and the agree step', st.class === 'B' && st.step === 'agree', JSON.stringify(st));
	rmSync(d, { recursive: true, force: true });
}

// ── a corrupt round state is a known error, not "no round here": it blocks the handoff hook instead
// of letting the worker end, and the dispatcher reports it instead of running on.
{
	const d = tempRepo();
	writeFileSync(stateFile(d), '{ "round": "r", "questions": [');
	const hook = await spawnKid('hook', d, '', JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'wf:round-worker' })).done;
	check('a corrupt state blocks the handoff hook instead of failing open', hook.out.includes('"decision":"block"') && hook.out.includes('corrupt round state'), `out ${hook.out.slice(0, 200)}`);
	const disp = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'status', '--all'], { cwd: d, encoding: 'utf8' });
	const text = `${disp.stdout ?? ''}${disp.stderr ?? ''}`;
	check('the dispatcher reports corrupt state instead of running on', disp.status === 1 && text.includes('corrupt round state'), `status ${disp.status} ${text.slice(0, 200)}`);
	rmSync(d, { recursive: true, force: true });
}

// ── classify: a corrupt state is reported, not read as "no persisted base" and silently classified
// against the project's base branch.
{
	const d = tempRepo();
	writeFileSync(stateFile(d), '{ "round": "r", "base": "b0", ');
	const cls = spawnSync(process.execPath, [join(WF_ROOT, 'src', 'gates', 'classify.ts'), '--json'], { cwd: d, encoding: 'utf8' });
	const text = `${cls.stdout ?? ''}${cls.stderr ?? ''}`;
	check('classify reports corrupt state instead of falling back to the base branch', cls.status !== 0 && text.includes('corrupt round state'), `status ${cls.status} ${text.slice(0, 200)}`);
	rmSync(d, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
