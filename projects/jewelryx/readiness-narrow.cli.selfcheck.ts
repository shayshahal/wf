// Real CLI/HTTP admission; these fixtures prove execution ordering, not product authentication.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-readiness-narrow-'));
const repo = join(root, 'round');
const marker = join(root, 'measured');
const runner = join(root, 'runner.mjs');
const folder = 'bug-reports/X-146';
const ticket = join(repo, folder, 'TICKET.md');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const requests: string[] = [];
const api = createServer((req, res) => { requests.push(req.url ?? ''); res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); });
await new Promise<void>((done) => api.listen(0, '127.0.0.1', done));
const address = api.address();
assert(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}`;
const cli = (args: string[]) => new Promise<{ code: number | null; out: string }>((done, reject) => {
	const child = spawn(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check', ...args], { cwd: repo, env });
	let out = '';
	child.stdout.on('data', (data) => { out += data; }); child.stderr.on('data', (data) => { out += data; });
	const timer = setTimeout(() => child.kill(), 120_000);
	child.once('error', (error) => { clearTimeout(timer); reject(error); });
	child.once('close', (code) => { clearTimeout(timer); done({ code, out }); });
});
const describe = (services: string, command = `node "${runner.replace(/\\/g, '/')}"`) => {
	writeFileSync(ticket, `# X-146\n## Intent\n- Verify declared dependencies\n## Repro\ncommand: ${command}\nservices: ${services}\n`);
};
try {
	mkdirSync(join(repo, folder), { recursive: true }); mkdirSync(join(repo, '.wf'));
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env, stdio: 'pipe' });
	git('init', '-q', '-b', 'main');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n.verify-stack.env\n');
	git('add', '.'); git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base');
	const state = JSON.stringify({ wf_version: 2, id: 'X-146', folder, class: 'A', step: 'build', base: 'main' });
	writeFileSync(join(repo, '.wf', 'state.json'), state);
	writeFileSync(join(repo, '.verify-stack.env'), `API_URL=${url}/api/v1\n`);
	writeFileSync(runner, `import {appendFileSync} from 'node:fs';const r=await fetch(${JSON.stringify(url + '/api/v1/health')});if(r.status!==200)throw Error('API unavailable');appendFileSync(${JSON.stringify(marker)},'measured\\n');`);
	describe('api');
	const repro = await cli(['--repro']);
	assert.equal(repro.code, 0, repro.out);
	assert.equal(readFileSync(marker, 'utf8'), 'measured\n'.repeat(3));
	assert(requests.includes('/openapi.json') && requests.filter((path) => path === '/api/v1/health').length === 3);
	assert(!existsSync(join(repo, '.wf', 'serve-owner.json')), 'healthy API is borrowed, never acquired or stopped');
	const ordinary = await cli(['--case', 'repro']);
	assert.equal(ordinary.code, 0, ordinary.out);
	assert.equal(readFileSync(marker, 'utf8'), 'measured\n'.repeat(4));
	const checks = () => readFileSync(join(repo, '.wf', 'checks.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	assert.equal(checks().at(-1).result, 'green');

	// No-app work needs neither stack URLs nor HTTP probes, through both entry paths.
	rmSync(join(repo, '.verify-stack.env')); requests.length = 0;
	writeFileSync(runner, `import {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(marker)},'local\\n');`);
	describe('none');
	for (const args of [['--repro'], ['--case', 'repro']]) {
		const local = await cli(args); assert.equal(local.code, 0, local.out);
	}
	assert.equal(requests.length, 0); assert(!existsSync(join(repo, '.wf', 'serve.pid')));
	assert(readFileSync(marker, 'utf8').endsWith('local\n'.repeat(4)));

	const before = readFileSync(marker, 'utf8');
	const refusals: readonly [string, string | undefined][] = [['bogus', undefined], ['api', 'pnpm --dir verification exec playwright test -c ../docs/agents/verify-jewelryx/repro.config.ts']];
	for (const [services, command] of refusals) {
		describe(services, command);
		const invalid = await cli(['--case', 'repro']); assert.equal(invalid.code, 1, invalid.out);
		assert.match(invalid.out, /verification requirements:/);
		assert.equal(checks().at(-1).cause, 'environment');
		assert.equal(readFileSync(marker, 'utf8'), before);
		assert.equal(readFileSync(join(repo, '.wf', 'state.json'), 'utf8'), state, 'no product-repair/state mutation');
	}
	console.log('  ok   API-only and no-app repro/check commands execute without unrelated services; invalid/conflicting declarations are environment refusals');
} finally {
	api.closeAllConnections(); await new Promise<void>((done, reject) => api.close((error) => error ? reject(error) : done()));
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
