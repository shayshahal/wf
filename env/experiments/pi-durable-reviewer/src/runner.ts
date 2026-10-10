// runner.ts — the one owning process: opens the durable storage, resumes unfinished work, runs the
// read-only review, and serves the local terminal channel (issue #116).
//
// Start it in a foreground terminal; inspect or steer it from another terminal with cli.ts, or type
// the same commands into its own stdin when it is a TTY. Kill it abruptly and start it again with the
// same --storage: the same conversation and submission are recovered, no review is submitted twice.
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage, FauxResponseStep, Message } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import {
	createRegistry,
	Harness,
	InboxDoc,
	LiveDoc,
	watchEvents,
} from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { serveControl, socketPathFor, type ControlRequest, type ControlResponse } from './control.ts';
import { identityOf, type ReviewTarget } from './identity.ts';
import { acquireOwnerLock } from './owner-lock.ts';
import { assertOutsideRoots } from './path-safety.ts';
// The wf checkout that holds this experiment: storage inside it would be erased by worktree cleanup
// or committed with the experiment. The env may import the kit, never the other way round.
import { WF_ROOT } from '../../../../src/paths.ts';
import {
	createReviewerExtension,
	ensureReviewTarget,
	ReviewDoc,
	reviewPrompt,
	targetIsStale,
	type CaptureOptions,
} from './reviewer.ts';

const context = BACKGROUND_CONTEXT;

function parseFlags(argv: string[]): Record<string, string | boolean> {
	const flags: Record<string, string | boolean> = {};
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index]!;
		if (!token.startsWith('--')) continue;
		const name = token.slice(2);
		const next = argv[index + 1];
		if (next === undefined || next.startsWith('--')) {
			flags[name] = true;
		} else {
			flags[name] = next;
			index++;
		}
	}
	return flags;
}

function required(flags: Record<string, string | boolean>, name: string): string {
	const value = flags[name];
	if (typeof value !== 'string' || value === '') throw new Error(`--${name} is required`);
	return value;
}

function print(line: string): void {
	process.stdout.write(`${line}\n`);
}

function contentText(content: Message['content']): string {
	if (typeof content === 'string') return content;
	return content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

function assistantText(message: AssistantMessage | undefined): string {
	return (message?.content ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
}

function formatEntry(entry: { kind: string; model?: readonly Message[] }): string {
	const message = entry.model?.[0];
	if (message === undefined) return `[${entry.kind}]`;
	if (message.role === 'user') return `> ${contentText(message.content)}`;
	if (message.role === 'assistant') {
		const calls = message.content
			.flatMap((part) => (part.type === 'toolCall' ? [`${part.name}(${JSON.stringify(part.arguments)})`] : []))
			.join(' ');
		const text = assistantText(message);
		return `assistant: ${text}${calls === '' ? '' : ` [calls ${calls}]`}`;
	}
	if (message.role === 'toolResult') return `tool ${message.toolName}: ${contentText(message.content).slice(0, 400)}`;
	return `[${entry.kind}]`;
}

const flags = parseFlags(process.argv.slice(2));
const worktree = resolve(required(flags, 'worktree'));
const agreementPath = resolve(required(flags, 'agreement'));
const base = typeof flags.base === 'string' ? flags.base : 'HEAD';
const provider = typeof flags.provider === 'string' ? flags.provider : 'opencode-go';
const probes = flags.probes === true;
// Never switch models silently: the default is the pinned experiment model, and it is printed below.
const modelId = typeof flags.model === 'string' ? flags.model : provider === 'faux' ? 'faux-1' : 'deepseek-v4.1-flash';
const captureOptions: CaptureOptions = { worktree, base, agreementPath };

// Storage must live outside the reviewed checkout and the wf checkout that holds this experiment:
// worktree cleanup must not erase it, and it must not be committed with the experiment. Symlinks are
// followed, and the check runs before the directory or the SQLite database is created.
const storageDir = assertOutsideRoots(resolve(required(flags, 'storage')), [worktree, WF_ROOT], 'storage');
mkdirSync(storageDir, { recursive: true });
let lock: ReturnType<typeof acquireOwnerLock>;
try {
	lock = acquireOwnerLock(storageDir);
} catch (error) {
	// A live owner already holds this storage: refuse loudly instead of opening it as a second writer.
	console.error(`owner: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}

const models = createModels();
let faux: ReturnType<typeof fauxProvider> | undefined;
if (provider === 'faux') {
	faux = fauxProvider({ models: [{ id: 'faux-1' }] });
	models.setProvider(faux.provider);
} else if (provider === 'opencode-go') {
	models.setProvider(opencodeGoProvider());
} else {
	throw new Error(`unknown --provider ${provider} (expected faux or opencode-go)`);
}

const extension = createReviewerExtension({ probes });
const registry = createRegistry();
registry.install(extension);

const harness = await Harness.open(
	await openNodeSqliteStorage(resolve(storageDir, 'review.sqlite')),
	{
		models,
		registry,
		env: ({ cwd = worktree }) => new NodeExecutionEnv({ cwd }),
		settings: { contextRetentionMs: 0 },
	},
	context,
);
const root = await harness.root(context);
await root.configure(
	{
		model: { provider, modelId },
		extensions: [extension],
		tools: extension.tools,
		cwd: worktree,
	},
	context,
);
let target: ReviewTarget;
try {
	target = await ensureReviewTarget(harness, root, captureOptions, context);
} catch (error) {
	// An unreadable repository or base ref refuses the review instead of reviewing an error string.
	console.error(`capture: ${error instanceof Error ? error.message : String(error)}`);
	lock.release();
	process.exit(1);
}

if (faux !== undefined) {
	const router: FauxResponseStep = (request) => {
		const toolResults = request.messages.filter((message) => message.role === 'toolResult');
		if (toolResults.length === 0) {
			return fauxAssistantMessage([fauxToolCall('read', { path: 'src/target.ts' })], { stopReason: 'toolUse' });
		}
		if (toolResults.length === 1) {
			return fauxAssistantMessage([fauxToolCall('probe_unsafe', { holdMs: 15_000 })], { stopReason: 'toolUse' });
		}
		return fauxAssistantMessage(
			`Reviewed ${target.requestId}: src/target.ts does not handle a missing user. No further findings.`,
		);
	};
	faux.setResponses(Array.from({ length: 64 }, () => router));
}

print(`owner pid ${process.pid} storage ${storageDir}`);
print(`model ${provider}/${modelId}`);
print(`review ${target.requestId} head ${target.headSha.slice(0, 12)} diff ${target.diffHash.slice(0, 12)}`);

const stream = await watchEvents(harness, root.id, context);
stream.start(async (events) => {
	for (const event of events) {
		if (event.type === 'tool_execution_start') print(`event tool_execution_start ${event.toolName}`);
		else if (event.type === 'tool_execution_end') print(`event tool_execution_end ${event.toolName}${event.entry === undefined ? ' interrupted' : ''}`);
		else if (event.type === 'run_start') print('event run_start');
		else if (event.type === 'run_end') print('event run_end');
		else if (event.type === 'task_failed') print(`event task_failed ${event.kind} ${event.message}`);
		else if (event.type === 'message_end' && event.entry.model?.[0]?.role === 'assistant') {
			const text = assistantText(event.entry.model[0] as AssistantMessage);
			if (text !== '') print(`assistant ${text}`);
		}
	}
});

let submission: Awaited<ReturnType<typeof root.submit>> | undefined;
let control: Awaited<ReturnType<typeof serveControl>> | undefined;
let stopping = false;

async function answerText(): Promise<string | undefined> {
	if (submission === undefined) return undefined;
	const record = await submission.status(context);
	if (record.status !== 'done' || record.answer === undefined) return undefined;
	const page = await root.entries({}, 200, undefined, context);
	const entry = page.items.find((each) => each.id === record.answer);
	return entry?.model?.[0]?.role === 'assistant' ? assistantText(entry.model[0] as AssistantMessage) : undefined;
}

async function statusResponse(): Promise<ControlResponse> {
	const live = await harness.snapshot(LiveDoc, root.id, context);
	const inbox = await harness.snapshot(InboxDoc, root.id, context);
	const record = submission === undefined ? undefined : await submission.status(context);
	return {
		ok: true,
		conversationId: root.id,
		busy: live?.run !== undefined,
		submission: record ?? null,
		queued: inbox?.items.length ?? 0,
		model: `${provider}/${modelId}`,
		identity: identityOf(target),
		stale: targetIsStale(target, captureOptions),
	};
}

async function stop(): Promise<void> {
	if (stopping) return;
	stopping = true;
	try {
		await control?.close();
	} catch (error) {
		// The server is already closed; nothing left to release.
		if (error instanceof Error) print(`stop: control close: ${error.message}`);
	}
	try {
		await stream.stop();
	} catch (error) {
		// The watch ended with the run; stop() then has nothing to do.
		if (error instanceof Error) print(`stop: watch: ${error.message}`);
	}
	try {
		await harness.close(context);
	} catch (error) {
		// Storage was already sealed; the process is exiting anyway.
		if (error instanceof Error) print(`stop: close: ${error.message}`);
	}
	lock.release();
	process.exit(0);
}

const handler = async (request: ControlRequest): Promise<ControlResponse> => {
	switch (request.cmd) {
		case 'ping':
			return { ok: true, pid: process.pid };
		case 'status':
			return await statusResponse();
		case 'transcript': {
			const limit = Math.min(500, Math.max(1, Math.trunc(Number(request.limit ?? 40))));
			const page = await root.entries({}, limit, undefined, context);
			return { ok: true, entries: [...page.items].reverse().map(formatEntry) };
		}
		case 'steer': {
			const text = String(request.text ?? '');
			if (text === '') return { ok: false, error: 'steer needs text' };
			const live = await harness.snapshot(LiveDoc, root.id, context);
			if (live?.run === undefined) return { ok: false, error: 'owner is idle; steering applies to a running review' };
			// A unique ID per request keeps two intentional identical steers distinct instead of silently
			// returning the first submission as if it were queued again.
			const steerRequestId = `steer:${randomUUID()}`;
			const steer = await root.submit({ type: 'input', content: text, whenBusy: 'steer', requestId: steerRequestId }, context);
			return { ok: true, submissionId: steer.id, requestId: steerRequestId };
		}
		case 'result': {
			const answer = await answerText();
			const record = submission === undefined ? undefined : await submission.status(context);
			return {
				ok: true,
				identity: identityOf(target),
				stale: targetIsStale(target, captureOptions),
				status: record?.status ?? 'unknown',
				answer: answer ?? null,
			};
		}
		case 'stop':
			void stop();
			return { ok: true, stopping: true };
		default:
			return { ok: false, error: `unknown command ${request.cmd}` };
	}
};

control = await serveControl(socketPathFor(storageDir), handler);
print(`control ${socketPathFor(storageDir)}`);

// The same commands from the owner's own foreground terminal, when it has one.
if (process.stdin.isTTY) {
	process.stdin.setEncoding('utf8');
	let buffer = '';
	process.stdin.on('data', (chunk: string) => {
		buffer += chunk;
		for (;;) {
			const index = buffer.indexOf('\n');
			if (index < 0) break;
			const line = buffer.slice(0, index).trim();
			buffer = buffer.slice(index + 1);
			if (line === '') continue;
			const [cmd, ...rest] = line.split(/\s+/);
			const request: ControlRequest = cmd === 'steer' ? { cmd: 'steer', text: rest.join(' ') } : { cmd: cmd! };
			void handler(request).then((response) => print(JSON.stringify(response)));
		}
	});
}

harness.resume();
submission = await root.submit({ type: 'input', content: reviewPrompt(target), requestId: target.requestId }, context);
await root.commit(async (tx) => {
	(await tx.doc(ReviewDoc, root.id)).submissionId = submission!.id;
}, context);
print(`submission ${submission.id} request ${target.requestId}`);

const settled = await submission.wait(context);
print(`settled ${settled.status}${settled.status === 'unanswered' ? ` ${settled.reason}` : ''}`);
if (settled.status === 'done') {
	const answer = await answerText();
	if (answer !== undefined) print(`result ${answer}`);
}
print('ready');

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

// Keep the owner alive for inspection and steering until `stop`, Ctrl-C, or an abrupt kill.
await new Promise<void>(() => {});
