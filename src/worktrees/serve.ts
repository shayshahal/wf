#!/usr/bin/env node
// serve.ts — wf serve: start this worktree's stack (the project's serve) in the background, unless it
// is running already. Nothing starts a stack when the worktree is made: the phases that use one start
// it (ensureServers): research and validate's briefs, `wf check` before the repro or a task that drives
// the app, and `wf review`. Until 2026-10-04 every worktree served from `wf new` on; Shay: "too much".
// The pid is in .wf/serve.pid for `wf reap`; the servers' output in .wf/logs/dev.log, and what
// happens before they start (a missing dependency) in .wf/logs/serve.log.
//   wf serve               start it, detached
//   wf serve --wait        start it, and return once it answers
//   wf serve --foreground  run it here until it dies (what the detached process runs)
//   wf serve --stop        release the recorded server tree, preserving the worktree and database
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readlinkSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ownedProcessTree, parseProcessIdentities } from '../process-tree.ts';
import { connect } from 'node:net';
import { directUrls, prepareServe, serve, stackUrls } from '../project.ts';
import { seams } from '../seams.ts';
import { realProbeStack } from '../round/status.ts';
import { PROCESS_CWD_PS } from '../process-cwd.ts';
import { basePortForBranch, slugForBranch, urlLines } from './worktree.ts';

export const pidFile = (worktree: string) => join(worktree, '.wf', 'serve.pid');

// Serialize starts and stops; a crashed lock is recoverable only with a known, absent creator.
function reserveServerOwnership(worktree: string): () => void {
	mkdirSync(join(worktree, '.wf'), { recursive: true });
	const lock = join(worktree, '.wf', 'serve.lock');
	const snapshot = seams.processes.snapshot();
	const owner = snapshot.kind === 'known' ? snapshot.processes.find((p) => p.pid === process.pid) : null;
	if (!owner) throw new Error('wf serve: cannot establish cleanup owner; process inventory unavailable');
	if (existsSync(lock)) throw new Error('wf serve: another or interrupted start/stop owns serve.lock; inspect its creator before recovery');
	const fd = openSync(lock, 'wx');
	const bytes = JSON.stringify({ token: randomUUID(), processes: [owner] });
	try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
	return () => { if (existsSync(lock) && readFileSync(lock, 'utf8') === bytes) unlinkSync(lock); };
}

// The pid `wf serve` recorded for this worktree, or null.
export function servePid(worktree: string) {
	const file = pidFile(worktree);
	const pid = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : NaN;
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const alive = (pid: number) => {
	try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

/** A stop refuses unknown process ownership instead of trusting a possibly recycled PID. */
export type ServerStopResult = { readonly kind: 'stopped'; readonly pid: number } | { readonly kind: 'absent' } | { readonly kind: 'refused'; readonly why: string };

// Only the recorded foreground entry is a server owner; agents and the shared proxy are not.
// Releasing an idle stack must not end other work in the same worktree (2026-10-14).
function serverProcessOwner(worktree: string, pid: number): 'owned' | 'gone' | 'other' | 'unknown' {
	if (!alive(pid)) return 'gone';
	if (process.platform === 'win32') {
		const path = worktree.replace(/\\/g, '/').replace(/\/+$/, '').replace(/'/g, "''");
		const entry = seams.entry.replace(/\\/g, '/').replace(/'/g, "''");
		const script = String.raw`$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';
try {
  ${PROCESS_CWD_PS}
  $p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'
  if (!$p) { 'gone'; exit }
  $cwd = WfCwdOf $p.ProcessId
  if (!$cwd) { 'unknown'; exit }
  $command = $p.CommandLine.Replace([char]92, [char]47)
  $node = '^(?:"[^"]+"|\S+)\s+'
  $entry = $node + '"?' + [regex]::Escape('${entry}') + '"?\s+serve\s+--foreground(\s|$)'
  $legacy = $node + '(?:"[^"]*/wf[.]mjs"|[^\s"]*/wf[.]mjs)\s+serve\s+--foreground(\s|$)'
  $foreground = $command -match $entry -or $command -match $legacy
  if ($p.Name -eq 'node.exe' -and $foreground -and $cwd.Replace([char]92, [char]47).TrimEnd('/') -eq '${path}') { 'owned' } else { 'other' }
} catch { 'unknown'; exit 1 }`;
		const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
		const owner = result.stdout?.trim();
		return result.status === 0 && (owner === 'owned' || owner === 'gone' || owner === 'other') ? owner : 'unknown';
	}
	const command = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', timeout: 5000 });
	if (command.status !== 0) return alive(pid) ? 'unknown' : 'gone';
	let cwd: string;
	try {
		if (process.platform === 'linux') cwd = readlinkSync(`/proc/${pid}/cwd`);
		else {
			const result = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 5000 });
			const path = result.stdout?.split('\n').find((line) => line.startsWith('n'))?.slice(1);
			if (result.status !== 0 || !path) return 'unknown';
			cwd = path;
		}
	} catch { return 'unknown'; /* unreadable cwd cannot authorize ending a process */ }
	const entry = seams.entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const node = String.raw`^(?:"[^"]+"|\S+)\s+`;
	const foreground = new RegExp(`${node}"?${entry}"?\\s+serve\\s+--foreground(\\s|$)`).test(command.stdout) || new RegExp(`${node}(?:"[^"]*/wf[.]mjs"|[^\\s"]*/wf[.]mjs)\\s+serve\\s+--foreground(\\s|$)`).test(command.stdout);
	return foreground && cwd.replace(/\/+$/, '') === worktree.replace(/\/+$/, '') ? 'owned' : 'other';
}

function serverAddressAlive(url: URL): Promise<'present' | 'absent' | 'unknown'> {
	return new Promise((resolve) => {
		const socket = connect({ host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) });
		const done = (up: 'present' | 'absent' | 'unknown') => { socket.destroy(); resolve(up); };
		socket.setTimeout(250);
		socket.once('connect', () => done('present'));
		socket.once('error', (error) => done('code' in error && error.code === 'ECONNREFUSED' ? 'absent' : 'unknown'));
		socket.once('timeout', () => done('unknown'));
	});
}

/** Stop the recorded server tree and await closed addresses; preserve checkout, database and other work. */
export async function stopWorktreeServers(worktree: string, expectedToken?: string): Promise<ServerStopResult> {
	let release: (() => void) | undefined;
	try {
		if (!existsSync(pidFile(worktree)) && !existsSync(join(worktree, '.wf', 'serve-owner.json'))) return { kind: 'absent' };
		release = reserveServerOwnership(worktree);
		const pid = servePid(worktree);
		const record = join(worktree, '.wf', 'serve-owner.json');
		if (pid === null) return existsSync(pidFile(worktree)) || existsSync(record) ? { kind: 'refused', why: 'wf serve: invalid or partial ownership record; inspect .wf/serve-owner.json' } : { kind: 'absent' };
		const snapshot = seams.processes.snapshot();
		if (snapshot.kind === 'unknown') return { kind: 'refused', why: 'wf serve: process inventory unavailable; ownership retained' };
		const original = existsSync(record) ? readFileSync(record, 'utf8') : null;
		let owners;
		let token: string = randomUUID();
		if (original !== null) {
			const raw: unknown = JSON.parse(original);
			if (typeof raw !== 'object' || raw === null || !('token' in raw) || typeof raw.token !== 'string' || !('processes' in raw)) return { kind: 'refused', why: 'wf serve: malformed ownership record; retained for recovery' };
			token = raw.token;
			if (expectedToken !== undefined && token !== expectedToken) return { kind: 'refused', why: 'wf serve: stop handle belongs to an older run; replacement retained' };
			owners = parseProcessIdentities(raw.processes);
			if (!owners?.length || owners[0].pid !== pid) return { kind: 'refused', why: 'wf serve: ownership record does not match serve.pid; retained for recovery' };
			if (!snapshot.processes.some((p) => p.pid === pid) && (!('state' in raw) || raw.state !== 'releasing')) return { kind: 'refused', why: 'wf serve: owner disappeared before release; possible orphan descendants require inspection' };
		} else {
			if (expectedToken !== undefined) return { kind: 'refused', why: 'wf serve: stop handle ownership is missing; retained for recovery' };
			// Legacy adoption is deliberately narrow: a missing root cannot authorize its orphans.
			if (serverProcessOwner(worktree, pid) !== 'owned') return { kind: 'refused', why: `wf serve: PID ${pid} is not a verified foreground server in this worktree; ownership retained` };
			const root = snapshot.processes.find((p) => p.pid === pid);
			if (!root) return { kind: 'refused', why: 'wf serve: server disappeared during ownership probe; retained for recovery' };
			owners = [root];
		}
		if (owners.some((owner) => snapshot.processes.some((p) => p.pid === owner.pid && p.born !== owner.born))) return { kind: 'refused', why: 'wf serve: reused PID; ownership retained and no process stopped' };
		owners = ownedProcessTree(owners, snapshot.processes);
		if (servePid(worktree) !== pid || (existsSync(record) ? readFileSync(record, 'utf8') : null) !== original) return { kind: 'refused', why: 'wf serve: ownership changed during stop; retry' };
		const releasing = JSON.stringify({ token, state: 'releasing', processes: owners });
		writeFileSync(record, releasing);
		if (!seams.processes.kill(owners)) return { kind: 'refused', why: 'wf serve: could not stop owned processes; ownership retained for retry' };
		const branch = execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
		const urls = Object.values(directUrls(basePortForBranch(branch))).flatMap((value) => { const url = new URL(value); if (url.hostname !== 'localhost') return [url]; const ipv4 = new URL(value); ipv4.hostname = '127.0.0.1'; const ipv6 = new URL(value); ipv6.hostname = '[::1]'; return [ipv4, ipv6]; });
		const until = Date.now() + 3000;
		while (true) {
			if (servePid(worktree) !== pid || readFileSync(record, 'utf8') !== releasing) return { kind: 'refused', why: 'wf serve: ownership changed during shutdown; replacement retained' };
			const remaining = seams.processes.snapshot();
			if (remaining.kind === 'unknown') return { kind: 'refused', why: 'wf serve: shutdown probe unavailable; ownership retained' };
			if (!owners.some((owner) => remaining.processes.some((p) => p.pid === owner.pid && p.born === owner.born || p.parent === owner.pid && Date.parse(p.born) >= Date.parse(owner.born))) && (await Promise.all(urls.map(serverAddressAlive))).every((probe) => probe === 'absent')) break;
			if (Date.now() >= until) return { kind: 'refused', why: 'wf serve: descendant or endpoint shutdown not confirmed; ownership retained for retry' };
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		unlinkSync(pidFile(worktree));
		unlinkSync(record);
		return { kind: 'stopped', pid };
	} catch {
		return { kind: 'refused', why: 'wf serve: could not verify shutdown or update ownership; inspect .wf/serve-owner.json and retry' };
	} finally { release?.(); }
}

// Starts the stack detached; returns its pid. stdio goes to a file, not this process: a server that
// inherits a pipe keeps its reader waiting for EOF (40 min under an agent harness, 2026-09-20).
export function startServers(worktree: string) {
	prepareServe();
	const release = reserveServerOwnership(worktree);
	try {
		if (existsSync(pidFile(worktree)) || existsSync(join(worktree, '.wf', 'serve-owner.json'))) throw new Error('wf serve: existing ownership must be released before starting another stack');
		mkdirSync(join(worktree, '.wf', 'logs'), { recursive: true });
		const fd = openSync(join(worktree, '.wf', 'logs', 'serve.log'), 'a');
		writeFileSync(join(worktree, '.wf', 'serve-owner.json'), JSON.stringify({ token: randomUUID(), state: 'starting', processes: [] }));
		const child = spawn(process.execPath, [seams.entry, 'serve', '--foreground'], { cwd: worktree, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
		closeSync(fd);
		child.once('error', () => appendFileSync(join(worktree, '.wf', 'logs', 'serve.log'), 'wf serve: foreground launch failed; ownership retained\n'));
		child.unref();
		if (!child.pid) throw new Error('wf serve: server process did not start');
		writeFileSync(pidFile(worktree), String(child.pid));
		const snapshot = seams.processes.snapshot();
		const root = snapshot.kind === 'known' ? snapshot.processes.find((p) => p.pid === child.pid) : null;
		if (root) writeFileSync(join(worktree, '.wf', 'serve-owner.json'), JSON.stringify({ token: randomUUID(), state: 'running', processes: [root] }));
		return child.pid;
	} finally { release(); }
}

// Pure: on Windows, the detached process re-runs itself once with windowsHide, or null. A detached
// process has no console, and each console program it starts opens a window of its own:
// concurrently's three cmd.exe opened three Windows Terminal windows at TJEW-670.11's wf new
// (2026-09-28). The hop's console has no window, and the servers under it share it.
// Pipes, not inherited stdio: libuv asks for CREATE_NO_WINDOW only when no stdio is inherited. With
// 'inherit' the hop got a console with SW_HIDE, and Windows Terminal (the default terminal) still
// flashed a window for it at every wf new and wf serve (the console watcher, 2026-09-28 17:34:20).
export function hiddenHop(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): { args: string[]; options: { stdio: ['ignore', 'pipe', 'pipe']; windowsHide: boolean; env: NodeJS.ProcessEnv } } | null {
	if (platform !== 'win32' || env.WF_SERVE_HIDDEN) return null;
	return { args: [seams.entry, 'serve', '--foreground'], options: { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...env, WF_SERVE_HIDDEN: '1' } } };
}

// Starts the worktree's stack unless it answers or is starting already; returns what it did, for the
// caller to print. `wait`: until the stack answers (a cold start takes ~20-40 s), for a caller that
// drives the app next; throws after `timeoutMs`, naming the logs.
export async function ensureServers(worktree: string, { wait = false, timeoutMs = 180_000 }: { wait?: boolean; timeoutMs?: number } = {}): Promise<string> {
	const branch = execFileSync('git', ['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
	const slug = slugForBranch(branch);
	const port = basePortForBranch(branch);
	const urls = urlLines(stackUrls({ slug, port }));
	const logs = join(worktree, '.wf', 'logs');
	if (await realProbeStack(port)) return `wf serve: the stack answers already\n${urls}`;
	const pid = servePid(worktree);
	if (pid && serverProcessOwner(worktree, pid) !== 'owned' || !pid && existsSync(join(worktree, '.wf', 'serve-owner.json'))) {
		throw new Error('wf serve: previous ownership is unresolved; run wf serve --stop and inspect its recovery record before restarting');
	}
	const said = pid && alive(pid) ? `wf serve: started already (pid ${pid}), not answering yet: see ${logs}` : `wf serve: starting (pid ${startServers(worktree)}; logs in ${logs})\n${urls}`;
	if (!wait) return said;
	const recorded: unknown = JSON.parse(readFileSync(join(worktree, '.wf', 'serve-owner.json'), 'utf8'));
	const expectedToken = typeof recorded === 'object' && recorded !== null && 'token' in recorded && typeof recorded.token === 'string' ? recorded.token : undefined;
	const t0 = Date.now();
	let cancelled = false;
	const cancel = () => { cancelled = true; };
	process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
	try {
		while (cancelled || !(await realProbeStack(port))) {
			if (cancelled || Date.now() - t0 > timeoutMs) {
				const stopped = await stopWorktreeServers(worktree, expectedToken);
				throw new Error(`wf serve: ${cancelled ? 'startup cancelled' : `the stack did not answer within ${timeoutMs / 1000} s`}: see ${logs}; ${stopped.kind === 'refused' ? stopped.why : 'owned startup released'}`);
			}
			await new Promise((r) => setTimeout(r, 2000));
		}
		return `${said}\nwf serve: the stack answers (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
	} finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }

}

export async function runServe(argv: string[]) {
	const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
	const worktree = git('rev-parse', '--show-toplevel');
	if (argv.includes('--stop')) {
		const stopped = await stopWorktreeServers(worktree);
		if (stopped.kind === 'refused') { console.error(stopped.why); process.exitCode = 1; }
		else console.log(stopped.kind === 'stopped' ? `wf serve: stopped server tree ${stopped.pid}` : 'wf serve: no recorded server running');
		return;
	}
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	const slug = slugForBranch(branch);
	const port = basePortForBranch(branch);
	if (argv.includes('--foreground')) {
		// The detached owner must be durably identified before it can acquire any server children.
		if (!process.env.WF_SERVE_HIDDEN) {
			const until = Date.now() + 20_000;
			let recorded = false;
			while (Date.now() < until) {
				try {
					const raw: unknown = JSON.parse(readFileSync(join(worktree, '.wf', 'serve-owner.json'), 'utf8'));
					if (typeof raw === 'object' && raw !== null && 'state' in raw && raw.state === 'running' && 'processes' in raw) {
						const owners = parseProcessIdentities(raw.processes);
						if (owners?.[0]?.pid === process.pid) { recorded = true; break; }
					}
				} catch { /* parent has not published the acquisition yet; no children may start */ }
				await new Promise((done) => setTimeout(done, 25));
			}
			if (!recorded) { console.error('wf serve: foreground ownership was not recorded; no stack started'); process.exitCode = 1; return; }
		}
		const hop = hiddenHop(process.platform, process.env);
		if (hop) {
			const child = spawn(process.execPath, hop.args, hop.options);
			child.stdout.pipe(process.stdout);
			child.stderr.pipe(process.stderr);
			child.on('exit', (code) => process.exit(code ?? 1));
			return;
		}
		return serve({ worktree, slug, port });
	}
	console.log(await ensureServers(worktree, { wait: argv.includes('--wait') }));
}
