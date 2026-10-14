// checks-log.ts — the checks.log protocol, shared by its producer and the step/status/friction readers.
// The three readers previously carried their own partial schema and JSONL loop. Keep legacy sparse
// records and append order here; workflow decisions still belong to the commands that use them.
import type { RunEvidence, IdentityGap } from './check.ts';

/** Bound failing task output to the same last 40 lines in the log and the CLI. */
export function checkOutputTail(output: string): string {
	return output.split('\n').slice(-40).join('\n').trimEnd();
}

/** One task's recorded run; baseline expectation is green for preservation, red for defect proof. */
export type CheckRun = { label: string; exit: number | null; missing?: string; expect?: 'red' | 'green'; output?: string; evidence?: RunEvidence };

/** A runner that never started is environment trouble, not a behavioral failure. */
export type RedCause = 'code' | 'environment';

/** Fields the readers consume; older logs may omit any of these measurement details. */
export type CheckLogEntry = {
	readonly row?: string | number | null;
	readonly rowCheck?: string | null;
	readonly scope?: string;
	readonly result?: string;
	readonly cause?: string;
	readonly content?: string;
	readonly tasks?: readonly { readonly label?: string; readonly exit?: number | null; readonly missing?: string }[];
};

/** The latest measured result shown by status; a missing identity never implies freshness. */
export type CheckEvidenceLine = { row: string | number | null; result: string; content?: string };

/** Measurements in append order, with repro and suites kept separate from ordinary case checks. */
export type ParsedChecksLog = {
	readonly cases: readonly CheckLogEntry[];
	readonly suites: readonly CheckLogEntry[];
	readonly repro: readonly CheckLogEntry[];
	readonly latest: { readonly case: CheckEvidenceLine | null; readonly suites: CheckEvidenceLine | null };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

/** Read sparse historical logs and skip cut-off JSON lines; never coerce an identity into gate evidence. */
export function parseChecksLog(log: string): ParsedChecksLog {
	const cases: CheckLogEntry[] = [];
	const suites: CheckLogEntry[] = [];
	const repro: CheckLogEntry[] = [];
	let caseLine: CheckEvidenceLine | null = null;
	let suitesLine: CheckEvidenceLine | null = null;
	for (const line of log.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let raw: unknown;
		try { raw = JSON.parse(line); } catch { /* an interrupted append is skipped, as all three readers did */ continue; }
		if (!isRecord(raw)) continue;
		const row = raw.row === null || typeof raw.row === 'string' || typeof raw.row === 'number' ? raw.row : undefined;
		const tasks = Array.isArray(raw.tasks) ? raw.tasks.filter(isRecord).map((task) => ({ label: text(task.label), exit: task.exit === null || typeof task.exit === 'number' ? task.exit : undefined, missing: text(task.missing) })) : undefined;
		const entry: CheckLogEntry = { row, rowCheck: raw.rowCheck === null ? null : text(raw.rowCheck), scope: text(raw.scope), result: text(raw.result), cause: text(raw.cause), content: text(raw.content), tasks };
		// Status historically displays sparse fields as text. Keep that projection separate from the
		// string-only identities and results the gates compare, so display coercion grants no authority.
		const summary: CheckEvidenceLine = { row: row ?? null, result: String(raw.result ?? ''), ...(raw.content ? { content: String(raw.content) } : {}) };
		if (row === 'suites') {
			suites.push(entry);
			suitesLine = summary;
		} else if (row === 'repro') repro.push(entry);
		else {
			cases.push(entry);
			caseLine = summary;
		}
	}
	return { cases, suites, repro, latest: { case: caseLine, suites: suitesLine } };
}

/** Encode a case or repro measurement, retaining the identity and scope it actually measured. */
export function checkRunLine({ ts, row, rowCheck, tasks, result, cause, content, scope }: { ts: string; row: number | string | null; rowCheck: string | null; tasks: CheckRun[]; result: string; cause?: RedCause; content?: string; scope?: string }): string {
	return JSON.stringify({ ts, row, rowCheck, tasks, result, ...(cause ? { cause } : {}), ...(content ? { content } : {}), ...(scope ? { scope } : {}) });
}

/** Encode whole suites: retain failing output tails and never mint green after an identity change. */
export function suitesLine({ ts, head, runs, content, gap }: { ts: string; head: string; runs: { label: string; exit: number | null; output: string }[]; content?: string; gap?: IdentityGap }): string {
	const tasks: CheckRun[] = runs.map((r) => (r.exit === 0 ? { label: r.label, exit: 0 } : { label: r.label, exit: r.exit, output: checkOutputTail(r.output) }));
	const red = tasks.filter((t) => t.exit !== 0);
	// Every red runner must have failed to start: one real suite failure keeps this about the code.
	const cause: RedCause | undefined = red.length && red.every((t) => t.exit === null) ? 'environment' : undefined;
	return JSON.stringify({ ts, row: 'suites', head, tasks, result: gap ?? (red.length ? 'red' : 'green'), ...(cause ? { cause } : {}), ...(content ? { content } : {}) });
}
