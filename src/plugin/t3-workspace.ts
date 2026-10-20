// t3-workspace.ts — read the thread binding, never infer it from cwd or project-script env.
// 2026-10-19: T3's Pi/ACP MCP credentials are thread-scoped. Unlike the stdio Inbox adapter,
// this reader must not end a session: DELETE could disconnect the live agent's native tools.
import { isAbsolute } from 'node:path';

/** The T3 thread's bound workspace; branch is thread metadata, not proof of Git's current branch. */
export type T3BoundWorkspace = {
	readonly kind: 'bound';
	readonly path: string;
	readonly projectRoot: string;
	readonly attached: boolean;
	readonly branch: string | null;
};

/** Authenticated T3 binding could not be read; why contains no server text, endpoint or credentials. */
export type T3WorkspaceUnavailable = { readonly kind: 'unavailable'; readonly why: string };

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const unavailable = (why: string): T3WorkspaceUnavailable => ({ kind: 'unavailable', why: `wf T3 workspace: ${why}` });
const PROTOCOL_VERSION = '2025-06-18';
const TIMEOUT_MS = 5000; // One local read, including handshake and response body; no retries.
const MAX_REPLY_BYTES = 1024 * 1024;

// Keep thread credentials redacted through parsing; unwrap only at the HTTP boundary.
class RedactedText {
	#text: string;
	constructor(text: string) { this.#text = text; }
	reveal(): string { return this.#text; }
	toJSON(): string { return '[redacted]'; }
	toString(): string { return '[redacted]'; }
}

function t3Credentials(env: NodeJS.ProcessEnv) {
	if (env.T3_MCP_URL?.trim() && env.T3_MCP_BEARER_TOKEN?.trim()) {
		return { endpoint: new RedactedText(env.T3_MCP_URL), authorization: new RedactedText(`Bearer ${env.T3_MCP_BEARER_TOKEN}`) };
	}
	if (env.T3_ACP_MCP_ENDPOINT?.trim() && env.T3_ACP_MCP_AUTHORIZATION?.trim()) {
		return { endpoint: new RedactedText(env.T3_ACP_MCP_ENDPOINT), authorization: new RedactedText(env.T3_ACP_MCP_AUTHORIZATION) };
	}
	return null;
}

type RpcReply = { kind: 'reply'; result: unknown };
function parseMcpEnvelope(value: unknown, id: number): RpcReply | T3WorkspaceUnavailable | null {
	if (!isRecord(value) || value.jsonrpc !== '2.0') return unavailable('invalid JSON-RPC envelope');
	// Streamable HTTP may interleave notifications before the response to our request.
	if (typeof value.method === 'string' && value.id === undefined && !('result' in value) && !('error' in value)) return null;
	if (value.id !== id || 'method' in value || 'error' in value || !('result' in value)) return unavailable('unexpected JSON-RPC response');
	return { kind: 'reply', result: value.result };
}

function parseMcpJson(text: string, id: number) {
	let value: unknown;
	try { value = JSON.parse(text); }
	catch {
		// Untrusted reply text can contain credentials; report only the parser's fixed diagnosis.
		return unavailable('invalid JSON response');
	}
	return parseMcpEnvelope(value, id);
}

async function readMcpReply(response: Response, id: number): Promise<RpcReply | T3WorkspaceUnavailable> {
	const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	if (!response.body || (contentType !== 'application/json' && contentType !== 'text/event-stream')) {
		await response.body?.cancel();
		return unavailable('missing or unsupported response body');
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let bytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			bytes += value?.byteLength ?? 0;
			if (bytes > MAX_REPLY_BYTES) return unavailable('response exceeds size limit');
			buffer += decoder.decode(value, { stream: !done });
			if (contentType === 'application/json') {
				if (done) return parseMcpJson(buffer, id) ?? unavailable('response contained only a notification');
			} else {
				let boundary: RegExpExecArray | null;
				while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
					const event = buffer.slice(0, boundary.index);
					buffer = buffer.slice(boundary.index + boundary[0].length);
					const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
					if (!data) continue; // SSE comments/keepalives have no JSON-RPC message.
					const reply = parseMcpJson(data, id);
					if (reply) return reply;
				}
				if (done) return unavailable('event stream ended without a response');
			}
		}
	} finally {
		await reader.cancel().catch(() => {
			// A failed/aborted transport may already be closed; never DELETE the MCP session.
		});
		reader.releaseLock();
	}
}

function absoluteWorkspacePath(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0') && isAbsolute(value);
}

function parseT3Workspace(result: unknown): T3BoundWorkspace | T3WorkspaceUnavailable {
	if (!isRecord(result) || (result.isError !== undefined && result.isError !== false)) return unavailable('workspace status tool failed');
	const status = result.structuredContent;
	if (!isRecord(status) || !absoluteWorkspacePath(status.projectWorkspaceRoot)) return unavailable('invalid workspace status');
	const projectRoot = status.projectWorkspaceRoot;
	if (status.branch !== null && (typeof status.branch !== 'string' || !status.branch.trim())) return unavailable('invalid workspace branch');
	// T3 returns branch metadata independently of attachment; a root thread may still name a branch.
	if (status.attached === false && status.worktreePath === null) {
		return { kind: 'bound', attached: false, path: projectRoot, projectRoot, branch: status.branch };
	}
	if (status.attached === true && absoluteWorkspacePath(status.worktreePath)) {
		return { kind: 'bound', attached: true, path: status.worktreePath, projectRoot, branch: status.branch };
	}
	return unavailable('inconsistent workspace attachment');
}

/**
 * Read the T3 bound workspace using only explicitly supplied thread credentials (Pi before ACP).
 * No complete pair returns null immediately; revoked credentials and all read failures mean unavailable.
 * Sends one read-only t3_worktree_status call after initialization; never writes tools or DELETEs.
 */
export function readT3BoundWorkspace(env: NodeJS.ProcessEnv): Promise<T3BoundWorkspace | T3WorkspaceUnavailable> | null {
	const credentials = t3Credentials(env);
	return credentials ? readT3Workspace(credentials) : null;
}

async function readT3Workspace(credentials: NonNullable<ReturnType<typeof t3Credentials>>): Promise<T3BoundWorkspace | T3WorkspaceUnavailable> {
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	try {
		let sessionId: string | null = null;
		const post = async (message: Json) => {
			const response = await fetch(credentials.endpoint.reveal(), {
				method: 'POST', redirect: 'error', signal,
				headers: {
					Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json',
					Authorization: credentials.authorization.reveal(),
					...(sessionId ? { 'mcp-protocol-version': PROTOCOL_VERSION, 'mcp-session-id': sessionId } : {}),
				},
				body: JSON.stringify({ jsonrpc: '2.0', ...message }),
			});
			if (!response.ok) {
				await response.body?.cancel();
				return unavailable(response.status === 401 ? 'thread authorization was refused' : `HTTP request failed (${response.status})`);
			}
			return response;
		};
		const initialized = await post({ id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'wf', version: '1' } } });
		if (!(initialized instanceof Response)) return initialized;
		const init = await readMcpReply(initialized, 1);
		if (init.kind === 'unavailable') return init;
		if (!isRecord(init.result) || init.result.protocolVersion !== PROTOCOL_VERSION || !isRecord(init.result.capabilities)
			|| !isRecord(init.result.serverInfo) || typeof init.result.serverInfo.name !== 'string' || typeof init.result.serverInfo.version !== 'string') {
			return unavailable('invalid initialization response');
		}
		sessionId = initialized.headers.get('mcp-session-id');
		if (!sessionId?.trim()) return unavailable('initialization did not bind an MCP session');
		const notified = await post({ method: 'notifications/initialized', params: {} });
		if (!(notified instanceof Response)) return notified;
		if (notified.status !== 202) {
			await notified.body?.cancel();
			return unavailable('initialization notification was not accepted');
		}
		if (notified.body) {
			const reader = notified.body.getReader();
			try {
				if (!(await reader.read()).done) return unavailable('initialization notification was not accepted');
			} finally {
				await reader.cancel();
				reader.releaseLock();
			}
		}
		const response = await post({ id: 2, method: 'tools/call', params: { name: 't3_worktree_status', arguments: {} } });
		if (!(response instanceof Response)) return response;
		const reply = await readMcpReply(response, 2);
		return reply.kind === 'unavailable' ? reply : parseT3Workspace(reply.result);
	} catch {
		// Fetch/body/header errors can echo endpoints and credentials. Never expose their causes.
		return unavailable(signal.aborted ? 'read timed out' : 'transport failed');
	}
}
