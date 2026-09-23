#!/usr/bin/env node
// wf.mjs — dispatcher: node JewelryX-Tools/wf/wf.mjs <cmd> [...]
// Commands: step, status, new, classify (delegated to ./classify.mjs when installed),
// design + show + review (human touchpoints, Task 2b), seed (fixture restore, Task 2d),
// stacks (the permanent dev + qa stacks: up|down|status).
import { fileURLToPath } from 'node:url';
import { autoUpdate } from './update.mjs';
// The installed copy follows tools/workflow-v2: a pushed change is live on the next run (update.mjs).
autoUpdate(fileURLToPath(import.meta.url), process.argv.slice(2));
const cmd = process.argv[2];
if (cmd === 'step') {
  const { runStep } = await import('./step.mjs');
  await runStep(process.argv.slice(3));
} else if (cmd === 'new') {
  const { runNew } = await import('./new.mjs');
  runNew(process.argv.slice(3));
} else if (cmd === 'seed') {
  const { runSeed } = await import('./seed.mjs');
  runSeed(process.argv.slice(3));
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
} else if (cmd === 'decide') {
  const { runDecide } = await import('./step.mjs');
  runDecide(process.argv.slice(3));
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
} else if (cmd === 'show') {
  const { runShow } = await import('./show.mjs');
  runShow(process.argv.slice(3));
} else if (cmd === 'review') {
  const { runReview } = await import('./review.mjs');
  await runReview(process.argv.slice(3));
} else if (cmd === 'update') {
  const { runUpdate } = await import('./update.mjs');
  runUpdate();
} else if (cmd === 'stacks') {
  const { runStacks } = await import('./stacks.mjs');
  await runStacks(process.argv.slice(3));
} else {
  console.log('usage: wf <new|step|prompt|check|deliver|decide|status|reap|classify|design|show|review|seed|stacks|update> [...]');
  process.exit(2);
}
