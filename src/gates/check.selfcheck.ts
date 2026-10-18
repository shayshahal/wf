import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shellArgv, shellArgUnsafe, RUN_MAX_BUFFER, manualCheck, identityGap, isRoundPaperwork } from './check.ts';
let failures = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(cond ? `ok ${name}` : `FAIL ${name}: ${detail}`); if (!cond) failures++; };
// The execution edge (#109 review, 2026-10-09): on Windows a runner command goes through cmd.exe
// (shell: true, so a .cmd shim like pnpm starts), and an argument with a space or a cmd metacharacter
// -- the row's selector `^amount \(EUR\)$` -- was split and had `^`/`\` eaten before the runner saw
// it. shellArgv quotes each argument for that path; a faithful native stub records what actually
// arrived. The task's args stay the semantic, unquoted array.
const stubDir = mkdtempSync(join(tmpdir(), 'wf-argv-'));
writeFileSync(join(stubDir, 'argv.cjs'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
const win = process.platform === 'win32';
const stub = join(stubDir, win ? 'wf-stub.cmd' : 'wf-stub');
writeFileSync(stub, win ? '@node "%~dp0argv.cjs" %*\r\n' : '#!/bin/sh\nexec node "$(dirname "$0")/argv.cjs" "$@"\n', win ? {} : { mode: 0o755 });
const argv = ['exec', 'vitest', 'run', 'src/x.test.ts', '-t', '^amount \\(EUR\\)$', '--reporter=verbose'];
const stubRun = spawnSync(stub, shellArgv(argv), { shell: win, encoding: 'utf8' });
check('a spaced, metacharacter argument reaches the runner intact through the shell edge', stubRun.status === 0 && stubRun.stdout === JSON.stringify(argv), JSON.stringify({ out: stubRun.stdout, err: stubRun.stderr }));
// The playwright selected task's argv (checks.ts): a spaced canonical id plus an escaped metacharacter
// and the JSON reporter. Same edge, same check.
const pwArgv = ['exec', 'playwright', 'test', 'tests/account.spec.ts', '-g', 'amount \\(EUR\\)', '--reporter=json'];
const pwStubRun = spawnSync(stub, shellArgv(pwArgv), { shell: win, encoding: 'utf8' });
check('the playwright task argv (spaced id, escaped metacharacter, JSON reporter) reaches the runner intact', pwStubRun.status === 0 && pwStubRun.stdout === JSON.stringify(pwArgv), JSON.stringify({ out: pwStubRun.stdout, err: pwStubRun.stderr }));
check('shellArgv quotes each argument on Windows and leaves argv alone elsewhere', JSON.stringify(shellArgv(['a b', 'c\\d'], 'win32')) === JSON.stringify(['"a b"', '"c\\d"']) && JSON.stringify(shellArgv(['a b', 'c\\d'], 'linux')) === JSON.stringify(['a b', 'c\\d']));
// Quoting does not stop a cmd metavariable: with a controlled marker, a quoted `%WF_MARKER%` still
// arrives at the runner as the marker's VALUE, not its name. That is why the spawn sites refuse
// shellArgUnsafe args before the shell runs instead of trusting the quotes (#109 review).
const markerRun = spawnSync(stub, shellArgv(['%WF_MARKER%']), { shell: win, encoding: 'utf8', env: { ...process.env, WF_MARKER: 'expanded-by-cmd' } });
check('a quoted %NAME% still expands through the Windows shell: quotes are not protection', !win || markerRun.stdout === JSON.stringify(['expanded-by-cmd']), JSON.stringify({ out: markerRun.stdout }));
check('shellArgUnsafe names a cmd metavariable, a lone % or a non-Windows platform is safe', shellArgUnsafe('%WF_MARKER%', 'win32') && !shellArgUnsafe('100%', 'win32') && !shellArgUnsafe('a%b', 'win32') && !shellArgUnsafe('%WF_MARKER%', 'linux'));
// A runner's output can exceed spawnSync's 1 MiB default (a failing playwright JSON report carries
// the page snapshot); ENOBUFS then reads as "the runner never started" and the row fails as an
// environment error (the #133 witness, 2026-10-14). RUN_MAX_BUFFER is what the captured spawns use.
const bigOut = spawnSync(process.execPath, ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024))'], { encoding: 'utf8', maxBuffer: RUN_MAX_BUFFER });
const defaultOut = spawnSync(process.execPath, ['-e', 'process.stdout.write("x".repeat(2 * 1024 * 1024))'], { encoding: 'utf8' });
check('a runner output over the 1 MiB default is captured, not ENOBUFS', bigOut.status === 0 && (bigOut.stdout ?? '').length === 2 * 1024 * 1024 && !bigOut.error, JSON.stringify({ status: bigOut.status, len: (bigOut.stdout ?? '').length, err: bigOut.error?.message }));
check('the same output overflows the default buffer: the bug this guards', defaultOut.status === null &&  (defaultOut.error as NodeJS.ErrnoException | undefined)?.code === 'ENOBUFS', JSON.stringify({ status: defaultOut.status, err: (defaultOut.error as NodeJS.ErrnoException | undefined)?.code }));
rmSync(stubDir, { recursive: true, force: true });


assert.equal(manualCheck('Manual: inspect badge'), 'inspect badge');
assert.equal(manualCheck('node x.js'), null);
assert.equal(identityGap(undefined, 'a'), 'unavailable');
assert.equal(identityGap('a', undefined), 'unavailable');
assert.equal(identityGap('a', 'b'), 'changed');
assert.equal(identityGap('a', 'a'), null);
assert(isRoundPaperwork('.wf/state.json', null));
assert(isRoundPaperwork('rounds/r/NOTES.md', 'rounds/r'));
assert(!isRoundPaperwork('src/helper.ts', 'rounds/r'));
process.exitCode = failures ? 1 : 0;
