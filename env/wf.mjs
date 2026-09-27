#!/usr/bin/env node
// env/wf.mjs — Shay's wf: the kit (../run.mjs) with his machine plugged into its seams (../seams.mjs):
// worktrunk and its hooks, a MongoDB container per worktree, portless, plannotator, herdr, the
// permanent stacks, and self-update from shayshahal/wf. ~/bin/wf and worktrunk's hooks run this file;
// the team's plugin runs the kit's own ../wf.mjs (kit and env plan, 2026-09-27).
import { fileURLToPath } from 'node:url';
import { run } from '../run.mjs';
import { isHerdrPresent, reportStepToHerdr } from './adapters/herdr.mjs';
import { annotateFile, isPlannotatorPresent, reviewDiff } from './adapters/plannotator.mjs';
import * as jewelryx from './projects/jewelryx/index.mjs';
import { autoUpdate } from './update.mjs';
import { createWorktree, removalPlan } from './worktrees.mjs';

const entry = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
// The installed copy follows shayshahal/wf main: a pushed change is live on the next run (update.mjs).
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
		hook: async (a) => (await import('./hook.mjs')).runHook(a),
		update: async () => (await import('./update.mjs')).runUpdate(),
		...jewelryx.commands,
	},
	project: jewelryx.pieces,
});
