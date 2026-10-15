// Process identity is PID + creation time. Never authorize a kill from a path or command substring.
import { spawnSync } from 'node:child_process';

/** Minimal process identity; no command lines or environment values leave the machine probe. */
export type ProcessIdentity = { pid: number; parent: number; born: string };
/** An unavailable process inventory cannot establish absence. */
export type ProcessSnapshot = { kind: 'known'; processes: ProcessIdentity[] } | { kind: 'unknown' };

/** Read process creation identities through the native machine probe. */
export function snapshotProcesses(): ProcessSnapshot {
	const script = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object { @{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; born=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress";
	const r = process.platform === 'win32'
		? spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
		: spawnSync('ps', ['-eo', 'pid=,ppid=,lstart='], { encoding: 'utf8', timeout: 5000 });
	if (r.status !== 0) return { kind: 'unknown' };
	try {
		const raw: unknown = process.platform === 'win32' ? JSON.parse(r.stdout) : r.stdout.trim().split('\n').map((line) => {
			const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
			return match ? { pid: Number(match[1]), parent: Number(match[2]), born: match[3] } : null;
		});
		const processes = parseProcessIdentities(raw);
		return processes ? { kind: 'known', processes } : { kind: 'unknown' };
	} catch { return { kind: 'unknown' }; /* invalid native output grants no kill authority */ }
}

/** Parse persisted identities without accepting malformed or empty creation times. */
export function parseProcessIdentities(raw: unknown): ProcessIdentity[] | null {
	if (!Array.isArray(raw)) return null;
	const parsed: ProcessIdentity[] = [];
	const seen = new Set<number>();
	for (const p of raw) {
		if (typeof p !== 'object' || p === null || !('pid' in p) || !('parent' in p) || !('born' in p)
			|| typeof p.pid !== 'number' || !Number.isSafeInteger(p.pid) || p.pid <= 0
			|| typeof p.parent !== 'number' || !Number.isSafeInteger(p.parent) || p.parent < 0
			|| typeof p.born !== 'string' || !Number.isFinite(Date.parse(p.born))) return null;
		if (seen.has(p.pid)) return null;
		seen.add(p.pid);
		parsed.push({ pid: p.pid, parent: p.parent, born: p.born });
	}
	return parsed;
}

/** Expand only live, identity-matched owners to their observed descendants. */
export function ownedProcessTree(owners: readonly ProcessIdentity[], processes: readonly ProcessIdentity[]): ProcessIdentity[] {
	const selected = new Map(owners.map((p) => [p.pid, p]));
	let changed = true;
	while (changed) {
		changed = false;
		for (const p of processes) {
			const parent = selected.get(p.parent);
			if (!selected.has(p.pid) && parent && Date.parse(p.born) >= Date.parse(parent.born) && processes.some((live) => live.pid === parent.pid && live.born === parent.born)) {
				selected.set(p.pid, p); changed = true;
			}
		}
	}
	return [...selected.values()];
}

/** Kill only identities observed before release, rechecking creation time in the native operation. */
export function killOwnedProcesses(owners: readonly ProcessIdentity[]): boolean {
	if (!owners.length) return true;
	if (owners.some((p) => p.pid === process.pid)) return false;
	if (process.platform === 'win32') {
		const encoded = Buffer.from(JSON.stringify(owners)).toString('base64');
		// Pin an OS process handle before checking creation time. A PID can be reused between a
		// CIM lookup and Stop-Process; killing through this same handle cannot target its successor.
		const script = `$ErrorActionPreference='Stop'; $owners=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json;
foreach($owner in $owners) {
  try { $p=[Diagnostics.Process]::GetProcessById($owner.pid) } catch [ArgumentException] { continue }
  try {
    $handle=$p.SafeHandle
    if($p.HasExited) { continue }
    $ticks=$p.StartTime.ToUniversalTime().Ticks
    # CIM's creation time truncates the kernel's 100 ns ticks to microseconds.
    if(($ticks - ($ticks % 10)) -ne ([DateTimeOffset]::Parse($owner.born)).UtcTicks) { exit 2 }
    $p.Kill()
    if(!$p.WaitForExit(3000)) { exit 3 }
  } finally { $p.Dispose() }
}
exit 0`;
		return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'ignore', timeout: 20_000 }).status === 0;
	}
	for (const owner of owners) {
		const snapshot = snapshotProcesses();
		if (snapshot.kind === 'unknown') return false;
		const live = snapshot.processes.find((p) => p.pid === owner.pid);
		if (!live) continue;
		if (live.born !== owner.born) return false;
		try { process.kill(owner.pid, 'SIGKILL'); }
		catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ESRCH')) return false; }
	}
	return true;
}
