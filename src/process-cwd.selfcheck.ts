// process-cwd.selfcheck.ts — node src/process-cwd.selfcheck.ts → exit 0 when green.
// Pure arms: the shared PowerShell fragment both cwd readers compose (process-cwd.ts). The read itself
// is checked where it runs (git-worktree.selfcheck.ts's plan, and `wf status` on the machine).
import { PROCESS_CWD_PS } from './process-cwd.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('it defines the cwd type', PROCESS_CWD_PS.includes('public static class WfCwd') && PROCESS_CWD_PS.includes('NtQueryInformationProcess'));
check('it defines the null-on-failure helper so a caller never throws', PROCESS_CWD_PS.includes('function WfCwdOf') && PROCESS_CWD_PS.includes('catch { return $null }'));
// $pid is PowerShell's own read-only variable: a parameter named $pid throws on assignment, and the
// helper's try/catch then swallows it and every read returns null (a silent, total failure).
check('the helper does not name its parameter $pid (PowerShell makes that read-only)', !/\$pid\b/.test(PROCESS_CWD_PS), PROCESS_CWD_PS.match(/function WfCwdOf[^\n]*/)?.join());
// -EncodedCommand, not -Command: a caller appends its own loop and reap runs the whole through cmd.exe,
// which cuts at the first `|`. A double-quoted here-string would need its quotes doubled per composer;
// single-quoted does not, and the here-string close must start a line.
check('the here-string is single-quoted and closes at the start of a line', !PROCESS_CWD_PS.includes('@"') && /^'@$/m.test(PROCESS_CWD_PS));
check('it is a fragment: the caller appends its own process loop', !/Get-CimInstance|GetProcesses/.test(PROCESS_CWD_PS));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
