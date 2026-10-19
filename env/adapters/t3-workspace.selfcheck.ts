// Only a local HTTP MCP fixture: no real T3 server, credentials, cwd binding or tool writes.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders, ServerResponse } from 'node:http';
import { readT3BoundWorkspace } from './t3-workspace.ts';
import type { T3BoundWorkspace, T3WorkspaceUnavailable } from './t3-workspace.ts';

const VERSION = '2025-06-18';
const TOKEN = 'fixture-thread-secret';
const SESSION = 'fixture-session-secret';
const ROOT = '/fixture/project';
const WORKTREE = '/fixture/other-thread-worktree';
const status = { attached: true, worktreePath: WORKTREE, branch: 'fix/bound-thread', projectWorkspaceRoot: ROOT, defaultStartFromOrigin: false };
const initResult = { protocolVersion: VERSION, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
const toolResult = { isError: false, structuredContent: status, content: [{ type: 'text', text: JSON.stringify(status) }] };
const envelope = (id: number, result: unknown) => ({ jsonrpc: '2.0', id, result });
type Stage = 'initialize' | 'notifications/initialized' | 'tools/call';
type RequestRecord = { method: string | undefined; headers: IncomingHttpHeaders; body: unknown };
type ReplyOverride = (stage: Stage, response: ServerResponse) => boolean;

function json(response: ServerResponse, value: unknown) {
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify(value));
}

async function fixture(run: (endpoint: string, requests: RequestRecord[]) => Promise<void>, options: {
	authorization?: string;
	format?: 'json' | 'sse';
	override?: ReplyOverride;
} = {}) {
	const requests: RequestRecord[] = [];
	const violations: string[] = [];
	const stages: Stage[] = ['initialize', 'notifications/initialized', 'tools/call'];
	const server = createServer(async (request, response) => {
		try {
			let text = '';
			for await (const chunk of request) text += chunk;
			const body: unknown = JSON.parse(text);
			requests.push({ method: request.method, headers: request.headers, body });
			const stage = stages[requests.length - 1];
			assert.ok(stage, 'at most initialize, notification, one status tool call');
			assert.equal(request.method, 'POST', 'no DELETE (including session cleanup), GET or mutation transport');
			assert.equal(request.url, '/mcp?thread=fixture-endpoint-secret');
			assert.equal(request.headers.authorization, options.authorization ?? `Bearer ${TOKEN}`);
			assert.equal(request.headers['content-type'], 'application/json');
			assert.equal(request.headers.accept, 'application/json, text/event-stream');
			if (stage === 'initialize') {
				assert.equal(request.headers['mcp-protocol-version'], undefined);
				assert.equal(request.headers['mcp-session-id'], undefined);
				assert.deepEqual(body, { jsonrpc: '2.0', id: 1, method: stage, params: { protocolVersion: VERSION, capabilities: {}, clientInfo: { name: 'wf', version: '1' } } });
				response.setHeader('mcp-session-id', SESSION);
			} else {
				assert.equal(request.headers['mcp-protocol-version'], VERSION);
				assert.equal(request.headers['mcp-session-id'], SESSION);
				assert.deepEqual(body, stage === 'notifications/initialized'
					? { jsonrpc: '2.0', method: stage, params: {} }
					: { jsonrpc: '2.0', id: 2, method: stage, params: { name: 't3_worktree_status', arguments: {} } });
			}
			if (options.override?.(stage, response)) return;
			if (stage === 'notifications/initialized') { response.writeHead(202); response.end(); return; }
			const reply = envelope(stage === 'initialize' ? 1 : 2, stage === 'initialize' ? initResult : toolResult);
			if (options.format !== 'sse') { json(response, reply); return; }
			response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
			// Multiple events, CRLF, multiline data and chunked delivery; keep the stream
			// open after the response. A reader waiting for EOF would time out here.
			response.write(': keepalive\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/message","params":{"text":"café"}}\r\n\r\n');
			const message = JSON.stringify(reply);
			const comma = message.indexOf(',');
			const event = Buffer.from(`id: ignored\r\nevent: message\r\ndata: ${message.slice(0, comma + 1)}\r\ndata: ${message.slice(comma + 1)}\r\n\r\n`);
			response.write(event.subarray(0, 13));
			setImmediate(() => response.write(event.subarray(13)));
		} catch (error) {
			violations.push(String(error));
			response.writeHead(500); response.end('fixture rejected client');
		}
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const endpoint = `http://127.0.0.1:${address.port}/mcp?thread=fixture-endpoint-secret`;
	try { await run(endpoint, requests); }
	finally {
		const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		server.closeAllConnections();
		await closed;
		assert.deepEqual(violations, []);
	}
}

const piEnv = (endpoint: string): NodeJS.ProcessEnv => ({ T3_MCP_URL: endpoint, T3_MCP_BEARER_TOKEN: TOKEN });
const expectedBound: T3BoundWorkspace = { kind: 'bound', path: WORKTREE, projectRoot: ROOT, branch: status.branch, attached: true };

function assertUnavailable(result: Awaited<ReturnType<typeof readT3BoundWorkspace>>, reason: RegExp): asserts result is T3WorkspaceUnavailable {
	assert.ok(result && result.kind === 'unavailable', JSON.stringify(result));
	assert.match(result.why, reason);
	for (const sensitive of [TOKEN, SESSION, 'fixture-endpoint-secret', '127.0.0.1', 'http://', 'Bearer', 'reflected-provider-secret']) {
		assert.ok(!JSON.stringify(result).includes(sensitive), `safe diagnostic excludes ${sensitive}`);
	}
}

// No credentials means immediate absence, not a network read or even a Promise; no cwd input.
const readerContract: (env: NodeJS.ProcessEnv) => Promise<T3BoundWorkspace | T3WorkspaceUnavailable> | null = readT3BoundWorkspace;
for (const env of [
	{}, { T3CODE_PROJECT_ROOT: ROOT }, { T3_MCP_URL: 'not-a-network-endpoint' },
	{ T3_MCP_BEARER_TOKEN: TOKEN }, { T3_ACP_MCP_ENDPOINT: 'not-a-network-endpoint' },
	{ T3_ACP_MCP_AUTHORIZATION: `Bearer ${TOKEN}` },
	{ T3_MCP_URL: 'x', T3_MCP_BEARER_TOKEN: '  ' },
	{ T3_MCP_URL: ' ', T3_MCP_BEARER_TOKEN: TOKEN },
	{ T3_ACP_MCP_ENDPOINT: 'x', T3_ACP_MCP_AUTHORIZATION: '\t ' },
	{ T3_ACP_MCP_ENDPOINT: ' ', T3_ACP_MCP_AUTHORIZATION: TOKEN },
	{ T3_MCP_URL: 'x', T3_ACP_MCP_AUTHORIZATION: TOKEN },
]) assert.equal(readerContract(env), null);

for (const format of ['json', 'sse'] as const) {
	await fixture(async (endpoint, requests) => {
		assert.deepEqual(await readT3BoundWorkspace({ ...piEnv(endpoint), T3CODE_PROJECT_ROOT: '/incorrect-script-root', PWD: '/incorrect-cwd' }), expectedBound);
		assert.equal(requests.length, 3);
	}, { format });
}
await fixture(async (endpoint, requests) => {
	assert.deepEqual(await readT3BoundWorkspace({ T3_ACP_MCP_ENDPOINT: endpoint, T3_ACP_MCP_AUTHORIZATION: `Bearer ${TOKEN}` }), expectedBound);
	assert.equal(requests.length, 3);
});
// Do not double-prefix ACP auth; do not mix halves of pairs; deterministic Pi priority.
await fixture(async (endpoint) => {
	assert.deepEqual(await readT3BoundWorkspace({ T3_MCP_URL: 'bad-incomplete-pi', T3_ACP_MCP_ENDPOINT: endpoint, T3_ACP_MCP_AUTHORIZATION: `Bearer ${TOKEN}` }), expectedBound);
});
await fixture(async (endpoint) => {
	assert.deepEqual(await readT3BoundWorkspace({ ...piEnv(endpoint), T3_ACP_MCP_ENDPOINT: 'bad-unused-acp', T3_ACP_MCP_AUTHORIZATION: 'Bearer unused-acp' }), expectedBound);
});

// Structured content owns the binding, not human-readable content or a project-script env.
for (const branch of ['fix/thread', null]) {
	await fixture(async (endpoint) => {
		assert.deepEqual(await readT3BoundWorkspace(piEnv(endpoint)), { ...expectedBound, branch });
	}, { override: (stage, response) => {
		if (stage !== 'tools/call') return false;
		json(response, envelope(2, { structuredContent: { ...status, branch }, content: [{ type: 'text', text: 'not JSON and not authority' }] }));
		return true;
	} });
}
for (const branch of [null, 'main']) {
	await fixture(async (endpoint) => {
		assert.deepEqual(await readT3BoundWorkspace(piEnv(endpoint)), { kind: 'bound', attached: false, path: ROOT, projectRoot: ROOT, branch });
	}, { override: (stage, response) => {
		if (stage !== 'tools/call') return false;
		json(response, envelope(2, { isError: false, structuredContent: { ...status, attached: false, worktreePath: null, branch } }));
		return true;
	} });
}

async function refused(stage: Stage, reply: (response: ServerResponse) => void, reason: RegExp) {
	await fixture(async (endpoint, requests) => {
		assertUnavailable(await readT3BoundWorkspace(piEnv(endpoint)), reason);
		assert.equal(requests.length, stage === 'initialize' ? 1 : stage === 'notifications/initialized' ? 2 : 3, 'stop immediately on failure; no fallback or cleanup request');
	}, { override: (current, response) => {
		if (current !== stage) return false;
		reply(response); return true;
	} });
}
for (const stage of ['initialize', 'notifications/initialized', 'tools/call'] as const) {
	await refused(stage, (response) => { response.writeHead(401); response.end(`${TOKEN} ${SESSION} reflected-provider-secret`); }, /authorization was refused/);
}
await refused('initialize', (response) => { response.writeHead(500); response.end(TOKEN); }, /HTTP request failed \(500\)/);
await refused('initialize', (response) => {
	response.writeHead(302, { location: 'http://127.0.0.1:1/never-follow?reflected-provider-secret' }); response.end();
}, /transport failed/);
await refused('initialize', (response) => { response.removeHeader('mcp-session-id'); json(response, envelope(1, initResult)); }, /did not bind/);
await refused('initialize', (response) => { response.setHeader('mcp-session-id', ' '); json(response, envelope(1, initResult)); }, /did not bind/);
for (const result of [null, {}, { ...initResult, protocolVersion: '2024-11-05' }, { ...initResult, capabilities: null }, { ...initResult, serverInfo: {} }]) {
	await refused('initialize', (response) => json(response, envelope(1, result)), /initialization response/);
}
await refused('notifications/initialized', (response) => { response.writeHead(200); response.end(); }, /notification was not accepted/);
await refused('notifications/initialized', (response) => { response.writeHead(202); response.end(TOKEN); }, /notification was not accepted/);
// Reject unexpected notification bytes without buffering an unbounded/open body until timeout.
await refused('notifications/initialized', (response) => { response.writeHead(202); response.write(TOKEN); }, /notification was not accepted/);
for (const reply of [
	{ jsonrpc: '2.0', id: 2, error: { code: -32000, message: `reflected-provider-secret ${TOKEN}` } },
	{ jsonrpc: '2.0', id: 2, result: toolResult, error: {} },
	{ jsonrpc: '2.0', id: 99, result: toolResult },
	{ jsonrpc: '2.0', id: '2', result: toolResult },
	{ jsonrpc: '1.0', id: 2, result: toolResult },
	{ jsonrpc: '2.0', id: 2 },
	{ jsonrpc: '2.0', id: 2, method: 'server-request' },
	[envelope(2, toolResult)],
]) await refused('tools/call', (response) => json(response, reply), /JSON-RPC/);
await refused('tools/call', (response) => json(response, { jsonrpc: '2.0', method: 'notifications/message' }), /only a notification/);
await refused('tools/call', (response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.end(`bad JSON ${TOKEN}`); }, /invalid JSON/);
await refused('tools/call', (response) => { response.writeHead(200, { 'content-type': 'text/plain' }); response.end(TOKEN); }, /unsupported/);
await refused('tools/call', (response) => { response.writeHead(204); response.end(); }, /missing or unsupported/);
await refused('tools/call', (response) => { response.destroy(); }, /transport failed/);
await refused('tools/call', (response) => {
	response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(': keepalive\n\ndata: {"jsonrpc":"2.0","method":"notice"}\n\n');
}, /ended without a response/);
await refused('tools/call', (response) => {
	response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(`data: bad JSON ${TOKEN}\n\n`);
}, /invalid JSON/);
await refused('tools/call', (response) => {
	response.writeHead(200, { 'content-type': 'application/json' }); response.end(' '.repeat(1024 * 1024 + 1));
}, /size limit/);

for (const result of [null, {}, { isError: true, structuredContent: status, content: [{ type: 'text', text: TOKEN }] }, { isError: 'false', structuredContent: status }, { content: toolResult.content }]) {
	await refused('tools/call', (response) => json(response, envelope(2, result)), /status tool failed|invalid workspace status/);
}
// Independently corrupt each source invariant; finite cases cover the branches without a dependency.
for (const malformed of [
	null, [], {}, { ...status, attached: 'true' }, { ...status, attached: undefined },
	{ ...status, worktreePath: null }, { ...status, worktreePath: '' }, { ...status, worktreePath: 'relative/path' },
	{ ...status, worktreePath: '/bad\0path' }, { ...status, branch: undefined }, { ...status, branch: 123 }, { ...status, branch: ' ' },
	{ ...status, projectWorkspaceRoot: null }, { ...status, projectWorkspaceRoot: 'relative' },
	{ ...status, attached: false },
	{ ...status, attached: false, worktreePath: '', branch: null },
]) await refused('tools/call', (response) => json(response, envelope(2, { structuredContent: malformed })), /invalid workspace status|invalid workspace branch|inconsistent workspace attachment/);

for (const endpoint of ['invalid-endpoint', 'file:///not-http']) assertUnavailable(await readT3BoundWorkspace(piEnv(endpoint)), /transport failed/);
// A complete Pi pair must not silently fall back to a different thread's valid ACP pair.
await fixture(async (endpoint, requests) => {
	assertUnavailable(await readT3BoundWorkspace({ ...piEnv('invalid-pi-endpoint'), T3_ACP_MCP_ENDPOINT: endpoint, T3_ACP_MCP_AUTHORIZATION: `Bearer ${TOKEN}` }), /transport failed/);
	assert.equal(requests.length, 0);
});

// Real stalled transports at all three phases exercise the single 5s deadline, not fake fetch.
for (const stage of ['initialize', 'notifications/initialized', 'tools/call'] as const) {
	const started = performance.now();
	await refused(stage, (response) => {
		if (stage === 'tools/call') { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write(': still open\n\n'); }
		// Otherwise leave headers pending; the server is closed by the fixture after timeout.
	}, /read timed out/);
	assert.ok(performance.now() - started < 10_000, 'bounded timeout including response body');
}
console.log('all T3 bound-workspace local HTTP checks green — Pi/ACP, JSON/open SSE, handshake, one status call, strict status, safe failures and real deadlines; no live T3 or entry wiring');
