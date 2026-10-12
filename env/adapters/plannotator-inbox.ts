// Plannotator Inbox adapter: the kit's QuestionInbox (seams.ts) over `plannotator inbox mcp`, the
// stdio MCP server of Plannotator's shared Inbox. One short-lived process per call: initialize,
// notifications/initialized, one tools/call, then the process is ended and reaped. Stdout is the
// protocol and nothing else (newline-delimited JSON-RPC): this module never writes to wf's own
// stdout or stderr, a server's stderr is kept (last 2 KB) only to say why a call failed.
//
// The Inbox is shared, so the data dir is whatever the user configured: unlike the review adapter
// (plannotator.ts), this one never sets PLANNOTATOR_DATA_DIR. The stdio server takes its identity
// (agent_session, agent_host) from the Pi or Claude session it runs inside; nothing is faked here.
//
// Upstream contract read from backnotprop/plannotator main (2026-10-12):
//   packages/server/inbox-mcp.ts, packages/core/inbox-types.ts, packages/shared/inbox/store.ts.
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { QuestionInbox } from '../../src/seams.ts';
import { plannotatorBin } from './plannotator.ts';

/** Why a call failed, as a tag a caller can branch on without matching message text. */
export type InboxErrorReason =
	| 'unavailable' // Plannotator is disabled or not installed: nothing was started
	| 'invalid-key' // the question key cannot be a thread name: nothing was started
	| 'start-failed' // the process could not be started
	| 'timeout' // no answer within the deadline; the process was killed
	| 'exited' // the process ended before it answered
	| 'protocol' // the server said something that is not the MCP it should speak
	| 'refused' // a tool call the Inbox refused (`<code>: <message>`)
	| 'unexpected-reply'; // the Inbox answered, but not with what this adapter relies on

/** A failed Inbox call. Every message starts "wf inbox:" so a log line leads back here. */
export class InboxError extends Error {
	readonly _tag = 'InboxError' as const;
	readonly reason: InboxErrorReason;
	/** The Inbox's own refusal code (`idempotency_conflict`, ...), when reason is 'refused'. */
	readonly code: string | null;
	constructor(reason: InboxErrorReason, message: string, code: string | null = null, options: { cause?: unknown } = {}) {
		super(`wf inbox: ${message}`, options);
		this.name = 'InboxError';
		this.reason = reason;
		this.code = code;
	}
}

export type InboxOperation = 'post' | 'read';

/** The executable and arguments that speak the Inbox's stdio MCP. */
export type InboxCommand = { file: string; args: string[] };
export type InboxOptions = {
	/** Finds what to run, or throws an InboxError('unavailable') that says why it cannot. */
	command: (operation: InboxOperation) => InboxCommand;
	/** The deadline for one whole call (start, handshake, tool call). */
	timeoutMs: number;
	/** How long a finished process may take to exit on its own once stdin closes, before it is killed. */
	exitGraceMs: number;
	/** The child's environment. Default: this process's, as it is at the call. */
	env?: NodeJS.ProcessEnv;
};

// A Plannotator thread name is 1-120 characters on one line (INBOX_THREAD_NAME_MAX upstream). The
// question's key is its thread name, so a key that would not be a name is refused here, by name,
// instead of by whatever the server does with it.
const THREAD_NAME_MAX = 120;
const STDERR_KEPT = 2000;
const STDOUT_BUFFER_MAX = 16 * 1024 * 1024;
const PROTOCOL_VERSION = '2025-06-18';

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

// ── what the server says on stdout

type Incoming =
	| { kind: 'result'; id: unknown; result: unknown }
	| { kind: 'failure'; id: unknown; text: string }
	| { kind: 'request'; id: string | number; method: string }
	| { kind: 'notification' };

/** One stdout line as a JSON-RPC message, or null when it is not one. */
function parseIncoming(line: string): Incoming | null {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return null; // not JSON: the caller reports the line
	}
	if (!isRecord(value) || value.jsonrpc !== '2.0') return null;
	const { id, method } = value;
	if (typeof method === 'string') {
		if (id === undefined) return { kind: 'notification' };
		return typeof id === 'string' || typeof id === 'number' ? { kind: 'request', id, method } : null;
	}
	if (id === undefined) return null;
	if (isRecord(value.error)) {
		const { code, message } = value.error;
		return { kind: 'failure', id, text: `${String(code)} ${typeof message === 'string' ? message : '(no message)'}` };
	}
	return 'result' in value ? { kind: 'result', id, result: value.result } : null;
}

/** A tools/call result as its structuredContent, or why it is not one. */
function parseToolResult(result: unknown, tool: string): Json {
	if (!isRecord(result)) throw new InboxError('protocol', `${tool} answered with a result that is not an object`);
	if (result.isError === true) {
		const first = Array.isArray(result.content) ? result.content.find((c: unknown) => isRecord(c) && typeof c.text === 'string') : undefined;
		const text = isRecord(first) && typeof first.text === 'string' ? first.text : '(no message)';
		// The Inbox's refusals read `<snake_code>: <message>`.
		const code = /^([a-z][a-z0-9_]*): /.exec(text)?.[1] ?? null;
		throw new InboxError('refused', `the Inbox refused ${tool}: ${text}`, code);
	}
	if (!isRecord(result.structuredContent)) throw new InboxError('protocol', `${tool} answered without structuredContent`);
	return result.structuredContent;
}

// ── one call

function describeExit(code: number | null, signal: NodeJS.Signals | null) {
	return signal ? `signal ${signal}` : `exit code ${String(code)}`;
}

/** Runs `tool` once through a fresh `plannotator inbox mcp` and returns its structuredContent. */
async function callTool(options: InboxOptions, operation: InboxOperation, worktree: string, tool: string, args: Json): Promise<Json> {
	const { file, args: argv } = options.command(operation);
	return new Promise<Json>((resolve, reject) => {
		let child: ChildProcessWithoutNullStreams;
		try {
			child = spawn(file, argv, { cwd: worktree, env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
		} catch (cause) {
			reject(new InboxError('start-failed', `could not start ${file} in ${worktree}: ${cause instanceof Error ? cause.message : 'unknown error'}`, null, { cause }));
			return;
		}
		// Never resolves for a process that did not start (no pid, no exit event).
		const exited = new Promise<void>((done) => (child.pid === undefined ? done() : child.once('exit', () => done())));
		let phase: 'initialize' | 'tools/call' = 'initialize';
		let settled = false;
		let buffer = '';
		let stderrTail = '';
		const where = () => `${file} ${argv.join(' ')} (cwd ${worktree})`;
		const withStderr = (text: string) => (stderrTail.trim() ? `${text}; its stderr ended: ${stderrTail.trim()}` : text);

		// A call is over once the process is gone: the success path closes stdin and waits for it to
		// exit, every failure path kills it. The answer is delivered after that, so a caller never
		// holds a result while a process of this call still runs.
		const settle = (outcome: { ok: true; value: Json } | { ok: false; error: InboxError }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.stdout.destroy();
			child.stderr.destroy();
			let grace: NodeJS.Timeout | undefined;
			if (outcome.ok) {
				child.stdin.end();
				grace = setTimeout(() => child.kill('SIGKILL'), options.exitGraceMs);
			} else {
				child.kill('SIGKILL');
				child.stdin.destroy();
			}
			void exited.then(() => {
				clearTimeout(grace);
				if (outcome.ok) resolve(outcome.value);
				else reject(outcome.error);
			});
		};
		const fail = (reason: InboxErrorReason, message: string, cause?: unknown) => settle({ ok: false, error: new InboxError(reason, message, null, { cause }) });
		const send = (message: Json) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

		const timer = setTimeout(() => fail('timeout', withStderr(`${tool}: no answer to ${phase} within ${options.timeoutMs} ms from ${where()}; killed it`)), options.timeoutMs);

		const handle = (line: string) => {
			const message = parseIncoming(line);
			if (!message) return fail('protocol', withStderr(`${where()} wrote a line to stdout that is not JSON-RPC: ${line.slice(0, 200)}`));
			if (message.kind === 'notification') return; // e.g. tools/list_changed: nothing waits on it
			if (message.kind === 'request') {
				// A server may ask the client something between answers; ping is the only one with an answer.
				return message.method === 'ping'
					? send({ id: message.id, result: {} })
					: send({ id: message.id, error: { code: -32601, message: `method not supported: ${message.method}` } });
			}
			const expected = phase === 'initialize' ? 1 : 2;
			if (message.id !== expected) return fail('protocol', withStderr(`${where()} answered request ${String(message.id)} while ${phase} (id ${expected}) was waiting`));
			if (message.kind === 'failure') return fail('protocol', withStderr(`${where()} rejected ${phase === 'initialize' ? 'initialize' : `tools/call ${tool}`}: ${message.text}`));
			if (phase === 'initialize') {
				if (!isRecord(message.result)) return fail('protocol', withStderr(`${where()} answered initialize with a result that is not an object`));
				phase = 'tools/call';
				send({ method: 'notifications/initialized' });
				send({ id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
				return;
			}
			try {
				settle({ ok: true, value: parseToolResult(message.result, tool) });
			} catch (error) {
				settle({ ok: false, error: error instanceof InboxError ? error : new InboxError('protocol', `${tool} result could not be read: ${error instanceof Error ? error.message : 'unknown error'}`, null, { cause: error }) });
			}
		};

		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			buffer += chunk;
			for (let end = buffer.indexOf('\n'); end >= 0 && !settled; end = buffer.indexOf('\n')) {
				const line = buffer.slice(0, end).replace(/\r$/, '');
				buffer = buffer.slice(end + 1);
				if (line.trim()) handle(line);
			}
			if (buffer.length > STDOUT_BUFFER_MAX) fail('protocol', `${where()} wrote more than ${STDOUT_BUFFER_MAX} bytes without a newline`);
		});
		child.stderr.on('data', (chunk: string) => {
			stderrTail = (stderrTail + chunk).slice(-STDERR_KEPT);
		});
		child.on('error', (cause) => fail('start-failed', `could not start ${where()}: ${cause.message}`, cause));
		// The pipes of a process that is going away fail with EPIPE; the call's outcome is already
		// decided by then, or the exit event decides it.
		child.stdin.on('error', () => undefined);
		child.stdout.on('error', () => undefined);
		child.stderr.on('error', () => undefined);
		child.on('close', (code, signal) => {
			if (settled) return;
			if (buffer.trim()) handle(buffer.replace(/\r$/, '')); // a last line the server did not end
			if (!settled) fail('exited', withStderr(`${where()} ended (${describeExit(code, signal)}) before answering ${phase}`));
		});

		send({ id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'wf', version: '1' } } });
	});
}

// ── what send_message and read_thread return

function parseSent(content: Json): { ref: string; url: string } {
	const { message_id: ref, url } = content;
	if (typeof ref !== 'string' || !ref || typeof url !== 'string' || !url) {
		throw new InboxError('unexpected-reply', 'send_message answered without a message_id and url');
	}
	return { ref, url };
}

type ThreadMessage = { id: string; person: boolean; replyTo: string | null; body: string; note: boolean };

function parseThreadMessage(value: unknown): ThreadMessage {
	if (!isRecord(value) || typeof value.id !== 'string' || typeof value.body !== 'string' || !isRecord(value.author) || typeof value.author.kind !== 'string') {
		throw new InboxError('unexpected-reply', 'read_thread answered with a message that has no id, author and body');
	}
	const { reply_to: replyTo } = value;
	if (replyTo !== undefined && replyTo !== null && typeof replyTo !== 'string') {
		throw new InboxError('unexpected-reply', `read_thread answered message ${value.id} with a reply_to that is not an id`);
	}
	// A Mark read on the person's side adds notes that say a question was set aside or reopened. They are
	// replies to the asking message by reply_to, but they answer nothing.
	const note = [value.set_aside, value.reopened].some((ids) => Array.isArray(ids) && ids.length > 0);
	return { id: value.id, person: value.author.kind === 'person', replyTo: replyTo ?? null, body: value.body, note };
}

function parseThread(content: Json): ThreadMessage[] {
	const { thread } = content;
	if (!isRecord(thread) || !Array.isArray(thread.messages)) throw new InboxError('unexpected-reply', 'read_thread answered without a thread and its messages');
	return thread.messages.map(parseThreadMessage);
}

/**
 * The person's latest word on question `ref`, with its zero-based position in the thread. The thread is
 * walked from the original down its reply_to ancestry (a reply to the question, a clarification the
 * agent posted as a reply, the person's answer to that, ...); a message whose parent is outside that
 * tree is another branch and is ignored. The latest person message in the tree wins: core shows a
 * correction made while the question is still open, and never reopens an answered one (it keeps the
 * highest sequence it has seen). Notes (set aside, reopened) answer nothing. The text is the raw body.
 */
function answerTo(messages: ThreadMessage[], ref: string): { ref: string; text: string; sequence: number } | null {
	const asked = messages.findIndex((m) => m.id === ref);
	if (asked < 0) throw new InboxError('unexpected-reply', `read_thread's thread does not contain message ${ref}`);
	const tree = new Set([ref]);
	let latest: { ref: string; text: string; sequence: number } | null = null;
	for (let sequence = asked + 1; sequence < messages.length; sequence++) {
		const m = messages[sequence]!;
		if (m.replyTo === null || !tree.has(m.replyTo)) continue;
		tree.add(m.id);
		if (m.person && !m.note) latest = { ref: m.id, text: m.body, sequence };
	}
	return latest;
}

function assertThreadName(key: string) {
	if (key.trim() === '' || key.length > THREAD_NAME_MAX || /[\r\n]/.test(key)) {
		throw new InboxError('invalid-key', `a question key is its thread name: 1-${THREAD_NAME_MAX} characters on one line, got ${JSON.stringify(key.length > 40 ? `${key.slice(0, 40)}…` : key)} (${key.length} characters)`);
	}
}

/** A QuestionInbox over the given command. Exported for the selfcheck, which runs a fake server. */
export function createQuestionInbox(options: InboxOptions): QuestionInbox {
	return {
		async post({ worktree, key, subject, body }) {
			assertThreadName(key);
			// thread = key: one question, one thread of its own, joined again by the same key. The idempotency
			// key makes a retried post answer with the first message instead of posting twice.
			const content = await callTool(options, 'post', worktree, 'send_message', { body, subject, thread: key, idempotency_key: key, project_path: worktree });
			return parseSent(content);
		},
		async read({ worktree, ref }) {
			const content = await callTool(options, 'read', worktree, 'read_thread', { message_id: ref, project_path: worktree });
			return answerTo(parseThread(content), ref);
		},
	};
}

function plannotatorInboxCommand(operation: InboxOperation): InboxCommand {
	const effect = operation === 'post' ? 'the question was not posted' : 'the Inbox was not read';
	if (process.env.PLANNOTATOR_DISABLE === '1') {
		throw new InboxError('unavailable', `Plannotator is disabled (PLANNOTATOR_DISABLE=1), so ${effect}. Unset it to use the Inbox.`);
	}
	const file = plannotatorBin();
	if (file === null) {
		throw new InboxError('unavailable', `plannotator is not on PATH or installed, so ${effect}. Install Plannotator to use the Inbox.`);
	}
	return { file, args: ['inbox', 'mcp'] };
}

// 30 s: a call starts the Inbox in the background when it is stopped, which takes seconds, not tens.
export const questionInbox: QuestionInbox = createQuestionInbox({ command: plannotatorInboxCommand, timeoutMs: 30_000, exitGraceMs: 1000 });
