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
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, stackUrls } from '../project.ts';
import { seams } from '../seams.ts';
import type { RemovalStep } from '../seams.ts';
import { realProbeStack } from '../round/status.ts';
import { basePortForBranch, slugForBranch, urlLines } from './worktree.ts';

export const pidFile = (worktree: string) => join(worktree, '.wf', 'serve.pid');

// The pid `wf serve` recorded for this worktree, or null.
export function servePid(worktree: string) {
	const file = pidFile(worktree);
	const pid = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : NaN;
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const alive = (pid: number) => {
	try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

// Pure: the step that stops the servers, with every process under them. Windows: taskkill's tree.
// Elsewhere the detached process leads its own process group, so the group gets the signal.
export function stopServersStep(pid: number, platform: NodeJS.Platform = process.platform) {
	return platform === 'win32'
		? { label: 'stop servers', cmd: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] } satisfies RemovalStep
		: { label: 'stop servers', cmd: 'kill', args: ['-TERM', `-${pid}`] } satisfies RemovalStep;
}

// Windows: reads a process's working directory out of its PEB (the same walk env/adapters/processes.ts
// does for `wf status`): a process holds its folder through its cwd, and WMI names only the command line.
// Wrapped in try/catch so this arm never stops the command-line match below it.
const CWD_READER = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class WfSweepCwd {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int c, ref PBI p, int l, out int r);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int a, bool i, int pid);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr b, byte[] buf, int n, out IntPtr r);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct PBI { public IntPtr a; public IntPtr Peb; public IntPtr b; public IntPtr c; public IntPtr d; public IntPtr e; }
  static IntPtr Ptr(IntPtr h, IntPtr at) { var b = new byte[8]; IntPtr r; return ReadProcessMemory(h, at, b, 8, out r) ? (IntPtr)BitConverter.ToInt64(b, 0) : IntPtr.Zero; }
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid); if (h == IntPtr.Zero) return null;
    try { var p = new PBI(); int r; if (NtQueryInformationProcess(h, 0, ref p, Marshal.SizeOf(p), out r) != 0) return null;
      IntPtr pp = Ptr(h, p.Peb + 0x20); if (pp == IntPtr.Zero) return null;
      var us = new byte[16]; IntPtr rr; if (!ReadProcessMemory(h, pp + 0x38, us, 16, out rr)) return null;
      int len = BitConverter.ToUInt16(us, 0); IntPtr buf = (IntPtr)BitConverter.ToInt64(us, 8);
      var s = new byte[len]; if (!ReadProcessMemory(h, buf, s, len, out rr)) return null; return Encoding.Unicode.GetString(s);
    } finally { CloseHandle(h); } } }
"@`;

// Pure: the step that ends every process still running from the worktree but this one, so its folder
// can go: a live process holds it on Windows (EPERM), and the round's stack is not the only one.
// Measured: 23 processes at an env reap (2026-09-24); BJEW-562's kit reap (2026-09-27) left the folder
// to the playwright daemon of `wf show`'s headed window. git reports the path with forward slashes, a
// command line carries backslashes: match either spelling. -EncodedCommand, not -Command: reap runs
// steps through cmd.exe on Windows, which cut the script at its first `|`.
// It matches each process by its command line or by its working directory. The second is not optional:
// a portless app starts as cmd -> portless -> mise -> app, and the first three name the worktree in no
// command line, only as their working directory (so the proxy survived its serve tree's taskkill, and
// matches the process-name filter yet not its path) — it held fix/jx-810's folder past its reap
// (2026-10-12). The names therefore cover those launchers; the cwd arm scopes them to the worktree, and
// killing by pid, not the tree, is what reaches an orphan whose launcher is already dead.
export function stragglersStep(path: string, pid: number, platform: NodeJS.Platform = process.platform) {
	if (platform !== 'win32') return { label: 'kill stragglers', cmd: 'pkill', args: ['-f', path] } satisfies RemovalStep;
	const fwd = path.replace(/\\/g, '/').replace(/'/g, "''");
	const bck = fwd.replace(/\//g, '\\');
	const ps = `$ProgressPreference = 'SilentlyContinue';
$names = @('node.exe', 'python.exe', 'portless.exe', 'mise.exe', 'cmd.exe');
function WfHolds($cwd, $cmd) {
  if ($cmd) { foreach ($p in @('${fwd}', '${bck}')) { if ($cmd -like ('*' + $p + '*')) { return $true } } }
  if ($cwd -like ('*' + '${bck}' + '*')) { return $true }
  return $false
}
try { ${CWD_READER}
} catch {}
Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name -and $_.ProcessId -ne ${pid} } | ForEach-Object {
  $cwd = $null; try { $cwd = [WfSweepCwd]::Get($_.ProcessId) } catch {}
  if (WfHolds $cwd $_.CommandLine) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}`;
	return { label: 'kill stragglers', cmd: 'powershell', args: ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')] } satisfies RemovalStep;
}

// Starts the stack detached; returns its pid. stdio goes to a file, not this process: a server that
// inherits a pipe keeps its reader waiting for EOF (40 min under an agent harness, 2026-09-20).
export function startServers(worktree: string) {
	mkdirSync(join(worktree, '.wf', 'logs'), { recursive: true });
	const fd = openSync(join(worktree, '.wf', 'logs', 'serve.log'), 'a');
	const child = spawn(process.execPath, [seams.entry, 'serve', '--foreground'], { cwd: worktree, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
	closeSync(fd);
	child.unref();
	writeFileSync(pidFile(worktree), String(child.pid));
	return child.pid;
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
	// Still starting: a second one would lose the port and the pid.
	const said = pid && alive(pid) ? `wf serve: started already (pid ${pid}), not answering yet: see ${logs}` : `wf serve: starting (pid ${startServers(worktree)}; logs in ${logs})\n${urls}`;
	if (!wait) return said;
	const t0 = Date.now();
	while (!(await realProbeStack(port))) {
		if (Date.now() - t0 > timeoutMs) throw new Error(`wf serve: the stack did not answer within ${timeoutMs / 1000} s: see ${logs}`);
		await new Promise((r) => setTimeout(r, 2000));
	}
	return `${said}\nwf serve: the stack answers (${((Date.now() - t0) / 1000).toFixed(0)} s)`;
}

export async function runServe(argv: string[]) {
	const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
	const worktree = git('rev-parse', '--show-toplevel');
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	const slug = slugForBranch(branch);
	const port = basePortForBranch(branch);
	if (argv.includes('--foreground')) {
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
