// A check gets a detached supervisor so cancellation cannot strand a shell's descendants.
// The supervisor waits for ownership to be persisted before starting the runner (#154).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { seams } from '../seams.ts';
import { ownedProcessTree, parseProcessIdentities } from '../process-tree.ts';

let cancellationRequested = false;
const activeRecords = new Set<string>();

/** The failed predicates of a refused release, in one bounded line. */
export function releaseRefusal(d: { rootPresent: boolean; orphanedRunner: boolean; nativeKillOk: boolean; inventoryAfter: string; survivors: string[]; survivorCount: number }): string {
	return `root identity ${d.rootPresent ? 'seen' : 'NOT seen'}; orphaned runner ${d.orphanedRunner ? 'YES' : 'no'}; native kill ${d.nativeKillOk ? 'ok' : 'FAILED'}; inventory after kill ${d.inventoryAfter}; surviving ${d.survivorCount}${d.survivors.length ? `: ${d.survivors.join(', ')}${d.survivorCount > d.survivors.length ? ', …' : ''}` : ''}`;
}

/** A failed cleanup always has null status, so its runner cannot supply green evidence. */
export type CheckProcessResult = { status: number | null; stdout: string; stderr: string; error?: Error };

/** Run a check with a bounded lifetime and a durable, identity-scoped cancellation record. */
export async function runCheckProcess(cmd: string, args: string[], options: { cwd: string; worktree: string; env: NodeJS.ProcessEnv; shell: boolean; maxBuffer: number; timeoutMs?: number; signal?: AbortSignal }): Promise<CheckProcessResult> {
	const folder = join(options.worktree, '.wf', 'check-processes');
	mkdirSync(folder, { recursive: true });
	// A previous interrupted owner must be reconciled, never overwritten by a new execution.
	for (const name of readdirSync(folder).filter((n) => n.endsWith('.json') && !activeRecords.has(join(folder, n)))) {
		try {
			const saved: unknown = JSON.parse(readFileSync(join(folder, name), 'utf8'));
			const owners = typeof saved === 'object' && saved !== null && 'state' in saved && saved.state === 'releasing' && 'processes' in saved ? parseProcessIdentities(saved.processes) : null;
			const snapshot = seams.processes.snapshot();
			if (!owners?.length || snapshot.kind === 'unknown' || owners.some((owner) => snapshot.processes.some((p) => p.pid === owner.pid || p.parent === owner.pid && Date.parse(p.born) >= Date.parse(owner.born)))) return { status: null, stdout: '', stderr: 'wf check: unresolved execution ownership in .wf/check-processes; inspect before retrying' };
			unlinkSync(join(folder, name));
		} catch { return { status: null, stdout: '', stderr: 'wf check: unreadable execution ownership; retained for recovery' }; }
	}
	if (cancellationRequested || options.signal?.aborted) return { status: null, stdout: '', stderr: 'wf check: cancelled before execution' };
	const record = join(folder, `${randomUUID()}.json`);
	activeRecords.add(record);
	const child = spawn(process.execPath, [join(WF_ROOT, 'src/gates/check-supervisor.ts'), record], { cwd: options.cwd, env: options.env, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
	const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
	let stdout = '', stderr = '';
	let cancelled = false;
	let runnerPid: number | undefined;
	let finish: (status: number | null, reason?: string) => void = () => {};
	const result = new Promise<CheckProcessResult>((resolve) => {
		let finishing = false;
		finish = async (status, reason = '') => {
			if (finishing) return;
			finishing = true;
			try {
				const snapshot = seams.processes.snapshot();
				const owners = snapshot.kind === 'known' && root ? ownedProcessTree([root], snapshot.processes) : null;
				if (!owners) { resolve({ status: null, stdout, stderr: `${stderr}\nwf check: process probe unavailable; ownership retained` }); return; }
				writeFileSync(record, JSON.stringify({ state: 'releasing', processes: owners }));
				const orphanedRunner = runnerPid !== undefined && snapshot.kind === 'known' && snapshot.processes.some((p) => p.parent === runnerPid && !owners.some((owner) => owner.pid === p.pid));
				const killed = seams.processes.kill(owners);
				const after = seams.processes.snapshot();
				const survivors = after.kind === 'known' ? owners.filter((owner) => after.processes.some((p) => p.pid === owner.pid && p.born === owner.born || p.parent === owner.pid && Date.parse(p.born) >= Date.parse(owner.born))) : [];
				// Each predicate is kept apart: a refusal says which one failed (#173), by identity only (no command lines).
				const diagnosis = { rootPresent: snapshot.kind === 'known' && snapshot.processes.some((p) => p.pid === root?.pid && p.born === root?.born), orphanedRunner, nativeKillOk: killed, inventoryAfter: after.kind, survivors: survivors.slice(0, 10).map((o) => `${o.pid}@${o.born}`), survivorCount: survivors.length };
				const released = diagnosis.rootPresent && !orphanedRunner && killed && after.kind === 'known' && !survivors.length;
				if (!released) writeFileSync(record, JSON.stringify({ state: 'releasing', processes: owners, diagnosis }));
				if (orphanedRunner) writeFileSync(record, JSON.stringify({ state: 'unverified-orphans', runnerPid, processes: owners }));
				if (released) unlinkSync(record);
				await Promise.race([closed, new Promise<void>((done) => setTimeout(done, 1000))]);
				resolve({ status: released && !cancelled ? status : null, stdout, stderr: `${stderr}${reason ? `\nwf check: ${reason}` : ''}${released ? '' : `\nwf check: descendant shutdown not confirmed; ownership retained (${releaseRefusal(diagnosis)})`}` });
			} catch { resolve({ status: null, stdout, stderr: `${stderr}\nwf check: release failed; inspect .wf/check-processes before retrying` }); }
		};
		child.stdout?.on('data', (data) => { stdout += data; if (stdout.length + stderr.length > options.maxBuffer) { cancelled = true; finish(null, 'output limit exceeded'); } });
		child.stderr?.on('data', (data) => { stderr += data; if (stdout.length + stderr.length > options.maxBuffer) { cancelled = true; finish(null, 'output limit exceeded'); } });
		child.on('error', () => finish(null, 'runner supervisor failed to start'));
		child.on('exit', () => finish(null, 'runner supervisor exited without a measurement'));
		child.on('message', (message) => {
			if (typeof message === 'object' && message !== null && 'status' in message && (message.status === null || typeof message.status === 'number')) { if ('pid' in message && typeof message.pid === 'number') runnerPid = message.pid; finish(message.status); }
		});
	});
	const initial = seams.processes.snapshot();
	const root = initial.kind === 'known' ? initial.processes.find((p) => p.pid === child.pid) : undefined;
	// Even an unavailable initial probe leaves the known launch PID for manual recovery.
	writeFileSync(record, JSON.stringify(root ? { state: 'running', processes: [root] } : { pid: child.pid, state: 'unverified' }));
	const cancel = () => { cancelled = true; finish(null, 'cancelled'); };
	const cancelAll = () => { cancellationRequested = true; cancel(); };
	process.on('SIGINT', cancelAll); process.on('SIGTERM', cancelAll);
	options.signal?.addEventListener('abort', cancel, { once: true });
	const timer = setTimeout(() => { cancelled = true; finish(null, 'timed out'); }, options.timeoutMs ?? 30 * 60_000);
	try {
		if (root) child.send({ cmd, args, shell: options.shell });
		else finish(null, 'could not establish runner ownership');
		return await result;
	} finally {
		activeRecords.delete(record);
		clearTimeout(timer);
		process.off('SIGINT', cancelAll); process.off('SIGTERM', cancelAll);
		options.signal?.removeEventListener('abort', cancel);
		if (child.connected) child.disconnect();
		child.stdout?.destroy(); child.stderr?.destroy();
		child.unref();
	}
}
