// control.ts — the local terminal-to-owner channel. Inspection and steering never open the database;
// they connect to the running owner, which alone owns it (issue #116). A Unix domain socket or a
// Windows named pipe carries newline-delimited JSON: one request line in, one response line out.
import { createServer, connect, type Server, type Socket } from 'node:net';
import { chmodSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from './identity.ts';

/** One newline-delimited JSON command from a terminal client to the owning process. */
export type ControlRequest = { readonly cmd: string; readonly [key: string]: unknown };
/** The owner's one-line answer: `ok` plus command-specific fields, or `error`. */
export type ControlResponse = { readonly ok: boolean; readonly [key: string]: unknown };
/** Handles one control command against the owner's live conversation and storage. */
export type ControlHandler = (request: ControlRequest) => Promise<ControlResponse>;

/** A pipe name on Windows (no stale file to clean up), a socket file beside the database elsewhere. */
export function socketPathFor(storageDir: string): string {
	if (process.platform === 'win32') return `\\\\.\\pipe\\wf-pi-durable-reviewer-${sha256Hex(storageDir).slice(0, 24)}`;
	return join(storageDir, 'control.sock');
}

/** A bound control endpoint the owner closes on stop. */
export type ControlServer = { close(): Promise<void> };

/** Bind the owner's control endpoint and serve `handler` until `close`. */
export async function serveControl(path: string, handler: ControlHandler): Promise<ControlServer> {
	if (process.platform !== 'win32') {
		try {
			unlinkSync(path);
		} catch (error) {
			// No stale socket is the common case; a leftover one from a killed owner is removed here.
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
	}
	const server: Server = createServer((socket: Socket) => {
		let buffer = '';
		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			void drain();
		});
		socket.on('error', () => {
			// A client that disconnects mid-line is not the owner's problem.
		});
		const drain = async (): Promise<void> => {
			for (;;) {
				const index = buffer.indexOf('\n');
				if (index < 0) return;
				const line = buffer.slice(0, index);
				buffer = buffer.slice(index + 1);
				if (line.trim() === '') continue;
				let response: ControlResponse;
				try {
					response = await handler(JSON.parse(line) as ControlRequest);
				} catch (error) {
					response = { ok: false, error: error instanceof Error ? error.message : String(error) };
				}
				socket.write(`${JSON.stringify(response)}\n`);
			}
		};
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(path, () => {
			server.off('error', reject);
			resolve();
		});
	});
	// Owner-only on POSIX. The socket is created with the process umask before this runs, so a local
	// user could connect in the brief window; the storage directory's own permissions are the real
	// boundary. On Windows a named pipe carries the default ACL and has no POSIX mode to tighten.
	if (process.platform !== 'win32') chmodSync(path, 0o600);
	return {
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => (error === undefined ? resolve() : reject(error)));
			}),
	};
}

/** Send one request to the owning process and return its response. */
export function callControl(path: string, request: ControlRequest, timeoutMs = 10_000): Promise<ControlResponse> {
	return new Promise<ControlResponse>((resolve, reject) => {
		const socket = connect(path);
		let buffer = '';
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`no response from the owner at ${path} within ${timeoutMs}ms`));
		}, timeoutMs);
		socket.setEncoding('utf8');
		socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			const index = buffer.indexOf('\n');
			if (index < 0) return;
			clearTimeout(timer);
			socket.end();
			try {
				resolve(JSON.parse(buffer.slice(0, index)) as ControlResponse);
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
		socket.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
