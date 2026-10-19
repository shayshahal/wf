// reap-session-workspace.selfcheck.ts — real Git, public reap/dispatcher and faithful rm + prune only.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { roundsDir } from '../project.ts';
import { WF_STATE_VERSION } from '../round/state.ts';
import { slugForBranch } from './worktree.ts';
import type { Seams } from '../seams.ts';

type Binding = Awaited<ReturnType<NonNullable<Seams['sessionWorkspace']>>>;
const root = mkdtempSync(join(tmpdir(), 'wf-reap-session-'));
const repo = join(root, 'repo');
const home = join(root, 'home');
const effects = join(root, 'effects');
const reads = join(root, 'reads');
const folder = `${roundsDir}/example`;
const url = (path: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, path)).href);
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
const bound = (path: string): Binding => ({ kind: 'bound', path, branch: null });
const unavailable: Binding = { kind: 'unavailable', why: 'PRIVATE_NATIVE_DETAILS' };
const journalFor = (branch: string) => join(repo, '.git', `wf-reap-${createHash('sha256').update(branch).digest('hex')}.json`);
let sequence = 0;
function target(parent = root) {
	const branch = `bench/session-${++sequence}`;
	const path = join(parent, `round-${sequence}`);
	git('worktree', 'add', '-qb', branch, path);
	mkdirSync(join(path, '.wf'));
	mkdirSync(join(path, folder, 'proof'), { recursive: true });
	writeFileSync(join(path, '.wf/state.json'), JSON.stringify({ wf_version: WF_STATE_VERSION, round: branch, step: 'build', folder }));
	writeFileSync(join(path, folder, 'proof/trace.zip'), 'proof');
	writeFileSync(join(path, 'REVIEW.md'), 'uncommitted review');
	return { branch, path, journal: journalFor(branch) };
}
type Target = ReturnType<typeof target>;
function saveJournal(t: Target, next = 0, path = t.path) {
	const stat = existsSync(path) ? statSync(path, { bigint: true }) : null;
	writeFileSync(t.journal, JSON.stringify({ branch: t.branch, path, token: randomUUID(), directory: stat ? `${stat.dev}:${stat.ino}:${stat.birthtimeNs}` : null, next, merged: false }));
}
// Snapshot persisted effects, not merely call counts: refused cleanup cannot touch target bytes,
// metadata, archive/ledger, launch entries, journal or even a preexisting malformed cleanup lock.
function snapshot(path: string): unknown {
	if (!existsSync(path)) return null;
	if (!statSync(path).isDirectory()) return readFileSync(path).toString('base64');
	return Object.fromEntries(readdirSync(path).sort().map((name) => [name, snapshot(join(path, name))]));
}
const persisted = (t: Target) => [snapshot(t.path), snapshot(join(repo, '.git')), snapshot(home), snapshot(join(repo, '.claude'))];
function cli(t: Target, binding: Binding, { reader = true, force = true, dispatcher = true, failPrune = false, cwd = repo, request = t.branch } = {}) {
	rmSync(effects, { force: true }); rmSync(reads, { force: true });
	const source = `import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { plug } from ${url('src/seams.ts')};
import { runReap } from ${url('src/worktrees/reap.ts')};
import { run } from ${url('src/run.ts')};
assert.equal(resolve(homedir()), ${JSON.stringify(resolve(home))}, 'archives must stay in the fixture');
const pieces = {
 sessionWorkspace: ${reader ? `() => { appendFileSync(${JSON.stringify(reads)}, 'read\\n'); return Promise.resolve(${JSON.stringify(binding)}); }` : 'null'},
 removalPlan: (o) => {
  appendFileSync(${JSON.stringify(effects)}, JSON.stringify(o) + '\\n');
  return [
   {label:'rm -rf worktree', rm:o.path},
   {label:'git worktree prune', run:()=>{
    appendFileSync(${JSON.stringify(effects)}, 'prune\\n');
    ${failPrune ? "throw new Error('fixture: interrupted before prune');" : `execFileSync('git', ['-C', ${JSON.stringify(repo)}, 'worktree', 'prune']);`}
   }}
  ];
 }
};
${dispatcher ? `await run(['reap', ${JSON.stringify(request)}], pieces);` : `plug(pieces); await runReap([${JSON.stringify(request)}]);`}`;
	const env = { ...process.env, HOME: home, USERPROFILE: home, WF_FORCE_REAP: force ? '1' : '0' };
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env, encoding: 'utf8', timeout: 30_000 });
	assert.ifError(result.error);
	return { ...result, queries: existsSync(reads) ? readFileSync(reads, 'utf8').trim().split('\n').length : 0, effects: existsSync(effects) ? readFileSync(effects, 'utf8') : '' };
}
function refused(t: Target, binding: Binding, pattern: RegExp, options: Parameters<typeof cli>[2] = {}) {
	const before = persisted(t);
	const result = cli(t, binding, options);
	assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
	assert.match(result.stderr, pattern);
	assert.match(result.stderr, /leave or archive the bound session.*surviving checkout\/session/);
	assert.match(result.stderr, /Changing the shell directory or forcing reap does not rebind/);
	assert.ok(result.stderr.includes(`target: ${resolve(t.path)}`), result.stderr);
	assert.doesNotMatch(result.stderr, /PRIVATE_NATIVE_DETAILS/);
	assert.equal(result.queries, 1);
	assert.equal(result.effects, '', 'refusal precedes even removal-plan construction');
	assert.deepEqual(persisted(t), before, 'refusal must precede every persisted cleanup effect');
	return result;
}
function removed(t: Target, binding: Binding, options: Parameters<typeof cli>[2] = {}) {
	const result = cli(t, binding, options);
	assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
	assert.equal(existsSync(t.path), false);
	assert.equal(existsSync(t.journal), false);
	assert.equal(existsSync(`${t.journal}.lock`), false);
	assert.match(result.effects, /prune/);
	assert.ok(!git('worktree', 'list', '--porcelain').includes(t.path.replace(/\\/g, '/')));
	return result;
}
try {
	mkdirSync(repo); mkdirSync(home);
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	git('commit', '--allow-empty', '-qm', 'base');
	mkdirSync(join(repo, '.claude'));
	writeFileSync(join(repo, '.claude/launch.json'), '{"configurations":[]}');

	// Shell already cd'd to the surviving checkout; forcing never overrides the native binding.
	const active = target();
	writeFileSync(`${active.journal}.lock`, 'preexisting lock must not be read/reclaimed');
	refused(active, bound(active.path), /contains the calling native session/);
	refused(active, bound(active.path), /contains the calling native session/, { dispatcher: false });
	refused(active, unavailable, /native session workspace unavailable/);
	refused(active, bound(join(root, 'missing-native-workspace')), /cannot verify the native session workspace/);
	// Dry runs follow the same safety policy, rather than implying this plan may run here later.
	refused(active, bound(active.path), /contains the calling native session/, { force: false });
	mkdirSync(join(repo, 'nested'));
	refused(active, bound(active.path), /contains the calling native session/, { cwd: join(repo, 'nested') });
	mkdirSync(join(active.path, 'nested'));
	refused(active, bound(join(active.path, 'nested')), /contains the calling native session/);
	const alias = join(root, 'active-alias');
	symlinkSync(active.path, alias, process.platform === 'win32' ? 'junction' : 'dir');
	refused(active, bound(alias), /contains the calling native session/);
	if (process.platform === 'win32') refused(active, bound(active.path.toUpperCase()), /contains the calling native session/);
	rmSync(`${active.journal}.lock`);
	const allowed = removed(active, bound(repo));
	assert.equal(allowed.queries, 1);
	assert.ok(existsSync(join(home, '.cache/wf-reaped', slugForBranch(active.branch), '.wf/state.json')));
	assert.ok(existsSync(join(home, '.cache/wf-reaped/ROUNDS.md')), 'surviving binding allows archival and teardown');

	// A surviving workspace with a common string prefix is not nested inside the target.
	const prefix = target();
	const prefixSibling = `${prefix.path}-sibling`; mkdirSync(prefixSibling);
	removed(prefix, bound(prefixSibling));
	const rootAlias = join(root, 'repo-alias');
	symlinkSync(repo, rootAlias, process.platform === 'win32' ? 'junction' : 'dir');
	removed(target(), bound(rootAlias));
	// wf's own destination is inside the main checkout: a descendant is not the session's workspace.
	mkdirSync(join(repo, '.claude/worktrees'), { recursive: true });
	removed(target(join(repo, '.claude/worktrees')), bound(repo));
	for (const reader of [true, false]) {
		const terminal = removed(target(), null, { reader });
		assert.equal(terminal.queries, reader ? 1 : 0, 'ordinary terminal behavior is unchanged');
	}
	const dry = target();
	const beforeDry = persisted(dry);
	const dryResult = cli(dry, bound(repo), { force: false });
	assert.equal(dryResult.status, 0, `${dryResult.stdout}${dryResult.stderr}`);
	assert.match(dryResult.stdout, /would: rm -rf/);
	assert.equal(dryResult.queries, 1);
	assert.doesNotMatch(dryResult.effects, /\nprune\n/);
	assert.deepEqual(persisted(dry), beforeDry);

	// A retry must inspect the journal's exact path, not resolve its label to a different checkout.
	const stored = target();
	const decoy = target();
	const recovery = { ...decoy, path: stored.path };
	saveJournal(recovery, 1);
	refused(recovery, bound(stored.path), /contains the calling native session/);
	assert.ok(existsSync(decoy.path));
	// Canonicalize a target alias too: saved recovery paths may use a different spelling.
	const storedAlias = join(root, 'stored-alias');
	symlinkSync(stored.path, storedAlias, process.platform === 'win32' ? 'junction' : 'dir');
	const aliasRecovery = { ...recovery, path: storedAlias };
	saveJournal(aliasRecovery, 1);
	refused(aliasRecovery, bound(stored.path), /contains the calling native session/);
	rmSync(decoy.journal);

	// A real interruption after rm leaves a saved prune step. Missing native binding still blocks;
	// only a verifiably surviving binding (or a terminal) may finish this ENOENT recovery target.
	const interrupted = target();
	const first = cli(interrupted, bound(repo), { failPrune: true });
	assert.notEqual(first.status, 0, `${first.stdout}${first.stderr}`);
	assert.equal(existsSync(interrupted.path), false);
	assert.equal(JSON.parse(readFileSync(interrupted.journal, 'utf8')).next, 1);
	refused(interrupted, bound(interrupted.path), /cannot verify the native session workspace/);
	refused(interrupted, unavailable, /native session workspace unavailable/);
	removed(interrupted, bound(repo));
	const goneUnbound = target(); rmSync(goneUnbound.path, { recursive: true }); saveJournal(goneUnbound, 1);
	refused(goneUnbound, bound(join(root, 'missing-native-workspace')), /cannot verify the native session workspace/);
	removed(goneUnbound, bound(repo));
	for (const reader of [true, false]) {
		const gone = target();
		rmSync(gone.path, { recursive: true }); saveJournal(gone, 1);
		removed(gone, null, { reader });
	}

	// A missing target is not generally permission to proceed; only a recovery may already be gone.
	const noJournal = target(); rmSync(noJournal.path, { recursive: true });
	refused(noJournal, bound(repo), /cannot verify the reap target/);
	const unknown = cli(noJournal, unavailable, { request: 'no-such-worktree' });
	assert.notEqual(unknown.status, 0);
	assert.equal(unknown.queries, 0, 'resolve a valid requested/recovery target before querying the native reader');

	// Error paths which are not ENOENT must not acquire permission from recovery: a symlink loop is
	// ELOOP on this filesystem, so it cannot be mistaken for an already-removed target.
	const looped = target();
	const loop = join(root, 'symlink-loop');
	symlinkSync(loop, loop, process.platform === 'win32' ? 'junction' : 'dir');
	const invalidPath = { ...looped, path: loop };
	saveJournal(invalidPath, 1);
	refused(invalidPath, bound(repo), /cannot verify the reap target/);
	console.log('all calling-session cleanup safety, canonical paths, terminal, dry-run and recovery witnesses green');
} finally {
	rmSync(root, { recursive: true, force: true });
}
