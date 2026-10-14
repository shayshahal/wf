// removal.ts — run one step of a worktree's removal plan. `wf reap` prints the plan and runs it;
// a baseline scratch (baseline-run.ts) tears its own worktree down with the same steps. Every step
// tolerates "already gone": a re-run is a no-op, not an error. The outcome is structured: a scratch
// teardown must be able to refuse a green when a resource was not actually released (#133 review).
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import type { RemovalStep } from '../seams.ts';

/** One step's outcome: `ok` false means the resource was not confirmed released (or the step failed). */
export type RemovalOutcome = { ok: boolean; say: string };

/** Runs one step, never throwing: the next step still runs, and the outcome says what happened. */
export function runRemovalStep(step: RemovalStep): RemovalOutcome {
	if (step.rm) {
		let failed: string | null = null;
		try {
			// A dev server just killed holds its folder for a few seconds (EBUSY on Windows):
			// rmSync retries EBUSY/EPERM itself. BJEW-603 left the folder behind twice without this.
			rmSync(step.rm, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
		} catch (e) {
			// Judged by the folder, not the error: a process still running in it keeps it (2026-10-06: a
			// proxy started from BJEW-461's stack kept its folder, EBUSY), and that is not "already gone".
			failed = (e as NodeJS.ErrnoException).code ?? 'failed';
		}
		const gone = !existsSync(step.rm);
		return { ok: gone, say: gone ? `${step.label}: ok` : `${step.label}: ${failed ?? 'failed'}, ${step.rm} is still there: a process still runs in it or holds a file in it` };
	}
	// A step done in-process: its arguments never pass through the shell (the database drop's python
	// source would not survive cmd.exe).
	if (step.run) {
		try { step.run(); return { ok: true, say: `${step.label}: ok` }; } catch (e) { return { ok: false, say: `${step.label}: already gone or failed (${(e as Error).message})` }; }
	}
	const run = spawnSync(step.cmd!, step.args!, { encoding: 'utf8', env: { ...process.env, WF_FORCE_REAP: '1', ...(step.env ?? {}) }, shell: process.platform === 'win32' });
	return { ok: run.status === 0, say: `${step.label}: ${run.status === 0 ? 'ok' : `already gone or failed (${(run.stderr ?? '').trim().split('\n').at(-1) || `exit ${run.status}`})`}` };
}
