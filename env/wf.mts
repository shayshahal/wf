// env/wf.mts — Shay's wf: the kit (../run.mts) with his machine plugged into its seams (../seams.mts):
// worktrunk and its hooks, a MongoDB container per worktree, portless, plannotator, herdr, the
// permanent stacks, and self-update from shayshahal/wf. ~/bin/wf and worktrunk's hooks run it
// through env/wf.mjs; the team's plugin runs the kit's own ../wf.mjs (kit and env plan, 2026-09-27).
import { run } from '../run.mts';
import { isHerdrPresent, reportStepToHerdr } from './adapters/herdr.mts';
import { annotateFile, isPlannotatorPresent, reviewDiff } from './adapters/plannotator.mts';
import * as jewelryx from './projects/jewelryx/index.mts';
import { autoUpdate } from './update.mts';
import { createWorktree, removalPlan } from './worktrees.mts';

// `entry` is env/wf.mjs, the file ~/bin/wf and the hooks call: autoUpdate re-runs it, the hooks name it.
export async function runEnvWf(entry: string, argv: string[]) {
	// The installed copy follows shayshahal/wf main: a pushed change is live on the next run (update.mts).
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
			hook: async (a) => (await import('./hook.mts')).runHook(a),
			update: async () => (await import('./update.mts')).runUpdate(),
			...jewelryx.commands,
		},
		project: jewelryx.pieces,
	});
}
