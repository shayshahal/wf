// git-worktree.selfcheck.mjs — node git-worktree.selfcheck.mjs → exit 0 when green.
// Pure arms: the kit's removal plan (git-worktree.mjs), the step that stops a stack (serve.mjs).
// Nothing is run, created or removed but a temp folder standing in for a worktree.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removalPlan } from './git-worktree.mjs';
import { stopServersStep } from './serve.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

check('Windows: taskkill takes the whole tree', stopServersStep(4242, 'win32').args.join(' ') === '/PID 4242 /T /F');
check('elsewhere: the detached process\'s group gets SIGTERM', stopServersStep(4242, 'darwin').cmd === 'kill' && stopServersStep(4242, 'darwin').args.join(' ') === '-TERM -4242');

const tree = mkdtempSync(join(tmpdir(), 'wf-gw-'));
const labels = () => removalPlan({ path: tree, slug: 'fix-a' }).map((s) => s.label).join(' → ');
check('no stack started: teardown before the folder goes, then prune', labels() === 'drop database → rm -rf worktree → git worktree prune', labels());
mkdirSync(join(tree, '.wf'));
writeFileSync(join(tree, '.wf', 'serve.pid'), '31337\n');
check('a stack started: it stops first', labels().startsWith('stop servers → drop database'), labels());
check('the stop names the recorded pid', removalPlan({ path: tree, slug: 'fix-a' })[0].args.includes(process.platform === 'win32' ? '31337' : '-31337'));
check('the folder goes in-process, no path through the shell', removalPlan({ path: tree, slug: 'fix-a' }).every((s) => !s.args?.includes(tree)));
rmSync(tree, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
