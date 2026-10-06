#!/usr/bin/env node
// ask.ts — wf ask / wf decide: a question to a person is a record in .wf/state.json, not a chat
// line. A question that lived only in a session's chat died with the session (2026-09-23: a pane
// closed with its question to Shay unanswered). Idea from firstmate: obligations are closed by
// records, not by recollection.
//   wf ask "<question>" [--to shay|<the project's people>] [--default "<default>"]   → q<n>, waiting_on = --to
//   wf ask --blocked [--to …]                                            → the Question line of BLOCKED.md
//   wf decide [--q <n>] "<answer, their words>"                          → closes q<n>
//   wf decide --revise [--q <n>] "<what the plan must now do>"            → the same, and the round goes back to `plan --revise`
//   wf decide --research [--q <n>] "<what research must now measure>"    → the same, and `wf next` dispatches a fresh research with it
// `wf prompt` and `wf deliver` refuse while a question is open (openQuestionGate).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { appendDecision, notifyAdapters, planPath } from './step.ts';
import { stepHistory } from './friction.ts';
import { people } from '../project.ts';
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
	const a = parse('decide', argv, ['q'], ['revise', 'research']);
	const answer = a.positionals.join(' ').trim();
	if (!answer) {
		console.error('usage: wf decide [--revise | --research] [--q <n>] "<the answer, in their words>"');
		process.exit(2);
	}
	const { toplevel, state } = roundState('decide');
	const refusal = a.revise && a.research ? '--revise and --research are two ways on: name one' : a.research ? researchGap(state) : null;
	if (refusal) {
		console.error(`wf decide: ${refusal}`);
		process.exit(2);
	}
	const plan = planPath(toplevel, state);
	if (!(state.questions ?? []).length) {
		if (a.revise) {
			// Nothing was asked and nothing is recorded in PLAN.md: the revised plan carries the answer.
			const next = writeState(toplevel, reviseState(state, answer));
			console.log('the round is back at plan: `wf next` dispatches plan --revise with this answer');
			await notifyAdapters(next);
			return;
		}
		if (a.research) {
			const next = writeState(toplevel, researchState(state, answer));
			console.log(RESEARCH_SAID);
			await notifyAdapters(next);
			return;
		}
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
	const said = revisionText(question, answer);
	const next = writeState(toplevel, a.revise ? reviseState(closed.state, said) : a.research ? researchState(closed.state, said) : closed.state);
	if (a.revise) console.log('the round is back at plan: `wf next` dispatches plan --revise with this answer');
	if (a.research) console.log(RESEARCH_SAID);
	await notifyAdapters(next);
}

// Pure: the text `wf decide --revise --q` records in state.revisions for an answered question.
export const revisionText = (question: Pick<Question, 'text' | 'default'>, answer: string) => `${question.text}${question.default ? ` (default: ${question.default})` : ''} → ${answer}`.trim();

// Pure: whether `wf decide --revise --q` sent this answered question back to plan. Nothing else links
// a revision to its question, and the text is built from both (revisionText).
export const wentThroughPlan = (question: Question, revisions: { text: string }[] = []) => revisions.some((r) => r.text === revisionText(question, (question.answer ?? '').trim()));

// Pure: the state sent back to plan with `text`, an answer saying the plan must change. `wf next`
// answers it with `plan --revise` until a plan brief is newer than the answer (pendingRevisions).
// BJEW-461, 2026-10-06: the plan's Ask "if the close comes from elsewhere" had `return to plan` as
// its default, so answering `default` was never acted on (overruledAsks ignores a default), and
// from the implement step nothing led back to plan.
export function reviseState(state: State, text: string, now = new Date().toISOString()): State {
	return { ...state, step: 'plan', waiting_on: state.questions?.[0]?.to ?? null, since: now, history: stepHistory(state.history, 'plan', now), revisions: [...(state.revisions ?? []), { text: text.trim(), at: now }] };
}

const RESEARCH_SAID = 'the round is back at research: `wf next` dispatches a fresh research with this answer';

// Pure: null, or why the round cannot go back to research: once it has gone to plan, the plan and
// the briefs after it were built on the research that is now doubted, and nothing here voids them.
export function researchGap(state: State | null): string | null {
	const step = state?.step;
	if (!step || step === 'classify' || step === 'research') return null;
	return `the round is at ${step}, past research: research again is for a round that has not gone to plan (a plan that must change: \`wf decide --revise\`)`;
}

// Pure: the state sent back to research with `text`, what research must now measure. `wf next`
// answers it with a fresh research until a research brief is newer than the request. BJEW-669,
// 2026-10-06: research was green on seeded data, the orchestrator then found the cause in QA's
// database, and `wf next` still offered only plan or reap: the repro verdict is keyed by the research
// brief's token, which TICKET.md's new facts do not change.
export function researchState(state: State, text: string, now = new Date().toISOString()): State {
	return { ...state, step: 'research', waiting_on: state.questions?.[0]?.to ?? null, since: now, history: stepHistory(state.history, 'research', now), researchRequests: [...(state.researchRequests ?? []), { text: text.trim(), at: now }] };
}

// Pure: the revisions no plan brief has answered yet.
export function pendingRevisions(revisions: { text: string; at: string }[] = [], planBriefAt: string | undefined) {
	return revisions.filter((r) => !planBriefAt || r.at > planBriefAt);
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
