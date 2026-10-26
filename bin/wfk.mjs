#!/usr/bin/env node
// bin/wfk.mjs — the short, collision-free command agents type: `wfk <cmd> [...]`.
// It starts no wf code itself. It picks the entry and runs it with the same arguments:
//   1. Inside a round (a `.wf/state.json` above the cwd): the entry that made the round (`entry`),
//      so a kit round never runs in the env's wf, or the reverse (state.ts entryGap).
//   2. Anywhere else: this copy's env/wf.mjs when it has one (Shay's machine), else its wf.mjs.
// Plain JavaScript with no imports from wf: it must run on a Node too old for wf, which then says so.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folder above `start` that holds `.wf/state.json`, or null. */
function roundFolder(start) {
	for (let dir = start; ; dir = dirname(dir)) {
		if (existsSync(join(dir, '.wf', 'state.json'))) return dir;
		if (dir === parse(dir).root) return null;
	}
}

/** The entry file `wfk` runs from `cwd`, in the copy at `root`. */
export function resolveEntry(cwd, root) {
	const folder = roundFolder(cwd);
	if (folder) {
		try {
			const entry = JSON.parse(readFileSync(join(folder, '.wf', 'state.json'), 'utf8')).entry;
			if (typeof entry === 'string' && existsSync(entry)) return entry;
		} catch { /* unreadable state: wf itself refuses it, with its own message */ }
	}
	const env = join(root, 'env', 'wf.mjs');
	return existsSync(env) ? env : join(root, 'wf.mjs');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const entry = resolveEntry(process.cwd(), dirname(dirname(fileURLToPath(import.meta.url))));
	const run = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });
	if (run.error) { console.error(`wfk: cannot start ${entry}: ${run.error.message}`); process.exit(1); }
	process.exit(run.status ?? 1);
}
