// projects/jewelryx/cjx-stack.ts — refuse to serve a worktree whose own `cjx stack up` stack still runs.
// `cjx stack up` (JewelryX docs/agents/verify-jewelryx/stack.mjs) starts the checkout's three servers on
// its own port triple and records them in .verify/stack.json. A wf stack beside it seeds and uses the same
// database, and both b2b dev servers write the same generated files: the b2b vite reloaded without end
// (chore/stack-without-wf, ASSESSMENT finding A1, 2026-11-02). stack.mjs already refuses the reverse.
// Reap stops that stack too (stopCjxStack, 2026-11-19).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { directUrls } from './index.ts';
import { ownedProcessTree } from '../../src/process-tree.ts';
import type { ProcessKillFailure } from '../../src/process-tree.ts';
import { seams } from '../../src/seams.ts';

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

// stack.mjs's own proof that a saved pid is still its stack (`isServerParent`): a server parent writing to
// the recorded log. A pid reused by another process, or another checkout's server parent, fails it.
const isServerParent = (line: string | null, log: string) => Boolean(line?.includes('cjx-stack-server-parent') && line.includes(log));

/**
 * The refusal when .verify/stack.json records a stack that still runs, else null. Alive is stack.mjs's own
 * proof that a saved pid is still its stack (`isServerParent`): a server parent writing to the recorded log.
 * Pids, not ports: a stale record's port triple is the first free one from 5173, which another checkout's
 * stack may hold now; and a stack still starting has its pids before its ports answer.
 */
export function cjxStackRefusal(worktree: string, { commandLine = commandLineOf }: { commandLine?: (pid: number) => string | null } = {}): string | null {
	const stack = readCjxStack(worktree);
	if (!stack) return null;
	const alive = stack.pids.some((pid) => isServerParent(commandLine(pid), stack.log));
	if (!alive) return null;
	const urls = directUrls(stack.port);
	return `wf serve: refused — a stack that \`cjx stack up\` started runs in this worktree (b2b ${urls.b2b} · api ${urls.api} · admin ${urls.admin}; pids ${stack.pids.join(', ')} in ${join(worktree, '.verify', 'stack.json').replace(/\\/g, '/')}). A second stack here shares its database and generated files, and the b2b reloads without end. Drive that stack, or stop it first, in ${worktree}: \`cjx stack down\` (node docs/agents/verify-jewelryx/control-jewelryx.mjs stack down)`;
}

const failureText = (f: ProcessKillFailure) => 'pid' in f ? `${f.kind} at pid ${f.pid}` : `${f.kind} (status ${f.status ?? 'none'})`;

/**
 * Stop this checkout's `cjx stack up` stack before reap deletes its folder (2026-11-19, JX-1266). The
 * stack's server parents and their dev servers keep the worktree as their working folder, and wf did not
 * own them: `rm -rf worktree` failed with EPERM, and reap stayed incomplete until the round's agent killed
 * them by hand. What is stopped is what cjx itself recorded and still proves its own: each pid in
 * .verify/stack.json that is a server parent writing to the recorded log, and the processes under it. The
 * kill goes through the identity snapshot (pid plus creation time, process-tree.ts), never a path or a
 * command line alone (#161): a dev server someone started outside cjx is not touched, and still holds the
 * folder. Shay chose this over a sweep of every process in the worktree, which would also match an agent's
 * shell or editor whose working folder is there (Plannotator Inbox, 2026-11-22). Throws when the stack it
 * proved could not be stopped; returns what it stopped.
 */
export function stopCjxStack(worktree: string, { commandLine = commandLineOf }: { commandLine?: (pid: number) => string | null } = {}): string | null {
	const stack = readCjxStack(worktree);
	if (!stack?.pids.length) return null;
	// The identities first, then the proof: a pid the proof passes is killed only at the creation time
	// seen here, so a pid reused after the snapshot is never hit.
	const snapshot = seams.processes.snapshot();
	if (snapshot.kind === 'unknown') throw new Error(`the process list could not be read, so the cjx stack recorded in ${join(worktree, '.verify', 'stack.json')} was not stopped`);
	const parents = snapshot.processes.filter((p) => stack.pids.includes(p.pid) && isServerParent(commandLine(p.pid), stack.log));
	if (!parents.length) return null;
	const tree = ownedProcessTree(parents, snapshot.processes);
	let failure: ProcessKillFailure | undefined;
	if (!seams.processes.kill(tree, (f) => { failure = f; })) throw new Error(`the cjx stack in ${worktree} did not stop (${failure ? failureText(failure) : 'no detail'}); stop it with \`cjx stack down\` there, then reap again`);
	return `stopped the cjx stack: ${parents.length} server parent(s), ${tree.length} process(es)`;
}
