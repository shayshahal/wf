// #146 (2026-10-17): a reachable storefront did not mean the shared buyer/seller/admin
// authentication setup could run. Check its three dependencies before admitting a measurement.
import { join } from 'node:path';

export type VerificationEndpoint = { name: string; url: string };

// These are the URLs handed to the runner, not the human-facing machine aliases. The API's
// root may legitimately be 404; its OpenAPI document is also what the verification doctor uses.
export function verificationEndpoints(env: Record<string, string>): VerificationEndpoint[] {
	return [['storefront', 'B2B_URL'], ['admin', 'ADMIN_URL'], ['API', 'API_URL']].map(([name, key]) => {
		const raw = env[key];
		if (!raw) throw new Error(`verification readiness: missing ${key}; restore this worktree's .verify-stack.env`);
		let url: URL;
		try { url = new URL(raw); }
		catch { throw new Error(`verification readiness: invalid ${key}; restore this worktree's .verify-stack.env`); }
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`verification readiness: invalid ${key}; expected an HTTP URL without credentials`);
		return { name, url: new URL(name === 'API' ? '/openapi.json' : '/', url.origin).href };
	});
}

export async function probeVerificationEndpoint(endpoint: VerificationEndpoint, timeoutMs = 2000): Promise<string | null> {
	try {
		const response = await fetch(endpoint.url, { signal: AbortSignal.timeout(timeoutMs) });
		await response.body?.cancel();
		return response.ok ? null : `HTTP ${response.status}`;
	} catch (error) {
		return error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'connection unavailable';
	}
}

// This is execution admission, separate from wf status's intentionally cheap reachability probe.
// It starts no services and mutates no data; a caller only uses it for a task needing shared auth.
export async function waitForVerificationReady(toplevel: string, env: Record<string, string>, { timeoutMs = 180_000, intervalMs = 1000, requestTimeoutMs = 2000 }: { timeoutMs?: number; intervalMs?: number; requestTimeoutMs?: number } = {}): Promise<void> {
	const endpoints = verificationEndpoints(env);
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const failures = (await Promise.all(endpoints.map(async (endpoint) => {
			const why = await probeVerificationEndpoint(endpoint, requestTimeoutMs);
			return why ? `${endpoint.name} ${endpoint.url}: ${why}` : null;
		}))).filter((why) => why !== null);
		if (!failures.length) return;
		if (Date.now() >= deadline) throw new Error(`verification readiness unavailable: ${failures.join('; ')}. Dependent runner not started. Inspect ${env.STACK_LOG || join(toplevel, '.wf', 'logs', 'dev.log')}`);
		await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, deadline - Date.now())));
	}
}
