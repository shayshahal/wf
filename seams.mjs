// seams.mjs — the pieces of wf that differ between machines, and the kit's defaults for them.
// wf.mjs runs the kit as it is; an env's own entry (Shay's: env/wf.mjs) runs the same kit with its
// pieces plugged in. Which entry runs decides, not a variable: every process wf starts, or names in
// a prompt, runs `seams.entry`, so a round started from one entry stays in it (kit and env plan,
// 2026-09-27). The kit never imports an env; it only reads what was plugged in here.
import { fileURLToPath } from 'node:url';

export const seams = {
	// The wf.mjs every child process and prompt runs: the entry that started this one.
	entry: fileURLToPath(new URL('./wf.mjs', import.meta.url)),
	// Whose wf this is, recorded in each round it makes (state.mjs entryGap): 'kit', or the env's name.
	madeBy: 'kit',
	// ({ branch, base, log }) → { path, branch }: makes the worktree, sets it up and starts its stack.
	// null: the kit's plain git (git-worktree.mjs).
	createWorktree: null,
	// ({ branch, path, slug, pid }) → the ordered steps `wf reap` runs (reap.mjs runs them).
	// null: the kit's plain git (git-worktree.mjs).
	removalPlan: null,
	// { available(), annotate({ worktree, file, since }), reviewDiff({ worktree, base, diffType, since }) }
	// → the one feedback line T1/T2 fold, or null. Without one, T1/T2 open the file in an editor.
	reviewUI: null,
	// (state) => void, after every `wf step`; best effort, a failing one never fails the command.
	notify: [],
	// wf subcommands the env adds: name → (argv) => void.
	commands: {},
	// The project's machine pieces; the project's own folder says which it reads (projects/<name>/index.mjs).
	project: {},
};

export function plug(pieces) {
	Object.assign(seams, pieces);
}
