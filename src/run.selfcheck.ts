// run.selfcheck.ts — node run.selfcheck.ts → exit 0 when green.
// Pure arm: which argv asks for help, which the dispatcher answers before any command runs.
import { wantsHelp } from './run.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('--help or -h anywhere, or `help`, asks for help', wantsHelp(['serve', '--help']) && wantsHelp(['check', '--repro', '-h']) && wantsHelp(['--help']) && wantsHelp(['help']));
check('a command with its own arguments does not', !wantsHelp(['serve']) && !wantsHelp(['check', '--repro']) && !wantsHelp(['reap', 'fix/help-me']) && !wantsHelp([]));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
