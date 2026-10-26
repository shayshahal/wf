// plannotator-inbox.selfcheck.ts — node plannotator-inbox.selfcheck.ts → exit 0 when green.
// Runs the adapter against a faithful fake `plannotator inbox mcp`: a real subprocess speaking
// newline-delimited JSON-RPC on stdio, with the Inbox's own rules for what these two tools do (strict
// arguments, idempotency replay and conflict, threads joined by name, reply_to routing, structuredContent
// shapes, `<code>: <message>` refusals — read from backnotprop/plannotator main, 2026-10-12). Its state
// is a JSON file, so the test plays the person by writing replies into it. The real binary is never run.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InboxError, createQuestionInbox, questionInbox } from './plannotator-inbox.ts';
import type { InboxOptions } from './plannotator-inbox.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const FAKE_SERVER = String.raw`
const fs = require('fs');
const readline = require('readline');
const { FAKE_STATE, FAKE_LOG, FAKE_PID, FAKE_MODE = '' } = process.env;
const modes = new Set(FAKE_MODE.split(',').filter(Boolean));
const log = (entry) => fs.appendFileSync(FAKE_LOG, JSON.stringify(entry) + '\n');
fs.appendFileSync(FAKE_PID, process.pid + '\n');
log({ started: true, cwd: process.cwd(), dataDir: process.env.PLANNOTATOR_DATA_DIR ?? null, session: process.env.PI_SESSION_ID ?? null });
if (modes.has('stderr-noise')) process.stderr.write('x'.repeat(200000));
if (modes.has('stderr-note')) process.stderr.write('inbox store locked\n');
const state = () => JSON.parse(fs.readFileSync(FAKE_STATE, 'utf8'));
const save = (s) => fs.writeFileSync(FAKE_STATE, JSON.stringify(s));
const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const ok = (id, line, structured) => out({ id, result: { content: [{ type: 'text', text: line }], structuredContent: structured } });
const refuse = (id, code, message) => out({ id, result: { content: [{ type: 'text', text: code + ': ' + message }], isError: true } });
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const SEND_KEYS = ['body', 'project_path', 'subject', 'thread', 'reply_to', 'supersedes', 'idempotency_key', 'agent_session', 'agent_name', 'agent_host', 'attachments'];
const READ_KEYS = ['thread_id', 'message_id', 'project_path', 'asked_by', 'include_resolved', 'limit', 'agent_session'];
let initialized = false;
let inited = false;

function sendMessage(id, a) {
  const bad = Object.keys(a).filter((k) => !SEND_KEYS.includes(k));
  if (bad.length) return refuse(id, 'validation_error', 'Unrecognized key(s): ' + bad.join(', '));
  if (typeof a.body !== 'string' || a.body.length < 1) return refuse(id, 'validation_error', 'body: required');
  if (a.thread !== undefined && (a.thread.length < 1 || a.thread.length > 120 || /[\r\n]/.test(a.thread))) return refuse(id, 'validation_error', 'thread: 1-120 characters, one line');
  const s = state();
  if (a.reply_to === undefined && !a.project_path) return refuse(id, 'validation_error', 'project_path: required for a new thread');
  if (a.idempotency_key !== undefined) {
    const first = s.messages.find((m) => m.idempotency_key === a.idempotency_key && m.author.kind === 'agent');
    if (first) {
      const same = first.body === a.body && (first.thread_name ?? null) === (a.thread ?? null) && first.reply_to === (a.reply_to ?? null);
      if (!same) return refuse(id, 'idempotency_conflict', 'The key ' + a.idempotency_key + ' was used with another body, thread or reply_to.');
      return sent(id, s, first, true);
    }
  }
  let thread_id;
  let thread_name = null;
  if (a.reply_to !== undefined) {
    const parent = s.messages.find((m) => m.id === a.reply_to);
    if (!parent) return refuse(id, 'message_not_found', 'No message ' + a.reply_to + '.');
    thread_id = parent.thread_id;
  } else if (a.thread !== undefined) {
    thread_name = a.thread;
    const roots = s.messages.filter((m) => m.id === m.thread_id && m.resolved_at === null && m.thread_name && norm(m.thread_name) === norm(a.thread));
    thread_id = roots.length ? roots[roots.length - 1].id : null;
  } else thread_id = null;
  s.n += 1;
  const msg = {
    id: 'msg_' + s.n, project_id: 'proj_1', thread_id: thread_id ?? 'msg_' + s.n, reply_to: a.reply_to ?? null,
    author: { kind: 'agent', host: 'pi', session: a.agent_session ?? 'ses_fake', name: null },
    subject: thread_id === null ? (a.subject ?? a.body.split('\n')[0]) : null, body: a.body,
    created_at: new Date(1e12 + s.n * 1000).toISOString(), resolved_at: null, idempotency_key: a.idempotency_key ?? null,
    thread_name: thread_id === null ? thread_name : null,
  };
  s.messages.push(msg);
  save(s);
  sent(id, s, msg, false);
}
function sent(id, s, m, replayed) {
  ok(id, (replayed ? 'Already sent' : 'Sent') + ' to the Plannotator Inbox', {
    message_id: m.id, thread_id: m.thread_id, new_thread: m.thread_id === m.id, thread_name: s.messages.find((x) => x.id === m.thread_id).thread_name ?? null,
    project: { id: 'proj_1', name: 'p', root: '/p' }, questions: [], attachments: [], superseded: [], replayed, cursor: s.n,
    url: 'http://localhost:1/#thread=' + m.thread_id,
  });
}
function readThread(id, a) {
  const bad = Object.keys(a).filter((k) => !READ_KEYS.includes(k));
  if (bad.length) return refuse(id, 'validation_error', 'Unrecognized key(s): ' + bad.join(', '));
  const s = state();
  const m = s.messages.find((x) => x.id === a.message_id);
  if (!m) return refuse(id, 'message_not_found', 'No message ' + a.message_id + '.');
  const messages = s.thread_override?.[m.thread_id] ?? s.messages.filter((x) => x.thread_id === m.thread_id);
  const root = s.messages.find((x) => x.id === m.thread_id);
  ok(id, 'Thread ' + root.id, {
    thread: { thread_id: root.id, project: { id: 'proj_1', name: 'p', root: '/p' }, subject: root.subject, thread_name: root.thread_name ?? null, resolved_at: root.resolved_at, messages },
    url: 'http://localhost:1/#thread=' + root.id,
  });
}

function toolCall(id, params) {
  log({ tool: params.name, arguments: params.arguments });
  if (modes.has('call-hang')) return;
  if (modes.has('call-exit')) { process.stderr.write('segfault in inbox store\n'); process.exit(3); }
  if (modes.has('call-error')) return out({ id, error: { code: -32602, message: 'Invalid params' } });
  if (modes.has('call-wrong-id')) return out({ id: 99, result: {} });
  if (modes.has('call-garbage')) return process.stdout.write('Listening on http://127.0.0.1:1234\n');
  if (modes.has('call-not-json-rpc')) return process.stdout.write(JSON.stringify({ hello: 'world' }) + '\n');
  if (modes.has('call-no-structured')) return out({ id, result: { content: [{ type: 'text', text: 'Sent' }] } });
  if (modes.has('call-bad-shape')) return ok(id, 'Sent', { message_id: 42, url: 'u' });
  if (modes.has('call-bad-thread')) return ok(id, 'Thread', { thread: { messages: [{ id: 'msg_1', author: { kind: 'person' } }] } });
  if (modes.has('call-refuse')) return refuse(id, 'internal_error', 'disk full');
  if (modes.has('call-interleave')) { out({ method: 'notifications/tools/list_changed' }); out({ id: 'srv-1', method: 'ping' }); out({ id: 'srv-2', method: 'sampling/createMessage', params: {} }); }
  if (params.name === 'send_message') sendMessage(id, params.arguments);
  else if (params.name === 'read_thread') readThread(id, params.arguments);
  else refuse(id, 'unknown_tool', params.name);
  if (modes.has('call-linger')) setInterval(() => {}, 1000); // ignores the end of stdin, as a wedged shim would
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  log({ method: m.method ?? null, id: m.id ?? null, params: m.params ?? null, response: m.method ? undefined : m });
  if (m.method === 'initialize') {
    if (modes.has('init-hang')) return;
    if (modes.has('init-exit')) { process.stderr.write('cannot open inbox registry\n'); process.exit(2); }
    if (modes.has('init-error')) return out({ id: m.id, error: { code: -32600, message: 'unsupported protocol' } });
    inited = true;
    const reply = JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'plannotator-inbox', version: '1.0.0' } } }) + '\n';
    if (modes.has('chunked')) { // one answer in three writes, split mid-token
      const a = Math.floor(reply.length / 3);
      process.stdout.write(reply.slice(0, a));
      setTimeout(() => process.stdout.write(reply.slice(a, 2 * a)), 20);
      setTimeout(() => process.stdout.write(reply.slice(2 * a)), 40);
    } else process.stdout.write(reply);
  } else if (m.method === 'notifications/initialized') {
    initialized = true;
  } else if (m.method === 'tools/call') {
    if (!inited || !initialized) return out({ id: m.id, error: { code: -32600, message: 'not initialized' } });
    if (modes.has('call-crlf')) { const w = process.stdout.write.bind(process.stdout); process.stdout.write = (s) => w(String(s).replace(/\n$/, '\r\n')); }
    toolCall(m.id, m.params);
  }
});
rl.on('close', () => { if (!modes.has('call-linger')) process.exit(0); });
`;

const root = mkdtempSync(join(tmpdir(), 'wf-inbox-'));
const worktree = join(root, 'wt');
mkdirSync(worktree);
const serverFile = join(root, 'fake-inbox.cjs');
writeFileSync(serverFile, FAKE_SERVER);

type Message = Record<string, unknown>;
type State = { n: number; messages: Message[]; thread_override?: Record<string, Message[]> };
type LogEntry = { started?: boolean; cwd?: string; dataDir?: string | null; session?: string | null; tool?: string; method?: string | null; id?: unknown; params?: Record<string, unknown> | null; arguments?: Record<string, unknown>; response?: Record<string, unknown> };

let scenario = 0;
/** A fresh fake Inbox (own state, log and pid files) and an adapter that runs it. */
function fake(mode = '', overrides: Partial<InboxOptions> = {}) {
	const dir = join(root, `s${++scenario}`);
	mkdirSync(dir);
	const files = { state: join(dir, 'state.json'), log: join(dir, 'log.jsonl'), pid: join(dir, 'pid') };
	writeFileSync(files.state, JSON.stringify({ n: 0, messages: [] }));
	const env = { ...process.env, FAKE_STATE: files.state, FAKE_LOG: files.log, FAKE_PID: files.pid, FAKE_MODE: mode };
	const inbox = createQuestionInbox({ command: () => ({ file: process.execPath, args: [serverFile] }), timeoutMs: 15_000, exitGraceMs: 2_000, env, ...overrides });
	return {
		inbox,
		state: (): State => JSON.parse(readFileSync(files.state, 'utf8')),
		write: (s: State) => writeFileSync(files.state, JSON.stringify(s)),
		log: (): LogEntry[] => (existsSync(files.log) ? readFileSync(files.log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
		files,
		pids: (): number[] => readFileSync(files.pid, 'utf8').split('\n').filter(Boolean).map(Number),
		/** The person answers in the window: a reply to `replyTo`, appended to its thread. */
		personReplies(replyTo: string, body: string, extra: Message = {}) {
			const s: State = JSON.parse(readFileSync(files.state, 'utf8'));
			const parent = s.messages.find((m) => m.id === replyTo)!;
			s.n += 1;
			s.messages.push({ id: `msg_${s.n}`, project_id: 'proj_1', thread_id: parent.thread_id, reply_to: replyTo, author: { kind: 'person' }, subject: null, body, created_at: new Date(1e12 + s.n * 1000).toISOString(), resolved_at: null, idempotency_key: null, ...extra });
			writeFileSync(files.state, JSON.stringify(s));
			return `msg_${s.n}`;
		},
	};
}
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false; // ESRCH: the process is gone
	}
};
async function rejection(promise: Promise<unknown>): Promise<InboxError | Error | null> {
	try {
		await promise;
		return null;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
}
const asInbox = (e: Error | null) => (e instanceof InboxError ? e : null);
const post = (f: ReturnType<typeof fake>, key = 'q-1', body = ':::question\nWhich queue?\n:::') => f.inbox.post({ worktree, key, subject: 'Which queue', body });

try {
	// ── post: the handshake, the request, the answer
	{
		const f = fake();
		const got = await post(f);
		const log = f.log();
		const calls = log.filter((l) => l.method);
		check('post returns the message id as ref and the thread url', got.ref === 'msg_1' && got.url === 'http://localhost:1/#thread=msg_1', JSON.stringify(got));
		check('the session is initialize, initialized, one tools/call, in that order', calls.map((c) => c.method).join() === 'initialize,notifications/initialized,tools/call', calls.map((c) => c.method).join());
		check('initialize names a protocol version and a client', typeof calls[0]?.params?.protocolVersion === 'string' && (calls[0]?.params?.clientInfo as { name: string }).name === 'wf');
		check('the notification carries no id', calls[1]?.id === null);
		const args = log.find((l) => l.tool === 'send_message')?.arguments;
		check('send_message gets thread = key, idempotency_key = key, project_path = worktree, subject and body', JSON.stringify(args) === JSON.stringify({ body: ':::question\nWhich queue?\n:::', subject: 'Which queue', thread: 'q-1', idempotency_key: 'q-1', project_path: worktree }), JSON.stringify(args));
		check('the server runs in the worktree', log[0]?.cwd?.toLowerCase().replace(/\\/g, '/') === worktree.toLowerCase().replace(/\\/g, '/') || log[0]?.cwd === worktree, log[0]?.cwd);
		check('the process is gone when post returns', f.pids().every((p) => !alive(p)));
		check('it is a new thread, not a join', f.state().messages.length === 1);
	}
	// ── the same key again: the first message, not a second post
	{
		const f = fake();
		const first = await post(f);
		const second = await post(f);
		check('the same key and body answers with the first message', second.ref === first.ref && f.state().messages.length === 1);
		const changed = asInbox(await rejection(post(f, 'q-1', 'another body')));
		check('the same key with another body is refused with the Inbox\'s own code', changed?.reason === 'refused' && changed.code === 'idempotency_conflict', String(changed));
		check('...and nothing was posted', f.state().messages.length === 1);
		const other = await post(f, 'q-2');
		check('another key is a thread of its own', other.ref !== first.ref && other.url !== first.url && f.state().messages.length === 2);
		const named = await post(f, 'Q-1 ', 'a body for a key that only differs by case and spacing');
		check('thread names compare without case and spacing, so such a key joins the first thread (the Inbox refuses reuse only by idempotency key)', f.state().messages.find((m) => m.id === named.ref)?.thread_id === first.ref);
	}
	// ── key = thread name
	{
		const f = fake();
		const long = await post(f, 'k'.repeat(120));
		check('a 120-character key is a thread name', long.ref === 'msg_1');
		for (const [label, key] of [['empty', ''], ['blank', '   '], ['121 characters', 'k'.repeat(121)], ['a newline', 'a\nb']] as const) {
			const before = f.log().length;
			const e = asInbox(await rejection(post(f, key)));
			check(`a key with ${label} is refused before anything starts`, e?.reason === 'invalid-key' && f.log().length === before, String(e));
		}
	}
	// ── read: the person's latest word in the question's own reply tree, with its position
	{
		const f = fake();
		const a = await post(f, 'q-a');
		check('no answer yet reads as null', (await f.inbox.read({ worktree, ref: a.ref })) === null);
		const log = f.log();
		check('read_thread asks by message_id with project_path = worktree', JSON.stringify(log.find((l) => l.tool === 'read_thread')?.arguments) === JSON.stringify({ message_id: a.ref, project_path: worktree }));
		const answers = '\u201cShip it\u201d \u2713\n\nAnswers to your questions\n\n### Q1. Which queue? (line 1)\nAnswer: A dedicated retries queue (your recommendation)\nNote: after the sale  \n';
		const id = f.personReplies(a.ref, answers);
		const got = await f.inbox.read({ worktree, ref: a.ref });
		check('the reply text comes back exactly, form answers and trailing space included', got?.text === answers, JSON.stringify(got));
		check('ref is the reply own message id, sequence its zero-based position in the thread', got?.ref === id && got.sequence === 1, JSON.stringify(got));
		const again = await f.inbox.read({ worktree, ref: a.ref });
		check('reading again returns the same reply and sequence', again?.ref === id && again.sequence === 1);
		const fix = f.personReplies(a.ref, 'Actually, the jobs queue.');
		const latest = await f.inbox.read({ worktree, ref: a.ref });
		check('a later correction is the answer now, with a higher sequence', latest?.ref === fix && latest.text === 'Actually, the jobs queue.' && latest.sequence === 2 && latest.sequence > (got?.sequence ?? 0), JSON.stringify(latest));
	}
	{
		const f = fake();
		const a = await post(f, 'q-a');
		const partial = f.personReplies(a.ref, 'Skipped: Q1\nQ2 needs more context');
		const state = f.state();
		state.messages.push({ id: 'msg_90', thread_id: a.ref, reply_to: partial, author: { kind: 'agent', host: 'pi', session: 's', name: null }, body: 'Q2: which service?' });
		f.write(state);
		const mid = await f.inbox.read({ worktree, ref: a.ref });
		check('a partial or skipped reply is returned raw, and the agent clarification after it is not an answer', mid?.ref === partial && mid.text === 'Skipped: Q1\nQ2 needs more context' && mid.sequence === 1, JSON.stringify(mid));
		const clarified = f.personReplies('msg_90', 'The billing service.');
		const got = await f.inbox.read({ worktree, ref: a.ref });
		check('the person answer to the clarification (a reply to the agent reply) is the latest, sequence 3', got?.ref === clarified && got.text === 'The billing service.' && got.sequence === 3, JSON.stringify(got));
		const deeper = f.personReplies(clarified, 'and retries too');
		check('a reply to that reply, any depth down, counts', (await f.inbox.read({ worktree, ref: a.ref }))?.ref === deeper);
	}
	{
		const f = fake();
		const a = await post(f, 'q-a');
		const agentAfter = f.state();
		agentAfter.messages.push({ id: 'msg_90', thread_id: a.ref, reply_to: a.ref, author: { kind: 'agent', host: 'pi', session: 's', name: null }, body: 'agent follow-up' });
		f.write(agentAfter);
		check('the agent own message is not an answer', (await f.inbox.read({ worktree, ref: a.ref })) === null);
		f.personReplies(a.ref, 'Marked read', { set_aside: [`${a.ref}/q-1`] });
		f.personReplies(a.ref, 'Reopened', { reopened: [`${a.ref}/q-1`] });
		check('set-aside and reopened notes are replies by reply_to but not answers', (await f.inbox.read({ worktree, ref: a.ref })) === null);
		const s = f.state();
		s.messages.push({ id: 'msg_91', thread_id: a.ref, reply_to: null, author: { kind: 'person' }, body: 'a New message to the thread' });
		s.messages.push({ id: 'msg_92', thread_id: a.ref, reply_to: 'msg_unrelated', author: { kind: 'person' }, body: 'a reply to a message outside the question tree' });
		f.write(s);
		check('a person message that answers nothing, and one in another branch, are not answers', (await f.inbox.read({ worktree, ref: a.ref })) === null);
		const real = f.personReplies(a.ref, 'the answer');
		check('the answer is found among them', (await f.inbox.read({ worktree, ref: a.ref }))?.ref === real);
		f.personReplies(a.ref, 'Marked read again', { set_aside: [`${a.ref}/q-1`] });
		check('a note after the answer does not replace it', (await f.inbox.read({ worktree, ref: a.ref }))?.ref === real);
	}
	{
		// An old original with older chatter, and a second question in the same thread: only the original tree counts.
		const f = fake();
		const a = await post(f, 'q-a');
		const first = f.personReplies(a.ref, 'first answer');
		for (let i = 0; i < 5; i++) f.personReplies(a.ref, `note ${i}`, { set_aside: ['x'] });
		const s = f.state();
		s.messages.push({ id: 'msg_70', thread_id: a.ref, reply_to: null, author: { kind: 'agent', host: 'pi', session: 's', name: null }, body: 'a second, unrelated question in the same thread' });
		f.write(s);
		const branch = f.personReplies('msg_70', 'answer to the other question');
		const got = await f.inbox.read({ worktree, ref: a.ref });
		check('an answer in an unrelated branch is never taken, even as the latest message', got?.ref === first && got.sequence === 1, JSON.stringify(got));
		const second = await f.inbox.read({ worktree, ref: 'msg_70' });
		check('...and it is the answer of its own question', second?.ref === branch, JSON.stringify(second));
	}
	{
		const f = fake();
		const a = await post(f, 'q-a');
		const b = await post(f, 'q-b');
		f.personReplies(b.ref, 'answer to b');
		check('another thread\'s answer is not this thread\'s', (await f.inbox.read({ worktree, ref: a.ref })) === null && (await f.inbox.read({ worktree, ref: b.ref }))?.text === 'answer to b');
		// Defense in depth: a person reply that the thread lists BEFORE its original is not an answer to it.
		const s = f.state();
		const early = { id: 'msg_80', thread_id: a.ref, reply_to: a.ref, author: { kind: 'person' }, body: 'listed before the question' };
		s.thread_override = { [a.ref]: [early, ...s.messages.filter((m) => m.thread_id === a.ref)] };
		f.write(s);
		check('a reply listed before the original message is not an answer', (await f.inbox.read({ worktree, ref: a.ref })) === null);
		s.thread_override = { [a.ref]: s.messages.filter((m) => m.thread_id === a.ref).filter((m) => m.id !== a.ref) };
		f.write(s);
		const missing = asInbox(await rejection(f.inbox.read({ worktree, ref: a.ref })));
		check('a thread that does not hold the original is an unexpected reply, not "no answer"', missing?.reason === 'unexpected-reply', String(missing));
		const unknown = asInbox(await rejection(f.inbox.read({ worktree, ref: 'msg_404' })));
		check('an unknown ref is the Inbox\'s refusal', unknown?.reason === 'refused' && unknown.code === 'message_not_found', String(unknown));
	}
	// ── the environment is the user's own
	{
		const saved = { dir: process.env.PLANNOTATOR_DATA_DIR, session: process.env.PI_SESSION_ID };
		process.env.PLANNOTATOR_DATA_DIR = join(root, 'users-shared-inbox');
		process.env.PI_SESSION_ID = 'pi-session-7';
		try {
			const f = fake('', { env: undefined }); // env undefined: this process's environment, as it is at the call
			Object.assign(process.env, { FAKE_STATE: f.files.state, FAKE_LOG: f.files.log, FAKE_PID: f.files.pid, FAKE_MODE: '' });
			await post(f);
			const started = f.log()[0];
			check('the configured data dir and the session identity pass through untouched', started?.dataDir === process.env.PLANNOTATOR_DATA_DIR && started?.session === 'pi-session-7', JSON.stringify(started));
			delete process.env.PLANNOTATOR_DATA_DIR;
			const g = fake('', { env: undefined });
			Object.assign(process.env, { FAKE_STATE: g.files.state, FAKE_LOG: g.files.log, FAKE_PID: g.files.pid });
			await post(g);
			check('an unset data dir stays unset: nothing worktree-local is made up', g.log()[0]?.dataDir === null);
		} finally {
			for (const k of ['FAKE_STATE', 'FAKE_LOG', 'FAKE_PID', 'FAKE_MODE']) delete process.env[k];
			if (saved.dir === undefined) delete process.env.PLANNOTATOR_DATA_DIR;
			else process.env.PLANNOTATOR_DATA_DIR = saved.dir;
			if (saved.session === undefined) delete process.env.PI_SESSION_ID;
			else process.env.PI_SESSION_ID = saved.session;
		}
	}
	// ── protocol edges that still work
	{
		const f = fake('chunked,call-crlf');
		check('an answer split across writes, and CRLF line ends, are read', (await post(f)).ref === 'msg_1');
		const g = fake('call-interleave');
		check('a notification and server requests between answers do not derail the call', (await post(g)).ref === 'msg_1');
		const replies = g.log().filter((l) => l.response);
		const ping = replies.find((l) => l.response?.id === 'srv-1');
		const unknown = replies.find((l) => l.response?.id === 'srv-2');
		check('...a ping is answered, any other request is told it is not supported', JSON.stringify(ping?.response?.result) === '{}' && (unknown?.response?.error as { code: number } | undefined)?.code === -32601, JSON.stringify(replies));
		const noisy = fake('stderr-noise');
		const t0 = Date.now();
		check('200 KB of stderr noise is no problem for a call that succeeds', (await post(noisy)).ref === 'msg_1' && Date.now() - t0 < 10_000);
	}
	// ── failures: each one is an InboxError that says why, and leaves no process behind
	const failing = async (label: string, mode: string, reason: string, expectText: RegExp, overrides: Partial<InboxOptions> = {}, op: 'post' | 'read' = 'post') => {
		const f = fake(mode, overrides);
		const started = Date.now();
		let e: Error | null;
		if (op === 'post') e = await rejection(post(f));
		else {
			const state = f.state();
			state.messages.push({ id: 'msg_1', thread_id: 'msg_1', reply_to: null, author: { kind: 'agent', host: 'pi', session: 's', name: null }, body: 'q', resolved_at: null, thread_name: 'x' });
			f.write(state);
			e = await rejection(f.inbox.read({ worktree, ref: 'msg_1' }));
		}
		const inbox = asInbox(e);
		check(`${label}: InboxError '${reason}' starting "wf inbox:"`, inbox?.reason === reason && inbox.message.startsWith('wf inbox: '), String(e));
		check(`${label}: the message says why`, expectText.test(e?.message ?? ''), e?.message);
		check(`${label}: no process left behind`, existsSync(join(root, `s${scenario}`, 'pid')) ? f.pids().every((p) => !alive(p)) : true);
		return { f, elapsed: Date.now() - started, error: e };
	};
	await failing('a server that never answers initialize', 'init-hang', 'timeout', /no answer to initialize within 300 ms/, { timeoutMs: 300 });
	// 3 s, not 300 ms: the deadline covers the child's own start, and under aggregate load a 300 ms one expired at initialize (#173, 2026-10-19).
	const hung = await failing('a server that never answers the tool call', 'call-hang', 'timeout', /no answer to tools\/call within 3000 ms/, { timeoutMs: 3_000 });
	check('the deadline is the deadline (not the long default)', hung.elapsed < 8_000, `${hung.elapsed} ms`);
	await failing('a server that exits during initialize, with its reason on stderr', 'init-exit', 'exited', /exit code 2.*cannot open inbox registry/s);
	await failing('a server that dies in the tool call', 'call-exit', 'exited', /exit code 3.*segfault in inbox store/s);
	await failing('initialize rejected by JSON-RPC', 'init-error', 'protocol', /rejected initialize: -32600 unsupported protocol/);
	await failing('tools/call rejected by JSON-RPC', 'call-error', 'protocol', /rejected tools\/call send_message: -32602 Invalid params/);
	await failing('an answer to a request that was not made', 'call-wrong-id', 'protocol', /answered request 99/);
	await failing('a non-JSON line on stdout', 'call-garbage', 'protocol', /not JSON-RPC: Listening on/);
	await failing('JSON that is not JSON-RPC', 'call-not-json-rpc', 'protocol', /not JSON-RPC/);
	await failing('a result without structuredContent', 'call-no-structured', 'protocol', /without structuredContent/);
	await failing('send_message answering a message_id that is not a string', 'call-bad-shape', 'unexpected-reply', /message_id and url/);
	await failing('read_thread answering a message without a body', 'call-bad-thread', 'unexpected-reply', /no id, author and body/, {}, 'read');
	const refused = await failing('a tool the Inbox refuses', 'call-refuse', 'refused', /internal_error: disk full/);
	check('a refusal carries the Inbox\'s code', asInbox(refused.error)?.code === 'internal_error');
	const wedged = await failing('stderr noise before a failure', 'stderr-noise,call-exit', 'exited', /exit code 3/);
	check('...is bounded in the message (2 KB of it, not 200 KB)', (wedged.error?.message.length ?? 0) < 3_500, String(wedged.error?.message.length));
	// a process that lingers after a good answer is reaped, after the grace
	{
		const f = fake('call-linger', { exitGraceMs: 150 });
		const got = await post(f);
		check('a process that ignores the end of stdin is killed after the grace, and the answer still stands', got.ref === 'msg_1' && f.pids().every((p) => !alive(p)));
	}
	// start failures
	{
		const missing = createQuestionInbox({ command: () => ({ file: join(root, 'no-such-plannotator'), args: ['inbox', 'mcp'] }), timeoutMs: 5_000, exitGraceMs: 100 });
		const e = asInbox(await rejection(missing.post({ worktree, key: 'k', subject: 's', body: 'b' })));
		check('a binary that cannot be started is a start-failed that names it', e?.reason === 'start-failed' && e.message.includes('no-such-plannotator'), String(e));
		const noFolder = fake();
		const e2 = asInbox(await rejection(noFolder.inbox.post({ worktree: join(root, 'no-such-worktree'), key: 'k', subject: 's', body: 'b' })));
		check('a worktree that does not exist is a start-failed that names it', e2?.reason === 'start-failed' && e2.message.includes('no-such-worktree'), String(e2));
	}
	// ── the real adapter's own unavailability: no start, a diagnostic that says what to do
	{
		const saved = { disable: process.env.PLANNOTATOR_DISABLE, path: process.env.PATH, local: process.env.LOCALAPPDATA, Path: process.env.Path };
		const restore = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
		try {
			process.env.PLANNOTATOR_DISABLE = '1';
			const d = asInbox(await rejection(questionInbox.post({ worktree, key: 'k', subject: 's', body: 'b' })));
			check('PLANNOTATOR_DISABLE=1: post throws, naming the variable and that nothing was posted', d?.reason === 'unavailable' && /PLANNOTATOR_DISABLE=1/.test(d.message) && /question was not posted/.test(d.message) && d.message.startsWith('wf inbox: '), String(d));
			const dr = asInbox(await rejection(questionInbox.read({ worktree, ref: 'msg_1' })));
			check('...and read throws too, without claiming a post was skipped', dr?.reason === 'unavailable' && /Inbox was not read/.test(dr.message) && !/not posted/.test(dr.message), String(dr));
			delete process.env.PLANNOTATOR_DISABLE;
			const empty = join(root, 'empty-path');
			mkdirSync(empty);
			process.env.PATH = empty;
			process.env.Path = empty;
			process.env.LOCALAPPDATA = empty;
			const n = asInbox(await rejection(questionInbox.post({ worktree, key: 'k', subject: 's', body: 'b' })));
			check('no plannotator anywhere: post throws, saying so', n?.reason === 'unavailable' && /not on PATH or installed/.test(n.message), String(n));
		} finally {
			restore('PLANNOTATOR_DISABLE', saved.disable);
			restore('PATH', saved.path);
			restore('Path', saved.Path);
			restore('LOCALAPPDATA', saved.local);
		}
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
