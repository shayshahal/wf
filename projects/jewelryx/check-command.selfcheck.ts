// Real wf check entrypoint + real git; a Node surrogate executes this fixture's value assertions.
// No Python/tool installation is needed for the portable suite. Real pytest is verified separately.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const dir = mkdtempSync(join(tmpdir(), 'wf-check-command-'));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', ...args], { encoding: 'utf8' }).trim();
const put = (path: string, text: string) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); };
const win = process.platform === 'win32';
try {
	git('init', '-q', '-b', 'main'); git('config', 'core.autocrlf', 'false');
	put('.gitignore', 'bin/\n');
	// This surrogate only implements the fixture's assertion, not a general Python interpreter.
	// It reads the real selected product/test files on each invocation, including the reverted tree.
	put('bin/runner.cjs', `const {readFileSync}=require('node:fs');
const args=process.argv.slice(2);
if(args.includes('ruff'))process.exit(0);
if(!args.includes('pytest'))process.exit(2);
let failed=false;
for(const selected of args.filter(a=>a.startsWith('tests/test_'))){
 const file=selected.split('::')[0];
 const test=readFileSync(file,'utf8');
 const module=/from (\\w+) import value/.exec(test)[1];
 const actual=Number(/return (\\d+)/.exec(readFileSync(module+'.py','utf8'))[1]);
 const expected=Number(/assert value\\(\\) == (\\d+)/.exec(test)[1]);
 const id=file+'::test_value';
 if(actual===expected)console.log('PASSED '+id);
 else {failed=true;console.log('___ test_value ___\\nE assert '+actual+' == '+expected+'\\n'+file+':4: AssertionError\\n=== short test summary info ===\\nFAILED '+id+' - assert '+actual+' == '+expected);}
}
console.log(failed?'1 failed':'1 passed');process.exit(failed?1:0);
`);
	put(win ? 'bin/uv.cmd' : 'bin/uv', win ? '@node "%~dp0runner.cjs" %*\r\n' : '#!/bin/sh\nexec node "$(dirname "$0")/runner.cjs" "$@"\n');
	if (!win) execFileSync('chmod', ['+x', join(dir, 'bin/uv')]);
	for (const name of ['app', 'other']) {
		put(`packages/backend/${name}.py`, 'def value():\n    return 0\n');
		put(`packages/backend/tests/test_${name}.py`, `from ${name} import value\n\ndef test_value():\n    assert value() == 1\n`);
	}
	git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'bench/check-command');
	put('.wf/state.json', JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'build', class: 'A' }));
	const ticket = '## Intent\n- "both values are one"\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n';
	const first = '| 1 | first | packages/backend/app.py | packages/backend/tests/test_app.py::test_value@4 |\n';
	const second = '| 2 | second | packages/backend/other.py | packages/backend/tests/test_other.py::test_value@4 |\n';
	put('bug-reports/r/TICKET.md', ticket + first + second);
	put('packages/backend/app.py', 'def value():\n    return 1\n');
	git('add', 'packages/backend/app.py'); git('commit', '-qm', 'first unit');
	put('packages/backend/other.py', 'def value():\n    return 1\n');
	const cli = (...args: string[]) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), 'check', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}${win ? ';' : ':'}${process.env.PATH}` } });
	const log = () => readFileSync(join(dir, '.wf/checks.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	const all = cli();
	const measurements = log();
	check('default check executes and proves both cases, committed plus working', all.status === 0 && [1, 2].every((n) => measurements.some((m) => m.row === n && m.result === 'green' && m.tasks.some((t: { evidence?: { verdict: string } }) => t.evidence?.verdict === 'passed') && m.tasks.some((t: { evidence?: { verdict: string } }) => t.evidence?.verdict === 'behavioral-failure'))), `${all.stdout}${all.stderr}\n${JSON.stringify(measurements)}`);
	for (const n of [1, 2]) {
		const selected = cli('--case', String(n));
		check(`case ${n} allows agreed sibling changes and proves its own assertion`, selected.status === 0 && log().at(-1).row === n && log().at(-1).result === 'green', selected.stderr);
	}
	put('packages/backend/other.py', 'def value():\n    return 0\n');
	const failed = cli();
	check('a failing second assertion makes the default command red, never lint-only green', failed.status === 1 && log().at(-1).row === 2 && log().at(-1).result === 'red', failed.stderr);
	put('packages/backend/other.py', 'def value():\n    return 1\n');
	put('bug-reports/r/TICKET.md', '## Intent\n- "both values are one"\n');
	const raw = cli('--case', 'packages/backend/tests/test_app.py::test_value@4');
	check('ordinary raw case proves product changes without a verification table', raw.status === 0 && log().at(-1).row === 0 && log().at(-1).tasks.some((t: { evidence?: { verdict: string } }) => t.evidence?.verdict === 'behavioral-failure'), raw.stderr);
	put('bug-reports/r/TICKET.md', ticket + first + second);
	put('packages/backend/outside.py', 'outside = True\n');
	const outside = cli('--case', '1');
	check('selecting a case still rejects product outside the whole agreement', outside.status === 1 && outside.stderr.includes('fence: packages/backend/outside.py'), outside.stderr);
	rmSync(join(dir, 'packages/backend/outside.py'));
	put('bug-reports/r/TICKET.md', ticket + first + second.replace('| 2 |', '| 1 |'));
	for (const args of [[], ['--case', '1']]) {
		const duplicate = cli(...args);
		check('duplicate case numbers refuse rather than proving the first assertion twice', duplicate.status === 1 && duplicate.stderr.includes('case numbers must be unique'), duplicate.stderr);
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
