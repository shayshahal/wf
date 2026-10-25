// inbox.selfcheck.ts — durable question routing through real state writes and the CLI; no network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { fileURLToPath } from 'node:url';
import type { QuestionInbox } from '../seams.ts';
import { WF_ROOT } from '../paths.ts';
import { addQuestion, closeQuestion, openQuestionGate, questionLines } from './ask.ts';
import { applyReply, inboxKey, inboxLines, pendingPosts, syncInbox } from './inbox.ts';
import { readState, writeState } from './state.ts';
import type { Question, QuestionReply, State } from './state.ts';

// Exercise the real dispatcher with a faithful transport, in an isolated child process.
if (process.argv[2] === 'cli') {
	const { run } = await import('../run.ts');
	const fail = process.argv[3] === 'fail' || process.argv[3] === 'next';
	await run([process.argv[3] === 'next' ? 'next' : 'inbox'], { inbox: {
		post: async ({ subject }) => {
			if (fail) throw new Error('transport unavailable');
			const ref = `m${/^q(\d+):/.exec(subject)?.[1]}`;
			return { ref, url: `http://localhost/#thread=${ref}` };
		},
		read: async () => {
			if (fail) throw new Error('transport unavailable');
			if (process.argv[3] === 'reaped') { rmSync(join(process.cwd(), '.wf/state.json'), { force: true }); return null; }
			return { ref: 'r1', text: 'Keep the agreed behavior.', sequence: 1 };
		},
	} });
	process.exit(process.exitCode ?? 0);
}

const root = mkdtempSync(join(tmpdir(), 'wf-inbox-'));
const t = '2026-10-12T06:00:00.000Z';
const question: Question = { n: 1, to: 'user', text: 'May this behavior change?', asked: t };
const posted = { ref: 'm1', url: 'http://localhost/#thread=m1' };
const reply = { ref: 'r1', text: 'Keep the agreed behavior.', sequence: 1 };
const pending: State = { wf_version: 3, round: 'r', base: 'main', class: 'A', step: 'build', folder: 'round', last_question: 1, questions: [{ ...question, inbox: posted }] };
const cli = (dir: string, ...args: string[]) => wfSync([...args], { cwd: dir });
function repo(name: string, state: State = pending) {
	const dir = join(root, name);
	mkdirSync(join(dir, '.wf'), { recursive: true });
	const git = (...args: string[]) => {
		const result = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
		assert.equal(result.status, 0, result.stderr);
	};
	git('init', '-q', '-b', 'main');
	writeFileSync(join(dir, 'base.txt'), 'base\n');
	git('add', 'base.txt'); git('commit', '-q', '-m', 'base');
	mkdirSync(join(dir, 'round'));
	writeFileSync(join(dir, 'round/TICKET.md'), '# r\n## Intent\n- Keep the behavior.\n');
	writeState(dir, () => state);
	return dir;
}
function fakeInbox() {
	const sent = new Map<string, { ref: string; url: string; body: string }>();
	const replies = new Map<string, QuestionReply>();
	const reads: string[] = [];
	const inbox: QuestionInbox = {
		post: async ({ key, body }) => {
			const found = sent.get(key);
			if (found) { assert.equal(found.body, body); return found; }
			const message = { ref: `m${sent.size + 1}`, url: `http://localhost/#thread=m${sent.size + 1}`, body };
			sent.set(key, message); return message;
		},
		read: async ({ ref }) => { reads.push(ref); return replies.get(ref) ?? null; },
	};
	return { inbox, sent, replies, reads };
}
try {
	assert.equal(inboxKey(root, question), inboxKey(root, structuredClone(question)));
	assert.notEqual(inboxKey(root, question), inboxKey(join(root, 'other'), question));
	assert.notEqual(inboxKey(root, question), inboxKey(root, { ...question, n: 2 }));
	assert.notEqual(inboxKey(root, question), inboxKey(root, { ...question, asked: 'later' }));
	assert.ok(inboxKey(root, question).length <= 120);
	assert.deepEqual(pendingPosts({ questions: [question, { ...question, n: 2, to: 'colleague' }, { ...question, n: 3, inbox: posted }] }), [question]);
	assert.deepEqual(applyReply(pending, 'foreign', reply), pending);
	assert.deepEqual(applyReply(pending, 'm1', { ref: 'r0', text: '  ', sequence: 1 }), pending);
	const received = applyReply(pending, 'm1', reply);
	assert.equal(received.questions?.[0].inbox?.reply?.text, reply.text);
	assert.ok(openQuestionGate(received), 'receiving a reply must keep the gate closed');
	assert.equal(received.step, 'build');
	assert.equal(received.answered, undefined);
	assert.equal(received.revisions, undefined);
	assert.deepEqual(applyReply(received, 'm1', reply), received);
	const corrected = applyReply(received, 'm1', { ref: 'r2', text: 'later correction', sequence: 2 });
	assert.equal(corrected.questions?.[0].inbox?.reply?.text, 'later correction');
	assert.deepEqual(applyReply(corrected, 'm1', reply), corrected, 'a stale read cannot overwrite a correction');
	const closed = closeQuestion(received, 1, t, reply.text).state;
	assert.deepEqual(applyReply(closed, 'm1', reply), closed, 'a late reply cannot reopen an answered question');
	assert.match(questionLines(received)[0], /reply saved/);
	assert.match(inboxLines(received).join('\n'), /wf decide --q 1/);
	console.log('  ok   keys, routing, corrections, stale reads, durable display and authority');

	const dir = repo('round-one', { ...pending, questions: [question, { ...question, n: 2, to: 'colleague' }] });
	const fake = fakeInbox();
	await Promise.all([syncInbox(dir, fake.inbox), syncInbox(dir, fake.inbox)]);
	assert.equal(fake.sent.size, 1, 'concurrent posters share an idempotency key');
	assert.equal(readState(dir)?.questions?.[0].inbox?.ref, 'm1');
	assert.equal(readState(dir)?.questions?.[1].inbox, undefined);
	fake.replies.set('m1', reply);
	await syncInbox(dir, fake.inbox);
	await syncInbox(dir, fake.inbox);
	assert.equal(fake.sent.size, 1);
	assert.deepEqual(readState(dir)?.questions?.[0].inbox?.reply, reply);
	assert.equal(readState(dir)?.questions?.length, 2, 'sync leaves all questions open');
	assert.ok(!existsSync(join(dir, 'round/REVIEW.md')) && !existsSync(join(dir, 'round/AGREEMENT-REVIEW.md')));
	console.log('  ok   concurrent/repeated sync does not repost, close or approve');

	// A remote send succeeds but its caller dies before the ref is saved: retry obtains the same ref.
	const crashDir = repo('crash', { ...pending, questions: [question] });
	const crashFake = fakeInbox();
	let crash = true;
	const interrupted: QuestionInbox = { ...crashFake.inbox, post: async (o) => {
		const message = await crashFake.inbox.post(o);
		if (crash) { crash = false; throw new Error('interrupted after send'); }
		return message;
	} };
	await assert.rejects(syncInbox(crashDir, interrupted), /interrupted after send/);
	assert.equal(readState(crashDir)?.questions?.[0].inbox, undefined);
	await syncInbox(crashDir, interrupted);
	assert.equal(crashFake.sent.size, 1);
	assert.equal(readState(crashDir)?.questions?.[0].inbox?.ref, 'm1');
	const updateDir = repo('update', { ...pending, questions: [{ ...question, inbox_message: {
		key: inboxKey(join(root, 'update'), question), subject: 'old subject', body: 'old template before wf updated',
	} }] });
	const updateFake = fakeInbox();
	await updateFake.inbox.post({ worktree: updateDir, ...readState(updateDir)!.questions![0].inbox_message! });
	await syncInbox(updateDir, updateFake.inbox);
	assert.equal(updateFake.sent.size, 1);
	assert.equal([...updateFake.sent.values()][0].body, 'old template before wf updated');
	assert.equal(readState(updateDir)?.questions?.[0].inbox?.ref, 'm1');
	console.log('  ok   crash and template changes across wf updates recover without reposting');

	// A person answers directly while post is in flight; its ref belongs to answered, not a new q.
	const raceDir = repo('race', { ...pending, questions: [question] });
	await syncInbox(raceDir, { post: async () => {
		writeState(raceDir, (s) => addQuestion(closeQuestion(s, 1, t, 'direct').state, { to: 'user', text: 'next' }, t));
		return posted;
	}, read: async () => { throw new Error('should not read the closed question'); } });
	assert.equal(readState(raceDir)?.answered?.[0].inbox?.ref, 'm1');
	assert.equal(readState(raceDir)?.questions?.[0].n, 2);
	assert.equal(readState(raceDir)?.questions?.[0].inbox, undefined);

	// Another command closes q while read is in flight; the stale reply cannot apply to the next q.
	const lateDir = repo('late');
	await syncInbox(lateDir, { post: async () => posted, read: async () => {
		writeState(lateDir, (s) => addQuestion(closeQuestion(s, 1, t, 'direct').state, { to: 'user', text: 'next' }, t));
		return reply;
	} });
	assert.equal(readState(lateDir)?.questions?.[0].inbox, undefined);
	assert.equal(readState(lateDir)?.answered?.[0].inbox?.reply, undefined);
	console.log('  ok   concurrent direct answer and stale reply preserve question identity');

	// Real dispatcher + wf decide own consumption, BLOCKED answer placement and explicit revision.
	const decisionDir = repo('decide', received);
	const fallback = cli(decisionDir, 'inbox');
	assert.equal(fallback.status, 0, fallback.stderr);
	assert.match(fallback.stdout, /unavailable/);
	assert.ok(openQuestionGate(readState(decisionDir)));
	const invalid = cli(decisionDir, 'inbox', '--unexpected');
	assert.equal(invalid.status, 2);
	const refusal = readFileSync(join(decisionDir, '.wf/events.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	assert.equal(refusal.at(-1).kind, 'caller', 'bad inbox argv is not a round failure');
	const decision = cli(decisionDir, 'decide', '--q', '1', reply.text);
	assert.equal(decision.status, 0, decision.stderr);
	assert.equal(readState(decisionDir)?.answered?.[0].inbox?.reply?.ref, 'r1');
	assert.match(readFileSync(join(decisionDir, 'round/TICKET.md'), 'utf8'), /Keep the agreed behavior\./);
	assert.equal(readState(decisionDir)?.step, 'build');
	assert.equal(readState(decisionDir)?.revisions, undefined);
	const blockDir = repo('blocked', { ...received, questions: [{ ...received.questions![0], source: 'BLOCKED.md' }] });
	writeFileSync(join(blockDir, 'round/BLOCKED.md'), '# blocked\nQuestion: May this behavior change?\n');
	assert.equal(cli(blockDir, 'decide', '--q', '1', reply.text).status, 0);
	assert.match(readFileSync(join(blockDir, 'round/BLOCKED.md'), 'utf8'), /## Answer/);
	const reviseDir = repo('revise', received);
	assert.equal(cli(reviseDir, 'decide', '--revise', '--q', '1', 'Change the agreed behavior.').status, 0);
	assert.equal(readState(reviseDir)?.step, 'agree');
	assert.equal(readState(reviseDir)?.revisions?.length, 1);
	assert.ok(!existsSync(join(reviseDir, 'round/AGREEMENT-REVIEW.md')));
	const liveDir = repo('transport-cli', { ...pending, questions: [question] });
	const transportCli = (mode = '') => spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'cli', mode], { cwd: liveDir, encoding: 'utf8' });
	const sync = transportCli();
	assert.equal(sync.status, 0, sync.stderr);
	assert.match(sync.stdout, /reply to q1:/);
	assert.deepEqual(readState(liveDir)?.questions?.[0].inbox?.reply, reply);
	const next = transportCli('next');
	assert.equal(next.status, 0, next.stderr);
	assert.match(next.stdout, /wait user: q1/);
	assert.ok(openQuestionGate(readState(liveDir)), 'next cannot consume a saved reply');
	writeState(liveDir, (s) => addQuestion(s, { to: 'user', text: 'another question' }, t));
	const failed = transportCli('fail');
	assert.equal(failed.status, 2, failed.stderr);
	assert.match(failed.stderr, /transport unavailable/);
	assert.ok(openQuestionGate(readState(liveDir)));
	assert.deepEqual(readState(liveDir)?.questions?.[0].inbox?.reply, reply);
	const vanished = transportCli('reaped');
	assert.equal(vanished.status, 2);
	assert.match(vanished.stderr, /round disappeared/);
	assert.equal(readState(liveDir), null);
	console.log('  ok   CLI transport, failure/reap, next without network, fallback, decision and --revise');

	const otherDir = repo('round-two', { ...pending, questions: [question] });
	const otherFake = fakeInbox();
	await syncInbox(otherDir, otherFake.inbox);
	assert.notEqual([...fake.sent.keys()][0], [...otherFake.sent.keys()][0]);
	console.log('  ok   two live rounds with q1 use different transport identities');
	console.log('\nall arms green');
} finally {
	rmSync(root, { recursive: true, force: true });
}
