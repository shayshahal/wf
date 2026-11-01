// workspace-allocation.ts — project-neutral allocation used by round setup and disposable diagnostics.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { withGitHooksDisabled } from './git-hooks.ts';
import { seams } from '../seams.ts';
import { listWorktrees, slugForBranch, worktreesHome, excludeFromGit } from './worktree-registry.ts';

/** Allocate a new Git branch and checkout; never delete a branch whose creation failed. */
export function addWorktree({ branch, path, base, cwd, hooks }: { branch: string; path: string; base: string; cwd?: string; hooks?: 'disabled' }): void {
	const allocate = (env: NodeJS.ProcessEnv | undefined) => {
		// Windows: the clone's .claude/worktrees/<slug>/ is 89 characters before a tracked path starts, and
		// a project's 185-character one put the checkout past 260: "Filename too long", exit 128, on
		// BJEW-602 (2026-09-27). In the clone's config, not -c: `-c core.longpaths=false` did not reach
		// the checkout, and every later git command in the worktree needs it too.
		if (process.platform === 'win32') execFileSync('git', ['config', 'core.longpaths', 'true'], { cwd, env });
		execFileSync('git', ['check-ref-format', '--branch', branch], { cwd, env, stdio: 'pipe' });
		let head: string;
		try {
			head = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
		} catch (cause) {
			throw new Error(`workspace allocation: cannot resolve ${base} for ${path}`, { cause });
		}
		// Create-if-absent is one Git transaction. A preceding show-ref followed by worktree add -b
		// cannot tell whether a competing caller created the branch before the checkout failed.
		execFileSync('git', ['update-ref', `refs/heads/${branch}`, head, '0'.repeat(head.length)], { cwd, env, stdio: 'pipe' });
		try {
			execFileSync('git', ['worktree', 'add', '--quiet', path, branch], { cwd, env, stdio: 'inherit' });
		} catch (error) {
			// Compare-and-delete only the ref this call created; a changed ref belongs to later work.
			spawnSync('git', ['update-ref', '-d', `refs/heads/${branch}`, head], { cwd, env, stdio: 'ignore' });
			throw error;
		}
	};
	if (hooks === 'disabled') withGitHooksDisabled(allocate);
	else allocate(undefined);
}

/** An allocation outcome names its intended path even if checkout failed and needs inspection. */
export type WorkspaceAllocationResult =
	| { readonly kind: 'allocated'; readonly path: string; readonly branch: string }
	| { readonly kind: 'refused'; readonly path: string | null; readonly branch: string; readonly why: string };

/** Resolve workspace placement from the supplied repository, never the caller's ambient cwd. */
export function workspaceAllocationPath(repository: string, branch: string): string {
	return join(worktreesHome(listWorktrees(repository)), slugForBranch(branch));
}

/** Allocate without project hooks: the explicit operation adapter owns setup after allocation. */
export async function allocateWorkspace({ repository, branch, ref, log }: { readonly repository: string; readonly branch: string; readonly ref: string; readonly log: string }): Promise<WorkspaceAllocationResult> {
	let path: string | null = null;
	try {
		path = workspaceAllocationPath(repository, branch);
		mkdirSync(dirname(log), { recursive: true });
		const canonical = (value: string) => {
			const resolved = realpathSync.native(value);
			return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
		};
		if (seams.createWorktree) {
			const allocated = await seams.createWorktree({ repository, branch, base: ref, path, log, setup: 'none' });
			if (allocated.branch !== branch || canonical(allocated.path) !== canonical(path)) return { kind: 'refused', path, branch, why: 'workspace allocation: backend returned a different workspace; no project setup authorized' };
		} else {
			addWorktree({ branch, path, base: ref, cwd: repository, hooks: 'disabled' });
		}
		const registered = listWorktrees(repository).filter((tree) => tree.branch === branch);
		if (registered.length !== 1 || canonical(registered[0].path) !== canonical(path)) return { kind: 'refused', path, branch, why: 'workspace allocation: registry does not confirm the requested branch and destination; no project setup authorized' };
		// Match the shared placement used by rounds without importing round metadata or project policy.
		excludeFromGit(repository, '/.claude/worktrees/');
		return { kind: 'allocated', path, branch };
	} catch (error) {
		return { kind: 'refused', path, branch, why: `workspace allocation: ${error instanceof Error ? error.message : String(error)}` };
	}
}
