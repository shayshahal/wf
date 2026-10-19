#!/usr/bin/env node
// The source skill uses the checkout entry. Export binds this one relative path to its bundled
// runtime; a damaged export must refuse, not fall back to a different wf above the skill folder.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RUNTIME_ENTRY = '../../../wf.mjs';
const entry = new URL(RUNTIME_ENTRY, import.meta.url);
if (!existsSync(entry)) {
	console.error(`wf: no runtime entry at ${fileURLToPath(entry)}: copy the exported skill folder whole, or run the checkout entry directly`);
	process.exit(1);
}
// Import, not spawn: stdio, signals and the exit code stay the command's own.
await import(entry.href);
