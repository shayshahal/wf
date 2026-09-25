#!/usr/bin/env node
// wf.mjs — dispatcher: node wf.mjs <cmd> [...]
// Commands: step, status, new, classify (delegated to ./classify.mjs when installed),
// design + review (human touchpoints, Task 2b), and the project's own (project.mjs commands:
// JewelryX's seed, show, stacks).
import { fileURLToPath } from 'node:url';
import { autoUpdate } from './update.mjs';
// The installed copy follows shayshahal/wf main: a pushed change is live on the next run (update.mjs).
// Not under a hook: wt runs the pre-start steps in parallel, and an update swaps the installed
// folder while the others are still loading from it.
// `hook install` is run by hand, not by wt: it updates first, so the hooks it writes call the newest
// copy (it did not, 2026-09-24: installed from the old copy after a push).
const cmd = process.argv[2];
if (cmd !== 'hook' || process.argv[3] === 'install') autoUpdate(fileURLToPath(import.meta.url), process.argv.slice(2));
// Windows .cmd shims (portless, pnpm) need shell: true, and Node then prints DEP0190 on every spawn
// that passes args (reap printed it on every run). Every argv wf spawns is one it built itself.
process.noDeprecation = true;
if (cmd === 'hook') {
  const { runHook } = await import('./hook.mjs');
  await runHook(process.argv.slice(3));
} else if (cmd === 'step') {
  const { runStep } = await import('./step.mjs');
  await runStep(process.argv.slice(3));
} else if (cmd === 'new') {
  const { runNew } = await import('./new.mjs');
  runNew(process.argv.slice(3));
} else if (cmd === 'status') {
  const { runStatus } = await import('./status.mjs');
  await runStatus(process.argv.slice(3));
} else if (cmd === 'prompt') {
  const { runPrompt } = await import('./prompt.mjs');
  runPrompt(process.argv.slice(3));
} else if (cmd === 'check') {
  const { runCheck } = await import('./check.mjs');
  runCheck();
} else if (cmd === 'deliver') {
  const { runDeliver } = await import('./deliver.mjs');
  await runDeliver();
} else if (cmd === 'ask') {
  const { runAsk } = await import('./ask.mjs');
  await runAsk(process.argv.slice(3));
} else if (cmd === 'decide') {
  const { runDecide } = await import('./ask.mjs');
  await runDecide(process.argv.slice(3));
} else if (cmd === 'reap') {
  const { runReap } = await import('./reap.mjs');
  runReap(process.argv.slice(3));
} else if (cmd === 'classify') {
  try {
    await import('./classify.mjs');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    console.log('classify: not installed');
  }
} else if (cmd === 'design') {
  const { runDesign } = await import('./design.mjs');
  await runDesign(process.argv.slice(3));
} else if (cmd === 'review') {
  const { runReview } = await import('./review.mjs');
  await runReview(process.argv.slice(3));
} else if (cmd === 'update') {
  const { runUpdate } = await import('./update.mjs');
  runUpdate();
} else {
  const { commands } = await import('./project.mjs');
  if (Object.hasOwn(commands, cmd)) await commands[cmd](process.argv.slice(3));
  else {
    console.log(`usage: wf <new|step|prompt|check|deliver|ask|decide|status|reap|classify|design|review|update|${Object.keys(commands).join('|')}> [...]`);
    process.exit(2);
  }
}
