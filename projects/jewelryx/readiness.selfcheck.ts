// #146: real HTTP dependencies and the actual check/repro command paths, without an app or DB.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WF_ROOT } from '../../src/paths.ts';
import { basePortForBranch } from '../../src/worktrees/worktree.ts';
import { realProbeStack } from '../../src/round/status.ts';
import { verificationEndpoints, waitForVerificationReady } from './readiness.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-readiness-'));
const repo = join(root, 'round');
const marker = join(root, 'ran');
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
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8', stdio: 'pipe' });
const cli = (entry: string, args: string[]) => {
	const child = spawn(process.execPath, [entry, ...args], { cwd: repo, env: gitEnv });
	let out = '';
	child.stdout.on('data', (data) => { out += data; });
	child.stderr.on('data', (data) => { out += data; });
	const timer = setTimeout(() => child.kill(), 60_000);
	const done = new Promise<{ code: number | null; out: string }>((resolve, reject) => {
		child.once('error', reject);
		child.once('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
	});
	return { child, done };
};

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

	mkdirSync(join(repo, 'bug-reports', 'X-146'), { recursive: true });
	mkdirSync(join(repo, '.wf'));
	git('init', '-q', '-b', 'main');
	git('config', 'user.name', 'wf selfcheck'); git('config', 'user.email', 'wf@example.invalid');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n.verify-stack.env\n');
	git('add', '.'); git('commit', '-qm', 'base'); git('switch', '-qc', branch);
	writeFileSync(join(repo, '.verify-stack.env'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'));
	writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, id: 'X-146', folder: 'bug-reports/X-146', base: 'main', step: 'build', class: 'A' }));
	const runner = join(root, 'runner.mjs');
	// Deliberately red: this test measures admission and preserves the runner's failure. It does
	// not claim that endpoint readiness makes the product verification pass.
	writeFileSync(runner, `import {appendFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(marker)}, 'ran\\n'); process.exitCode = 17;`);
	writeFileSync(join(repo, 'bug-reports', 'X-146', 'TICKET.md'), `# X-146\n## Intent\n- readiness\n## Repro\ncommand: node "${runner.replace(/\\/g, '/')}"\n`);
	// A bounded failure through runRepro's real stack and readiness functions. Only the timeout is
	// shortened; the production CLI uses the default three-minute bound.
	const bounded = join(root, 'bounded.mjs');
	writeFileSync(bounded, `import {runRepro} from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/gates/check.ts')).href)};
import {waitForVerificationReady} from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'projects/jewelryx/readiness.ts')).href)};
await runRepro({ready:(root,env)=>waitForVerificationReady(root,env,{timeoutMs:0,requestTimeoutMs:10000})});`);
	adminStatus = 503;
	const refused = await cli(bounded, []).done;
	assert.equal(refused.code, 1, refused.out);
	assert.match(refused.out, /verification readiness unavailable: admin .*HTTP 503/);
	assert(!existsSync(marker), 'shared auth / repro must not start with admin unavailable');
	assert(!existsSync(join(repo, '.wf', 'checks.log')), 'readiness failure must not produce defect measurements');
	// A non-app check has no endpoint requirement and does not probe or warm any service.
	requests.length = 0;
	const manual = await cli(join(WF_ROOT, 'wf.mjs'), ['check', '--case', 'manual: inspect the wording']).done;
	assert.equal(manual.code, 0, manual.out);
	assert.equal(requests.length, 0);
	rmSync(join(repo, '.wf', 'checks.log'));
	// A missing dependency configuration is an environment refusal through the ordinary check
	// path as well; no task ran, no behavioral evidence and no product-repair state change.
	writeFileSync(join(repo, '.verify-stack.env'), `B2B_URL=${env.B2B_URL}\nAPI_URL=${env.API_URL}\n`);
	const refusedCheck = await cli(join(WF_ROOT, 'wf.mjs'), ['check', '--case', 'repro']).done;
	assert.equal(refusedCheck.code, 1, refusedCheck.out);
	assert.match(refusedCheck.out, /missing ADMIN_URL/);
	const unavailable = JSON.parse(readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').trim());
	assert.equal(unavailable.cause, 'environment');
	assert(!existsSync(marker));
	assert.equal(JSON.parse(readFileSync(join(repo, '.wf', 'state.json'), 'utf8')).step, 'build');
	rmSync(join(repo, '.wf', 'checks.log'));
	writeFileSync(join(repo, '.verify-stack.env'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'));
	// The actual wf check command, with an available storefront and delayed dependencies. Observe
	// an admin probe before releasing it so this proves ordering rather than relying on a sleep.
	requests.length = 0;
	const pending = cli(join(WF_ROOT, 'wf.mjs'), ['check', '--case', 'repro']);
	try {
		const deadline = Date.now() + 45_000;
		while (!requests.includes('admin GET /') && Date.now() < deadline && pending.child.exitCode === null) await new Promise((resolve) => setTimeout(resolve, 20));
		if (!requests.includes('admin GET /')) {
			pending.child.kill();
			assert.fail(`check must probe admin before the runner: ${(await pending.done).out}`);
		}
		assert(!existsSync(marker), 'runner stays blocked during cold start');
		adminStatus = 200;
		const allowed = await pending.done;
		assert.equal(allowed.code, 1, allowed.out);
		assert.equal(readFileSync(marker, 'utf8'), 'ran\n');
		const result = JSON.parse(readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').trim());
		assert.equal(result.result, 'red', 'the deliberately failing runner must never become green');
	} finally {
		if (pending.child.exitCode === null) { pending.child.kill(); await pending.done; }
	}
	console.log('  ok   readiness blocks cold/missing/HTTP-error/timed-out dependencies before check and repro; healthy dependencies admit the runner');
} finally {
	await Promise.all([close(storefront), close(admin), close(api)]);
	rmSync(root, { recursive: true, force: true });
}
