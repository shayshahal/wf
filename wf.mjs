#!/usr/bin/env node
// wf.mjs — the kit's entry: node wf.mjs <cmd> [...]. It runs wf with the kit's own defaults
// (seams.mts). Shay's machine runs env/wf.mjs instead, the same kit with his env plugged in.
// JavaScript, not TypeScript: the plugin's hooks and ~/bin/wf call this name, and on a Node too old
// to run .mts files it still loads, to say so (a .mts import there fails without saying why).
const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18))) {
	console.error(`wf needs Node 22.18 or newer (this is ${process.version}): wf is TypeScript, which Node runs itself from 22.18`);
	process.exit(1);
}
const { fileURLToPath } = await import('node:url');
const { run } = await import('./run.mts');

await run(process.argv.slice(2), { entry: fileURLToPath(import.meta.url) });
