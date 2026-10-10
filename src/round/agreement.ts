// agreement.ts — the round's working agreement: what the round will do and how it will be verified.
// This is where the old mandatory research → plan → design → replan chain went (#111, 2026-10-09):
// one agreement, one T1.
//
//   Class A (ordinary): TICKET.md is the agreement. It is the sole human working document and the
//     agreement (#110), so no AGREEMENT.md is written; a `## Repro` and a `## Verification` section
//     may be added to TICKET.md by the working session, and `wf check --case` can name a case the
//     ticket does not carry.
//   Class B/C (consequential): AGREEMENT.md, with `## Observed` (facts, each sourced `path:line` or
//     a command), `## Agreed` (behavior, exclusions, the consequential choice with one rejected
//     alternative, the verification promise) and `## Verification` (the cases `wf check` proves).
//     T1 approves a frozen AGREEMENT.md sha into AGREEMENT-REVIEW.md (gates/agree.ts).
//
// Verification cases replace PLAN.md's commit rows: a named assertion `wf check` runs, with the
// files the case may touch (scopeprot won't let unrelated edits through). A commit is not a case:
// there is no per-commit dispatch or token (#112).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planGap } from '../project.ts';
import type { RoundClass } from './state.ts';

export const AGREEMENT_FILE = 'AGREEMENT.md';
export const AGREEMENT_REVIEW_FILE = 'AGREEMENT-REVIEW.md';
export const ASSESSMENT_FILE = 'ASSESSMENT.md';
export const REVIEW_FILE = 'REVIEW.md';
export const TICKET_FILE = 'TICKET.md';

// Consequential work: class B (a contract path) or C (a design whose approach T1 decides).
export const consequential = (klass: RoundClass | null | undefined): boolean => klass === 'B' || klass === 'C';

// The file that is this round's agreement. Class A's is the ticket: no AGREEMENT.md stands beside it.
export const agreementFile = (klass: RoundClass | null | undefined): string => (consequential(klass) ? AGREEMENT_FILE : TICKET_FILE);

export function agreementPath(toplevel: string, klass: RoundClass | null | undefined, folder: string | null | undefined): string {
	return join(toplevel, folder ?? '', agreementFile(klass));
}

// Pure: the body of `## <name>` in `text`, or null. One section reader for the agreement's parts.
export function section(text: string | null | undefined, name: string): string | null {
	const m = new RegExp(`^## ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec((text ?? '').replace(/\r\n/g, '\n'));
	return m ? m[1] : null;
}

// A verification case: a table row under `## Verification` whose first cell is the case number. A
// named assertion for `wf check` (check.ts checkCellTarget), the files it may touch (the fence) and
// the repro it carries. Replaces PLAN.md's `## Commits` row.
export type VerificationCase = { n: number; line: string; message: string; files: string; check: string };

// Pure: the `## Verification` cases of an agreement, in order. Header and `|---|` rows are not cases.
export function verificationCases(text: string | null | undefined): VerificationCase[] {
	const body = section(text, 'Verification');
	if (!body) return [];
	const cases: VerificationCase[] = [];
	for (const line of body.split('\n')) {
		if (!line.trim().startsWith('|')) continue;
		const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
		if (!/^\d+$/.test(cells[0])) continue;
		cases.push({ n: Number(cells[0]), line: line.trimEnd(), message: cells[1] ?? '', files: cells[2] ?? '', check: cells[3] ?? '' });
	}
	return cases;
}

// Whitespace- or comma-separated paths in a case's `files` cell, backticks stripped.
export const caseFiles = (c: Pick<VerificationCase, 'files'> | null | undefined): string[] =>
	(c?.files ?? '').split(/[\s,]+/).map((f) => f.replace(/`/g, '').trim()).filter(Boolean);

// Pure: `Class:` in an agreement, or null. A declared class can only upgrade the measured one.
export function agreementClass(text: string | null | undefined): RoundClass | null {
	const m = /^Class:[ \t]*([ABC])\b/m.exec((text ?? '').replace(/\r\n/g, '\n'));
	return m ? (m[1] as RoundClass) : null;
}

// Pure: sha256 of the agreement's *agreed material* — the bytes T1 approves. It binds `## Observed`
// and `## Agreed`, never the mutable working detail (`## Verification` cases, `## Units`, a `## Files`
// hint): adding a helper to a case, or refreshing progress, must not invalidate unchanged direction
// (#111.5). A genuinely new behavior changes `## Agreed` and so the sha. Null when the file is absent.
export function agreementSha(toplevel: string, klass: RoundClass | null | undefined, folder: string | null | undefined): string | null {
	const file = agreementPath(toplevel, klass, folder);
	if (!existsSync(file)) return null;
	const text = readFileSync(file, 'utf8');
	const material = consequential(klass) ? [section(text, 'Observed'), section(text, 'Agreed')].join('\n---\n') : section(text, 'Intent') ?? text;
	return createHash('sha256').update(material).digest('hex');
}

// Pure: null when `text` is an agreement a build can start from, else why not. Class A: the ticket
// needs `## Intent` (composePrompt enforces that) and nothing else — no AGREEMENT.md, no extra
// artifact to record the repro (#110). Class B/C: the observed facts and the agreed behavior are the
// two halves a T1 decision needs; the verification cases are what `wf check` runs.
export function agreementGap(text: string | null | undefined, klass: RoundClass | null | undefined, branch: string | null = null): string | null {
	if (!consequential(klass)) return null;
	if (text == null) return `no ${AGREEMENT_FILE}`;
	const observed = (section(text, 'Observed') ?? '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('<!--')).length;
	if (!observed) return `${AGREEMENT_FILE} has no \`## Observed\` facts — each with its source (path:line or a command)`;
	const agreed = (section(text, 'Agreed') ?? '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('<!--')).length;
	if (!agreed) return `${AGREEMENT_FILE} has no \`## Agreed\` behavior — what changes, what is excluded, the choice, the verification promise`;
	const cases = verificationCases(text);
	if (!cases.length) return `${AGREEMENT_FILE} has no \`## Verification\` cases — one table row per case \`| # | case | files | check |\``;
	// The project's own rule on what a case may touch (projects/<name>/index.ts planGap): a fix/ case
	// listing a verification/ file is refused, so the oracle tests cannot be edited.
	return planGap({ branch, rows: cases.map((c) => ({ n: c.n, message: c.message, files: caseFiles(c) })) });
}

// Pure: null when every `## Intent` line of an assessment is one verdict and every `met:` has a
// measurement on each side; else the first line that is not. A claim is measured before and after,
// or visibly NOT MEASURED, never met from the code alone (#109's intent discipline).
export function intentGap(text: string | null | undefined): string | null {
	const body = section(text, 'Intent');
	const lines = (body ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--'));
	if (!lines.length) return `${ASSESSMENT_FILE} has no \`## Intent\` lines`;
	for (const l of lines) {
		const notMet = /\bnot met:/.test(l);
		const met = !notMet && /\bmet:/.test(l);
		if (!met && !notMet && !/\bNOT MEASURED\b/.test(l) && !/\bleft out:/.test(l)) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" has no verdict (met | NOT MEASURED | not met | left out)`;
		if (/\bleft out:\s*$/.test(l)) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" is left out with no reason`;
		if (met && !(/\bbefore:/.test(l) && /\bafter:/.test(l))) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" is met without a before: and an after: measurement — or it is NOT MEASURED`;
	}
	return null;
}

// Pure: ASSESSMENT.md's `Verdict:` line — clean | repair | blocked — or null.
export function assessmentVerdict(text: string | null | undefined): string | null {
	return /^Verdict:[ \t]*(clean|repair|blocked)\b/m.exec((text ?? '').replace(/\r\n/g, '\n'))?.[1] ?? null;
}

// Pure: the HEAD the assessment measured (its `head:` line), or null on a file from before the field.
export const assessmentHead = (text: string | null | undefined): string | null => {
	const m = /^head:[ \t]*(\S+)[ \t]*$/m.exec((text ?? '').replace(/\r\n/g, '\n'));
	return m ? m[1] : null;
};

// Pure: a `material: <what changed>` line in ASSESSMENT.md's `## Agreement` section, or null. A
// genuine new behavior is a renewed agreement, not an autonomous repair (#111.4).
export function assessmentMaterial(text: string | null | undefined): string | null {
	const body = section(text, 'Agreement') ?? '';
	return /^material:[ \t]*(.+)$/m.exec(body)?.[1].trim() || null;
}

// Pure: null when ASSESSMENT.md is an assessment a T2 can read, else why not.
export function assessmentGap(text: string | null | undefined): string | null {
	if (text == null) return `no ${ASSESSMENT_FILE}`;
	if (!assessmentVerdict(text)) return `${ASSESSMENT_FILE} has no \`Verdict: clean | repair | blocked\` line`;
	return intentGap(text);
}
