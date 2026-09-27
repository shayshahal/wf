#!/usr/bin/env node
// serve.mjs — wf serve: start this worktree's stack (the project's serve) in the background, unless it
// is running already. Where no env keeps the servers alive (worktrunk's tether on Shay's), `wf new`
// starts them this way, and a person restarts a stack that died the same way (kit and env plan,
// step 3). The pid is in .wf/serve.pid for `wf reap`; the servers' output in .wf/logs/dev.log, and
// what happens before they start (a missing dependency) in .wf/logs/serve.log.
//   wf serve               start it, detached
//   wf serve --foreground  run it here until it dies (what the detached process runs)
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, stackUrls } from './project.mjs';
import { seams } from './seams.mjs';
import { realProbeStack } from './status.mjs';
import { basePortForBranch, slugForBranch, urlLines } from './worktree.mjs';

export const pidFile = (worktree) => join(worktree, '.wf', 'serve.pid');

// The pid `wf serve` recorded for this worktree, or null.
export function servePid(worktree) {
	const file = pidFile(worktree);
	const pid = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : NaN;
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const alive = (pid) => {
	try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// Pure: the step that stops the servers, with every process under them. Windows: taskkill's tree.
// Elsewhere the detached process leads its own process group, so the group gets the signal.
export function stopServersStep(pid, platform = process.platform) {
	return platform === 'win32'
		? { label: 'stop servers', cmd: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] }
		: { label: 'stop servers', cmd: 'kill', args: ['-TERM', `-${pid}`] };
}

// Starts the stack detached; returns its pid. stdio goes to a file, not this process: a server that
// inherits a pipe keeps its reader waiting for EOF (40 min under an agent harness, 2026-09-20).
export function startServers(worktree) {
	mkdirSync(join(worktree, '.wf', 'logs'), { recursive: true });
	const fd = openSync(join(worktree, '.wf', 'logs', 'serve.log'), 'a');
	const child = spawn(process.execPath, [seams.entry, 'serve', '--foreground'], { cwd: worktree, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
	closeSync(fd);
	child.unref();
	writeFileSync(pidFile(worktree), String(child.pid));
	return child.pid;
}

export async function runServe(argv) {
	const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
	const worktree = git('rev-parse', '--show-toplevel');
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	const slug = slugForBranch(branch);
	const port = basePortForBranch(branch);
	if (argv.includes('--foreground')) return serve({ worktree, slug, port });
	const pid = servePid(worktree);
	if (await realProbeStack(port)) return console.log(`wf serve: the stack answers already\n${urlLines(stackUrls({ slug, port }))}`);
	// Still starting (a cold vite takes ~20 s): a second one would lose the port and the pid.
	if (pid && alive(pid)) return console.log(`wf serve: started already (pid ${pid}), not answering yet: see ${join(worktree, '.wf', 'logs')}`);
	console.log(`wf serve: starting (pid ${startServers(worktree)}; logs in ${join(worktree, '.wf', 'logs')})\n${urlLines(stackUrls({ slug, port }))}`);
}
