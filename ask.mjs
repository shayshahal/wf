#!/usr/bin/env node
// ask.mjs — wf ask / wf decide: a question to a person is a record in .wf/state.json, not a chat
// line. A question that lived only in a session's chat died with the session (2026-09-23: a pane
// closed with its question to Shay unanswered). Idea from firstmate: obligations are closed by
// records, not by recollection.
//   wf ask "<question>" [--to shay|einat|saar] [--default "<default>"]   → q<n>, waiting_on = --to
//   wf ask --blocked [--to …]                                            → the Question line of BLOCKED.md
//   wf decide [--q <n>] "<answer, their words>"                          → closes q<n>
// `wf prompt` and `wf deliver` refuse while a question is open (openQuestionGate).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { appendDecision, notifyAdapters, planPath } from './step.mjs';
import { readState, roundFile, toplevelOf, writeState } from './state.mjs';

const PEOPLE = ['shay', 'einat', 'saar'];

// Pure: the state with one more open question. The round now waits on the oldest open question's person.
// Numbers only go up (last_question): "q1" in chat names one question for the whole round.
export function addQuestion(state, { to, text, dflt = null, source = null }, now = new Date().toISOString()) {
	const questions = [...(state.questions ?? [])];
	const n = Math.max(state.last_question ?? 0, ...questions.map((q) => q.n)) + 1;
	questions.push({ n, to, text, ...(dflt ? { default: dflt } : {}), ...(source ? { source } : {}), asked: now });
	return { ...state, questions, last_question: n, waiting_on: questions[0].to, since: now };
}

// Pure: the state without question n, and the question. With one question open, n may be omitted.
export function closeQuestion(state, n, now = new Date().toISOString()) {
	const open = state.questions ?? [];
	if (n == null && open.length > 1) throw new Error(`${open.length} questions are open — name one with --q: ${open.map((q) => `q${q.n}`).join(', ')}`);
	const question = n == null ? open[0] : open.find((q) => q.n === n);
	if (!question) throw new Error(`no open question q${n}${open.length ? ` (open: ${open.map((q) => `q${q.n}`).join(', ')})` : ''}`);
	const questions = open.filter((q) => q !== question);
	return { question, state: { ...state, questions, waiting_on: questions[0]?.to ?? null, since: now } };
}

// Pure: null, or why the round cannot move on. An open question means someone owes an answer first.
export function openQuestionGate(state) {
	const open = state?.questions ?? [];
	if (!open.length) return null;
	return `${open.length} open question${open.length > 1 ? 's' : ''} — ${open.map((q) => `q${q.n} → ${q.to}: ${q.text}`).join(' | ')}. Their answer → \`wf decide\` first.`;
}

// Pure: the one-line Question of a BLOCKED.md (prompts/implement.md).
export function blockedQuestion(text) {
	return text.replace(/\r\n/g, '\n').match(/^Question:[ \t]*(.+)$/m)?.[1].trim() || null;
}

// Pure: BLOCKED.md with the answer under `## Answer`, which the next implement agent follows.
export function appendAnswer(blockedText, answer, date = new Date().toISOString().slice(0, 10)) {
	const body = blockedText.replace(/\r\n/g, '\n').trimEnd();
	const line = `${date} ${answer.trim()}`;
	return /^## Answer[ \t]*$/m.test(body) ? `${body}\n${line}\n` : `${body}\n\n## Answer\n${line}\n`;
}

// Pure: `wf status --all` lines under a round.
export function questionLines(state) {
	return (state?.questions ?? []).map((q) => `? q${q.n} → ${q.to}: ${q.text}${q.default ? ` (default: ${q.default})` : ''}`);
}

// Pure: flags that take a value, boolean flags, the rest as words. An unknown flag throws: `--q2 x`
// once closed the only open question with the answer "x".
export function parseArgs(argv, valued, booleans = []) {
	const out = { positionals: [] };
	for (let i = 0; i < argv.length; i++) {
		const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
		if (name && valued.includes(name)) {
			if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
			out[name] = argv[++i];
		} else if (name && booleans.includes(name)) out[name] = true;
		else if (name) throw new Error(`unknown flag ${argv[i]}`);
		else out.positionals.push(argv[i]);
	}
	return out;
}

function parse(cmd, argv, valued, booleans) {
	try {
		return parseArgs(argv, valued, booleans);
	} catch (e) {
		console.error(`wf ${cmd}: ${e.message}`);
		process.exit(2);
	}
}

function roundState(cmd) {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state) {
		console.error(`wf ${cmd}: no round in .wf/state.json — run it in the round's worktree`);
		process.exit(2);
	}
	return { toplevel, state };
}

export async function runAsk(argv) {
	const a = parse('ask', argv, ['to', 'default'], ['blocked']);
	const to = a.to ?? 'shay';
	if (!PEOPLE.includes(to)) {
		console.error(`wf ask: --to ${to} — one of: ${PEOPLE.join(' ')}`);
		process.exit(2);
	}
	const { toplevel, state } = roundState('ask');
	let text = a.positionals.join(' ').trim();
	let source = null;
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
		console.error('usage: wf ask "<question>" [--to shay|einat|saar] [--default "<default>"] · wf ask --blocked');
		process.exit(2);
	}
	const next = writeState(toplevel, addQuestion(state, { to, text, dflt: a.default, source }));
	const q = next.questions.at(-1);
	console.log(`q${q.n} → ${to}: ${text}`);
	await notifyAdapters(next);
}

export async function runDecide(argv) {
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
	let closed;
	try {
		const n = a.q == null ? null : Number(String(a.q).replace(/^q/, ''));
		if (n !== null && !Number.isInteger(n)) throw new Error(`--q ${a.q} is not a question number`);
		closed = closeQuestion(state, n);
	} catch (e) {
		console.error(`wf decide: ${e.message}`);
		process.exit(2);
	}
	const { question } = closed;
	if (question.source === 'BLOCKED.md') {
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
