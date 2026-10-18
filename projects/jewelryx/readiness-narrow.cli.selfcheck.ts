// Real HTTP admission through the retained server lease, without the removed repro CLI.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireVerificationServers } from '../../src/worktrees/serve.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-readiness-narrow-'));
const requests: string[] = [];
const api = createServer((req, res) => { requests.push(req.url ?? ''); res.writeHead(200).end('{}'); });
await new Promise<void>((done) => api.listen(0, '127.0.0.1', done));
const address = api.address();
assert(address && typeof address !== 'string');
try {
 const env = { API_URL: `http://127.0.0.1:${address.port}/api/v1` };
 const apiLease = await acquireVerificationServers(root, env, { kind: 'stack', profile: 'api', temporary: true });
 assert.equal(apiLease.kind, 'acquired');
 if (apiLease.kind === 'acquired') assert.equal(await apiLease.release(), null);
 assert.deepEqual(requests, ['/openapi.json']);
 assert(!existsSync(join(root, '.wf/serve-owner.json')), 'healthy API is borrowed, not acquired or stopped');
 const count = requests.length;
 const local = await acquireVerificationServers(root, {}, { kind: 'none' });
 assert.equal(local.kind, 'acquired');
 if (local.kind === 'acquired') assert.equal(await local.release(), null);
 assert.equal(requests.length, count, 'local work probes no endpoint');
 const missing = await acquireVerificationServers(root, {}, { kind: 'stack', profile: 'api', temporary: true });
 assert.equal(missing.kind, 'refused');
 if (missing.kind === 'refused') assert.match(missing.why, /missing API_URL/);
 assert(!existsSync(join(root, '.wf/serve-owner.json')));
 console.log('API-only lease borrows healthy dependency; local work and invalid configuration start no services');
} finally {
 api.closeAllConnections();
 await new Promise<void>((done, reject) => api.close((error) => error ? reject(error) : done()));
 rmSync(root, { recursive: true, force: true });
}
