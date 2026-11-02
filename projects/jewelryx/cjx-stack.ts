// projects/jewelryx/cjx-stack.ts — refuse to serve a worktree whose own `cjx stack up` stack still runs.
// `cjx stack up` (JewelryX docs/agents/verify-jewelryx/stack.mjs) starts the checkout's three servers on
// its own port triple and records them in .verify/stack.json. A wf stack beside it seeds and uses the same
// database, and both b2b dev servers write the same generated files: the b2b vite reloaded without end
// (chore/stack-without-wf, ASSESSMENT finding A1, 2026-11-02). stack.mjs already refuses the reverse.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { directUrls } from './index.ts';

/** What `stack up` writes to .verify/stack.json (stack.mjs `save`). */
type CjxStackRecord = { port: number; log: string; pids: number[] };

function readCjxStack(worktree: string): CjxStackRecord | null {
	let raw: unknown;
	try { raw = JSON.parse(readFileSync(join(worktree, '.verify', 'stack.json'), 'utf8')); } catch { return null; /* no record, or not stack.mjs's: nothing of cjx's to protect */ }
	if (typeof raw !== 'object' || raw === null || !('port' in raw) || !('log' in raw) || typeof raw.port !== 'number' || typeof raw.log !== 'string') return null;
	const pids = 'pids' in raw && Array.isArray(raw.pids) ? raw.pids.filter((pid): pid is number => Number.isInteger(pid) && pid > 0) : [];
	return { port: raw.port, log: raw.log, pids };
}

// A process's command line, or null when there is none (stack.mjs `commandLineOf`).
function commandLineOf(pid: number): string | null {
	try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EPERM') return null; /* ESRCH: no such process, skip the slow query */ }
	const r = process.platform === 'win32'
		? spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`], { encoding: 'utf8', windowsHide: true, timeout: 20_000 })
		: spawnSync('ps', ['-ww', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
	return (r.stdout ?? '').trim() || null;
}

/**
 * The refusal when .verify/stack.json records a stack that still runs, else null. Alive is stack.mjs's own
 * proof that a saved pid is still its stack (`isServerParent`): a server parent writing to the recorded log.
 * Pids, not ports: a stale record's port triple is the first free one from 5173, which another checkout's
 * stack may hold now; and a stack still starting has its pids before its ports answer.
 */
export function cjxStackRefusal(worktree: string, { commandLine = commandLineOf }: { commandLine?: (pid: number) => string | null } = {}): string | null {
	const stack = readCjxStack(worktree);
	if (!stack) return null;
	const alive = stack.pids.some((pid) => {
		const line = commandLine(pid);
		return Boolean(line?.includes('cjx-stack-server-parent') && line.includes(stack.log));
	});
	if (!alive) return null;
	const urls = directUrls(stack.port);
	return `wf serve: refused — a stack that \`cjx stack up\` started runs in this worktree (b2b ${urls.b2b} · api ${urls.api} · admin ${urls.admin}; pids ${stack.pids.join(', ')} in ${join(worktree, '.verify', 'stack.json').replace(/\\/g, '/')}). A second stack here shares its database and generated files, and the b2b reloads without end. Drive that stack, or stop it first, in ${worktree}: \`cjx stack down\` (node docs/agents/verify-jewelryx/control-jewelryx.mjs stack down)`;
}
