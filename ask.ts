#!/usr/bin/env node
// ask.ts — wf ask / wf decide: a question to a person is a record in .wf/state.json, not a chat
// line. A question that lived only in a session's chat died with the session (2026-09-23: a pane
// closed with its question to Shay unanswered). Idea from firstmate: obligations are closed by
// records, not by recollection.
//   wf ask "<question>" [--to shay|<the project's people>] [--default "<default>"]   → q<n>, waiting_on = --to
//   wf ask --blocked [--to …]                                            → the Question line of BLOCKED.md
//   wf decide [--q <n>] "<answer, their words>"                          → closes q<n>
// `wf prompt` and `wf deliver` refuse while a question is open (openQuestionGate).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { appendDecision, notifyAdapters, planPath } from './step.ts';
import { people } from './project.ts';
import { readState, roundFile, toplevelOf, writeState } from './state.ts';
import type { Question, State } from './state.ts';

const PEOPLE = ['user', ...people];

// Pure: the state with one more open question. The round now waits on the oldest open question's person.
// Numbers only go up (last_question): "q1" in chat names one question for the whole round.
export function addQuestion(state: State, { to, text, dflt = null, source = null }: { to: string; text: string; dflt?: string | null; source?: string | null }, now = new Date().toISOString()): State & { questions: Question[] } {
	const questions: Question[] = [...(state.questions ?? [])];
	const n = Math.max(state.last_question ?? 0, ...questions.map((q) => q.n)) + 1;
	questions.push({ n, to, text, ...(dflt ? { default: dflt } : {}), ...(source ? { source } : {}), asked: now });
	return { ...state, questions, last_question: n, waiting_on: questions[0].to, since: now };
}

// Pure: the state without question n, and the question. With one question open, n may be omitted.
// The question moves to `answered` with its answer: `wf next` acts on a ruling (fix or accept) and
// knows which Asks it has put already.
export function closeQuestion(state: State, n: number | null, now = new Date().toISOString(), answer: string | null = null): { question: Question; state: State & { questions: Question[]; answered: Question[] } } {
	const open = state.questions ?? [];
	if (n == null && open.length > 1) throw new Error(`${open.length} questions are open — name one with --q: ${open.map((q) => `q${q.n}`).join(', ')}`);
	const question = n == null ? open[0] : open.find((q) => q.n === n);
	if (!question) throw new Error(`no open question q${n}${open.length ? ` (open: ${open.map((q) => `q${q.n}`).join(', ')})` : ''}`);
	const questions = open.filter((q) => q !== question);
	const answered = [...(state.answered ?? []), { ...question, answer, answered: now }];
	return { question, state: { ...state, questions, answered, waiting_on: questions[0]?.to ?? null, since: now } };
}

// Pure: null, or why the round cannot move on. An open question means someone owes an answer first.
export function openQuestionGate(state: State | null): string | null {
	const open = state?.questions ?? [];
	if (!open.length) return null;
	return `${open.length} open question${open.length > 1 ? 's' : ''} — ${open.map((q) => `q${q.n} → ${q.to}: ${q.text}`).join(' | ')}. Their answer → \`wf decide\` first.`;
}

// Pure: the one-line Question of a BLOCKED.md (prompts/implement.md).
export function blockedQuestion(text: string): string | null {
	return text.replace(/\r\n/g, '\n').match(/^Question:[ \t]*(.+)$/m)?.[1].trim() || null;
}

// Pure: BLOCKED.md with the answer under `## Answer`, which the next implement agent follows.
export function appendAnswer(blockedText: string, answer: string, date = new Date().toISOString().slice(0, 10)) {
	const body = blockedText.replace(/\r\n/g, '\n').trimEnd();
	const line = `${date} ${answer.trim()}`;
	return /^## Answer[ \t]*$/m.test(body) ? `${body}\n${line}\n` : `${body}\n\n## Answer\n${line}\n`;
}

// Pure: `wf status --all` lines under a round.
export function questionLines(state: State | null): string[] {
	return (state?.questions ?? []).map((q) => `? q${q.n} → ${q.to}: ${q.text}${q.default ? ` (default: ${q.default})` : ''}`);
}

// Pure: flags that take a value, boolean flags, the rest as words. An unknown flag throws: `--q2 x`
// once closed the only open question with the answer "x".
export type Args<V extends string, B extends string> = { positionals: string[] } & { [K in V]?: string } & { [K in B]?: true };

export function parseArgs<V extends string, B extends string = never>(argv: string[], valued: readonly V[], booleans: readonly B[] = []): Args<V, B> {
	const out: { positionals: string[]; [flag: string]: string | true | string[] } = { positionals: [] };
	for (let i = 0; i < argv.length; i++) {
		const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
		if (name && valued.includes(name as V)) {
			if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
			out[name] = argv[++i];
		} else if (name && booleans.includes(name as B)) out[name] = true;
		else if (name) throw new Error(`unknown flag ${argv[i]}`);
		else out.positionals.push(argv[i]);
	}
	return out as Args<V, B>;
}

function parse<V extends string, B extends string = never>(cmd: string, argv: string[], valued: readonly V[], booleans?: readonly B[]): Args<V, B> {
	try {
		return parseArgs(argv, valued, booleans);
	} catch (e) {
		console.error(`wf ${cmd}: ${(e as Error).message}`);
		process.exit(2);
	}
}

function roundState(cmd: string) {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state) {
		console.error(`wf ${cmd}: no round in .wf/state.json — run it in the round's worktree`);
		process.exit(2);
	}
	return { toplevel, state };
}

export async function runAsk(argv: string[]): Promise<void> {
	const a = parse('ask', argv, ['to', 'default'], ['blocked']);
	const to = a.to ?? 'user';
	if (!PEOPLE.includes(to)) {
		console.error(`wf ask: --to ${to} — one of: ${PEOPLE.join(' ')}`);
		process.exit(2);
	}
	const { toplevel, state } = roundState('ask');
	let text: string | null = a.positionals.join(' ').trim();
	let source: string | null = null;
	if (a.blocked) {
		const file = roundFile(toplevel, 'BLOCKED.md');
		text = existsSync(file) ? blockedQuestion(readFileSync(file, 'utf8')) : null;
		if (!text) {
			console.error(`wf ask --blocked: ${existsSync(file) ? 'BLOCKED.md has no Question: line' : 'no BLOCKED.md in the round folder'}`);
			process.exit(2);
		}
		source = 'BLOCKED.md';
	}
	if (!text) {
		console.error(`usage: wf ask "<question>" [--to ${PEOPLE.join('|')}] [--default "<default>"] · wf ask --blocked`);
		process.exit(2);
	}
	const next = writeState(toplevel, addQuestion(state, { to, text, dflt: a.default, source }));
	const q = next.questions!.at(-1)!;
	console.log(`q${q.n} → ${to}: ${text}`);
	await notifyAdapters(next);
}

export async function runDecide(argv: string[]): Promise<void> {
	const a = parse('decide', argv, ['q']);
	const answer = a.positionals.join(' ').trim();
	if (!answer) {
		console.error('usage: wf decide [--q <n>] "<the answer, in their words>"');
		process.exit(2);
	}
	const { toplevel, state } = roundState('decide');
	const plan = planPath(toplevel, state);
	if (!(state.questions ?? []).length) {
		// No question open: a decision nobody was asked for, recorded where the implementer reads it.
		if (!existsSync(plan)) {
			console.error(`wf decide: no ${plan} to record it in`);
			process.exit(2);
		}
		writeFileSync(plan, appendDecision(readFileSync(plan, 'utf8'), answer));
		console.log(`recorded in ${plan} § Decisions`);
		return;
	}
	let closed: ReturnType<typeof closeQuestion>;
	try {
		const n = a.q == null ? null : Number(String(a.q).replace(/^q/, ''));
		if (n !== null && !Number.isInteger(n)) throw new Error(`--q ${a.q} is not a question number`);
		closed = closeQuestion(state, n, undefined, answer);
	} catch (e) {
		console.error(`wf decide: ${(e as Error).message}`);
		process.exit(2);
	}
	const { question } = closed;
	if (question.source?.startsWith('BLOCKED.md')) {
		const file = roundFile(toplevel, 'BLOCKED.md');
		writeFileSync(file, appendAnswer(readFileSync(file, 'utf8'), answer));
		console.log(`q${question.n} closed · answer in ${file} § Answer`);
	} else {
		if (!existsSync(plan)) {
			console.error(`wf decide: no ${plan} to record q${question.n}'s answer in`);
			process.exit(2);
		}
		writeFileSync(plan, appendDecision(readFileSync(plan, 'utf8'), `${question.text} → ${question.to}: ${answer}`));
		console.log(`q${question.n} closed · recorded in ${plan} § Decisions`);
	}
	const next = writeState(toplevel, closed.state);
	await notifyAdapters(next);
}

// Pure: the plan's Asks (sources PLAN.md#<token>:<i>, for the plan briefed with `token`) whose
// answer is not their default. The plan was written for the default, so each one sends it back
// to be revised before anything is built (BJEW-562, 2026-09-27: q1 "also drop the pink
// background? default: no" answered yes, and wf next dispatched the build of the plan as written).
// The default is `default` or the default's own words, as the question tool's option gives them.
export function overruledAsks(answered: Question[] = [], token: string | undefined): Question[] {
	const same = (a: string, b: string) => a.trim().replace(/\.$/, '').toLowerCase() === b.trim().replace(/\.$/, '').toLowerCase();
	return answered.filter((q) => q.source?.startsWith(`PLAN.md#${token}:`) && !same(q.answer ?? '', 'default') && !(q.default && same(q.answer ?? '', q.default)));
}
