// adopt.ts — `wf new <branch> --here`: make the checkout a session host created for this session the
// round, instead of cutting a second one beside it. 2026-11-28: T3's delegate_task gives a subagent
// either the project root or a fresh T3 worktree (~/.t3/worktrees/<project>/t3-<id>), never a
// checkout wf made, and a thread cannot rebind. A subagent that ran plain `wf new` got a worktree no
// session was bound to, and next/serve/seed/check refused it (session-workspace.ts, JX-1426). The
// workaround, a top-level thread launched on the wf checkout, never woke its parent.
//
// The branch: wf renames the host's branch to the round's. Ports, stack hostnames, the database, the
// PR branch and the project's branch rules (a project's hooks may key on the branch prefix) all
// derive from the branch name, and the host's generated name (T3: a model picks it, e.g.
// chore/probe-branch-binding) follows none of them. The host keeps its old name in its metadata
// (measured), which session-workspace.ts accepts at this path only (state.adopted).
//
// The base: the host cuts from whatever its project root has (T3 used a local base branch months
// behind its remote, 2026-11-28). A checkout with no commits of its own is fast-forwarded to the fetched
// base: that rewrites nothing. One with its own commits is refused with the rebase to run, because
// those commits are the agent's work and wf does not rewrite them.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { baseBranch, releaseBranches } from '../project.ts';
import { seams } from '../seams.ts';
import type { SessionWorkspace } from '../seams.ts';
import { listWorktrees } from './worktree-registry.ts';
import { excludeWfFolder } from './worktree.ts';

/** What adoption needs to know about the checkout; read once by `checkoutFacts`, judged by `adoptionGap`. */
export type CheckoutFacts = {
	readonly top: string;
	/** The repository's main checkout (null in a bare layout): never a round. */
	readonly main: string | null;
	/** Git's current branch, or null when HEAD is detached. */
	readonly current: string | null;
	readonly isRound: boolean;
	/** `git status --porcelain` lines: tracked changes and untracked files, not ignored ones. */
	readonly dirty: readonly string[];
	readonly branchExists: (branch: string) => boolean;
};

const canonical = (path: string) => {
	const real = realpathSync.native(path);
	return process.platform === 'win32' ? real.toLowerCase() : real;
};
const samePath = (a: string, b: string) => {
	try { return canonical(a) === canonical(b); } catch {
		// A path that does not resolve is not the checkout this process runs in.
		return false;
	}
};

// Pure but for the canonical paths: a protected branch is the project's base or a release branch,
// the branches rounds are cut from. `v[0-9]*` is a glob over ref names (project.ts releaseBranches).
export function protectedBranch(branch: string): boolean {
	const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
	return branch === baseBranch || releaseBranches.some((pattern) => glob(pattern).test(branch));
}

/** The adoption to run, or why not. `from`: the name the host gave the branch (recorded as state.adopted.from). */
export type Adoption = { kind: 'adopt'; path: string; from: string; branch: string } | { kind: 'refused'; why: string };

/** Judge the binding and the checkout before anything is fetched, renamed or written. */
export function adoptionGap({ binding, facts, branch }: { binding: SessionWorkspace | null; facts: CheckoutFacts; branch: string }): Adoption {
	const refused = (why: string): Adoption => ({ kind: 'refused', why });
	if (!binding) return refused('--here adopts the checkout a session host created for this session (a T3 subagent\'s worktree); this process has no native session binding. In a terminal, run wf new <branch> without --here');
	if (binding.kind === 'unavailable') return refused('native session workspace unavailable — cannot verify which checkout this session is bound to');
	if (binding.attached !== true) return refused(`this session is bound to the project root (${binding.path}), not a checkout of its own; --here never makes the project's root checkout a round. Run wf new <branch> without --here for a new worktree`);
	if (!samePath(facts.top, binding.path)) return refused(`the shell is in ${facts.top}, but this session is bound to ${binding.path}; run wf new --here from the bound checkout (a shell cd does not move the session)`);
	if (facts.main && samePath(facts.top, facts.main)) return refused(`${facts.top} is the repository's main checkout; a round never runs in it`);
	if (facts.current === null) return refused('HEAD is detached; adoption needs the branch the host created');
	if (protectedBranch(facts.current)) return refused(`this checkout is on ${facts.current}, a base branch rounds are cut from; it is never renamed into a round`);
	if (facts.isRound) return refused('this checkout is already a round (.wf/state.json): resume it with wf next');
	if (facts.dirty.length) return refused(`uncommitted changes (${facts.dirty.slice(0, 5).join(', ')}${facts.dirty.length > 5 ? ', …' : ''}); adoption starts from a clean checkout: commit or remove them first`);
	if (protectedBranch(branch)) return refused(`${branch} is a base branch; name the round's own branch`);
	// The host's metadata names the branch it created. After a rename whose setup then failed, Git is on
	// the requested branch and the host's name no longer exists: that retry is the same adoption.
	const from = binding.branch ?? facts.current;
	if (from !== facts.current && !(facts.current === branch && !facts.branchExists(from))) {
		return refused(`the session host names branch ${from} but Git is on ${facts.current}; switch back to ${from} or open a session bound to this checkout`);
	}
	if (facts.current !== branch && facts.branchExists(branch)) return refused(`branch ${branch} already exists; choose a new round branch name`);
	return { kind: 'adopt', path: facts.top, from, branch };
}

/**
 * Plain `wf new` from the host checkout this session is bound to: the new worktree could never be this
 * session's, so its setup would be spent on a round the session is refused in. Refused before
 * anything is fetched or created; elsewhere (the project root, a terminal) `wf new` is unchanged.
 */
export function ownCheckoutGap(binding: SessionWorkspace | null, top: string | null): string | null {
	if (!binding || binding.kind !== 'bound' || binding.attached !== true || !top || !samePath(top, binding.path)) return null;
	return `this session is bound to its own host checkout ${binding.path}; a new worktree could never be bound to it. Make this checkout the round: wf new <branch> --here --class A|B|C [--id <id>]`;
}

/** Read the checkout the shell is in; throws outside a Git work tree. */
export function checkoutFacts(cwd: string): CheckoutFacts {
	const git = (args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	const top = git(['rev-parse', '--show-toplevel']).trim();
	const trees = listWorktrees(top);
	const main = trees[0] && !trees[0].bare ? trees[0].path : null;
	const current = git(['branch', '--show-current']).trim() || null;
	const dirty = git(['status', '--porcelain', '--untracked-files=all']).split('\n').map((line) => line.trimEnd()).filter(Boolean);
	const branchExists = (name: string) => spawnSync('git', ['-C', top, 'show-ref', '--verify', '--quiet', `refs/heads/${name}`]).status === 0;
	return { top, main, current, isRound: existsSync(join(top, '.wf', 'state.json')), dirty, branchExists };
}

/** Where HEAD stands against the base: on it, behind it with nothing of its own, or diverged. */
export type BaseStanding = 'contains' | 'behind' | 'diverged' | 'unknown';

/** Pure: what adoption does about the base, or the refusal with the exact command to run. */
export function baseAction(standing: BaseStanding, base: string): { kind: 'none' | 'fast-forward' } | { kind: 'refused'; why: string } {
	if (standing === 'contains') return { kind: 'none' };
	if (standing === 'behind') return { kind: 'fast-forward' };
	if (standing === 'unknown') return { kind: 'refused', why: `cannot resolve ${base} here; fetch it (git fetch origin) or pass --base <ref>` };
	return { kind: 'refused', why: `this checkout has commits of its own and does not contain ${base}. Rebase it first, then rerun: git rebase ${base}` };
}

export function baseStanding(top: string, base: string): BaseStanding {
	const ancestor = (a: string, b: string) => spawnSync('git', ['-C', top, 'merge-base', '--is-ancestor', a, b]).status;
	if (spawnSync('git', ['-C', top, 'rev-parse', '--verify', '--quiet', `${base}^{commit}`]).status !== 0) return 'unknown';
	if (ancestor(base, 'HEAD') === 0) return 'contains';
	if (ancestor('HEAD', base) === 0) return 'behind';
	return 'diverged';
}

/**
 * Bring the adopted checkout onto the base, rename its branch, then run the project's setup there.
 * Every refusal comes before the first change. A failed setup leaves the renamed checkout; rerunning
 * the same `wf new <branch> --here` repeats the setup (adoptionGap accepts that retry).
 */
export async function adoptCheckout({ adoption, base, port, log }: { adoption: Extract<Adoption, { kind: 'adopt' }>; base: string; port: number; log: string }): Promise<void> {
	const { path, branch } = adoption;
	const git = (args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	if (spawnSync('git', ['check-ref-format', '--branch', branch]).status !== 0) throw new Error(`nothing changed — ${branch} is not a valid branch name`);
	const action = baseAction(baseStanding(path, base), base);
	if (action.kind === 'refused') throw new Error(`nothing changed — ${action.why}`);
	// Windows: same reason as addWorktree (workspace-allocation.ts, BJEW-602): a long tracked path
	// fails the checkout the fast-forward does.
	if (process.platform === 'win32') git(['config', 'core.longpaths', 'true']);
	if (action.kind === 'fast-forward') {
		git(['merge', '--ff-only', '--quiet', base]);
		console.log(`wf new --here: fast-forwarded this checkout to ${base} (it had no commits of its own)`);
	}
	const current = git(['branch', '--show-current']).trim();
	if (current !== branch) {
		git(['branch', '-m', current, branch]);
		console.log(`wf new --here: renamed branch ${current} → ${branch}; the session host may keep showing ${current}`);
	}
	excludeWfFolder(path);
	const setup = seams.setupCheckout ?? (await import('./git-worktree.ts')).setupCheckout;
	await setup({ path, branch, port, log });
}
