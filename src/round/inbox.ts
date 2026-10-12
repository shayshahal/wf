// inbox.ts — wf inbox: send the round's user questions and save replies without advancing it.
// A native tool alone leaves the q<n> ↔ message mapping in a dying session (2026-10-12).
// The transport ref lives with the question; wf decide still owns local rulings versus --revise.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { seams } from '../seams.ts';
import { refuseCaller } from '../refusal.ts';
import type { QuestionInbox } from '../seams.ts';
import { readState, toplevelOf, writeState } from './state.ts';
import type { Question, QuestionReply, State } from './state.ts';

// Pure: stable across retries, distinct across worktrees and questions even when their words match.
export function inboxKey(worktree: string, question: Question): string {
	const path = resolve(worktree).replace(/\\/g, '/');
	const identity = [process.platform === 'win32' ? path.toLowerCase() : path, question.n, question.asked];
	return `wf-q-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

// Pure: only the user's unposted questions belong in this machine's inbox.
export function pendingPosts(state: State): Question[] {
	return (state.questions ?? []).filter((q) => q.to === 'user' && !q.inbox);
}

// Pure: save a newer reply only to its exact, still-open question. Stale reads cannot replace it,
// and even a correction never closes a gate: wf decide records the ruling explicitly.
export function applyReply(state: State, ref: string, reply: QuestionReply): State {
	return { ...state, questions: (state.questions ?? []).map((q) =>
		q.to === 'user' && q.inbox?.ref === ref && (!q.inbox.reply || reply.sequence > q.inbox.reply.sequence) && reply.text.trim()
			? { ...q, inbox: { ...q.inbox, reply } } : q) };
}

function messageBody(question: Question): string {
	return `:::question-text\n${question.text}\n\nRound question q${question.n}${question.source ? ` from ${question.source}` : ''}. The round waits for your answer; a change to the agreed behavior goes through a renewed agreement and T1.${question.default ? `\n\nDefault: ${question.default}` : ''}\n\nStopped: this round needs your ruling\n:::`;
}

// Post outside the state lock with an idempotency key, then save the ref under it. A crash after send
// retries the identical message; a concurrent answer keeps the ref in answered, not a reopened q.
export async function syncInbox(worktree: string, inbox: QuestionInbox): Promise<void> {
	if (!readState(worktree)) throw new Error('wf inbox: no round in .wf/state.json — run it in the round\'s worktree');
	// Freeze the envelope BEFORE send: even an updated wf after a crash retries identical content.
	const state = writeState(worktree, (current) => ({ questions: (current.questions ?? []).map((q) =>
		q.to === 'user' && !q.inbox && !q.inbox_message ? { ...q, inbox_message: {
			key: inboxKey(worktree, q), subject: `q${q.n}: ${q.text.split('\n')[0]}`, body: messageBody(q),
		} } : q) }));
	for (const question of pendingPosts(state)) {
		const message = question.inbox_message;
		if (!message) throw new Error(`wf inbox: q${question.n} has no saved message to retry`);
		const posted = await inbox.post({ worktree, ...message });
		writeState(worktree, (current) => {
			const save = (q: Question) => q.n === question.n && q.asked === question.asked && !q.inbox ? { ...q, inbox: posted } : q;
			return { questions: (current.questions ?? []).map(save), answered: (current.answered ?? []).map(save) };
		});
	}
	for (const question of readState(worktree)?.questions ?? []) {
		if (question.to !== 'user' || !question.inbox) continue;
		const ref = question.inbox.ref;
		const reply = await inbox.read({ worktree, ref });
		if (reply) writeState(worktree, (current) => applyReply(current, ref, reply));
	}
}

// The durable reply is displayed on every resume until wf decide records the person's ruling.
export function inboxLines(state: State): string[] {
	return (state.questions ?? []).filter((q) => q.to === 'user').flatMap((q) => {
		const label = `q${q.n}: ${q.text}${q.default ? ` (default: ${q.default})` : ''}`;
		if (!q.inbox) return [`${label} · not posted`];
		const line = `${label} · ${q.inbox.url}`;
		return q.inbox.reply ? [line, `reply to q${q.n}:\n${q.inbox.reply.text}`, `Record their ruling: wf decide --q ${q.n} "<their words>" (agreement change: add --revise).`] : [line, `waiting for q${q.n}; on an Inbox reply or resume, run wf inbox again`];
	});
}

// No waiting loop: one post/read pass. The kit without an inbox tells the caller to ask directly.
export async function runInbox(argv: string[]): Promise<void> {
	if (argv.length) {
		console.error('usage: wf inbox (post open user questions and save any replies)');
		refuseCaller();
	}
	const worktree = toplevelOf();
	if (!readState(worktree)) {
		console.error('wf inbox: no round in .wf/state.json — run it in the round\'s worktree');
		refuseCaller();
	}
	if (!seams.inbox) {
		console.log('wf inbox: unavailable — ask the recorded questions with the harness question tool, then wf decide');
		return;
	}
	try {
		await syncInbox(worktree, seams.inbox);
	} catch (e) {
		console.error(`wf inbox: ${e instanceof Error ? e.message : String(e)} — questions remain recorded; retry wf inbox or ask directly and use wf decide`);
		process.exitCode = 2;
		return;
	}
	const current = readState(worktree);
	if (!current) {
		console.error('wf inbox: the round disappeared while syncing — it may have been reaped');
		process.exitCode = 2;
		return;
	}
	const lines = inboxLines(current);
	console.log(lines.length ? lines.join('\n') : 'wf inbox: no open user questions');
}
