// session-workspace.selfcheck.ts — real Git and the public dispatcher, with a native binding reader.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { contractPaths as contractPathsFile } from '../project.ts';
import { WF_STATE_VERSION } from '../round/state.ts';
import type { Seams } from '../seams.ts';

type Binding = Awaited<ReturnType<NonNullable<Seams['sessionWorkspace']>>>;
const root = mkdtempSync(join(tmpdir(), 'wf-session-workspace-'));
const repo = join(root, 'repo');
const other = join(root, 'other');
const reads = join(root, 'binding-reads');
const folder = 'rounds/example';
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const url = (path: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, path)).href);
const bound = (path: string, branch: string | null = 'round/one'): Binding => ({ kind: 'bound', path, branch });
const unavailable: Binding = { kind: 'unavailable', why: 'private adapter details must not be echoed' };
const state = (round = 'round/one') => JSON.stringify({ wf_version: WF_STATE_VERSION, round, base: 'main', class: 'A', step: 'build', folder });
const reset = (cwd: string, round = 'round/one') => {
	mkdirSync(join(cwd, '.wf'), { recursive: true });
	writeFileSync(join(cwd, '.wf/state.json'), state(round));
	rmSync(join(cwd, '.wf/.gitignore'), { force: true });
};
// The reader models an already-parsed native binding, not cwd. UI/commands are recording adapters
// so a broken guard is observable without starting a real stack or opening a person's browser.
const cli = (cwd: string, argv: string[], binding: Binding, reader = true) => {
	rmSync(reads, { force: true });
	const source = `import { appendFileSync } from 'node:fs';
import { run } from ${url('src/run.ts')};
const binding = ${JSON.stringify(binding)};
await run(${JSON.stringify(argv)}, {
 sessionWorkspace: ${reader ? `() => { appendFileSync(${JSON.stringify(reads)}, 'read\\n'); return binding === null ? null : Promise.resolve(binding); }` : 'null'},
 presentation: { guidance: 'NATIVE_VIEW', reviewHandoff: () => 'NATIVE_HANDOFF' },
 commands: { probe: () => console.log('COMMAND_REACHED'), hook: () => console.log('HOOK_REACHED'), update: () => console.log('UPDATE_REACHED') }
});`;
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd, encoding: 'utf8', timeout: 30_000 });
	assert.ifError(result.error);
	return { ...result, queries: existsSync(reads) ? readFileSync(reads, 'utf8').trim().split('\n').length : 0 };
};
const unchanged = (cwd: string, expected = state()) => {
	assert.equal(readFileSync(join(cwd, '.wf/state.json'), 'utf8'), expected);
	assert.equal(existsSync(join(cwd, '.wf/.gitignore')), false, 'binding must precede local Git excludes');
};
const refused = (result: ReturnType<typeof cli>, pattern: RegExp) => {
	assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, pattern);
	assert.match(result.stderr, /open or resume a session bound to this exact round path:/);
	assert.match(result.stderr, /Changing the shell directory does not rebind the chat workspace/);
	assert.equal(result.queries, 1);
};
try {
	mkdirSync(repo);
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	mkdirSync(join(repo, contractPathsFile, '..'), { recursive: true });
	writeFileSync(join(repo, contractPathsFile), '# no contract paths in this fixture\n');
	mkdirSync(join(repo, folder), { recursive: true });
	writeFileSync(join(repo, folder, 'TICKET.md'), '# example\n## Intent\n- preserve the workspace binding\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
	git(repo, 'checkout', '-qb', 'round/one');
	git(repo, 'worktree', 'add', '-qb', 'round/two', other, 'main');
	reset(repo); reset(other, 'round/two');

	// Every current-round workflow entry refuses before ignores, state, questions, views or stack.
	for (const argv of [['next'], ['brief', 'build'], ['step', 'build'], ['prompt', 'build'], ['check'], ['deliver'], ['ask', 'question'], ['decide', '--q', '1', 'answer'], ['correct', 'instruction'], ['inbox'], ['serve'], ['probe']]) {
		const result = cli(repo, argv, bound(other, 'round/two'));
		refused(result, /native session workspace does not match/);
		assert.ok(result.stderr.replace(/\\/g, '/').includes(git(repo, 'rev-parse', '--show-toplevel')));
		assert.doesNotMatch(result.stdout, /NATIVE_VIEW|COMMAND_REACHED/);
		unchanged(repo);
	}

	// The shell can cd into the round, but the native binding still names the other worktree.
	mkdirSync(join(repo, 'nested'));
	refused(cli(join(repo, 'nested'), ['step', 'build'], bound(other, 'round/two')), /workspace does not match/);
	unchanged(repo);
	for (const argv of [['agree', 'round/two'], ['review', 'round/two'], ['review', 'round/two', '--done']]) {
		const result = cli(repo, argv, bound(repo));
		refused(result, /workspace does not match/);
		unchanged(repo); unchanged(other, state('round/two'));
		assert.equal(existsSync(join(other, '.wf/AGREEMENT-T1.html')), false);
		assert.equal(existsSync(join(other, folder, 'REVIEW.md')), false);
	}

	reset(repo, 'metadata-only-branch');
	refused(cli(repo, ['step', 'build'], bound(repo, 'metadata-only-branch')), /actual Git branch/);
	unchanged(repo, state('metadata-only-branch'));
	reset(repo);
	for (const argv of [['step', 'build'], ['agree', 'round/one'], ['review', 'round/one', '--done']]) {
		const result = cli(repo, argv, unavailable);
		refused(result, /native session workspace unavailable.*cannot verify/);
		assert.doesNotMatch(result.stderr, /private adapter details/);
		unchanged(repo);
	}
	refused(cli(repo, ['step', 'build'], bound(join(root, 'gone'))), /cannot verify.*canonical path unavailable/);
	unchanged(repo);

	const happy = cli(repo, ['step', 'build'], bound(repo));
	assert.equal(happy.status, 0, `${happy.stdout}${happy.stderr}`);
	assert.equal(happy.queries, 1);
	assert.equal(existsSync(join(repo, '.wf/.gitignore')), true);
	assert.equal(JSON.parse(readFileSync(join(repo, '.wf/state.json'), 'utf8')).step, 'build');
	for (const reader of [true, false]) {
		reset(repo);
		const terminal = cli(repo, ['step', 'build'], null, reader);
		assert.equal(terminal.status, 0, `${terminal.stdout}${terminal.stderr}`);
		assert.equal(terminal.queries, reader ? 1 : 0);
	}
	reset(repo);
	const noBranch = cli(repo, ['probe'], bound(repo, null));
	assert.equal(noBranch.status, 0, noBranch.stderr);
	assert.match(noBranch.stdout, /COMMAND_REACHED/);

	// Real gate success from another cwd: resolve the named target, exactly one binding read.
	const agreement = cli(other, ['agree', 'round/one'], bound(repo));
	assert.equal(agreement.status, 0, `${agreement.stdout}${agreement.stderr}`);
	assert.equal(agreement.queries, 1);
	assert.match(agreement.stdout, /NATIVE_HANDOFF/);
	assert.equal(existsSync(join(repo, '.wf/AGREEMENT-T1.html')), true);
	assert.equal(existsSync(join(repo, folder, 'AGREEMENT-REVIEW.md')), true);
	writeFileSync(join(repo, folder, 'CHECKPOINT-REVIEW.md'), 'base: main\nverdict: changes-requested\n');
	const review = cli(other, ['review', 'round/one', '--checkpoint', '--done'], bound(repo));
	assert.equal(review.status, 0, `${review.stdout}${review.stderr}`);
	assert.equal(review.queries, 1);
	assert.match(review.stdout, /checkpoint changes requested: back to build/);

	for (const argv of [['help'], ['serve', '--help'], ['review', 'round/two', '-h'], ['status'], ['classify', '--json'], ['notes'], ['models'], ['hook'], ['update'], ['skill'], ['new'], ['reap'], ['serve', '--stop']]) {
		const result = cli(repo, argv, unavailable);
		assert.equal(result.queries, 0, `${argv.join(' ')} must not query binding`);
	}
	// Existing schema/entry/delivery refusals still win, before asking the native reader.
	for (const [bytes, pattern] of [
		['{', /corrupt round state/],
		[JSON.stringify({ wf_version: 1 }), /wf version 1/],
		[JSON.stringify({ wf_version: WF_STATE_VERSION, made_by: 'another-entry' }), /round was made by/],
		[JSON.stringify({ wf_version: WF_STATE_VERSION, step: 'merged' }), /already delivered/],
	] as const) {
		writeFileSync(join(repo, '.wf/state.json'), bytes);
		const result = cli(repo, ['step', 'build'], unavailable);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, pattern);
		assert.equal(result.queries, 0);
		assert.equal(readFileSync(join(repo, '.wf/state.json'), 'utf8'), bytes);
	}
	reset(repo);
	const unknown = cli(repo, ['agree', 'no-such-round'], unavailable);
	assert.match(unknown.stderr, /no worktree for "no-such-round"/);
	assert.equal(unknown.queries, 0);
	// With no current round, new's step-classify initialization must run, even in a native chat.
	rmSync(join(other, '.wf'), { recursive: true, force: true });
	const initial = cli(other, ['step', 'classify', '--base', 'main'], unavailable);
	assert.equal(initial.status, 0, `${initial.stdout}${initial.stderr}`);
	assert.equal(initial.queries, 0);
	assert.equal(JSON.parse(readFileSync(join(other, '.wf/state.json'), 'utf8')).step, 'classify');

	// Canonical filesystem identity accepts aliases; case folds only on Windows.
	const alias = join(root, 'alias');
	symlinkSync(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
	assert.equal(cli(repo, ['probe'], bound(alias)).status, 0);
	if (process.platform === 'win32') assert.equal(cli(repo, ['probe'], bound(repo.toUpperCase())).status, 0);
	git(repo, 'checkout', '--detach', '-q');
	refused(cli(repo, ['probe'], bound(repo)), /actual Git branch/);
	assert.equal(cli(repo, ['probe'], bound(repo, null)).status, 0);

	// The helper's public contract also covers non-Git targets and reader defects safely.
	const plain = join(root, 'plain'); mkdirSync(plain);
	const source = `import assert from 'node:assert/strict';
import { plug } from ${url('src/seams.ts')};
import { roundWorkspaceGap } from ${url('src/worktrees/session-workspace.ts')};
plug({ sessionWorkspace: async () => ({kind:'bound',path:${JSON.stringify(plain)},branch:null}) });
assert.match(await roundWorkspaceGap(${JSON.stringify(plain)}), /cannot verify.*Git branch unavailable/);
plug({ sessionWorkspace: () => { throw new Error('binding reader defect'); } });
await assert.rejects(roundWorkspaceGap(${JSON.stringify(repo)}), /binding reader defect/);`;
	const helper = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: root, encoding: 'utf8' });
	assert.equal(helper.status, 0, `${helper.stdout}${helper.stderr}`);
	const defect = spawnSync(process.execPath, ['--input-type=module', '-e', `import { run } from ${url('src/run.ts')}; await run(['probe'], {sessionWorkspace:()=>{throw new Error('binding reader defect');},commands:{probe:()=>console.log('COMMAND_REACHED')}});`], { cwd: repo, encoding: 'utf8' });
	assert.notEqual(defect.status, 0);
	assert.match(defect.stderr, /binding reader defect/);
	assert.doesNotMatch(defect.stdout, /COMMAND_REACHED/);
} finally {
	rmSync(root, { recursive: true, force: true });
}
console.log('all arms green');
