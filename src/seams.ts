// seams.ts — the pieces of wf that differ between machines, and the kit's defaults for them.
// wf.mjs runs the kit as it is; an env's own entry (Shay's: env/wf.mjs) runs the same kit with its
// pieces plugged in. Which entry runs decides, not a variable: every process wf starts, or names in
// a prompt, runs `seams.entry`, so a round started from one entry stays in it (kit and env plan,
// 2026-09-27). The kit never imports an env; it only reads what was plugged in here.
import { join } from 'node:path';
import { WF_ROOT } from './paths.ts';
import { CLAUDE_CODE_MODELS } from './models.ts';
import type { Models } from './models.ts';
import type { ReviewFeedback } from './gates/review-format.ts';
import type { State } from './round/state.ts';

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
	models: Models;
	resolveModel: ((model: string) => string | null) | null;
	// Typed by the project that reads it (projects/<name>/index.ts).
	project: object;
};

export const seams: Seams = {
	// The wf.mjs every child process and prompt runs: the entry that started this one.
	entry: join(WF_ROOT, 'wf.mjs'),
	// Whose wf this is, recorded in each round it makes (state.ts entryGap): 'kit', or the env's name.
	madeBy: 'kit',
	// ({ branch, base, log }) → { path, branch }: makes the worktree, sets it up and starts its stack.
	// null: the kit's plain git (git-worktree.ts).
	createWorktree: null,
	// ({ branch, path, slug, pid }) → the ordered steps `wf reap` runs (reap.ts runs them).
	// null: the kit's plain git (git-worktree.ts).
	removalPlan: null,
	// { available(), annotate({ worktree, file, since }), reviewDiff({ worktree, base, diffType, since }) }
	// → the one feedback line T1/T2 fold, or null. Without one, T1/T2 open the file in an editor.
	reviewUI: null,
	// (state) => void, after every `wf step`; best effort, a failing one never fails the command.
	notify: [],
	// wf subcommands the env adds: name → (argv) => void.
	commands: {},
	// The model each effort level runs on (models.ts): what `wf next` names in a dispatch, and what
	// an agent file's `effort:` becomes. The kit's are Claude Code's aliases.
	models: CLAUDE_CODE_MODELS,
	// (model) → the model the harness resolves it to, or null when it has none; `wf models` prints it.
	// null: the harness cannot be asked (Claude Code resolves its aliases inside the session).
	resolveModel: null,
	// The project's machine pieces; the project's own folder says which it reads (projects/<name>/index.ts).
	project: {},
};

export function plug(pieces: Partial<Seams>) {
	Object.assign(seams, pieces);
}
