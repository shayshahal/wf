// editor.mjs — $VISUAL → $EDITOR → code fallback. Returns true when an editor was started.
// It is started detached and not waited for: `wf review` and `wf design` return, and the person says
// when the verdict is in. Until 2026-09-27 it waited (spawnSync): a terminal editor with no terminal
// hung the command, and on Windows `code` (code.cmd, which Node cannot start without a shell)
// failed with ENOENT while this still said it had opened.
import { execFileSync, spawn } from 'node:child_process';

// Pure: whether wf may open a window of its own (an editor, a browser). Not under Claude Code, which
// sets CLAUDECODE=1 in its Bash tool: Desktop has its own Browser pane, diff view and file pane, and
// the person looks there. BJEW-562's T2 (2026-09-27): `wf show` opened a separate Chrome and
// `wf review` VS Code, next to the app the person was working in.
export function opensWindows(env = process.env) {
	return !env.CLAUDECODE;
}

function resolvable(bin) {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// Pure: how to start `raw` on `paths`: [command, args, shell]. Windows goes through cmd.exe as one
// quoted line, so .cmd shims start and a path with spaces stays one argument.
export function editorCommand(raw, paths, platform = process.platform) {
	const [bin, ...rest] = raw.trim().split(/\s+/);
	return platform === 'win32' ? [[bin, ...rest, ...paths.map((p) => `"${p}"`)].join(' '), [], true] : [bin, [...rest, ...paths], false];
}

export function openInEditor(paths) {
	if (!opensWindows()) return false;
	for (const raw of [process.env.VISUAL, process.env.EDITOR, 'code']) {
		if (!raw || !resolvable(raw.trim().split(/\s+/)[0])) continue;
		const [command, args, shell] = editorCommand(raw, paths);
		spawn(command, args, { detached: true, stdio: 'ignore', shell }).unref();
		return true;
	}
	return false;
}
