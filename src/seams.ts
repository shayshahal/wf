// seams.ts — the pieces of wf that differ between machines, and the kit's defaults for them.
// wf.mjs runs the kit as it is; an env's own entry (Shay's: env/wf.mjs) runs the same kit with its
// pieces plugged in. Which entry runs decides, not a variable: every process wf starts, or names in
// a prompt, runs `seams.entry`, so a round started from one entry stays in it (kit and env plan,
// 2026-09-27). The kit never imports an env; it only reads what was plugged in here.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { snapshotProcesses, killOwnedProcesses } from './process-tree.ts';
import { WF_ROOT } from './paths.ts';
import { CLAUDE_CODE_MODELS } from './models.ts';
import type { Models } from './models.ts';
import type { ReviewFeedback } from './gates/review-format.ts';
import type { QuestionReply } from './round/state.ts';

// One step `wf reap` runs: a command, a folder removed in-process, or a function run in-process
// (its arguments never pass through the shell).
export type RemovalStep = { label: string } & (
	| { cmd: string; args: string[]; env?: Record<string, string>; rm?: never; run?: never }
	| { rm: string; cmd?: never; args?: never; env?: never; run?: never }
	| { run: () => unknown | Promise<unknown>; cmd?: never; args?: never; env?: never; rm?: never }
);
export type Worktree = { path: string; branch: string | null };
export type ReviewUI = {
	available: () => boolean;
	annotate: (o: { worktree: string; file: string; since: string }) => ReviewFeedback | null;
};
// A question inbox carries messages, not round decisions or human gate approvals.
export type QuestionInbox = {
	post: (o: { worktree: string; key: string; subject: string; body: string }) => Promise<{ ref: string; url: string }>;
	read: (o: { worktree: string; ref: string }) => Promise<QuestionReply | null>;
};
/** A native review handoff names exact artifacts; the session, not wf, invokes its UI tools. */
export type ReviewPresentation = {
	readonly kind: 'agreement' | 'review';
	readonly worktree: string;
	readonly document: string;
	readonly pages: readonly string[];
	readonly reviewFile: string;
};
/** Presentation instructions carry no verdict and never claim a native tool was executed. */
export type NativePresentation = {
	readonly guidance: string;
	readonly reviewHandoff: (review: ReviewPresentation) => string;
};
export type Command = (argv: string[]) => unknown;
// One `gh` call for the remote wf delivers to: argv, the folder to run it in, and what it printed.
// The kit's default shells out to gh; a delivery test plugs a faithful fake so a retry can be proven
// without a production remote (deliver.ts, deliver-recovery.selfcheck.ts).
export type GhResult = { status: number | null; stdout: string; stderr: string };
export type Gh = (args: string[], cwd: string) => GhResult;
export type Seams = {
	/** Machine process probes must distinguish unavailable inventory from absence. */
	processes: { snapshot: typeof snapshotProcesses; kill: typeof killOwnedProcesses };
	entry: string;
	madeBy: string;
	createWorktree: ((o: { branch: string; base: string; log: string; path: string }) => Worktree | Promise<Worktree>) | null;
	removalPlan: ((o: { branch: string; path: string; slug: string; pid: number }) => RemovalStep[] | Promise<RemovalStep[]>) | null;
	reviewUI: ReviewUI | null;
	presentation: NativePresentation | null;
	/** Native session binding; null means no native session, unavailable must refuse, never downgrade. */
	sessionWorkspace: (() => Promise<{ kind: 'bound'; path: string; branch: string | null } | { kind: 'unavailable'; why: string }> | null) | null;
	/** Session-owned binding instructions, never a second workspace allocation or a claim it opened. */
	workspaceHandoff: ((worktree: string) => string) | null;
	inbox: QuestionInbox | null;
	commands: Record<string, Command>;
	models: Models;
	resolveModel: ((model: string) => string | null) | null;
	// The remote CLI deliver inspects, creates, edits and merges PRs through: the kit's is `gh`.
	gh: Gh;
	opener: (() => Record<string, string> | null) | null;
	processCwds: (() => string[]) | null;
	// Typed by the project that reads it (projects/<name>/index.ts).
	project: object;
};

export const seams: Seams = {
	processes: { snapshot: snapshotProcesses, kill: killOwnedProcesses },
	// The wf.mjs every child process and prompt runs: the entry that started this one.
	entry: join(WF_ROOT, 'wf.mjs'),
	// Whose wf this is, recorded in each round it makes (state.ts entryGap): 'kit', or the env's name.
	madeBy: 'kit',
	// ({ branch, base, log, path }) → { path, branch }: allocates at wf's destination and sets it up.
	// null: the kit's plain git (git-worktree.ts).
	createWorktree: null,
	// ({ branch, path, slug, pid }) → the ordered steps `wf reap` runs (reap.ts runs them).
	// null: the kit's plain git (git-worktree.ts).
	removalPlan: null,
	// { available(), annotate({ worktree, file, since }) }
	// → the one feedback line T1/T2 fold, or null. Without one, T1/T2 open the file in an editor.
	reviewUI: null,
	// Native tool instructions take precedence over an external review UI; null keeps kit defaults.
	presentation: null,
	// A shell's cwd is not a native session binding; the kit has no native reader.
	sessionWorkspace: null,
	// Native hosts supply their existing-checkout launch; terminal sessions use the printed path.
	workspaceHandoff: null,
	// Optional async question transport. Replies are saved by `wf inbox`, ruled on by `wf decide`.
	inbox: null,
	// wf subcommands the env adds: name → (argv) => void.
	commands: {},
	// The model each effort level runs on (models.ts): what `wf next` names in a dispatch, and what
	// an agent file's `effort:` becomes. The kit's are Claude Code's aliases.
	models: CLAUDE_CODE_MODELS,
	// (model) → the model the harness resolves it to, or null when it has none; `wf models` prints it.
	// null: the harness cannot be asked (Claude Code resolves its aliases inside the session).
	resolveModel: null,
	// The kit's own remote CLI. A gh that fails is not an answer: deliver refuses rather than reading
	// it as "no PR" and creating a second one for the same branch.
	gh: (args, cwd) => {
		const r = spawnSync('gh', args, { cwd, encoding: 'utf8' });
		return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
	},
	// () → who is opening a worktree, recorded in its state as `opened_by` by `wf new`: the env's own
	// keys (Shay's: the pane and the agent session). null: nobody is recorded.
	opener: null,
	// () → the working folder of every running process, for `wf status`'s count of what still runs in
	// each worktree. null: no count.
	processCwds: null,
	// The project's machine pieces; the project's own folder says which it reads (projects/<name>/index.ts).
	project: {},
};

export function plug(pieces: Partial<Seams>) {
	Object.assign(seams, pieces);
}
