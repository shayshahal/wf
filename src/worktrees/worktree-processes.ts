// worktree-processes.ts — the processes that live in a worktree, for what wf did not start or no longer
// owns. Two callers, one rule set:
//   reap (stopWorktreeProcesses): every process whose executable or script is inside the worktree, with
//     the processes under it. A Playwright daemon the round's agent started from the worktree's own
//     node_modules held fix/jx-1085's folder after reap had stopped everything it owned (2026-11-22).
//   wf serve --stop, when the recorded root is gone (staleServeLeftovers): what its stack may have left.
//     That stack exited by itself 3 s after it started, and every stop refused until someone inspected
//     by hand (2026-11-22, same round).
// A process is never chosen by its working folder alone while its parent lives: that is an agent's shell
// or an editor parked in the worktree (Shay's pick in the Inbox for #255, 2026-11-22). The kill still
// goes by pid and creation time (process-tree.ts, #161); the path only chooses which identities.
import { spawnSync } from 'node:child_process';
import { readlinkSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { PROCESS_CWD_PS } from '../process-cwd.ts';
import { ownedProcessTree } from '../process-tree.ts';
import type { ProcessIdentity, ProcessKillFailure } from '../process-tree.ts';
import { seams } from '../seams.ts';

/** A process identity with where it runs from; each field is null when the machine would not say. */
export type ProcessDetail = ProcessIdentity & { exe: string | null; command: string | null; cwd: string | null };
export type ProcessInventory = { kind: 'known'; processes: ProcessDetail[] } | { kind: 'unknown' };

// `born` is spelled exactly as snapshotProcesses spells it: the kill compares the two. UTF-8 out: a pipe
// gets the console's code page, which wrote another agent's `RPT-040 → RPT-042` as a raw 0x1A byte, and
// JSON.parse refused the whole list (2 selfcheck runs in 4, 2026-11-22).
const INVENTORY_PS = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
${PROCESS_CWD_PS}
@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -gt 0 -and $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; born = $_.CreationDate.ToUniversalTime().ToString('o'); exe = $_.ExecutablePath; command = $_.CommandLine; cwd = (WfCwdOf $_.ProcessId) } }) | ConvertTo-Json -Compress`;

const text = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null;
const link = (path: string) => { try { return readlinkSync(path); } catch { return null; /* another user's process, or gone: not known */ } };

/** Every process with its executable, command line and working folder. Unknown grants nothing. */
export function processInventory(): ProcessInventory {
	if (process.platform === 'win32') {
		const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(INVENTORY_PS, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 256 * 1024 * 1024 });
		if (r.status !== 0) return { kind: 'unknown' };
		let raw: unknown;
		try { raw = JSON.parse(r.stdout); } catch { return { kind: 'unknown' }; /* invalid native output grants no kill authority */ }
		if (!Array.isArray(raw)) return { kind: 'unknown' };
		const processes: ProcessDetail[] = [];
		for (const p of raw as Record<string, unknown>[]) {
			if (typeof p.pid !== 'number' || typeof p.parent !== 'number' || typeof p.born !== 'string') return { kind: 'unknown' };
			processes.push({ pid: p.pid, parent: p.parent, born: p.born, exe: text(p.exe), command: text(p.command), cwd: text(p.cwd) });
		}
		return { kind: 'known', processes };
	}
	// lstart is a fixed five-word date, so the command line follows it; snapshotProcesses reads the same.
	const r = spawnSync('ps', ['-ww', '-eo', 'pid=,ppid=,lstart=,args='], { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) return { kind: 'unknown' };
	const cwds = new Map<number, string>();
	if (process.platform !== 'linux') {
		// macOS has no /proc: one lsof for every process's cwd ("p<pid>" then "n<path>" lines).
		const l = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fpn'], { encoding: 'utf8', timeout: 20_000, maxBuffer: 64 * 1024 * 1024 });
		let at = 0;
		for (const line of (l.stdout ?? '').split('\n')) {
			if (line.startsWith('p')) at = Number(line.slice(1));
			else if (line.startsWith('n') && at) cwds.set(at, line.slice(1));
		}
	}
	const processes: ProcessDetail[] = [];
	for (const line of r.stdout.split('\n')) {
		const m = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s*(.*)$/.exec(line);
		if (!m) continue;
		const pid = Number(m[1]);
		const linux = process.platform === 'linux';
		processes.push({ pid, parent: Number(m[2]), born: m[3], exe: linux ? link(`/proc/${pid}/exe`) : null, command: text(m[4]), cwd: linux ? link(`/proc/${pid}/cwd`) : cwds.get(pid) ?? null });
	}
	return processes.length ? { kind: 'known', processes } : { kind: 'unknown' };
}

const spell = (path: string) => {
	const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '');
	return process.platform === 'win32' ? slashed.toLowerCase() : slashed;
};

/** The worktree's spellings: as given and as the file system resolves it (a short or linked temp path). */
export function worktreeSpellings(worktree: string): string[] {
	let real: string | null = null;
	try { real = realpathSync.native(worktree); } catch { real = null; /* already deleted: the given spelling is all there is */ }
	return [...new Set([worktree, real].filter((p): p is string => p !== null).map(spell))];
}

const inside = (path: string | null, roots: readonly string[], self = true) => {
	if (!path) return false;
	const p = spell(path);
	return roots.some((root) => (self && p === root) || p.startsWith(`${root}/`));
};

// Pure: the script a command line runs, the first argument that is not a flag, resolved against the
// process's working folder. `cmd /d /s /c "pnpm dev"` has none that is a file; `node <script> default` has.
export function commandScript(command: string | null, cwd: string | null, platform: NodeJS.Platform = process.platform): string | null {
	if (!command) return null;
	const tokens = [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]).slice(1);
	const first = tokens.find((t) => !t.startsWith('-') && !(platform === 'win32' && /^\/[a-z?]$/i.test(t)));
	if (!first) return null;
	if (isAbsolute(first) || (platform === 'win32' && /^[a-z]:[\\/]/i.test(first))) return first;
	return cwd ? resolve(cwd, first) : null;
}

const isFile = (path: string) => { try { return statSync(path).isFile(); } catch { return false; /* not a file on this machine: no script */ } };

/** The process's executable or script is a file inside the worktree. */
export function startedFromWorktree(p: ProcessDetail, roots: readonly string[]): boolean {
	if (inside(p.exe, roots, false)) return true;
	const script = commandScript(p.command, p.cwd);
	return script !== null && inside(script, roots, false) && isFile(script);
}

// This process and those above it: never chosen, whatever their folder (reap runs from a shell).
function selfAndAncestors(processes: readonly ProcessIdentity[]): Set<number> {
	const mine = new Set<number>();
	for (let at: ProcessIdentity | undefined = processes.find((p) => p.pid === process.pid); at && !mine.has(at.pid); at = processes.find((p) => p.pid === at!.parent)) mine.add(at.pid);
	mine.add(process.pid);
	return mine;
}

const identity = ({ pid, parent, born }: ProcessIdentity): ProcessIdentity => ({ pid, parent, born });

/** Pure: reap's selection, the processes started from the worktree and every process under them. */
export function worktreeProcessTrees(worktree: string, processes: readonly ProcessDetail[]): ProcessDetail[] {
	const roots = worktreeSpellings(worktree);
	const mine = selfAndAncestors(processes);
	const seeds = processes.filter((p) => !mine.has(p.pid) && startedFromWorktree(p, roots));
	const tree = new Set(ownedProcessTree(seeds, processes).map((p) => p.pid));
	return processes.filter((p) => tree.has(p.pid) && !mine.has(p.pid));
}

/**
 * Pure: what a serve stack whose recorded root is gone may have left, with every process under it. Only
 * processes born after the root can be its stack's:
 *   - the root's own children (on Windows an orphan keeps its parent's pid);
 *   - those whose executable or script is inside the worktree (a dev server under a hop that died too);
 *   - orphans whose working folder is the worktree (cmd.exe running `pnpm dev` under that hop).
 * A process parked in the worktree under a live parent is not one of them.
 */
export function staleServeLeftovers(worktree: string, root: ProcessIdentity, processes: readonly ProcessDetail[]): ProcessDetail[] {
	const roots = worktreeSpellings(worktree);
	const mine = selfAndAncestors(processes);
	const since = Date.parse(root.born);
	// A pid reused after the root exited: its own children are not the root's.
	const reused = processes.find((p) => p.pid === root.pid && p.born !== root.born);
	const until = reused ? Date.parse(reused.born) : Infinity;
	const live = new Set(processes.map((p) => p.pid));
	const seeds = processes.filter((p) => {
		const born = Date.parse(p.born);
		if (mine.has(p.pid) || !(born >= since)) return false;
		if (p.parent === root.pid && born < until) return true;
		return startedFromWorktree(p, roots) || (inside(p.cwd, roots) && !live.has(p.parent));
	});
	const tree = new Set(ownedProcessTree(seeds, processes).map((p) => p.pid));
	return processes.filter((p) => tree.has(p.pid) && !mine.has(p.pid));
}

const name = (p: ProcessDetail) => `${p.pid} ${(p.exe ?? p.command ?? '?').split(/[\\/]/).pop()?.slice(0, 60)}`;
export const describeProcesses = (processes: readonly ProcessDetail[]) => processes.map(name).join(', ');
export const killFailureText = (f: ProcessKillFailure) => 'pid' in f ? `${f.kind} at pid ${f.pid}` : `${f.kind} (status ${f.status ?? 'none'})`;

/**
 * Reap: stop every process started from the worktree, with the processes under it, by pid and creation
 * time. Throws when the process list can't be read or one of them won't stop, naming them; returns what it
 * stopped, or null when nothing ran from the worktree.
 */
export function stopWorktreeProcesses(worktree: string, inventory: () => ProcessInventory = processInventory): string | null {
	const seen = inventory();
	if (seen.kind === 'unknown') throw new Error(`the process list could not be read, so the processes started from ${worktree} were not stopped`);
	const tree = worktreeProcessTrees(worktree, seen.processes);
	if (!tree.length) return null;
	let failure: ProcessKillFailure | undefined;
	if (!seams.processes.kill(tree.map(identity), (f) => { failure = f; })) throw new Error(`processes started from ${worktree} did not stop (${failure ? killFailureText(failure) : 'no detail'}): ${describeProcesses(tree)}`);
	return `stopped ${tree.length} process(es) started from the worktree: ${describeProcesses(tree)}`;
}

/** The identity fields only: what a record or a kill carries. */
export const identities = (processes: readonly ProcessDetail[]): ProcessIdentity[] => processes.map(identity);
