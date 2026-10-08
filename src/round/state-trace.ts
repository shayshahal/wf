// state-trace.ts — one line in .wf/state-writes.log per write to .wf/state.json, and the briefs a
// write dropped.
// Why: JX-252 (2026-10-07) briefed validate 7 times and critique 6, each brief with its own token and
// none refused, and the round's state still read `validate: {count: 1}` — the reaped copy in
// ~/.cache/wf-reaped has it. So the count had been rewound (3 at 16:43, 1 at 16:47), and nothing on
// disk said by which process. `briefs` is the one field a patch replaces whole — brief.ts and
// handoff-hook.ts both build the map from a read — so a writer whose read is older than its write
// drops whatever landed in between; every other field merges (state.ts).
// `dropped` names what a write lost, with the counts, and the line carries the writer: entry (kit or
// env), command, pid, ppid, cwd. A legitimate reset counts as a drop too — brief.ts's `fresh` (a
// critique of a new validation) and `again` (research asked for again) start a phase at 1 on purpose —
// so read the line's `cmd` beside it. Diagnostic: it goes once the stale writer is named and fixed.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { State } from './state.ts';

export const STATE_WRITES_LOG = 'state-writes.log';

// Pure: "validate=3 critique=2", in briefing order. "" for a round with no briefs.
export function briefsCounts(briefs: Record<string, { count?: number }> | undefined): string {
	return Object.entries(briefs ?? {}).map(([key, b]) => `${key}=${b.count ?? 1}`).join(' ');
}

// Pure: what this write lost — a brief the patch does not carry whose count is lower than the one on
// disk, or that is gone. This is the rewind: a write whose read predates what it overwrites.
export function droppedBriefs(before: State | null, after: State): string[] {
	const was = before?.briefs ?? {};
	const now = after.briefs ?? {};
	return Object.entries(was)
		.filter(([key, b]) => (now[key]?.count ?? 0) < (b.count ?? 1))
		.map(([key, b]) => `${key}:${b.count ?? 1}->${now[key]?.count ?? 0}`);
}

// Pure: the log line. `patch` is the fields the caller wrote, so a line whose patch has no `briefs`
// dropped another phase's by replacing the map from an older read.
export function stateWriteLine(w: { ts: string; pid: number; ppid: number; up: number; entry: string; cmd: string; cwd: string; patch: string[]; before: State | null; after: State }): string {
	return JSON.stringify({
		ts: w.ts,
		pid: w.pid,
		ppid: w.ppid,
		up: w.up,
		entry: w.entry,
		cmd: w.cmd,
		cwd: w.cwd,
		patch: w.patch,
		briefs: briefsCounts(w.after.briefs),
		dropped: droppedBriefs(w.before, w.after),
	});
}

// The writer this process is, then append. Never throws: a trace is no reason to fail the write it
// traces, and a read-only .wf or a full disk says nothing about the round.
export function traceStateWrite(toplevel: string, w: { before: State | null; after: State; patch: string[] }): void {
	try {
		mkdirSync(join(toplevel, '.wf'), { recursive: true });
		appendFileSync(join(toplevel, '.wf', STATE_WRITES_LOG), `${stateWriteLine({
			ts: new Date().toISOString(),
			pid: process.pid,
			ppid: process.ppid,
			up: Number(process.uptime().toFixed(1)),
			entry: process.argv[1] ?? '',
			cmd: process.argv.slice(2).join(' '),
			cwd: process.cwd().replace(/\\/g, '/'),
			...w,
		})}\n`);
	} catch { /* dropped on purpose: the log is diagnostic, the write it traces is the round's */ }
}
