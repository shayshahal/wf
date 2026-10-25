// in-process-wf.selfcheck.ts — node src/in-process-wf.selfcheck.ts → exit 0 when green.
// wfSync gives what `node wf.mjs` gives: same exit status, stdout and stderr, from the caller's cwd,
// with the env it was given, and a process.exit inside wf ends only the thread.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { wfAsync, wfOut, wfSync } from './in-process-wf.ts';
import { WF_ROOT } from './paths.ts';

let failures = 0;
const check = (name: string, fn: () => void) => { try { fn(); console.log(`  ok   ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name} — ${e instanceof Error ? e.message : String(e)}`); } };
const real = (args: string[], cwd: string, env?: NodeJS.ProcessEnv) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd, env, encoding: 'utf8' });
const dir = mkdtempSync(join(tmpdir(), 'wf-inproc-'));
try {
	for (const args of [['--help'], ['no-such-command']]) {
		check(`\`wf ${args.join(' ')}\` outside a repo: status, stdout and stderr match the process`, () => {
			const a = wfSync(args, { cwd: dir });
			const b = real(args, dir);
			assert.equal(a.status, b.status);
			assert.equal(a.stdout, b.stdout);
			assert.equal(a.stderr, b.stderr);
		});
	}
	// An uncaught exception is rendered by Node's own crash banner in a process and as the plain stack here:
	// same status and message, not the same bytes.
	check('`wf next` outside a repo (an uncaught exception): same status, same message', () => {
		const a = wfSync(['next'], { cwd: dir });
		const b = real(['next'], dir);
		assert.equal(a.status, b.status);
		assert.ok(a.stderr.includes('not a git repository') && b.stderr.includes('not a git repository'), a.stderr.slice(0, 300));
	});
	check('the caller\'s cwd is restored afterwards', () => { const before = process.cwd(); wfSync(['--help'], { cwd: dir }); assert.equal(process.cwd(), before); });
	check('a failing call (process.exit inside wf) leaves this process running and reports its status', () => { assert.notEqual(wfSync(['next'], { cwd: dir }).status, 0); });
	check('wfOut returns stdout on success and throws with status and stderr on failure', () => {
		assert.match(wfOut(['--help'], { cwd: dir }), /^usage: wf /);
		assert.throws(() => wfOut(['next'], { cwd: dir }), (e: Error & { status?: number }) => e.status !== 0 && e.status !== undefined);
	});
	check('the env given is the env wf sees (PATH without git: the same failure as the process)', () => {
		const env = { ...process.env, PATH: dir };
		const a = wfSync(['next'], { cwd: dir, env });
		const b = real(['next'], dir, env);
		assert.equal(a.status, b.status);
	});
	check('two calls do not share state (a seam plugged by one is not there for the next)', () => {
		const first = wfSync(['--help'], { cwd: dir });
		assert.equal(wfSync(['--help'], { cwd: dir }).stdout, first.stdout);
	});
	// The reason wfAsync exists: a check that serves HTTP from this thread for the CLI to probe.
	const server = createServer((_req, res) => { res.writeHead(200); res.end('served'); });
	await new Promise<void>((resolve) => server.listen(0, resolve));
	try {
		const port = (server.address() as { port: number }).port;
		const [firstRun, body] = await Promise.all([wfAsync(['next'], { cwd: dir }), fetch(`http://127.0.0.1:${port}`).then((r) => r.text())]);
		check('this thread keeps answering HTTP while a wfAsync call runs (a blocking call could not)', () => { assert.equal(body, 'served'); assert.notEqual(firstRun.status, 0); });
		const run = await wfAsync(['--help'], { cwd: dir });
		check('wfAsync returns the same as wfSync', () => assert.deepEqual(run, wfSync(['--help'], { cwd: dir })));
		const second = await Promise.all([wfAsync(['--help'], { cwd: dir }), wfAsync(['--help'], { cwd: dir })].map((p) => p.then(() => 'ok', (e: Error) => e.message)));
		check('a second concurrent wfAsync is refused, the cwd being process-wide', () => assert.ok(second.some((r) => r.includes('one call at a time')), JSON.stringify(second)));
	} finally { server.close(); }
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `${failures} FAILURE(S)` : 'in-process-wf selfcheck: ok');
process.exit(failures ? 1 : 0);
