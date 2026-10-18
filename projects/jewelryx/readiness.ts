// #146 (2026-10-17): a reachable storefront did not mean the shared buyer/seller/admin
// authentication setup could run. Check its dependencies before admitting a measurement.
import { join, posix } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Verification profile selects project-owned endpoint and startup dependencies. */
export type VerificationProfile = 'shared-auth' | 'api';

/** API-only stacks are temporary; shared authentication retains the existing full stack. */
export type VerificationRequirements =
	| { readonly kind: 'none' }
	| { readonly kind: 'stack'; readonly profile: 'shared-auth'; readonly temporary: false }
	| { readonly kind: 'stack'; readonly profile: 'api'; readonly temporary: true };

/** Parse a verification profile without silently accepting misspellings or null. */
export function parseVerificationProfile(raw: unknown): { kind: 'parsed'; profile: VerificationProfile } | { kind: 'invalid'; why: string } {
	if (raw === undefined || raw === 'shared-auth') return { kind: 'parsed', profile: 'shared-auth' };
	if (raw === 'api') return { kind: 'parsed', profile: 'api' };
	return { kind: 'invalid', why: 'verification requirements: expected shared-auth or api' };
}

// Facts from round.ts's reproConfig/REPRO_GLOBAL_SETUP and checks.ts's verification cwd.
// A generated fallback path cannot prove withAuth was disabled: retain shared auth there,
// rather than guessing from arbitrary commands or custom configuration names.
function knownSharedAuthCommand(command: string): boolean {
	const tokens = [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\/g, '/'));
	// control-jewelryx's API calls can refresh a missing/expired login through its browser auth,
	// unlike `api --find`, which only reads SDK source. A warm cookie is not a narrower contract.
	if (tokens.some((token, i) => /(?:^|\/)control-jewelryx(?:\.mjs|\.cmd)?$/.test(token)
		&& (['auth', 'login', 'open', 'doctor', 'reset'].includes(tokens[i + 1]) || tokens[i + 1] === 'api' && tokens[i + 2] !== '--find'))) return true;
	const playwright = tokens.some((token) => /(?:^|\/)(?:playwright(?:\.cmd|\.js)?|(?:@playwright\/test|playwright)\/cli\.js)$/.test(token));
	if (!playwright || !tokens.includes('test')) return false;
	const canonical = (path: string) => posix.normalize(path).replace(/\/$/, '');
	const configs = tokens.flatMap((token, i) => token === '-c' || token === '--config' ? [tokens[i + 1] ?? ''] : token.startsWith('--config=') ? [token.slice(9)] : token.startsWith('-c=') ? [token.slice(3)] : token.startsWith('-c') && token.length > 2 ? [token.slice(2)] : []).map(canonical);
	const directories = tokens.flatMap((token, i) => token === '--dir' || token === '-C' ? [tokens[i + 1] ?? ''] : token.startsWith('--dir=') ? [token.slice(6)] : token.startsWith('-C') && token.length > 2 ? [token.slice(2)] : []).map(canonical);
	// Playwright accepts a directory and resolves relative config paths from the selected cwd.
	// Compare the combined path: verification/tests + ../playwright.config.ts is shared auth too.
	return (directories.length ? directories : ['.']).some((cwd) => (configs.length ? configs : ['.']).some((config) => {
		const path = canonical(posix.isAbsolute(config) || /^[a-z]:\//i.test(config) ? config : posix.join(cwd, config));
		return /(?:^|\/)docs\/agents\/verify-jewelryx(?:\/repro\.config\.ts)?$/.test(path)
			|| /(?:^|\/)bug-reports\/[^/]+\/repro(?:\/playwright\.config\.ts)?$/.test(path)
			|| /(?:^|\/)verification(?:\/playwright\.config\.[cm]?[jt]s)?$/.test(path);
	}));
}

/** Read optional services only in ## Repro; unknown commands default to shared auth, never inferred dependencies. */
export function parseReproRequirements(description: string, command: string): { kind: 'parsed'; requirements: VerificationRequirements } | { kind: 'invalid'; why: string } {
	const sections = [...description.replace(/\r\n/g, '\n').matchAll(/^## Repro[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
	const declarations = sections.flatMap((section) => section[1].split('\n').filter((line) => /^[ \t]*services\b/i.test(line)));
	if (declarations.length > 1) return { kind: 'invalid', why: 'verification requirements: duplicate services declarations in ## Repro' };
	const declaration = declarations[0];
	const match = declaration === undefined ? null : /^services:[ \t]*(none|api|shared-auth)[ \t]*$/.exec(declaration);
	if (declaration !== undefined && !match) return { kind: 'invalid', why: 'verification requirements: expected services: none|api|shared-auth in ## Repro' };
	const services = match?.[1] ?? 'shared-auth';
	if (services !== 'shared-auth' && knownSharedAuthCommand(command)) return { kind: 'invalid', why: 'verification requirements: services declaration conflicts with known shared-auth runner/configuration' };
	if (services === 'none') return { kind: 'parsed', requirements: { kind: 'none' } };
	return { kind: 'parsed', requirements: services === 'api'
		? { kind: 'stack', profile: 'api', temporary: true }
		: { kind: 'stack', profile: 'shared-auth', temporary: false } };
}

/** A named HTTP dependency; readiness probes never use credentials. */
export type VerificationEndpoint = { name: string; url: string };

/** Resolve runner URLs; API-only needs no frontends, and the API schema avoids a legitimate root 404. */
export function verificationEndpoints(env: Record<string, string>, profile: VerificationProfile = 'shared-auth'): VerificationEndpoint[] {
	return (profile === 'api' ? [['API', 'API_URL']] : [['storefront', 'B2B_URL'], ['admin', 'ADMIN_URL'], ['API', 'API_URL']]).map(([name, key]) => {
		const raw = env[key];
		if (!raw) throw new Error(`verification readiness: missing ${key}; restore this worktree's .verify-stack.env`);
		let url: URL;
		try { url = new URL(raw); }
		catch { throw new Error(`verification readiness: invalid ${key}; restore this worktree's .verify-stack.env`); }
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`verification readiness: invalid ${key}; expected an HTTP URL without credentials`);
		return { name, url: new URL(name === 'API' ? '/openapi.json' : '/', url.origin).href };
	});
}

/** Probe one endpoint; cancellation rejects rather than masquerading as unavailability. */
export async function probeVerificationEndpoint(endpoint: VerificationEndpoint, timeoutMs = 2000, signal?: AbortSignal): Promise<string | null> {
	try {
		const response = await fetch(endpoint.url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
		await response.body?.cancel();
		return response.ok ? null : `HTTP ${response.status}`;
	} catch (error) {
		if (signal?.aborted) throw new Error('verification readiness cancelled: dependent runner not started');
		return error instanceof Error && error.name === 'TimeoutError' ? 'request timed out' : 'connection unavailable';
	}
}

/** Wait for every profile dependency; abort interrupts requests and retry waits. Starts no services. */
export async function waitForVerificationReady(toplevel: string, env: Record<string, string>, { timeoutMs = 180_000, intervalMs = 1000, requestTimeoutMs = 2000, profile = 'shared-auth', signal }: { timeoutMs?: number; intervalMs?: number; requestTimeoutMs?: number; profile?: VerificationProfile; signal?: AbortSignal } = {}): Promise<void> {
	if (signal?.aborted) throw new Error('verification readiness cancelled: dependent runner not started');
	const endpoints = verificationEndpoints(env, profile);
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const failures = (await Promise.all(endpoints.map(async (endpoint) => {
			const why = await probeVerificationEndpoint(endpoint, requestTimeoutMs, signal);
			return why ? `${endpoint.name} ${endpoint.url}: ${why}` : null;
		}))).filter((why) => why !== null);
		if (signal?.aborted) throw new Error('verification readiness cancelled: dependent runner not started');
		if (!failures.length) return;
		if (Date.now() >= deadline) throw new Error(`verification readiness unavailable: ${failures.join('; ')}. Dependent runner not started. Inspect ${env.STACK_LOG || join(toplevel, '.wf', 'logs', 'dev.log')}`);
		try { await delay(Math.min(intervalMs, deadline - Date.now()), undefined, { signal }); }
		catch (error) {
			if (signal?.aborted) throw new Error('verification readiness cancelled: dependent runner not started');
			throw error;
		}
	}
}
