// The working folder of every running process (seams.processCwds), for `wf status`'s count of what
// still runs in each worktree. Windows keeps a process's working folder only in its own process
// block, so this reads it there — the reader is the kit's (src/process-cwd.ts, shared with reap's
// straggler sweep since 2026-10-12). That is how the portless proxy holding BJEW-461's folder past its
// reap was found (2026-10-06): neither its command line nor Win32_Process named the folder.
import { execFileSync } from 'node:child_process';
import { PROCESS_CWD_PS } from '../../src/process-cwd.ts';

const READ_CWDS = `
$ProgressPreference = 'SilentlyContinue'
try { ${PROCESS_CWD_PS}
} catch {}
foreach ($p in [System.Diagnostics.Process]::GetProcesses()) { $c = WfCwdOf $p.Id; if ($c) { $c } }
`;

export function processCwds(): string[] {
	if (process.platform !== 'win32') return [];
	try {
		const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(READ_CWDS, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
		return out.split(/\r?\n/).filter(Boolean);
	} catch {
		// No count is better than a status that fails: wf status prints the row without it.
		return [];
	}
}
