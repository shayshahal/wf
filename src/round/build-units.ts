// build-units.ts — a build cut into ordered units, each with its own assessment, from the agreement's
// structured `## Units` table:
//
//   | # | unit | cases | depends on | review after |
//   |---|---|---|---|---|
//   | 1 | the schema | 1, 2 | — | — |
//   | 2 | the API | 3 | 1 | API shape |
//
// Each row is a unit: a positive number (ascending, unique), a title, the `## Verification` cases it
// owns, the earlier units it builds on, and a checkpoint review label (`—` for none). Every case is
// owned by exactly one unit. An agreement with no such table (none, or the old prose `## Units` note)
// builds as one slice, as before: `{ kind: 'single' }`.
//
// The plan's sha binds the unit ownership and review boundaries. Verification files and assertion
// locations stay mutable working detail: current checks bind their exact check cells, and integration
// reruns every case, so adding a helper never discards earlier chunk feedback. Progress (`slices` in the
// round state) records the active unit, the commit it started from (`base`), the commit the last
// checkpoint review reached (`reviewBase`) and each finished unit's head; `unit: null` is the final
// integration, which writes the round's ordinary ASSESSMENT.md and REVIEW.md.
import { createHash } from 'node:crypto';
import { ASSESSMENT_FILE, REVIEW_FILE, section, verificationCases } from './agreement.ts';

/** A bounded build unit owns verification cases and an optional human review checkpoint. */
export type BuildUnit = { n: number; title: string; cases: number[]; depends: number[]; reviewAfter: string | null };

/** Ordered build units and the frozen scheduling identity; verification file lists stay mutable. */
export type BuildPlan = { kind: 'units'; units: BuildUnit[]; sha: string };

/** No structured table preserves the single-task route; malformed plans fail closed. */
export type BuildUnitsParse = { kind: 'single' } | { kind: 'invalid'; why: string } | BuildPlan;

/** Durable build-unit progress; unit: null names final integration, never approval to merge. */
export type SliceProgress = {
	planSha: string;
	unit: number | null;
	base: string;
	reviewBase: string;
	completed: { n: number; head: string; reviewed: boolean }[];
	// Chunk feedback can repair an earlier unreviewed unit; normal builds still own one unit.
	reviewRepair?: boolean;
};

/** Active unit scope and evidence paths, with distinct build and review chunk bases. */
export type UnitSlice = { kind: 'unit'; unit: BuildUnit; plan: BuildPlan; base: string; reviewBase: string; reviewUnits: BuildUnit[]; cases: number[]; reviewRepair: boolean; assessmentFile: string; reviewFile: string };
/** Completed units still require whole-round integration assessment and delivery approval. */
export type IntegrationSlice = { kind: 'integration'; plan: BuildPlan; base: string; assessmentFile: typeof ASSESSMENT_FILE; reviewFile: typeof REVIEW_FILE };
/** Execution scope derived from the current agreement and its validated progress. */
export type SliceContext =
	| { kind: 'single' }
	| { kind: 'invalid'; why: string }
	| { kind: 'pending'; plan: BuildPlan }
	| UnitSlice
	| IntegrationSlice;

/** Unit assessments never overwrite the final whole-round assessment. */
export const unitAssessmentFile = (n: number): string => `ASSESSMENT-unit-${n}.md`;
/** Checkpoint review records are distinct from the final merge approval. */
export const unitReviewFile = (n: number): string => `REVIEW-unit-${n}.md`;

const UNITS_HEADER = ['#', 'unit', 'cases', 'depends on', 'review after'];
const NONE = new Set(['', '—', '–', '-', 'none']);

const cellsOf = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSeparator = (cells: string[]): boolean => cells.every((c) => /^:?-+:?$/.test(c));

// Pure: a cell of ids (`1, 2` or `1 2`), or why it is not one. `none` allows the empty set.
function idList(cell: string, what: string, none: boolean): number[] | string {
	if (NONE.has(cell.toLowerCase())) return none ? [] : `lists no ${what}`;
	const ids: number[] = [];
	for (const token of cell.split(/[\s,]+/).filter(Boolean)) {
		if (!/^\d+$/.test(token) || !Number.isSafeInteger(Number(token)) || Number(token) < 1) return `has "${token}" among its ${what} — ids are positive numbers`;
		if (ids.includes(Number(token))) return `lists ${what.replace(/s$/, '')} ${token} twice`;
		ids.push(Number(token));
	}
	return ids;
}

/** Parse the agreement's build units; old prose notes remain on the single-task route. */
export function parseBuildUnits(text: string | null | undefined): BuildUnitsParse {
	const body = section(text, 'Units');
	if (body == null) return { kind: 'single' };
	const rows = body.split('\n').filter((l) => l.trim().startsWith('|')).map(cellsOf);
	const at = rows.findIndex((cells) => cells[0] === '#' && cells[1]?.toLowerCase() === 'unit');
	if (at < 0) return { kind: 'single' };
	const invalid = (why: string): BuildUnitsParse => ({ kind: 'invalid', why: `## Units: ${why}` });
	const header = rows[at].map((c) => c.toLowerCase().replace(/\s+/g, ' '));
	if (header.join('|') !== UNITS_HEADER.join('|')) return invalid(`the table's columns must be \`| ${UNITS_HEADER.join(' | ')} |\``);

	const cases = verificationCases(text);
	const caseNs = cases.map((c) => c.n);
	const twice = caseNs.find((n, i) => caseNs.indexOf(n) !== i);
	if (twice !== undefined) return invalid(`## Verification has case ${twice} twice`);
	const owner = new Map<number, number>();
	const units: BuildUnit[] = [];
	for (const cells of rows.slice(at + 1)) {
		if (isSeparator(cells)) continue;
		if (cells.length !== UNITS_HEADER.length) return invalid(`row "${cells.join(' | ')}" has ${cells.length} cells, not ${UNITS_HEADER.length}`);
		const [num, title, caseCell, dependsCell, reviewCell] = cells;
		if (!/^\d+$/.test(num) || !Number.isSafeInteger(Number(num)) || Number(num) < 1) return invalid(`"${num}" is not a positive unit number`);
		const n = Number(num);
		const previous = units.at(-1)?.n ?? 0;
		if (n <= previous) return invalid(`unit ${n} comes after unit ${previous} — units are numbered once, in ascending order`);
		const where = `unit ${n}`;
		if (!title) return invalid(`${where} has no title`);
		const ownCases = idList(caseCell, 'cases', false);
		if (typeof ownCases === 'string') return invalid(`${where} ${ownCases}`);
		for (const c of ownCases) {
			if (!caseNs.includes(c)) return invalid(`${where} names case ${c}, which is not a ## Verification case`);
			const other = owner.get(c);
			if (other !== undefined) return invalid(`case ${c} is in unit ${other} and unit ${n} — each case belongs to one unit`);
			owner.set(c, n);
		}
		const depends = idList(dependsCell, 'dependencies', true);
		if (typeof depends === 'string') return invalid(`${where} ${depends}`);
		const late = depends.find((d) => !units.some((u) => u.n === d));
		if (late !== undefined) return invalid(`${where} depends on unit ${late}, which is not an earlier unit`);
		units.push({ n, title, cases: ownCases, depends, reviewAfter: NONE.has(reviewCell.toLowerCase()) ? null : reviewCell });
	}
	if (!units.length) return invalid('the table has no units');
	const orphan = caseNs.find((c) => !owner.has(c));
	if (orphan !== undefined) return invalid(`case ${orphan} is in no unit — every ## Verification case belongs to one`);
	// The cells, not the row bytes: re-aligning the table leaves the plan (and the progress made on it) standing.
	const frozen = JSON.stringify(units);
	return { kind: 'units', units, sha: createHash('sha256').update(frozen).digest('hex') };
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Check serialized progress shape; sliceContext owns its relationship to the execution plan. */
export function sliceProgressGap(value: unknown): string | null {
	if (value === undefined) return null;
	if (!isRecord(value)) return 'slices is not an object';
	if (!isText(value.planSha)) return 'slices.planSha is not a sha';
	if (value.unit !== null && !isId(value.unit)) return 'slices.unit is neither a unit number nor null (the integration)';
	if (!isText(value.base)) return 'slices.base is not a commit';
	if (!isText(value.reviewBase)) return 'slices.reviewBase is not a commit';
	if (value.reviewRepair !== undefined && typeof value.reviewRepair !== 'boolean') return 'slices.reviewRepair is not a boolean';
	if (!Array.isArray(value.completed)) return 'slices.completed is not a list';
	let previous = 0;
	for (const done of value.completed as unknown[]) {
		if (!isRecord(done) || !isId(done.n) || !isText(done.head) || typeof done.reviewed !== 'boolean') return 'slices.completed has an entry that is not { n, head, reviewed }';
		if (done.n <= previous) return `slices.completed has unit ${done.n} after unit ${previous}`;
		previous = done.n;
	}
	if (isId(value.unit) && value.unit <= previous) return `slices.unit ${value.unit} is not after the completed units`;
	return null;
}

/** Resolve the current build scope, rejecting changed plans and out-of-order completion receipts. */
export function sliceContext(text: string | null | undefined, progress?: SliceProgress): SliceContext {
	const parsed = parseBuildUnits(text);
	if (parsed.kind === 'invalid') return parsed;
	if (!progress) return parsed.kind === 'single' ? parsed : { kind: 'pending', plan: parsed };
	const gap = sliceProgressGap(progress);
	if (gap) return { kind: 'invalid', why: gap };
	if (parsed.kind === 'single') return { kind: 'invalid', why: 'the build has unit progress but the agreement has no ## Units table' };
	const plan = parsed;
	if (progress.planSha !== plan.sha) return { kind: 'invalid', why: '## Units changed since this build started — renew any changed agreed behavior, then explicitly restart the units with wf step build --restart-units (discards completion receipts)' };
	for (const [i, done] of progress.completed.entries()) {
		const unit = plan.units[i];
		if (!unit || unit.n !== done.n) return { kind: 'invalid', why: `completed unit ${done.n} is not unit ${unit?.n ?? '(none)'}, next in the plan` };
		if (unit.reviewAfter !== null && !done.reviewed) return { kind: 'invalid', why: `unit ${done.n} completed without its checkpoint review (${unit.reviewAfter})` };
	}
	const last = progress.completed.at(-1);
	if (last && progress.base !== last.head) return { kind: 'invalid', why: 'slices.base is not the last completed unit head' };
	const reviewed = progress.completed.filter((done) => done.reviewed).at(-1);
	if (reviewed && progress.reviewBase !== reviewed.head) return { kind: 'invalid', why: 'slices.reviewBase is not the last reviewed unit head' };
	if (!last && progress.base !== progress.reviewBase) return { kind: 'invalid', why: 'the first unit and first review chunk must start at the same commit' };
	const next = plan.units[progress.completed.length];
	if (!next) {
		if (progress.unit !== null) return { kind: 'invalid', why: `every unit is complete but the active unit is ${progress.unit}` };
		if (progress.reviewRepair) return { kind: 'invalid', why: 'integration cannot be a unit checkpoint repair' };
		// The final review reads what no checkpoint review has seen; the final assessment is the round's own.
		return { kind: 'integration', plan, base: progress.reviewBase, assessmentFile: ASSESSMENT_FILE, reviewFile: REVIEW_FILE };
	}
	if (progress.unit !== next.n) return { kind: 'invalid', why: `the active unit is ${progress.unit ?? 'the integration'} but unit ${next.n} is next in the plan` };
	if (progress.reviewRepair && next.reviewAfter === null) return { kind: 'invalid', why: `unit ${next.n} has no checkpoint to repair` };
	const reviewUnits = plan.units.slice(progress.completed.findLastIndex((done) => done.reviewed) + 1, progress.completed.length + 1);
	return { kind: 'unit', unit: next, plan, base: progress.base, reviewBase: progress.reviewBase, reviewUnits, cases: progress.reviewRepair ? reviewUnits.flatMap((u) => u.cases) : next.cases, reviewRepair: progress.reviewRepair ?? false, assessmentFile: unitAssessmentFile(next.n), reviewFile: unitReviewFile(next.n) };
}

/** Start the first unit and review chunk at the current committed HEAD. */
export function initializeSlices(plan: BuildPlan, head: string): SliceProgress {
	return { planSha: plan.sha, unit: plan.units[0].n, base: head, reviewBase: head, completed: [] };
}

/** Advance an assessed unit; a named checkpoint also needs approval, which never permits delivery.
 * Callers supply the current sliceContext and a committed head; inconsistent inputs are defects.
 */
export function advanceSlice(slice: UnitSlice, progress: SliceProgress, head: string, receipt: { reviewed: boolean }): SliceProgress {
	if (slice.plan.sha !== progress.planSha || progress.unit !== slice.unit.n) throw new Error(`advanceSlice: unit ${slice.unit.n} is not the active unit of this progress`);
	if (slice.unit.reviewAfter !== null && !receipt.reviewed) throw new Error(`advanceSlice: unit ${slice.unit.n} needs its checkpoint review (${slice.unit.reviewAfter}) before it completes`);
	if (!isText(head)) throw new Error('advanceSlice: no head commit');
	const next = slice.plan.units[slice.plan.units.findIndex((u) => u.n === slice.unit.n) + 1];
	return {
		planSha: progress.planSha,
		unit: next?.n ?? null,
		base: head,
		reviewBase: receipt.reviewed ? head : progress.reviewBase,
		completed: [...progress.completed, { n: slice.unit.n, head, reviewed: receipt.reviewed }],
	};
}
