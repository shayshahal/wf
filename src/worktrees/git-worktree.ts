// git-worktree.ts — the kit's worktrees, where no env plugs its own in (seams.ts): plain git,
// in <repo>/.claude/worktrees/<slug>, Claude Code Desktop's own place (kit and env plan, step 3).
//   create: git worktree add, the project's setup steps side by side, then its stack (wf serve)
//   remove: stop the stack, the project's teardown while the worktree is still there, then the folder
import { closeSync, openSync, readFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { setup, teardown } from '../project.ts';
import type { RemovalStep, Seams, Worktree } from '../seams.ts';
import { servePid, startServers, stopServersStep, stragglersStep } from './serve.ts';
import { basePortForBranch, excludeFromGit, excludeWfFolder, listWorktrees, slugForBranch, worktreesHome } from './worktree.ts';

// The project's setup steps all at once, as worktrunk runs them: a command runs in a shell, its
// output in the log; a function is awaited here. Returns the failed steps.
async function runSetup({ worktree, slug, port, fd }: { worktree: string; slug: string; port: number; fd: number }) {
	const runs = Object.entries(setup).map(([name, step]) => (typeof step === 'string'
		? new Promise<string | null>((resolve) => spawn(step, { cwd: worktree, shell: true, stdio: ['ignore', fd, fd] })
			.on('error', (e) => resolve(`${name}: ${e.message}`))
			.on('exit', (code) => resolve(code === 0 ? null : `${name} (exit ${code})`)))
		: Promise.resolve().then(() => step({ worktree, slug, port })).then(() => null, (e) => `${name}: ${e.message}`)));
	return (await Promise.all(runs)).filter(Boolean);
}

// A `git worktree add -b` whose checkout fails removes the worktree but leaves the branch: BJEW-602's
// first try (2026-09-27), deleted by hand before the second. Only a branch this call made goes: -b
// also fails when the branch already exists, and that one is someone's work.
export function addWorktree({ branch, path, base, cwd }: { branch: string; path: string; base: string; cwd?: string }) {
	const existed = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd }).status === 0;
	try {
		// --quiet: git's checkout progress was ~100 lines of the agent's output (2026-09-27).
		execFileSync('git', ['worktree', 'add', '--quiet', '-b', branch, path, base], { cwd, stdio: 'inherit' });
	} catch (e) {
		if (!existed) spawnSync('git', ['branch', '-D', branch], { cwd, stdio: 'ignore' });
		throw e;
	}
}

// Returns the worktree, or throws naming the failed steps and the log's end. A failed setup leaves
// the worktree for a look; `wf reap` removes it.
export async function createWorktree({ branch, base, log }: Parameters<NonNullable<Seams['createWorktree']>>[0]): Promise<Worktree> {
	const path = `${worktreesHome(listWorktrees())}/${slugForBranch(branch)}`;
	// Windows: the clone's .claude/worktrees/<slug>/ is 89 characters before a tracked path starts, and
	// a project's 185-character one put the checkout past 260: "Filename too long", exit 128, on
	// BJEW-602 (2026-09-27). In the clone's config, not -c: `-c core.longpaths=false` did not reach
	// the checkout, and every later git command in the worktree needs it too.
	if (process.platform === 'win32') execFileSync('git', ['config', 'core.longpaths', 'true']);
	addWorktree({ branch, path, base });
	excludeWfFolder(path);
	// The person's clone must not show the rounds as untracked files: JewelryX's main branch ignores
	// no .claude/ (its .gitignore was five weeks behind dev's, 2026-09-27), and a clone on main is
	// where a teammate starts.
	excludeFromGit(path, '/.claude/worktrees/');
	const fd = openSync(log, 'w');
	const failed = await runSetup({ worktree: path, slug: slugForBranch(branch), port: basePortForBranch(branch), fd });
	closeSync(fd);
	if (failed.length) throw new Error(`${readFileSync(log, 'utf8').trimEnd().split('\n').slice(-40).join('\n')}\nsetup failed: ${failed.join(', ')} (log: ${log}; worktree left at ${path})`);
	startServers(path);
	return { path, branch };
}

// Pure but for the pid file: the ordered steps. The project's teardown runs before the folder goes:
// dropping the database takes the worktree's own python. No `git worktree remove`: rm and prune do
// the same without a path through the shell reap runs commands in.
export function removalPlan({ path, slug, pid: self }: Pick<Parameters<NonNullable<Seams['removalPlan']>>[0], 'path' | 'slug' | 'pid'>): RemovalStep[] {
	const pid = servePid(path);
	return [
		...(pid ? [stopServersStep(pid)] : []),
		// Whatever else still runs from the tree (a `wf show` window's daemon, BJEW-562): its folder
		// cannot go while it does. `self`: reap's own pid, spared.
		stragglersStep(path, self),
		...teardown({ slug, worktree: path }),
		{ label: 'rm -rf worktree', rm: path },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
	];
}
