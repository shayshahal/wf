// adopt.selfcheck.ts — `wf new <branch> --here` and the reap of an adopted round, through the public
// dispatcher on real Git: an origin, a person's clone whose local base is stale, and checkouts made the
// way T3 makes a subagent's (a linked worktree outside the clone, on a branch T3 named). Only the native
// binding, the project's setup and the removal plan are fixtures; the rest is the real command.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { contractPaths } from '../project.ts';
import type { SessionWorkspace } from '../seams.ts';
import { adoptionGap, baseAction, ownCheckoutGap, protectedBranch } from './adopt.ts';
import type { CheckoutFacts } from './adopt.ts';
import { slugForBranch } from './worktree.ts';

// ── pure arms ────────────────────────────────────────────────────────────────
const t3 = (path: string, branch: string | null = 'chore/probe-thing', attached = true): SessionWorkspace => ({ kind: 'bound', path, branch, attached });
const facts = (o: Partial<CheckoutFacts> = {}): CheckoutFacts => ({ top: tmpdir(), main: null, current: 'chore/probe-thing', isRound: false, dirty: [], branchExists: () => false, ...o });
const verdict = (binding: SessionWorkspace | null, f: CheckoutFacts = facts(), branch = 'fix/x-1-a') => adoptionGap({ binding, facts: f, branch });
const why = (a: ReturnType<typeof verdict>) => (a.kind === 'refused' ? a.why : '');
assert.match(why(verdict(null)), /no native session binding/);
assert.match(why(verdict({ kind: 'unavailable', why: 'PRIVATE' })), /unavailable/);
assert.doesNotMatch(why(verdict({ kind: 'unavailable', why: 'PRIVATE' })), /PRIVATE/);
assert.match(why(verdict(t3(tmpdir(), 'x', false))), /project root.*never makes the project's root checkout a round/);
assert.match(why(verdict({ kind: 'bound', path: tmpdir(), branch: 'x' })), /project root/, 'a host that does not say attached is not adopted');
assert.match(why(verdict(t3(WF_ROOT))), /the shell is in .*but this session is bound to/);
assert.match(why(verdict(t3(tmpdir()), facts({ main: tmpdir() }))), /main checkout/);
assert.match(why(verdict(t3(tmpdir()), facts({ current: null }))), /detached/);
assert.match(why(verdict(t3(tmpdir()), facts({ current: 'dev' }))), /base branch rounds are cut from/);
assert.match(why(verdict(t3(tmpdir()), facts({ isRound: true }))), /already a round.*wf next/);
assert.match(why(verdict(t3(tmpdir()), facts({ dirty: ['?? a', ' M b'] }))), /uncommitted changes \(\?\? a,  M b\)/);
assert.match(why(verdict(t3(tmpdir()), facts(), 'v1.1')), /is a base branch/);
assert.match(why(verdict(t3(tmpdir(), 'chore/other'))), /names branch chore\/other but Git is on chore\/probe-thing/);
assert.match(why(verdict(t3(tmpdir()), facts({ branchExists: (b) => b === 'fix/x-1-a' }))), /already exists/);
assert.deepEqual(verdict(t3(tmpdir())), { kind: 'adopt', path: tmpdir(), from: 'chore/probe-thing', branch: 'fix/x-1-a' });
assert.deepEqual(verdict(t3(tmpdir(), null)), { kind: 'adopt', path: tmpdir(), from: 'chore/probe-thing', branch: 'fix/x-1-a' }, 'no host branch: Git\'s is the one renamed');
// A retry after a rename whose setup failed: Git is on the round's branch and the host's name is gone.
assert.equal(verdict(t3(tmpdir()), facts({ current: 'fix/x-1-a' })).kind, 'adopt');
assert.match(why(verdict(t3(tmpdir()), facts({ current: 'fix/x-1-a', branchExists: () => true }))), /names branch chore\/probe-thing/);
assert.equal(protectedBranch('dev') && protectedBranch('v1.1') && !protectedBranch('fix/v1') && !protectedBranch('dev2'), true);
assert.deepEqual(baseAction('contains', 'origin/dev'), { kind: 'none' });
assert.deepEqual(baseAction('behind', 'origin/dev'), { kind: 'fast-forward' });
assert.match(baseAction('diverged', 'origin/dev').kind === 'refused' ? (baseAction('diverged', 'origin/dev') as { why: string }).why : '', /git rebase origin\/dev/);
assert.equal(ownCheckoutGap(null, tmpdir()), null);
assert.equal(ownCheckoutGap(t3(tmpdir(), 'b', false), tmpdir()), null, 'the project root still cuts new worktrees');
assert.equal(ownCheckoutGap(t3(WF_ROOT), tmpdir()), null, 'elsewhere than the bound checkout: unchanged');
assert.match(ownCheckoutGap(t3(tmpdir()), tmpdir()) ?? '', /wf new <branch> --here/);

// ── the real command ─────────────────────────────────────────────────────────
const root = mkdtempSync(join(tmpdir(), 'wf-adopt-'));
const origin = join(root, 'origin.git');
const clone = join(root, 'clone');
const peer = join(root, 'peer');
const home = join(root, 'home');
const hosted = join(root, 'host-worktrees');
const record = join(root, 'record');
const url = (path: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, path)).href);
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
// A checkout made the way T3 makes one: a new branch it named, cut from the clone's (stale) local dev.
const hostCheckout = (name: string, branch: string) => {
	const path = join(hosted, name);
	git(clone, 'worktree', 'add', '-q', '-b', branch, path, 'dev');
	return path;
};
type Options = { setupFails?: boolean; failStep?: boolean; force?: boolean };
// T3 credentials are stripped: the binding is the fixture's, never this session's real one.
const hermetic = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('T3_')));
function cli(cwd: string, argv: string[], binding: SessionWorkspace | null, { setupFails = false, failStep = false, force = true }: Options = {}) {
	rmSync(record, { force: true });
	const source = `import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { run } from ${url('src/run.ts')};
const record = (line) => appendFileSync(${JSON.stringify(record)}, JSON.stringify(line) + '\\n');
await run(${JSON.stringify(argv)}, {
 sessionWorkspace: () => Promise.resolve(${JSON.stringify(binding)}),
 setupCheckout: ({ path, branch, port }) => { record({ setup: { path, branch, port } }); if (${setupFails}) throw new Error('fixture: setup failed'); },
 removalPlan: (o) => [
  { label: 'stop owned servers', run: () => record({ plan: o }) },
  { label: 'drop database', run: () => { if (${failStep} && !existsSync(${JSON.stringify(join(root, 'failed-once'))})) { writeFileSync(${JSON.stringify(join(root, 'failed-once'))}, ''); throw new Error('fixture: database busy'); } record({ dropped: o.slug }); } },
 ],
 commands: { probe: () => console.log('COMMAND_REACHED') },
});`;
	const env = { ...hermetic, HOME: home, USERPROFILE: home, WF_FORCE_REAP: force ? '1' : '0' };
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd, env, encoding: 'utf8', timeout: 120_000 });
	assert.ifError(result.error);
	const lines = existsSync(record) ? readFileSync(record, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
	return { ...result, out: `${result.stdout}\n${result.stderr}`, lines };
}
const state = (path: string) => JSON.parse(readFileSync(join(path, '.wf/state.json'), 'utf8'));
const branchOf = (path: string) => git(path, 'branch', '--show-current');
const unchanged = (path: string, branch: string, head: string) => {
	assert.equal(branchOf(path), branch);
	assert.equal(git(path, 'rev-parse', 'HEAD'), head);
	assert.equal(existsSync(join(path, '.wf/state.json')), false);
};
const refused = (result: ReturnType<typeof cli>, pattern: RegExp) => {
	assert.notEqual(result.status, 0, result.out);
	assert.match(result.stderr, pattern);
	assert.equal(result.lines.length, 0, 'no setup ran');
};
const round = 'fix/x-1-adopt';
const adopt = ['new', round, '--here', '--class', 'A'];
try {
	mkdirSync(home);
	execFileSync('git', ['init', '-q', '--bare', '-b', 'dev', origin]);
	execFileSync('git', ['clone', '-q', origin, peer], { stdio: 'ignore' });
	mkdirSync(dirname(join(peer, contractPaths)), { recursive: true });
	writeFileSync(join(peer, contractPaths), '# no contracts in this fixture\n');
	git(peer, 'add', '-A'); git(peer, 'commit', '-qm', 'base'); git(peer, 'push', '-q', 'origin', 'HEAD:dev');
	execFileSync('git', ['clone', '-q', '-b', 'dev', origin, clone]);
	// The base moves on after the clone took its dev: the host cuts from the stale local dev.
	writeFileSync(join(peer, 'later.txt'), 'later\n');
	git(peer, 'add', '-A'); git(peer, 'commit', '-qm', 'later on origin/dev'); git(peer, 'push', '-q', 'origin', 'HEAD:dev');
	const fresh = hostCheckout('t3-aaaa', 'chore/probe-thing');
	const staleHead = git(fresh, 'rev-parse', 'HEAD');

	// Every refusal comes before any fetch, rename, setup or state.
	refused(cli(fresh, adopt, null), /--here: nothing changed — .*no native session binding/);
	refused(cli(fresh, adopt, { kind: 'unavailable', why: 'PRIVATE_DETAILS' }), /workspace unavailable/);
	refused(cli(fresh, adopt, t3(clone, 'dev', false)), /bound to the project root/);
	refused(cli(fresh, adopt, t3(clone)), /the shell is in .* but this session is bound to/);
	refused(cli(clone, adopt, t3(clone, 'dev')), /main checkout/);
	refused(cli(fresh, adopt, t3(fresh, 'chore/renamed-elsewhere')), /names branch chore\/renamed-elsewhere/);
	writeFileSync(join(fresh, 'scratch.txt'), 'x');
	refused(cli(fresh, adopt, t3(fresh)), /uncommitted changes \(\?\? scratch\.txt\)/);
	rmSync(join(fresh, 'scratch.txt'));
	unchanged(fresh, 'chore/probe-thing', staleHead);

	// Plain wf new from the session's own host checkout would cut a worktree nobody can bind.
	const plain = cli(fresh, ['new', 'fix/x-2-plain', '--class', 'A'], t3(fresh));
	refused(plain, /nothing created — this session is bound to its own host checkout .*wf new <branch> --here/);
	assert.equal(existsSync(join(clone, '.claude', 'worktrees')), false, 'no worktree cut');

	// A checkout with commits of its own on the stale base: refused with the rebase, nothing renamed.
	const diverged = hostCheckout('t3-bbbb', 'chore/own-work');
	writeFileSync(join(diverged, 'own.txt'), 'own\n');
	git(diverged, 'add', '-A'); git(diverged, 'commit', '-qm', 'own work');
	const divergedHead = git(diverged, 'rev-parse', 'HEAD');
	const rebase = cli(diverged, ['new', 'fix/x-3-own', '--here', '--class', 'A'], t3(diverged, 'chore/own-work'));
	refused(rebase, /commits of its own and does not contain origin\/dev\. Rebase it first, then rerun: git rebase origin\/dev/);
	unchanged(diverged, 'chore/own-work', divergedHead);
	refused(cli(fresh, ['new', 'chore/own-work', '--here', '--class', 'A'], t3(fresh)), /branch chore\/own-work already exists/);

	// Adoption: fetched, fast-forwarded, renamed, set up, classified and recorded, in this checkout.
	const adopted = cli(fresh, adopt, t3(fresh));
	assert.equal(adopted.status, 0, adopted.out);
	assert.match(adopted.stdout, /fast-forwarded this checkout to origin\/dev/);
	assert.match(adopted.stdout, /renamed branch chore\/probe-thing → fix\/x-1-adopt/);
	assert.match(adopted.stdout, /checkout adopted/);
	assert.match(adopted.stdout, /already bound here: run wf next/);
	assert.doesNotMatch(adopted.stdout, /existing_worktree|BIND_EXISTING/);
	assert.equal(branchOf(fresh), round);
	assert.equal(git(fresh, 'rev-parse', 'HEAD'), git(clone, 'rev-parse', 'origin/dev'));
	const saved = state(fresh);
	assert.equal(saved.round, round);
	assert.equal(saved.step, 'classify');
	assert.equal(saved.class, 'A');
	assert.equal(saved.base, 'origin/dev');
	assert.equal(saved.adopted.from, 'chore/probe-thing');
	assert.equal(saved.adopted.branch, round);
	assert.ok(existsSync(join(fresh, saved.folder)), saved.folder);
	assert.equal(saved.folder.endsWith(slugForBranch(round)), true);
	assert.ok(existsSync(join(fresh, '.wf/.gitignore')));
	const setup = adopted.lines.find((l) => l.setup)?.setup as { branch: string; port: number; path: string };
	assert.equal(setup.branch, round, 'setup sees the round branch: ports, hostnames and database follow it');
	assert.equal(typeof setup.port, 'number');
	assert.equal(existsSync(join(clone, '.claude', 'worktrees')), false, 'no second checkout');
	assert.doesNotMatch(execFileSync('git', ['-C', fresh, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }), /\.wf\//, 'round metadata is ignored');
	refused(cli(fresh, adopt, t3(fresh, round)), /already a round.*wf next/);

	// T3 keeps the old branch name; that stale name is accepted at this path only.
	assert.match(cli(fresh, ['probe'], t3(fresh, 'chore/probe-thing')).stdout, /COMMAND_REACHED/);
	assert.match(cli(fresh, ['probe'], t3(fresh, round)).stdout, /COMMAND_REACHED/);
	refused(cli(fresh, ['probe'], t3(fresh, 'chore/something-else')), /native session branch does not match/);
	refused(cli(fresh, ['probe'], t3(fresh, 'chore/probe-thing', false)), /native session branch does not match/);
	const elsewhere = cli(fresh, ['probe'], t3(diverged, 'chore/own-work'));
	refused(elsewhere, /does not match the round workspace/);
	assert.match(elsewhere.stderr, /own host checkout .*wf new <branch> --here/);
	const fromRoot = cli(fresh, ['probe'], t3(clone, 'dev', false));
	refused(fromRoot, /does not match the round workspace/);
	assert.match(fromRoot.stderr, /delegate_task with isolation "worktree".*wf new <branch> --here/);

	// A setup that fails after the rename: rerunning the same command is the same adoption.
	const retried = hostCheckout('t3-cccc', 'chore/retry-thing');
	const failed = cli(retried, ['new', 'fix/x-4-retry', '--here', '--class', 'A'], t3(retried, 'chore/retry-thing'), { setupFails: true });
	assert.notEqual(failed.status, 0, failed.out);
	assert.match(failed.stderr, /setup failed/);
	assert.equal(branchOf(retried), 'fix/x-4-retry');
	assert.equal(existsSync(join(retried, '.wf/state.json')), false);
	const again = cli(retried, ['new', 'fix/x-4-retry', '--here', '--class', 'A'], t3(retried, 'chore/retry-thing'));
	assert.equal(again.status, 0, again.out);
	assert.equal(state(retried).adopted.from, 'chore/retry-thing');

	// Reap, from the bound session itself: dry by default, then the project's resources and .wf/ go;
	// the checkout, its branch and the host's binding stay.
	const dry = cli(fresh, ['reap', round], t3(fresh), { force: false });
	assert.equal(dry.status, 0, dry.out);
	assert.match(dry.stdout, /would: archive the round record .*keep the checkout and branch fix\/x-1-adopt/);
	assert.equal(dry.lines.length, 0);
	assert.ok(existsSync(join(fresh, '.wf/state.json')));
	const broken = cli(fresh, ['reap', round], t3(fresh), { failStep: true });
	assert.notEqual(broken.status, 0, broken.out);
	assert.match(broken.stderr, /incomplete at "drop database".*run wf reap fix\/x-1-adopt again/);
	assert.ok(existsSync(join(fresh, '.wf/state.json')), 'the round record stays until every step is done');
	const reaped = cli(fresh, ['reap', round], t3(fresh), { failStep: true });
	assert.equal(reaped.status, 0, reaped.out);
	const plan = reaped.lines.find((l) => l.plan)?.plan as { checkout?: string; path: string; slug: string };
	assert.equal(plan.checkout, 'keep', 'the machine is asked for a plan that keeps the checkout');
	assert.ok(reaped.lines.some((l) => l.dropped === slugForBranch(round)));
	assert.equal(existsSync(join(fresh, '.wf')), false);
	assert.ok(existsSync(join(fresh, contractPaths)), 'the checkout stays');
	assert.equal(branchOf(fresh), round, 'the branch stays');
	assert.match(reaped.stdout, /checkout .* kept — the session host created it/);
	assert.match(reaped.stdout, /local branch fix\/x-1-adopt: kept/);
	const archive = join(home, '.cache', 'wf-reaped', slugForBranch(round));
	assert.equal(JSON.parse(readFileSync(join(archive, '.wf/state.json'), 'utf8')).adopted.from, 'chore/probe-thing');
	const ledger = readFileSync(join(home, '.cache', 'wf-reaped', 'ROUNDS.md'), 'utf8').split('\n').filter((l) => l.startsWith('- '));
	assert.equal(ledger.length, 1, `one friction line across the failed and the retried reap: ${ledger.join(' | ')}`);
	assert.deepEqual(readdirSync(hosted).sort(), ['t3-aaaa', 't3-bbbb', 't3-cccc']);
} finally {
	rmSync(root, { recursive: true, force: true });
}
console.log('all arms green');
