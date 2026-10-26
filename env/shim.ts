// env/shim.ts — the `wfk` command on the PATH, for bash, cmd and PowerShell (PowerShell runs wfk.cmd
// through PATHEXT). Written by the installer (update.ts), not by a profile alias: an alias lives in one
// shell and an agent's shell may not load it. Each shim runs the installed bin/wfk.mjs, which picks
// the round's own entry (bin/wfk.mjs). `wf` is untouched: Windows also has WF.msc, which is why
// agents get a name of their own.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const SHIM_SH = '#!/bin/sh\nexec node "$HOME/.local/share/wf/bin/wfk.mjs" "$@"\n';
export const SHIM_CMD = '@node "%USERPROFILE%\\.local\\share\\wf\\bin\\wfk.mjs" %*\r\n';

const norm = (p: string) => resolve(p).split('\\').join('/').toLowerCase();

/** The first of `dirs` that exists and is on `pathEnv` gets both shims, rewritten only when they differ. Returns it, or null. */
export function installWfkShims(dirs: string[], pathEnv = process.env.PATH ?? process.env.Path ?? ''): string | null {
	const onPath = pathEnv.split(delimiter).filter(Boolean).map(norm);
	const dir = dirs.find((d) => existsSync(d) && onPath.includes(norm(d)));
	if (!dir) return null;
	for (const [file, text] of [['wfk', SHIM_SH], ['wfk.cmd', SHIM_CMD]] as const) {
		const path = join(dir, file);
		if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text, { mode: 0o755 });
	}
	return dir;
}

/** The folders that already hold the person's own commands, best first. */
export const shimDirs = () => [join(homedir(), 'bin'), join(homedir(), '.local', 'bin')];
