// agreement.ts — the round's working agreement: what the round will do and how it will be verified.
// This is where the old mandatory research → plan → design → replan chain went (#111, 2026-10-09):
// one agreement, one T1.
//
//   Class A (ordinary): TICKET.md is the agreement. It is the sole human working document and the
//     agreement (#110), so no AGREEMENT.md is written; a `## Repro` and a `## Verification` section
//     may be added to TICKET.md by the working session.
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
import { agreementCaseGap } from '../project.ts';
import type { RoundClass } from './state.ts';

export const AGREEMENT_FILE = 'AGREEMENT.md';
export const AGREEMENT_REVIEW_FILE = 'AGREEMENT-REVIEW.md';
export const ASSESSMENT_FILE = 'ASSESSMENT.md';
export const REVIEW_FILE = 'REVIEW.md';
/** A human-agreed checkpoint review, appended to a round that may have several; never the final. */
export const CHECKPOINT_REVIEW_FILE = 'CHECKPOINT-REVIEW.md';
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

/** Read anticipated repo-relative paths from Scope's `paths:` lines and the optional Files hint. */
export function anticipatedPaths(text: string | null | undefined): string[] {
	// #132: explicit path hints classify known scope without interpreting exclusions or requiring a plan.
	const scope = (section(text, 'Scope') ?? '').split('\n')
		.flatMap((line) => line.match(/^[ \t]*(?:-[ \t]+)?paths:[ \t]*(.*)$/i)?.[1] ?? []);
	const files = (section(text, 'Files') ?? '').split('\n').map((line) => line.replace(/^[ \t]*-[ \t]+/, ''));
	return [...new Set([...scope, ...files].flatMap((line) => line.split(/[\s,]+/))
		.map((path) => path.replace(/`/g, '').replace(/\\/g, '/').replace(/^\.\//, ''))
		.filter(Boolean))];
}

/** The `## Agreed` bullet labelled `label` (plain or bold) and its indented continuations; never
 * sibling facts or headings. Class A has no `## Agreed`, so its ticket is read whole. */
function agreedBulletLines(text: string | null | undefined, label: string): string[] {
	const normalized = (text ?? '').replace(/\r\n/g, '\n');
	const body = section(normalized, 'Agreed') ?? normalized;
	const bullet = new RegExp(`^([ \\t]*)[-*][ \\t]+(?:\\*\\*${label}[.:]?\\*\\*|${label})[.:]?(?:[ \\t]+(.*)|$)`, 'i');
	const lines: string[] = [];
	let indent: number | null = null;
	for (const raw of body.split('\n')) {
		if (indent === null) {
			const marker = bullet.exec(raw);
			if (!marker) continue;
			indent = marker[1].length;
			lines.push((marker[2] ?? '').trim());
		} else {
			if (!raw.trim()) continue;
			if (raw.length - raw.trimStart().length <= indent) break;
			lines.push(raw.trimStart().replace(/^[-*]\s+/, ''));
		}
	}
	return lines.filter((line) => line && !line.startsWith('<!--'));
}

/** The explicit T2 walk bullet and its indented continuations. */
export const agreementT2WalkLines = (text: string | null | undefined): string[] => agreedBulletLines(text, 'T2 walk');

const NONE_WITH_REASON = /^none\s*(?:—|[-:])\s*\S/i;

/** The `**Not asked for.**` items: what the agreement adds that no source asked for — the ticket, the
 * spec it cites, or a ruling of the person's. Empty for `none — <why>`, and when the bullet is absent.
 * 2026-10-18, JX-1367: the ticket asked to hold VAT with the bid; the agreement also put a new
 * "amount held" line on the bid form that neither the ticket nor the pricing spec (JX-696) described.
 * It sat as one clause of an approved `## Agreed`, and Shay did not catch it at T1. Listing the
 * additions apart makes each one a decision of its own. */
export const notAskedFor = (text: string | null | undefined): string[] =>
	agreedBulletLines(text, 'Not asked for').filter((line) => !NONE_WITH_REASON.test(line));

/** Pure: why the agreement cannot go to T1 for want of a `**Not asked for.**` bullet, or null. */
export function notAskedForGap(text: string | null | undefined): string | null {
	const lines = agreedBulletLines(text, 'Not asked for');
	if (lines.length && !lines.some((line) => /^none\b/i.test(line) && !NONE_WITH_REASON.test(line))) return null;
	return `${AGREEMENT_FILE} needs a \`**Not asked for.**\` bullet under \`## Agreed\`: one sub-bullet per behavior, screen, text or contract change no source asked for (the ticket, the spec it cites, a ruling), each with why it is needed; or \`none — <why>\``;
}

/** Pure: true when the round declares a T2 walk `wf show` can follow: an `open:` target or the
 * explicit `none — <why>`. Class A's bullet lives in TICKET.md (there is no `## Agreed` to scope it),
 * B/C's under `## Agreed`; agreementT2WalkLines reads both. Shared by agreementGap (B/C before T1)
 * and `wf next` (class A before T2, #139 JX-1068: a class A round reached T2 with no walk at all). */
export function hasT2Walk(text: string | null | undefined): boolean {
	return agreementT2WalkLines(text).some((line) => /^open:[ \t]*`?[^`\s<]/i.test(line) || NONE_WITH_REASON.test(line));
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
// and `## Agreed`, never the mutable working detail (`## Verification` cases, a `## Files`
// hint): adding a helper to a case, or refreshing progress, must not invalidate unchanged direction
// (#111.5). A genuinely new behavior changes `## Agreed` and so the sha. Null when the file is absent.
export function agreementSha(toplevel: string, klass: RoundClass | null | undefined, folder: string | null | undefined): string | null {
	const file = agreementPath(toplevel, klass, folder);
	if (!existsSync(file)) return null;
	const text = readFileSync(file, 'utf8');
	const material = consequential(klass) ? [section(text, 'Observed'), section(text, 'Agreed')].join('\n---\n') : section(text, 'Intent') ?? text;
	return createHash('sha256').update(material).digest('hex');
}

// The sha a `wf decide --revise` records and `openRevisions` compares. B/C: the agreed material. Class A:
// agreementSha binds `## Intent`, which the agree phase may not edit, so a revision keyed on it never
// closed (JX-1096: `wf next` dispatched agree forever). A's revision answers when the ticket's agreed
// sections (`## Agreed`, `## Verification`) change; `## Decisions`, which `wf decide` appends, is not in.
export function revisionSha(toplevel: string, klass: RoundClass | null | undefined, folder: string | null | undefined): string | null {
	if (consequential(klass)) return agreementSha(toplevel, klass, folder);
	const file = agreementPath(toplevel, klass, folder);
	if (!existsSync(file)) return null;
	const text = readFileSync(file, 'utf8');
	return createHash('sha256').update([section(text, 'Agreed'), section(text, 'Verification')].map((x) => (x ?? '').trim()).join('\n---\n')).digest('hex');
}

/** Return the agreement gap before build: class A needs a ticket with intent; B/C also needs
 * observed facts, agreed behavior, verification cases and a T2 walk before approval. */
export function agreementGap(text: string | null | undefined, klass: RoundClass | null | undefined, branch: string | null = null): string | null {
	// #184 (2026-10-20): next skipped the ticket and step build refused it. Share the minimum here
	// so dispatch and direct build cannot disagree about a missing ticket or empty intent.
	if (!consequential(klass)) {
		if (text == null) return `no ${TICKET_FILE}`;
		return section(text, 'Intent')?.trim() ? null : `${TICKET_FILE} has no \`## Intent\` — the requester's words, verbatim and attributed`;
	}
	if (text == null) return `no ${AGREEMENT_FILE}`;
	const observed = (section(text, 'Observed') ?? '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('<!--')).length;
	if (!observed) return `${AGREEMENT_FILE} has no \`## Observed\` facts — each with its source (path:line or a command)`;
	const agreed = (section(text, 'Agreed') ?? '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('<!--')).length;
	if (!agreed) return `${AGREEMENT_FILE} has no \`## Agreed\` behavior — what changes, what is excluded, the choice, the verification promise`;
	const cases = verificationCases(text);
	if (!cases.length) return `${AGREEMENT_FILE} has no \`## Verification\` cases — one table row per case \`| # | case | files | check |\``;
	if (!hasT2Walk(text)) return `${AGREEMENT_FILE} needs a T2 walk: open: <the review target>, or none — <why no walk is needed>; plain or bold labels are accepted`;
	// The project's own rule on what a case may touch (projects/<name>/index.ts agreementCaseGap): a fix/ case
	// listing a verification/ file is refused, so the oracle tests cannot be edited.
	return agreementCaseGap({ branch, rows: cases.map((c) => ({ n: c.n, message: c.message, files: caseFiles(c) })) });
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

/** Only explicit reviewer outcome and measured head are machine-checked; evidence is reviewer judgment. */
export function assessmentGap(text: string | null | undefined): string | null {
	if (text == null) return `no ${ASSESSMENT_FILE}`;
	if (!assessmentVerdict(text)) return `${ASSESSMENT_FILE} has no \`Verdict: clean | repair | blocked\` line`;
	if (!assessmentHead(text)) return `${ASSESSMENT_FILE} has no \`head: <commit>\` line — the assessment names the tree it judged`;
	return null;
}

/** Assessment answers stay outside the agreement's approved material. */
export function isAssessmentRulingSource(source: string | undefined): boolean {
	return /^ASSESSMENT\.md(?:#|$)/.test(source ?? '');
}

/** Bind a durable reviewer question to its assessed head, not the checkout. */
export function assessmentRulingSource(text: string | null): string {
	return `${ASSESSMENT_FILE}#${assessmentHead(text) ?? 'unknown'}`;
}

/** Content identity ignores checkout newline conversion, never filesystem timestamps. */
export function assessmentContentSha(text: string | null): string | null {
	return text === null ? null : createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}
