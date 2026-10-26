// paths.ts — where wf's own files are. The modules live under src/; the entry (wf.mjs), the prompts,
// process docs, skills and projects/ at the copy's root (2026-10-01). A module naming one of those
// starts from WF_ROOT, not from its own folder, so moving a module never moves what it reads.
import { delimiter, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveEntry } from '../bin/wfk.mjs';

export const WF_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
// WF_ROOT with forward slashes: what prompts and printed commands name.
export const WF_HOME = WF_ROOT.replace(/\\/g, '/');
// Run as a script by `wf step classify` and the T2 header, not imported: it exits the process.
export const CLASSIFY = join(WF_ROOT, 'src', 'gates', 'classify.ts');

/** Render a Node command with a quoted, slash-normalized entry path, including paths with spaces. */
export function wfCommand(entry: string): string {
	return `node ${JSON.stringify(entry.replace(/\\/g, '/'))}`;
}

/** True when a `wfk` shim is in a folder of the PATH (the installer, env/shim.ts, puts one there). */
export function wfkOnPath(env: NodeJS.ProcessEnv = process.env): boolean {
	const names = process.platform === 'win32' ? ['wfk.cmd', 'wfk'] : ['wfk'];
	return (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean).some((dir) => names.some((name) => existsSync(join(dir, name))));
}

/**
 * The command a generated instruction names for `entry`: the short `wfk` when it would run that very
 * entry from `cwd` (a round's own entry, else this copy's default), else the full node line. A shell alias
 * cannot pick another runtime: `wfk` reads the round's state itself. `WF_FULL_COMMAND=1` keeps the full line.
 */
export function wfEntryCommand(entry: string, { cwd = process.cwd(), env = process.env }: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
	if (env.WF_FULL_COMMAND === '1' || !wfkOnPath(env)) return wfCommand(entry);
	const norm = (p: string) => resolve(p).split('\\').join('/').toLowerCase();
	const same = (a: string, b: string) => norm(a) === norm(b);
	return same(resolveEntry(cwd, WF_ROOT), entry) ? 'wfk' : wfCommand(entry);
}
