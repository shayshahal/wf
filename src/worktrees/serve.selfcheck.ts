// serve.selfcheck.ts — native CLI lifecycle checks with a real detached HTTP stack and descendant.
// No application dependencies: the entry stands in for a project's serve, behind seams.entry.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { plug, seams } from '../seams.ts';
import { pidFile, startServers } from './serve.ts';

// These PIDs were created by this fixture, never discovered by path or port.
const stopServersStep = (pid: number) => process.platform === 'win32'
	? { cmd: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] }
	: { cmd: 'kill', args: ['-KILL', `-${pid}`] };

let failures = 0;
const check = (name: string, condition: unknown, detail = '') => {
	console.log(condition ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!condition) failures++;
};
const root = mkdtempSync(join(tmpdir(), 'wf-stack-lifetime-'));
const entry = join(root, 'server entry [x].mjs');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const grandchild = `const fs=require('node:fs'); const http=require('node:http'); if(fs.existsSync('.wf/ignore-term'))process.on('SIGTERM',()=>{}); const server=http.createServer((q,r)=>r.end('descendant')); server.listen(0,'127.0.0.1',()=>fs.writeFileSync('.wf/descendant.json',JSON.stringify({pid:process.pid,port:server.address().port})));`;
writeFileSync(entry, `import {run} from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)};
import {createServer} from 'node:http'; import {writeFileSync,existsSync} from 'node:fs'; import {spawn} from 'node:child_process';
if(process.argv.includes('--foreground')) {
 if(existsSync('.wf/ignore-term'))process.on('SIGTERM',()=>{});
 const child=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore',windowsHide:true});
 const server=createServer((q,r)=>r.end('fixture stack'));
 server.listen(0,'127.0.0.1',()=>writeFileSync('.wf/stack.json',JSON.stringify({pid:process.pid,port:server.address().port})));
} else await run(process.argv.slice(2), {entry:${JSON.stringify(entry)}});
`);
const previousEntry = seams.entry;
plug({ entry });
const folder = 'round';
function makeRepo(name: string) {
	const repo = join(root, name);
	mkdirSync(repo, { recursive: true });
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env, stdio: 'pipe' });
	git('init', '-q', '-b', 'main'); git('config', 'core.autocrlf', 'false');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', 'commit', '-qm', 'base', '--allow-empty');
	git('checkout', '-qb', 'fix/stack');
	mkdirSync(join(repo, '.wf')); mkdirSync(join(repo, folder));
	// Dispatch persists the build reason through step build (#151), which needs a working document.
	writeFileSync(join(repo, folder, 'TICKET.md'), '# stack fixture\n## Intent\n- preserve the running stack during active work\n');
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 3, round: 'fix/stack', id: 'X-1', folder, base: 'main', class: 'A', step: 'agree' }));
	return repo;
}
const cli = (repo: string, ...args: string[]) => {
	const result = spawnSync(process.execPath, [entry, ...args], { cwd: repo, env, encoding: 'utf8', timeout: 45_000 });
	return { code: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
type Listener = { pid: number; port: number };
const listeners = (repo: string): Listener[] => ['stack.json', 'descendant.json'].map((file) => JSON.parse(readFileSync(join(repo, '.wf', file), 'utf8')));
async function answers(port: number) {
	try { return (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(2000) })).ok; }
	catch { return false; /* connection refused is the expected shutdown observation */ }
}
async function waitFor(predicate: () => boolean | Promise<boolean>, timeout = 15_000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) { if (await predicate()) return true; await new Promise((resolve) => setTimeout(resolve, 25)); }
	return false;
}
const stillRunning = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; /* fixture absence is the assertion */ } };
const started = new Map<number, Listener[]>();
async function start(repo: string) {
	for (const file of ['stack.json', 'descendant.json']) rmSync(join(repo, '.wf', file), { force: true });
	const pid = startServers(repo);
	if (!pid) throw Error('fixture stack did not spawn');
	started.set(pid, []);
	if (!await waitFor(() => existsSync(join(repo, '.wf/stack.json')) && existsSync(join(repo, '.wf/descendant.json')))) throw Error('fixture listeners did not start');
	const actual = listeners(repo);
	started.set(pid, actual);
	if (!(await Promise.all(actual.map((listener) => answers(listener.port)))).every(Boolean)) throw Error('fixture listeners do not answer');
	return actual;
}
async function down(actual: Listener[]) { return waitFor(async () => !(await Promise.all(actual.map((listener) => answers(listener.port)))).some(Boolean), 5000); }
async function cleanup(actual: Listener[]) {
	if (process.platform !== 'win32' && actual[0] && (await Promise.all(actual.map((listener) => answers(listener.port)))).some(Boolean)) {
		// Fixture groups may intentionally ignore TERM; cleanup must still release our own test resources.
		try { process.kill(-actual[0].pid, 'SIGKILL'); }
		catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
	}
	for (const listener of actual) {
		if (await answers(listener.port)) { const step = stopServersStep(listener.pid); spawnSync(step.cmd, step.args, { stdio: 'ignore' }); }
		started.delete(listener.pid);
	}
}

const idle = makeRepo("idle '[]&");
const other = makeRepo('other');
try {
	let actual = await start(idle);
	const stopped = cli(idle, 'serve', '--stop');
	check('explicit stop closes the tracked stack and its descendant, without removing the worktree', stopped.code === 0 && await down(actual) && !existsSync(pidFile(idle)) && existsSync(join(idle, '.git')), stopped.out);
	const again = cli(idle, 'serve', '--stop');
	check('repeating stop is harmless and does not restart the stack', again.code === 0 && !existsSync(pidFile(idle)) && await down(actual), again.out);
	// Before the fix the stop flag is ignored, leaving the same process alive. Clean just this fixture.
	await cleanup(actual);
	const statePath = join(idle, '.wf/state.json');
	writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath, 'utf8')), class: 'B' }));
	actual = await start(idle);
	const next = cli(idle, 'next');
	check('an agreement dispatch releases an idle stack instead of leaving it until reap', next.code === 0 && next.out.startsWith('dispatch agree') && await down(actual) && !existsSync(pidFile(idle)), next.out);
	await cleanup(actual);
	actual = await start(idle);
	const held = cli(idle, 'step', 'held');
	check('parking a round closes its whole stack', held.code === 0 && await down(actual) && !existsSync(pidFile(idle)), held.out);
	await cleanup(actual);
	writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath, 'utf8')), class: 'A', step: 'build' }));
	actual = await start(idle);
	const building = cli(idle, 'next');
	check('an active build dispatch keeps both stack listeners and its ownership', building.code === 0 && building.out.startsWith('dispatch build') && (await Promise.all(actual.map((listener) => answers(listener.port)))).every(Boolean) && existsSync(pidFile(idle)), building.out);
	writeFileSync(join(idle, folder, 'BLOCKED.md'), 'Question: Restore the required capability?\n');
	const waiting = cli(idle, 'next');
	check('a blocked non-review human wait releases its stack', waiting.code === 0 && waiting.out.startsWith('wait user:') && await down(actual) && !existsSync(pidFile(idle)), waiting.out);
	await cleanup(actual);
	actual = await start(idle);
	const ciHeld = cli(idle, 'step', 'held', '--waiting-on', 'ci');
	const ciNext = cli(idle, 'next');
	check('real CI waiting metadata preserves the stack through step and next', ciHeld.code === 0 && ciNext.code === 0 && JSON.parse(readFileSync(statePath, 'utf8')).waiting_on === 'ci' && (await Promise.all(actual.map((listener) => answers(listener.port)))).every(Boolean) && existsSync(pidFile(idle)), `${ciHeld.out}\n${ciNext.out}`);
	const ciStop = cli(idle, 'serve', '--stop');
	check('explicit helper stop overrides a CI wait', ciStop.code === 0 && await down(actual), ciStop.out);
	await cleanup(actual);
	if (process.platform !== 'win32') {
		writeFileSync(join(idle, '.wf/ignore-term'), 'fixture ignores TERM');
		actual = await start(idle);
		const forced = cli(idle, 'serve', '--stop');
		check('POSIX shutdown confirms death even when the whole group ignores TERM', forced.code === 0 && await down(actual) && !existsSync(pidFile(idle)), forced.out);
		await cleanup(actual);
		rmSync(join(idle, '.wf/ignore-term'));
	}
	actual = await start(idle);
	const legacy = JSON.stringify({ wf_version: 1, made_by: 'other-entry', step: 'research' });
	writeFileSync(statePath, legacy);
	const legacyStop = cli(idle, 'serve', '--stop');
	check('legacy/foreign round state does not prevent a verified stop or get rewritten', legacyStop.code === 0 && await down(actual) && readFileSync(statePath, 'utf8') === legacy, legacyStop.out);
	await cleanup(actual);
	writeFileSync(pidFile(idle), 'not-a-pid');
	const invalid = cli(idle, 'serve', '--stop');
	check('malformed ownership is refused and left intact', invalid.code !== 0 && readFileSync(pidFile(idle), 'utf8') === 'not-a-pid', invalid.out);
	const independent = await start(other);
	const otherPid = listeners(other).find((listener) => listener.pid === Number(readFileSync(pidFile(other), 'utf8')))?.pid;
	if (!otherPid) throw Error('fixture root pid missing');
	writeFileSync(pidFile(idle), String(otherPid));
	const bytes = readFileSync(pidFile(idle), 'utf8');
	const forged = cli(idle, 'serve', '--stop');
	check('a copied/recycled PID cannot stop another worktree or erase its authority', forged.code !== 0 && (await Promise.all(independent.map((listener) => answers(listener.port)))).every(Boolean) && readFileSync(pidFile(idle), 'utf8') === bytes, forged.out);
	writeFileSync(statePath, JSON.stringify({ wf_version: 3, round: 'fix/stack', id: 'X-1', folder, base: 'main', class: 'B', step: 'agree' }));
	const staleNext = cli(idle, 'next');
	check('an unowned stale PID warns without refusing agreement dispatch', staleNext.code === 0 && staleNext.out.startsWith('dispatch agree') && staleNext.out.includes('not a verified foreground server') && readFileSync(pidFile(idle), 'utf8') === bytes && independent.every((listener) => stillRunning(listener.pid)), staleNext.out);
	const staleHeld = cli(idle, 'step', 'held');
	check('an unowned stale PID also warns without invalidating the committed held phase', staleHeld.code === 0 && JSON.parse(readFileSync(statePath, 'utf8')).step === 'held' && readFileSync(pidFile(idle), 'utf8') === bytes && independent.every((listener) => stillRunning(listener.pid)), staleHeld.out);
	const agentCode = `const fs=require('node:fs');const server=require('node:http').createServer((q,r)=>r.end('agent'));server.listen(0,'127.0.0.1',()=>fs.writeFileSync('.wf/agent.json',JSON.stringify({pid:process.pid,port:server.address().port})));`;
	const agent = spawn(process.execPath, ['-e', agentCode, `${join(WF_ROOT, 'wf.mjs')} serve --foreground`], { cwd: idle, env, detached: true, stdio: 'ignore', windowsHide: true });
	agent.unref();
	if (!agent.pid) throw Error('agent fixture did not spawn');
	started.set(agent.pid, []);
	if (!await waitFor(() => existsSync(join(idle, '.wf/agent.json')))) throw Error('agent fixture did not answer');
	const actor: Listener = JSON.parse(readFileSync(join(idle, '.wf/agent.json'), 'utf8'));
	started.set(actor.pid, [actor]);
	writeFileSync(pidFile(idle), String(actor.pid));
	const actorStop = cli(idle, 'serve', '--stop');
	check('an agent in the same checkout is not a server even with the workflow command in its prompt', actorStop.code !== 0 && await answers(actor.port) && readFileSync(pidFile(idle), 'utf8') === String(actor.pid), actorStop.out);
	for (const file of ['stack.json', 'descendant.json']) rmSync(join(idle, '.wf', file), { force: true });
	const restart = cli(idle, 'serve');
	const replacement = Number(readFileSync(pidFile(idle), 'utf8'));
	check('a lazy start refuses unresolved ownership without stopping either unrelated process', restart.code !== 0 && replacement === actor.pid && await answers(actor.port) && (await Promise.all(independent.map((listener) => answers(listener.port)))).every(Boolean), restart.out);

} finally {
	for (const [pid, actual] of started) {
		if (actual.length) await cleanup(actual);
		else { const step = stopServersStep(pid); spawnSync(step.cmd, step.args, { stdio: 'ignore' }); }
	}
	plug({ entry: previousEntry });
	rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exitCode = failures ? 1 : 0;
