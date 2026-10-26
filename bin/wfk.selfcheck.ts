// wfk.selfcheck.ts — node bin/wfk.selfcheck.ts → exit 0 when green.
// The short agent command: which entry it picks, that the installed shims start it from a fresh shell
// (paths with spaces, quoted arguments, exit status), and that generated text names it only when it
// would run the very entry that printed the text.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { installWfkShims, SHIM_CMD, SHIM_SH } from '../env/shim.ts';
import { wfCommand, wfEntryCommand } from '../src/paths.ts';
import { resolveEntry } from './wfk.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'wfk with space-'));
try {
	// A fake installed copy: bin/wfk.mjs, an env entry and a kit entry that print what they got.
	const root = join(tmp, 'home', '.local', 'share', 'wf');
	mkdirSync(join(root, 'bin'), { recursive: true });
	mkdirSync(join(root, 'env'), { recursive: true });
	copyFileSync(new URL('./wfk.mjs', import.meta.url), join(root, 'bin', 'wfk.mjs'));
	const fake = (name: string, code: number) => `console.log(JSON.stringify({ entry: ${JSON.stringify(name)}, argv: process.argv.slice(2) }));\nprocess.exit(${code});\n`;
	const envEntry = join(root, 'env', 'wf.mjs');
	const kitEntry = join(tmp, 'kit copy', 'wf.mjs');
	mkdirSync(join(tmp, 'kit copy'), { recursive: true });
	writeFileSync(envEntry, fake('env', 7));
	writeFileSync(kitEntry, fake('kit', 0));
	const round = join(tmp, 'round');
	mkdirSync(join(round, '.wf'), { recursive: true });
	mkdirSync(join(round, 'sub', 'dir'), { recursive: true });
	const outside = join(tmp, 'outside');
	mkdirSync(outside);

	// Entry choice.
	writeFileSync(join(round, '.wf', 'state.json'), JSON.stringify({ made_by: 'kit', entry: kitEntry }));
	assert.equal(resolveEntry(round, root), kitEntry, 'a round runs the entry that made it');
	assert.equal(resolveEntry(join(round, 'sub', 'dir'), root), kitEntry, 'from a folder inside the round too');
	assert.equal(resolveEntry(outside, root), envEntry, 'outside a round: the copy\'s env entry');
	writeFileSync(join(round, '.wf', 'state.json'), JSON.stringify({ made_by: 'kit', entry: join(tmp, 'gone.mjs') }));
	assert.equal(resolveEntry(round, root), envEntry, 'a recorded entry that is gone falls back; wf refuses by its own rule');
	writeFileSync(join(round, '.wf', 'state.json'), '{ not json');
	assert.equal(resolveEntry(round, root), envEntry, 'unreadable state falls back');
	rmSync(envEntry);
	assert.equal(resolveEntry(outside, root), join(root, 'wf.mjs'), 'a copy with no env folder (the team kit) runs wf.mjs');
	writeFileSync(envEntry, fake('env', 7));
	writeFileSync(join(round, '.wf', 'state.json'), JSON.stringify({ made_by: 'kit', entry: kitEntry }));

	// Real shells, from a fresh process with HOME pointing at the fake install (spaces in every path).
	const shims = join(tmp, 'bin dir');
	mkdirSync(shims);
	assert.equal(installWfkShims([join(tmp, 'missing'), shims], `/usr/bin${delimiter}${shims}`), shims);
	assert.equal(installWfkShims([shims], `/usr/bin`), null, 'a folder off the PATH gets nothing');
	const env = { ...process.env, HOME: join(tmp, 'home'), USERPROFILE: join(tmp, 'home'), PATH: `${shims}${delimiter}${process.env.PATH ?? ''}` };
	const args = ['next', 'two words', 'say "hi"', '--flag=a b'];
	const check = (label: string, run: ReturnType<typeof spawnSync>, entry: string, status: number) => {
		assert.equal(run.status, status, `${label}: exit status ${run.status}\n${run.stdout}${run.stderr}`);
		const got = JSON.parse(String(run.stdout).trim().split('\n').at(-1)!);
		assert.equal(got.entry, entry, `${label}: entry`);
		assert.deepEqual(got.argv, args, `${label}: arguments`);
	};
	if (process.platform === 'win32') {
		assert.equal(SHIM_CMD.includes('\r\n'), true);
		check('cmd, in a round', spawnSync('cmd.exe', ['/d', '/c', 'wfk', ...args.map((a) => `"${a.replace(/"/g, '\\"')}"`)], { cwd: round, env, encoding: 'utf8', windowsVerbatimArguments: true }), 'kit', 0);
		check('cmd, outside a round: the env exit status passes through', spawnSync('cmd.exe', ['/d', '/c', 'wfk', ...args.map((a) => `"${a.replace(/"/g, '\\"')}"`)], { cwd: outside, env, encoding: 'utf8', windowsVerbatimArguments: true }), 'env', 7);
		const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'wfk next "two words" \'say "hi"\' \'--flag=a b\''], { cwd: round, env, encoding: 'utf8' });
		if (!ps.error) assert.equal(ps.status, 0, `powershell: ${ps.stdout}${ps.stderr}`), assert.equal(JSON.parse(ps.stdout.trim().split('\n').at(-1)!).entry, 'kit');
	}
	const sh = spawnSync('sh', ['-c', 'wfk "$@"', 'sh', ...args], { cwd: outside, env, encoding: 'utf8' });
	if (!sh.error && sh.status !== 127) check('sh, outside a round', sh, 'env', 7);
	assert.equal(SHIM_SH.startsWith('#!/bin/sh\n'), true);

	// Generated text: `wfk` only when it would run this very entry.
	const onPath = { ...env, WF_FULL_COMMAND: '' };
	assert.equal(wfEntryCommand(kitEntry, { cwd: round, env: onPath }), 'wfk', 'the round\'s own entry has the short form');
	assert.equal(wfEntryCommand(envEntry, { cwd: round, env: onPath }), wfCommand(envEntry), 'another entry keeps the full line');
	assert.equal(wfEntryCommand(kitEntry, { cwd: round, env: { ...onPath, WF_FULL_COMMAND: '1' } }), wfCommand(kitEntry), 'WF_FULL_COMMAND keeps the full line');
	assert.equal(wfEntryCommand(kitEntry, { cwd: round, env: { ...onPath, PATH: '/usr/bin' } }), wfCommand(kitEntry), 'no shim on the PATH: the full line');
	console.log('wfk green');
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
