// checks-log.ts — the checks.log protocol, shared by its producer and the step/status/friction readers.
// The three readers previously carried their own partial schema and JSONL loop. Keep legacy sparse
// records and append order here; workflow decisions still belong to the commands that use them.
import type { RunEvidence, IdentityGap } from './check.ts';
import type { BaselineIdentity } from './baseline-proof.ts';

/** Bound failing task output to the same last 40 lines in the log and the CLI. */
export function checkOutputTail(output: string): string {
	return output.split('\n').slice(-40).join('\n').trimEnd();
}

/** One task's recorded run; baseline expectation is green for preservation, red for defect proof. */
export type CheckRun = { label: string; exit: number | null; missing?: string; expect?: 'red' | 'green'; output?: string; evidence?: RunEvidence; baseline?: BaselineIdentity };

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
	readonly tasks?: readonly { readonly label?: string; readonly exit?: number | null; readonly missing?: string; readonly evidence?: RunEvidence; readonly baseline?: BaselineIdentity }[];
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

/** Rebuild a recorded red-base identity from a log line. Every field the writer emits is REQUIRED:
 * a sparse or hand-edited record is not partly trusted, it cannot grant a reuse (#133 review). */
function parseBaseline(value: unknown): BaselineIdentity | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.base !== 'string' || typeof value.key !== 'string' || typeof value.current !== 'string') return undefined;
	if (typeof value.command !== 'string' || typeof value.probe !== 'string' || typeof value.environment !== 'string' || typeof value.isolated !== 'boolean') return undefined;
	if (!Array.isArray(value.argv) || value.argv.some((a) => typeof a !== 'string')) return undefined;
	if (!isRecord(value.target) || typeof value.target.file !== 'string' || typeof value.target.refactor !== 'boolean') return undefined;
	if (value.target.id !== null && typeof value.target.id !== 'string') return undefined;
	if (value.target.line !== null && typeof value.target.line !== 'number') return undefined;
	return {
		base: value.base,
		key: value.key,
		current: value.current,
		command: value.command,
		argv: value.argv as string[],
		target: { file: value.target.file, id: value.target.id as string | null, line: value.target.line as number | null, refactor: value.target.refactor },
		probe: value.probe,
		environment: value.environment,
		isolated: value.isolated,
		...(value.reused === true ? { reused: true } : {}),
	};
}

/** Keep the runner verdict AND its provenance a reuse rule and a reader need -- a reused proof must
 * re-emit the runner's own report reference, not a bare verdict (#133 review). A loose record without
 * a known verdict is not evidence. */
function parseEvidence(value: unknown): RunEvidence | undefined {
	if (!isRecord(value) || typeof value.verdict !== 'string') return undefined;
	if (value.verdict !== 'behavioral-failure' && value.verdict !== 'passed' && value.verdict !== 'runner-failure' && value.verdict !== 'unavailable') return undefined;
	const tests = Array.isArray(value.tests)
		? value.tests.filter(isRecord).flatMap((t) => (typeof t.id === 'string' && typeof t.error === 'string' ? [{ id: t.id, error: t.error, ...(typeof t.source === 'string' ? { source: t.source } : {}) }] : []))
		: undefined;
	return {
		verdict: value.verdict,
		say: text(value.say) ?? '',
		...(typeof value.runner === 'string' || value.runner === null ? { runner: value.runner } : {}),
		...(typeof value.kind === 'string' ? { kind: value.kind } : {}),
		...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
		...(tests ? { tests } : {}),
	};
}

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
		const tasks = Array.isArray(raw.tasks) ? raw.tasks.filter(isRecord).map((task) => ({ label: text(task.label), exit: task.exit === null || typeof task.exit === 'number' ? task.exit : undefined, missing: text(task.missing), evidence: parseEvidence(task.evidence), baseline: parseBaseline(task.baseline) })) : undefined;
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
