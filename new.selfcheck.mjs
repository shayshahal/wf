// new.selfcheck.mjs — node new.selfcheck.mjs → exit 0 when green.
// Pure arm: the worktree's .claude/launch.json for Claude Code Desktop's Browser pane (new.mjs).
import { launchConfig } from './new.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const config = JSON.parse(launchConfig({ b2b: 'http://localhost:12345', admin: 'http://localhost:32345', api: 'http://127.0.0.1:22345/api/v1' }));
check('one entry per app, in the stack\'s order', config.configurations.map((c) => c.name).join() === 'b2b,admin,api');
check('attach mode: a url and no command', config.configurations.every((c) => c.url && !c.runtimeExecutable && !c.program));
check('a bare origin: Desktop refuses a localhost url with a path', config.configurations[2].url === 'http://127.0.0.1:22345', config.configurations[2].url);
check('the version Desktop writes', config.version === '0.0.1');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
