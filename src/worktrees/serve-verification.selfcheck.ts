// Real server processes and sockets exercise narrow ownership, not application feature correctness.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireVerificationServers, hiddenHop, stopWorktreeServers } from './serve.ts';
import { basePortForBranch } from './worktree.ts';
import { directUrls, parseReproRequirements } from '../project.ts';
import { plug, seams } from '../seams.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-serve-verification-'));
const previous = seams.entry;
const branch = `bench/verification-${randomUUID()}`;
const port = basePortForBranch(branch);
const urls = directUrls(port);
const record = join(root, '.wf', 'serve-owner.json');
const flag = join(root, 'ready');
const started = join(root, 'started');
const frontend = createServer((_req, res) => res.end('borrowed frontend'));
const api = createServer((_req, res) => res.end('{}'));
const listen = (server: typeof api, port: number) => new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(); }); });
const close = (server: typeof api) => new Promise<void>((done, reject) => { if (!server.listening) return done(); server.closeAllConnections(); server.close((error) => error ? reject(error) : done()); });
const status = async (url: string) => { try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); return response.status; } catch { return null; } };
const until = async (predicate: () => boolean | Promise<boolean>) => { const end = Date.now() + 30_000; while (!await predicate()) { assert(Date.now() < end, 'fixture startup deadline'); await new Promise((done) => setTimeout(done, 30)); } };
const selected = parseReproRequirements('## Repro\nservices: api\n', 'node custom.mjs');
assert.equal(selected.kind, 'parsed');
let ownedBytes: string | undefined;
try {
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))) });
	git('init', '-q', '-b', branch); git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '--allow-empty', '-qm', 'base');
	mkdirSync(join(root, '.wf'));
	const entry = join(root, 'fixture.mjs');
	// This owned entry deliberately serves one API process. Actual project selection is covered
	// through devCommands and the native JewelryX cycle, not by teaching this fixture to launch apps.
	writeFileSync(entry, `import {createServer} from 'node:http';import {existsSync,writeFileSync} from 'node:fs';const args=process.argv.slice(2);if(args[args.indexOf('--verification-profile')+1]!=='api')throw Error('wrong profile');createServer((_q,r)=>r.writeHead(existsSync(${JSON.stringify(flag)})?200:503).end('{}')).listen(${port + 10_000},'127.0.0.1',()=>writeFileSync(${JSON.stringify(started)},'started'));`);
	plug({ entry });
	assert(hiddenHop('win32', {}, 'api')?.args.includes('--verification-profile'));
	const none = await acquireVerificationServers(root, {}, { kind: 'none' }, { stack: async () => { throw Error('unexpected startup'); }, ready: async () => { throw Error('unexpected probe'); } });
	assert.equal(none.kind, 'acquired'); assert.equal(await none.release(), null); assert(!existsSync(record));
	await listen(frontend, port);
	await listen(api, port + 10_000);
	const borrowed = await acquireVerificationServers(root, { API_URL: urls.api }, selected.requirements);
	assert.equal(borrowed.kind, 'acquired'); assert(!existsSync(record));
	assert.equal(await borrowed.release(), null); assert.equal(await status(urls.api), 200);
	await close(api);

	writeFileSync(flag, 'ready');
	const owned = await acquireVerificationServers(root, { API_URL: urls.api }, selected.requirements);
	assert.equal(owned.kind, 'acquired');
	ownedBytes = readFileSync(record, 'utf8');
	assert.equal(JSON.parse(ownedBytes).verificationProfile, 'api');
	assert.equal(await status(urls.api), 200);
	// A corrupt profile cannot broaden stop authority or erase the valid launch reference.
	const corrupt = JSON.stringify({ ...JSON.parse(ownedBytes), verificationProfile: 'unknown' });
	writeFileSync(record, corrupt);
	assert.equal((await stopWorktreeServers(root)).kind, 'refused');
	assert.equal(readFileSync(record, 'utf8'), corrupt); assert.equal(await status(urls.api), 200);
	writeFileSync(record, ownedBytes);
	assert.equal(await owned.release(), null);
	assert.equal(await status(urls.api), null); assert.equal(await status(`http://127.0.0.1:${port}`), 200, 'unrelated frontend is not stopped or required absent');
	assert(!existsSync(record));
	writeFileSync(record, 'replacement receipt');
	assert.equal(await owned.release(), null, 'repeated release is memoized');
	assert.equal(readFileSync(record, 'utf8'), 'replacement receipt'); rmSync(record); ownedBytes = undefined;

	// Failure after acquisition releases only this run's process before returning refusal.
	const refused = await acquireVerificationServers(root, { API_URL: urls.api }, selected.requirements, { ready: async () => { throw Error('fixture readiness refusal'); } });
	assert.equal(refused.kind, 'refused'); assert.match(refused.why, /fixture readiness refusal/);
	assert(!existsSync(record)); assert.equal(await status(urls.api), null);

	// Cancellation while the actual HTTP readiness loop retries must unwind acquisition.
	rmSync(flag); rmSync(started, { force: true });
	const beforeSignals = process.listenerCount('SIGTERM');
	const pending = acquireVerificationServers(root, { API_URL: urls.api }, selected.requirements);
	await until(async () => existsSync(started) && await status(urls.api) === 503);
	process.emit('SIGTERM');
	const cancelled = await pending;
	assert.equal(cancelled.kind, 'refused'); assert.match(cancelled.why, /cancel/);
	assert.equal(process.listenerCount('SIGTERM'), beforeSignals);
	assert(!existsSync(record)); assert.equal(await status(urls.api), null);
	assert.equal(await status(`http://127.0.0.1:${port}`), 200);

	writeFileSync(record, 'unknown authority');
	const unknown = await acquireVerificationServers(root, { API_URL: urls.api }, selected.requirements);
	assert.equal(unknown.kind, 'refused'); assert.equal(readFileSync(record, 'utf8'), 'unknown authority'); rmSync(record);
	console.log('  ok   narrow leases borrow safely, launch only the selected profile, refuse malformed authority, release on failure/cancel, and preserve unrelated endpoints');
} finally {
	if (ownedBytes && existsSync(record)) writeFileSync(record, ownedBytes);
	const stopped = await stopWorktreeServers(root);
	assert.notEqual(stopped.kind, 'refused', 'fixture teardown must confirm release');
	plug({ entry: previous }); await Promise.all([close(api), close(frontend)]);
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
