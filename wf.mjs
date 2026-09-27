#!/usr/bin/env node
// wf.mjs — the kit's entry: node wf.mjs <cmd> [...]. It runs wf with the kit's own defaults
// (seams.mjs). Shay's machine runs env/wf.mjs instead, the same kit with his env plugged in.
import { fileURLToPath } from 'node:url';
import { run } from './run.mjs';

await run(process.argv.slice(2), { entry: fileURLToPath(import.meta.url) });
