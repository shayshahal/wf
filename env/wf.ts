// env/wf.ts — Shay's wf: the kit (../src/run.ts) with his machine plugged into its seams (../src/seams.ts):
// worktrunk and its hooks, the one MongoDB the worktrees' databases share, portless, plannotator,
// herdr, and self-update from shayshahal/wf. ~/bin/wf and worktrunk's hooks run it
// through env/wf.mjs; the team's plugin runs the kit's own ../wf.mjs (kit and env plan, 2026-09-27).
import { run } from '../src/run.ts';
import { herdrOpener } from './adapters/herdr.ts';
import { notifyRound } from './adapters/osc7501.ts';
import { processCwds } from './adapters/processes.ts';
import { annotateFile, isPlannotatorPresent, reviewDiff } from './adapters/plannotator.ts';
import { PI_MODELS, resolvePi } from './models.ts';
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
		opener: herdrOpener,
		// Every step writes the round's records to the pty the command already has, for a terminal that
		// implements OSC 7501 (src/notify/osc7501.ts); a terminal without it discards the line.
		notify: [notifyRound],
		processCwds,
		commands: {
			hook: async (a) => (await import('./hook.ts')).runHook(a),
			update: async () => (await import('./update.ts')).runUpdate(),
		},
		project: jewelryx.pieces,
		models: PI_MODELS,
		resolveModel: resolvePi,
	});
}
