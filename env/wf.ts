// env/wf.ts — Shay's wf: the kit (../src/run.ts) with his machine plugged into its seams (../src/seams.ts):
// worktrunk and its hooks, a MongoDB container per worktree, portless, plannotator, herdr, the
// permanent stacks, and self-update from shayshahal/wf. ~/bin/wf and worktrunk's hooks run it
// through env/wf.mjs; the team's plugin runs the kit's own ../wf.mjs (kit and env plan, 2026-09-27).
import { run } from '../src/run.ts';
import { isHerdrPresent, reportStepToHerdr } from './adapters/herdr.ts';
import { annotateFile, isPlannotatorPresent, reviewDiff } from './adapters/plannotator.ts';
import * as jewelryx from './projects/jewelryx/index.ts';
import { autoUpdate } from './update.ts';
import { createWorktree, removalPlan } from './worktrees.ts';

// `entry` is env/wf.mjs, the file ~/bin/wf and the hooks call: autoUpdate re-runs it, the hooks name it.
export async function runEnvWf(entry: string, argv: string[]) {
	// The installed copy follows shayshahal/wf main: a pushed change is live on the next run (update.ts).
	// Not under a hook: wt runs the pre-start steps in parallel, and an update swaps the installed
	// folder while the others are still loading from it.
	// `hook install` is run by hand, not by wt: it updates first, so the hooks it writes call the newest
	// copy (it did not, 2026-09-24: installed from the old copy after a push).
	if (argv[0] !== 'hook' || argv[1] === 'install') autoUpdate(entry, argv);

	await run(argv, {
		entry,
		madeBy: 'env',
		createWorktree,
		removalPlan,
		reviewUI: { available: isPlannotatorPresent, annotate: annotateFile, reviewDiff },
		notify: [(state) => (isHerdrPresent() ? reportStepToHerdr(state) : undefined)],
		commands: {
			hook: async (a) => (await import('./hook.ts')).runHook(a),
			update: async () => (await import('./update.ts')).runUpdate(),
			...jewelryx.commands,
		},
		project: jewelryx.pieces,
	});
}
