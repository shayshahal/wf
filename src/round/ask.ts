#!/usr/bin/env node
// ask.ts — wf ask / wf decide: a question to a person is a record in .wf/state.json, not a chat line.
// A question that lived only in a session's chat died with the session (2026-09-23). Idea from
// firstmate: obligations are closed by records, not by recollection.
//   wf ask "<question>" [--to shay|<the project's people>] [--default "<default>"]   → q<n>
//   wf ask --blocked [--to …]                                            → the Question line of BLOCKED.md
//   wf decide [--q <n>] "<answer, their words>"                          → closes q<n>
//   wf decide --revise [--q <n>] "<what the agreement must now do>"      → the same, and back to `agree`
// `wf prompt` and `wf deliver` refuse while a question is open (openQuestionGate).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { refuseCaller } from '../refusal.ts';
import { appendDecision, agreementPathOf, notifyAdapters } from './step.ts';
import { stepHistory } from './friction.ts';
import { people } from '../project.ts';
import { agreementSha } from './agreement.ts';
import { readState, roundFile, toplevelOf, writeState } from './state.ts';
import type { Question, State } from './state.ts';

const PEOPLE = ['user', ...people];

// Pure: the state with one more open question. The round now waits on the oldest open question's person.
export function addQuestion(state: State, { to, text, dflt = null, source = null }: { to: string; text: string; dflt?: string | null; source?: string | null }, now = new Date().toISOString()): State & { questions: Question[] } {
	const questions: Question[] = [...(state.questions ?? [])];
	const n = Math.max(state.last_question ?? 0, ...questions.map((q) => q.n)) + 1;
	questions.push({ n, to, text, ...(dflt ? { default: dflt } : {}), ...(source ? { source } : {}), asked: now });
	return { ...state, questions, last_question: n, waiting_on: questions[0].to, since: now };
}

// Pure: the state without question n, and the question. With one question open, n may be omitted.
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

// Pure: the one-line Question of a BLOCKED.md (prompts/build.md).
export function blockedQuestion(text: string): string | null {
	return text.replace(/\r\n/g, '\n').match(/^Question:[ \t]*(.+)$/m)?.[1].trim() || null;
}

// Pure: BLOCKED.md with the answer under `## Answer`, which the next build agent follows.
export function appendAnswer(blockedText: string, answer: string, date = new Date().toISOString().slice(0, 10)) {
	const body = blockedText.replace(/\r\n/g, '\n').trimEnd();
	const line = `${date} ${answer.trim()}`;
	return /^## Answer[ \t]*$/m.test(body) ? `${body}\n${line}\n` : `${body}\n\n## Answer\n${line}\n`;
}

// Pure: `wf status --all` lines under a round.
export function questionLines(state: State | null): string[] {
	return (state?.questions ?? []).map((q) => `? q${q.n} → ${q.to}: ${q.text}${q.default ? ` (default: ${q.default})` : ''}`);
}

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
		refuseCaller();
	}
}

function roundState(cmd: string) {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state) {
		console.error(`wf ${cmd}: no round in .wf/state.json — run it in the round's worktree`);
		refuseCaller();
	}
	return { toplevel, state };
}

export async function runAsk(argv: string[]): Promise<void> {
	const a = parse('ask', argv, ['to', 'default'], ['blocked']);
	const to = a.to ?? 'user';
	if (!PEOPLE.includes(to)) {
		console.error(`wf ask: --to ${to} — one of: ${PEOPLE.join(' ')}`);
		refuseCaller();
	}
	const { toplevel } = roundState('ask');
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
		refuseCaller();
	}
	const next = writeState(toplevel, (state) => addQuestion(state, { to, text, dflt: a.default, source }));
	const q = next.questions!.at(-1)!;
	console.log(`q${q.n} → ${to}: ${text}`);
	await notifyAdapters(next);
}

export async function runDecide(argv: string[]): Promise<void> {
	const a = parse('decide', argv, ['q'], ['revise']);
	const answer = a.positionals.join(' ').trim();
	if (!answer) {
		console.error('usage: wf decide [--revise] [--q <n>] "<the answer, in their words>"');
		refuseCaller();
	}
	const { toplevel, state } = roundState('decide');
	const agreement = agreementPathOf(toplevel, state);
	if (!(state.questions ?? []).length) {
		if (a.revise) {
			const sha = agreementSha(toplevel, state.class ?? null, state.folder ?? null);
			const next = writeState(toplevel, (state) => reviseState(state, answer, sha));
			console.log('the round is back at agree: `wf next` sends it to a fresh agreement and T1 with this answer');
			await notifyAdapters(next);
			return;
		}
		// No question open: a decision nobody was asked for, recorded where the build reads it.
		if (!existsSync(agreement)) {
			console.error(`wf decide: no ${agreement} to record it in`);
			process.exit(2);
		}
		writeFileSync(agreement, appendDecision(readFileSync(agreement, 'utf8'), answer));
		console.log(`recorded in ${agreement} § Decisions`);
		return;
	}
	const open = state.questions ?? [];
	if (a.q == null && open.length > 1) {
		console.error(`wf decide: ${open.length} questions are open — name one with --q: ${open.map((q) => `q${q.n}`).join(', ')}`);
		process.exit(2);
	}
	const target = a.q == null ? open[0].n : Number(String(a.q).replace(/^q/, ''));
	if (a.q != null && !Number.isInteger(target)) {
		console.error(`wf decide: --q ${a.q} is not a question number`);
		process.exit(2);
	}
	// Where the answer is read is checked before the state is written: a missing agreement refuses
	// while the question is still open, instead of closing it with nowhere to record the answer.
	const blocked = open.find((q) => q.n === target)?.source?.startsWith('BLOCKED.md') ?? false;
	const assessmentSource = open.find((q) => q.n === target)?.source?.startsWith('ASSESSMENT.md') ?? false;
	if (!blocked && !assessmentSource && !existsSync(agreement)) {
		console.error(`wf decide: no ${agreement} to record q${target}'s answer in`);
		process.exit(2);
	}
	let next: State;
	const decided = { question: null as Question | null };
	try {
		next = writeState(toplevel, (current) => {
			const result = closeQuestion(current, target, undefined, answer);
			decided.question = result.question;
			const said = revisionText(result.question, answer);
			return a.revise ? reviseState(result.state, said, agreementSha(toplevel, result.state.class ?? null, result.state.folder ?? null)) : result.state;
		});
	} catch (e) {
		console.error(`wf decide: ${(e as Error).message}`);
		process.exit(2);
	}
	const question = decided.question as Question;
	if (blocked) {
		const file = roundFile(toplevel, 'BLOCKED.md');
		writeFileSync(file, appendAnswer(readFileSync(file, 'utf8'), answer));
		console.log(`q${question.n} closed · answer in ${file} § Answer`);
	} else if (assessmentSource) {
		// An assessment ruling (fix or accept) stays in state: ASSESSMENT.md is the assessment's, not
		// the person's, and `wf next` reads the ruling from `answered` (next.ts).
		console.log(`q${question.n} closed · ruling recorded`);
	} else {
		writeFileSync(agreement, appendDecision(readFileSync(agreement, 'utf8'), `${question.text} → ${question.to}: ${answer}`));
		console.log(`q${question.n} closed · recorded in ${agreement} § Decisions`);
	}
	if (a.revise) console.log('the round is back at agree: `wf next` sends it to a fresh agreement and T1 with this answer');
	await notifyAdapters(next);
}

// Pure: the text `wf decide --revise --q` records in state.revisions for an answered question.
export const revisionText = (question: Pick<Question, 'text' | 'default'>, answer: string) => `${question.text}${question.default ? ` (default: ${question.default})` : ''} → ${answer}`.trim();

// Pure: the state sent back to agree with `text`, an answer saying the agreement must change. `sha` is
// the agreement's material sha at the moment the revision was recorded: the revision is answered only
// when that sha moves, so a session that writes nothing cannot leave the old T1 approval in force.
export function reviseState(state: State, text: string, sha: string | null, now = new Date().toISOString()): State {
	return { ...state, step: 'agree', waiting_on: state.questions?.[0]?.to ?? null, since: now, history: stepHistory(state.history, 'agree', now), revisions: [...(state.revisions ?? []), { text: text.trim(), at: now, sha }] };
}

// Pure: the revisions a fresh agreement has not answered yet — those whose recorded material sha still
// matches the agreement as it stands. A revision without a recorded sha is a malformed state (the only
// producer, `reviseState`, always writes one) and is kept open, never silently discharged: a requested
// change must not vanish because its record is incomplete. `wf next` dispatches `agree` while any is
// open, so the round cannot build on the old T1.
export function openRevisions(revisions: { text: string; at: string; sha?: string | null }[] = [], currentSha: string | null) {
	return revisions.filter((r) => r.sha === undefined || r.sha === currentSha);
}

// Pure: the revisions a fresh agreement has not answered yet. A revision is answered when the agreed
// material's sha changes and T1 approves it; while the step is still `agree` it stays pending.
export function pendingRevisions(revisions: { text: string; at: string }[] = [], answeredAt: string | undefined) {
	return revisions.filter((r) => !answeredAt || r.at > answeredAt);
}

// Pure: the Asks a person answered against the default the agreement was written for. `wf next` sends
// those back to agree before a build (a default is what the agreement assumed).
export function overruledAsks(answered: Question[] = []): Question[] {
	const same = (a: string, b: string) => a.trim().replace(/\.$/, '').toLowerCase() === b.trim().replace(/\.$/, '').toLowerCase();
	return answered.filter((q) => q.default && !same(q.answer ?? '', 'default') && !same(q.answer ?? '', q.default));
}
