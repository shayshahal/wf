// seams.mts — the pieces of wf that differ between machines, and the kit's defaults for them.
// wf.mjs runs the kit as it is; an env's own entry (Shay's: env/wf.mjs) runs the same kit with its
// pieces plugged in. Which entry runs decides, not a variable: every process wf starts, or names in
// a prompt, runs `seams.entry`, so a round started from one entry stays in it (kit and env plan,
// 2026-09-27). The kit never imports an env; it only reads what was plugged in here.
import { fileURLToPath } from 'node:url';
import type { ReviewFeedback } from './review-format.mts';
import type { State } from './state.mts';

// One step `wf reap` runs: a command, a folder removed in-process, or a function run in-process
// (its arguments never pass through the shell).
export type RemovalStep = { label: string } & (
	| { cmd: string; args: string[]; env?: Record<string, string>; rm?: never; run?: never }
	| { rm: string; cmd?: never; args?: never; env?: never; run?: never }
	| { run: () => unknown; cmd?: never; args?: never; env?: never; rm?: never }
);
export type Worktree = { path: string; branch: string | null };
export type ReviewUI = {
	available: () => boolean;
	annotate: (o: { worktree: string; file: string; since: string }) => ReviewFeedback | null;
	reviewDiff: (o: { worktree: string; base: string; diffType?: string; since: string }) => ReviewFeedback | null;
};
export type Command = (argv: string[]) => unknown;
export type Seams = {
	entry: string;
	madeBy: string;
	createWorktree: ((o: { branch: string; base: string; log: string }) => Worktree | Promise<Worktree>) | null;
	removalPlan: ((o: { branch: string; path: string; slug: string; pid: number }) => RemovalStep[] | Promise<RemovalStep[]>) | null;
	reviewUI: ReviewUI | null;
	notify: ((state: State) => unknown)[];
	commands: Record<string, Command>;
	// Typed by the project that reads it (projects/<name>/index.mts).
	project: object;
};

export const seams: Seams = {
	// The wf.mjs every child process and prompt runs: the entry that started this one.
	entry: fileURLToPath(new URL('./wf.mjs', import.meta.url)),
	// Whose wf this is, recorded in each round it makes (state.mts entryGap): 'kit', or the env's name.
	madeBy: 'kit',
	// ({ branch, base, log }) → { path, branch }: makes the worktree, sets it up and starts its stack.
	// null: the kit's plain git (git-worktree.mts).
	createWorktree: null,
	// ({ branch, path, slug, pid }) → the ordered steps `wf reap` runs (reap.mts runs them).
	// null: the kit's plain git (git-worktree.mts).
	removalPlan: null,
	// { available(), annotate({ worktree, file, since }), reviewDiff({ worktree, base, diffType, since }) }
	// → the one feedback line T1/T2 fold, or null. Without one, T1/T2 open the file in an editor.
	reviewUI: null,
	// (state) => void, after every `wf step`; best effort, a failing one never fails the command.
	notify: [],
	// wf subcommands the env adds: name → (argv) => void.
	commands: {},
	// The project's machine pieces; the project's own folder says which it reads (projects/<name>/index.mts).
	project: {},
};

export function plug(pieces: Partial<Seams>) {
	Object.assign(seams, pieces);
}
