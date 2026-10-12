// process-cwd.ts — Windows: read a running process's working directory out of its own process block.
// A dev server holds its worktree through its cwd, and the two things wf does about it both need this
// walk: `wf status` counts what still runs in each worktree (seams.processCwds, env/adapters/processes.ts),
// and `wf reap`'s straggler sweep ends what does (serve.ts). They each carried a copy until 2026-10-12.
// Windows keeps a cwd nowhere else: neither the command line nor Win32_Process names it (that is how the
// portless proxy holding BJEW-461's folder past its reap was found, 2026-10-06). Not a worktree, yet
// both consumers are: a module under src/worktrees/ served one and reached past the other.
// The snippet defines the `WfCwd` type and a `WfCwdOf` helper (so a mis-defined type yields null, not an
// error). It is a fragment: a caller appends its own loop and passes the whole as -EncodedCommand.
export const PROCESS_CWD_PS = `Add-Type -TypeDefinition @'
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
    } finally { CloseHandle(h); } } }
'@
function WfCwdOf($procId) { try { return [WfCwd]::Get($procId) } catch { return $null } }
`;
