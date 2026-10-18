// Finite declaration/profile products cover this closed domain more directly than random generation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { devCommands } from './dev.ts';
import { parseVerificationProfile, verificationEndpoints, waitForVerificationReady } from './readiness.ts';
import type { VerificationProfile } from './readiness.ts';

for (const raw of [undefined, 'shared-auth', 'api', null, '', 'API', ' api', 0, false, {}, [], ['api']]) {
	const parsed = parseVerificationProfile(raw);
	if (raw === undefined || raw === 'shared-auth' || raw === 'api') {
		assert.deepEqual(parsed, { kind: 'parsed', profile: raw ?? 'shared-auth' });
	} else assert.equal(parsed.kind, 'invalid');
}
for (const profile of ['shared-auth', 'api'] satisfies VerificationProfile[]) {
	const wrapped: string[] = [];
	const commands = devCommands(12345, { profile, wrap: ({ role, command }) => { wrapped.push(role); return { command: `wrapped ${command}`, env: { WRAPPED: role } }; } });
	assert.deepEqual(commands.map((command) => command.name), profile === 'api' ? ['backend'] : ['backend', 'b2b', 'admin']);
	assert.deepEqual(wrapped, profile === 'api' ? ['api'] : ['api', 'b2b', 'admin']);
	assert.equal(commands[0].command, 'wrapped pnpm dev:backend');
	assert.equal(commands[0].env.DEV_BACKEND_PORT, '22345');
}
assert.deepEqual(devCommands(12345), devCommands(12345, { profile: 'shared-auth' }));
assert.deepEqual(devCommands(12345, { profile: 'api' }), [devCommands(12345)[0]]);

let status = 200;
let frontendStatus = 200;
let hang = false;
let received: (() => void) | undefined;
const requests: string[] = [];
const server = createServer((req, res) => {
	requests.push(req.url ?? '');
	if (!hang) res.writeHead(req.url === '/openapi.json' ? status : frontendStatus).end('{}');
	received?.();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const env = { API_URL: `http://127.0.0.1:${address.port}/api/v1` };
const quick = { timeoutMs: 0, requestTimeoutMs: 1000 };
try {
	assert.deepEqual(verificationEndpoints(env, 'api'), [{ name: 'API', url: `http://127.0.0.1:${address.port}/openapi.json` }]);
	assert.throws(() => verificationEndpoints(env), /missing B2B_URL/);
	assert.throws(() => verificationEndpoints({}, 'api'), /missing API_URL/);
	for (const API_URL of ['file:///tmp/api', 'http://user:secret@localhost', 'not a url']) {
		assert.throws(() => verificationEndpoints({ API_URL }, 'api'), /invalid API_URL/);
	}
	await waitForVerificationReady('.', env, { ...quick, profile: 'api' });
	assert.deepEqual(requests, ['/openapi.json']);
	await assert.rejects(waitForVerificationReady('.', env, quick), /missing B2B_URL/);
	// Both frontends answer 503 while the API answers 200: API admits, shared auth refuses.
	const full = { ...env, B2B_URL: env.API_URL, ADMIN_URL: env.API_URL };
	frontendStatus = 503;
	await waitForVerificationReady('.', full, { ...quick, profile: 'api' });
	await assert.rejects(waitForVerificationReady('.', full, quick), /storefront .*HTTP 503.*admin .*HTTP 503/);
	frontendStatus = 200;
	await waitForVerificationReady('.', full, quick);
	assert(requests.includes('/'));

	// A held HTTP request cannot defer cancellation until its 30-second request timeout.
	hang = true;
	const requestAbort = new AbortController();
	received = () => requestAbort.abort('fixture cancellation');
	const requestStart = performance.now();
	await assert.rejects(waitForVerificationReady('.', env, { profile: 'api', signal: requestAbort.signal, requestTimeoutMs: 30_000 }), /verification readiness cancelled/);
	assert(performance.now() - requestStart < 5000, 'abort must interrupt an in-flight request');
	hang = false;
	status = 503;
	await assert.rejects(waitForVerificationReady('.', { ...env, STACK_LOG: '/fixture/dev.log' }, { ...quick, profile: 'api' }), /API .*HTTP 503.*Dependent runner not started.*\/fixture\/dev.log/);
	const retryAbort = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Abort after the failed response has entered the long retry wait.
	received = () => { timer = setTimeout(() => retryAbort.abort(), 50); };
	try {
		const retryStart = performance.now();
		await assert.rejects(waitForVerificationReady('.', env, { profile: 'api', signal: retryAbort.signal, intervalMs: 30_000 }), /verification readiness cancelled/);
		assert(performance.now() - retryStart < 5000, 'abort must interrupt the retry wait');
	} finally { clearTimeout(timer); }
	received = undefined;
	const before = requests.length;
	await assert.rejects(waitForVerificationReady('.', {}, { signal: AbortSignal.abort() }), /verification readiness cancelled/);
	assert.equal(requests.length, before, 'pre-abort sends no request and wins over missing configuration');
	console.log('  ok   finite requirements/profile cases, API-only HTTP admission, shared default, request/retry cancellation and backend-only startup commands');
} finally {
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
