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
import { agreementCaseGap } from '../project.ts';
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

/** The explicit T2 walk bullet and its indented continuations; never sibling facts or headings. */
export function agreementT2WalkLines(text: string | null | undefined): string[] {
	const normalized = (text ?? '').replace(/\r\n/g, '\n');
	const body = section(normalized, 'Agreed') ?? normalized;
	const lines: string[] = [];
	let indent: number | null = null;
	for (const raw of body.split('\n')) {
		if (indent === null) {
			const marker = /^([ \t]*)[-*][ \t]+(?:\*\*T2 walk[.:]?\*\*|T2 walk)[.:]?(?:[ \t]+(.*)|$)/i.exec(raw);
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

/** Pure: true when the round declares a T2 walk `wf show` can follow: an `open:` target or the
 * explicit `none — <why>`. Class A's bullet lives in TICKET.md (there is no `## Agreed` to scope it),
 * B/C's under `## Agreed`; agreementT2WalkLines reads both. Shared by agreementGap (B/C before T1)
 * and `wf next` (class A before T2, #139 JX-1068: a class A round reached T2 with no walk at all). */
export function hasT2Walk(text: string | null | undefined): boolean {
	return agreementT2WalkLines(text).some((line) => /^open:[ \t]*`?[^`\s<]/i.test(line) || /^none\s*(?:—|[-:])\s*\S/i.test(line));
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

// Pure: null when `text` is an agreement a build can start from, else why not. Class A: the ticket
// needs `## Intent` (composePrompt enforces that) and nothing else — no AGREEMENT.md, no extra
// artifact to record the repro (#110). Class B/C: the observed facts and the agreed behavior are the
// two halves a T1 decision needs; the verification cases are what `wf check` runs. A readable
// T2 walk or an explicit no-walk reason is required before that approval.
export function agreementGap(text: string | null | undefined, klass: RoundClass | null | undefined, branch: string | null = null): string | null {
	if (!consequential(klass)) return null;
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

// Pure: null when every `## Intent` line of an assessment is one verdict and every `met:` has a
// measurement on each side; else the first line that is not. A claim is measured before and after,
// or visibly NOT MEASURED, never met from the code alone (#109's intent discipline).
export function intentGap(text: string | null | undefined, deferredUnits: readonly number[] = []): string | null {
	const body = section(text, 'Intent');
	const lines = (body ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--'));
	if (!lines.length) return `${ASSESSMENT_FILE} has no \`## Intent\` lines`;
	let current = false;
	for (const l of lines) {
		const deferred = /\bdeferred:\s*unit\s+(\d+)\s*$/i.exec(l);
		if (deferred && deferredUnits.includes(Number(deferred[1]))) continue;
		current = true;
		const notMet = /\bnot met:/.test(l);
		const met = !notMet && /\bmet:/.test(l);
		if (!met && !notMet && !/\bNOT MEASURED\b/.test(l) && !/\bleft out:/.test(l)) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" has no verdict (met | NOT MEASURED | not met | left out)`;
		if (/\bleft out:\s*$/.test(l)) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" is left out with no reason`;
		if (met && !(/\bbefore:/.test(l) && /\bafter:/.test(l))) return `${ASSESSMENT_FILE} ## Intent: "${l.slice(0, 80)}" is met without a before: and an after: measurement — or it is NOT MEASURED`;
	}
	return current ? null : `${ASSESSMENT_FILE} has no current-scope Intent measurement — every line was deferred`;
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

/** Known agreement mismatches in report order; surviving agreed effects need repair or a durable ruling. */
export function assessmentSurviving(text: string | null | undefined): string[] {
	const body = section(text, 'Agreement') ?? '';
	return body
		.split('\n')
		.map((l) => /^(?:-[ \t]+)?surviving:[ \t]*(.+)$/i.exec(l.trim())?.[1].trim())
		.filter((l): l is string => Boolean(l));
}

// Pure: null when ASSESSMENT.md is an assessment a T2 can read, else why not. The `head:` is what
// binds it to the tree it judged, so a missing one is refused; a `clean` verdict may not carry an
// unmet item (`not met:`/`differs:`/`still reproduces:`) — that is a blocked round wearing a clean
// label (#113.4). A `clean` verdict may not carry a `surviving:` agreed effect either: a known
// intent/agreement mismatch is repaired or durably ruled on, never an advisory `## Design` note
// (#130). A `blocked` one names the mismatch on an intent line so the durable ruling carries it.
export function assessmentGap(text: string | null | undefined, deferredUnits: readonly number[] = []): string | null {
	if (text == null) return `no ${ASSESSMENT_FILE}`;
	const verdict = assessmentVerdict(text);
	if (!verdict) return `${ASSESSMENT_FILE} has no \`Verdict: clean | repair | blocked\` line`;
	if (!assessmentHead(text)) return `${ASSESSMENT_FILE} has no \`head: <commit>\` line — the assessment names the tree it judged`;
	if (verdict === 'clean' && /(not met:|differs:|still reproduces:)/i.test(text)) return `${ASSESSMENT_FILE} says clean but states an unmet item — a clean assessment cannot carry \`not met:\``;
	if ((section(text, 'Agreement') ?? '').split('\n').some((line) => /^(?:-[ \t]+)?surviving:[ \t]*$/i.test(line.trim()))) return `${ASSESSMENT_FILE} has an empty \`surviving:\` item — name the agreed effect still in place`;
	const surviving = assessmentSurviving(text);
	if (verdict === 'clean' && surviving.length) return `${ASSESSMENT_FILE} says clean but an agreed removal or exclusion still takes effect (\`surviving:\`) — a surviving effect the agreement removes is not a \`## Design\` note: fix it with \`Verdict: repair\`, or record it for a ruling with \`Verdict: blocked\``;
	if (surviving.length && verdict === 'blocked' && !/(not met:|differs:|still reproduces:)/i.test(section(text, 'Intent') ?? '') && !assessmentMaterial(text)) return `${ASSESSMENT_FILE} is blocked by a surviving agreed effect but names no \`not met:\` ## Intent line or \`material:\` change — the person's ruling must carry the mismatch`;
	return intentGap(text, deferredUnits);
}

// Pure: the verification gaps an assessment states about itself — a line in `## Intent`, `## Live` or
// `## Behavior and evidence` marked INCONCLUSIVE, NOT VERIFIED or NOT MEASURED. A `clean` verdict does
// not carry them silently: wf next asks the user to fix or accept them (an explicit ruling tied to this
// assessment's head and these lines). 2026-10-12 JX-1239: an assessment said clean with its mobile/LTR
// lines INCONCLUSIVE, and T2 opened as though they had been checked.
export function assessmentOpenGaps(text: string | null | undefined): string[] {
	const marker = /^(INCONCLUSIVE|NOT VERIFIED|NOT MEASURED|VERIFIED|met|not met|left out|deferred)\b/i;
	return ['Intent', 'Live', 'Behavior and evidence']
		.flatMap((name) => (section(text, name) ?? '').split('\n'))
		.map((l) => l.trim().replace(/^[-*]\s*/, ''))
		.filter((line) => {
			// JX-1392 (#151): read the present status, never quoted history in its evidence.
			const plain = line.replace(/\*\*/g, '');
			const status = marker.exec(plain) ?? marker.exec(plain.replace(/^(?:"[^"]*"|[^:]+):\s*/, ''));
			return /^(INCONCLUSIVE|NOT VERIFIED|NOT MEASURED)$/i.test(status?.[1] ?? '');
		});
}
