// #146: real HTTP dependencies and the actual check/repro command paths, without an app or DB.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { basePortForBranch } from '../../src/worktrees/worktree.ts';
import { realProbeStack } from '../../src/round/status.ts';
import { verificationEndpoints, waitForVerificationReady } from './readiness.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-readiness-'));
const branch = `bench/readiness-${randomUUID()}`;
const basePort = basePortForBranch(branch);
const requests: string[] = [];
let adminStatus = 200;
let apiStatus = 200;
let apiHangs = false;
const storefront = createServer((req, res) => { requests.push(`storefront ${req.method} ${req.url}`); res.end('storefront'); });
const admin = createServer((req, res) => { requests.push(`admin ${req.method} ${req.url}`); res.writeHead(adminStatus).end('admin'); });
const api = createServer((req, res) => {
	requests.push(`API ${req.method} ${req.url}`);
	if (!apiHangs) res.writeHead(req.url === '/openapi.json' ? apiStatus : 404).end('{}');
});
const listen = (server: Server, port = 0) => new Promise<number>((resolve, reject) => {
	server.once('error', reject);
	server.listen(port, () => { server.off('error', reject); resolve((server.address() as { port: number }).port); });
});
const close = (server: Server) => new Promise<void>((resolve, reject) => {
	if (!server.listening) return resolve();
	server.closeAllConnections();
	server.close((error) => error ? reject(error) : resolve());
});

try {
	await listen(storefront, basePort);
	const adminPort = await listen(admin);
	const apiPort = await listen(api);
	const env = { B2B_URL: `http://localhost:${basePort}`, ADMIN_URL: `http://localhost:${adminPort}`, API_URL: `http://127.0.0.1:${apiPort}/api/v1` };
	// One complete probe is enough to observe these fixed failure states. Allow CPU contention
	// from the full parallel suite without turning an HTTP status assertion into a timing test.
	const quick = { timeoutMs: 0, requestTimeoutMs: 10_000 };
	assert.throws(() => verificationEndpoints({}), /missing B2B_URL/);
	assert.throws(() => verificationEndpoints({ ...env, ADMIN_URL: 'file:///tmp/app' }), /invalid ADMIN_URL/);
	await waitForVerificationReady(root, env, { timeoutMs: 30_000, requestTimeoutMs: 10_000 });
	assert(requests.includes('admin GET /') && requests.includes('API GET /openapi.json'));
	await close(admin); await close(api);
	assert(await realProbeStack(basePort), 'the old status probe reports up with only the storefront');
	await assert.rejects(waitForVerificationReady(root, { ...env, STACK_LOG: '/fixture/dev.log' }, quick), (error: Error) => {
		assert.match(error.message, /admin .*connection unavailable/);
		assert.match(error.message, /API .*connection unavailable/);
		assert.match(error.message, /Dependent runner not started.*\/fixture\/dev.log/);
		return true;
	});
	await listen(admin, adminPort); await listen(api, apiPort);
	adminStatus = 503; apiStatus = 500;
	await assert.rejects(waitForVerificationReady(root, env, quick), /admin .*HTTP 503.*API .*HTTP 500/);
	adminStatus = 200; apiStatus = 200; apiHangs = true;
	await assert.rejects(waitForVerificationReady(root, env, { ...quick, requestTimeoutMs: 100 }), /API .*request timed out/);
	apiHangs = false;

	console.log('readiness: real HTTP dependencies, missing configuration, HTTP errors and timeouts');
} finally {
	await Promise.all([close(storefront), close(admin), close(api)]);
	rmSync(root, { recursive: true, force: true });
}
