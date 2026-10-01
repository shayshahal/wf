#!/usr/bin/env node
// env/wf.mjs — Shay's entry, under the name ~/bin/wf, worktrunk's hooks and autoUpdate's re-run call.
// His wf itself is env/wf.mts; this file stays JavaScript so that name never moves.
import { fileURLToPath } from 'node:url';
import { runEnvWf } from './wf.mts';

await runEnvWf(fileURLToPath(import.meta.url), process.argv.slice(2));
