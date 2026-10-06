// The working folder of every running process (seams.processCwds), for `wf status`'s count of what
// still runs in each worktree. Windows keeps a process's working folder only in its own process
// block, so this reads it there: that is how the portless proxy holding BJEW-461's folder past its
// reap was found (2026-10-06); neither its command line nor Win32_Process named the folder.
import { execFileSync } from 'node:child_process';

const READ_CWDS = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class WfCwd {
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
    } finally { CloseHandle(h); } }
}
"@
foreach ($p in [System.Diagnostics.Process]::GetProcesses()) { $c = [WfCwd]::Get($p.Id); if ($c) { $c } }
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
