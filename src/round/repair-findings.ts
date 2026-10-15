// #152, JX-1393: an unexecutable finding spent a repair, and an unanswered one passed handoff.
import { section, assessmentVerdict } from './agreement.ts';
import { assessmentContentSha } from './assessment-rulings.ts';
import { lastField } from '../gates/review-format.ts';

/** A repair names its obligation and either executable work or an owned execution blocker. */
export type RepairFinding =
	| { readonly id: string; readonly obligation: string; readonly kind: 'action'; readonly action: string }
	| { readonly id: string; readonly obligation: string; readonly kind: 'blocker'; readonly blocker: string; readonly owner: string; readonly next: string };

/** Parse the assessment's repair contract; malformed findings return to the assessor without a repair. */
export function parseRepairFindings(assessment: string | null): { readonly kind: 'findings'; readonly findings: readonly RepairFinding[] } | { readonly kind: 'invalid'; readonly why: string } {
	const invalid = (why: string) => ({ kind: 'invalid' as const, why: `repair findings: ${why}` });
	const lines = section(assessment, 'Repairs')?.split('\n').filter((line) => line.trim()) ?? [];
	if (!lines.length) return invalid('write ## Repairs with an obligation and action, or a blocker with owner and next step');
	const findings: RepairFinding[] = [];
	for (const line of lines) {
		const match = /^- (R[1-9]\d*): (\S.*?) \| (.+)$/.exec(line.trim());
		if (!match) return invalid('use - R1: <obligation> | action: <authorized command/test/setup>, or | blocker: <gap> | owner: <owner> | next: <recovery>');
		const [, id, obligation, detail] = match;
		if (findings.some((finding) => finding.id === id)) return invalid(`duplicate ${id}`);
		const action = /^action: (\S.*)$/.exec(detail);
		const blocker = /^blocker: (\S.*?) \| owner: (\S.*?) \| next: (\S.*)$/.exec(detail);
		if (action) findings.push({ id, obligation, kind: 'action', action: action[1] });
		else if (blocker) findings.push({ id, obligation, kind: 'blocker', blocker: blocker[1], owner: blocker[2], next: blocker[3] });
		else return invalid(`${id} needs action: or blocker: with owner: and next:`);
	}
	return { kind: 'findings', findings };
}

/** Repair answers live in the working document, bound to this assessment and current implementation. */
export function repairResponseGap(assessment: string | null, agreement: string, content: string | null): string | null {
	if (assessmentVerdict(assessment) !== 'repair') return null;
	const parsed = parseRepairFindings(assessment);
	// An already-dispatched build may predate the findings contract (#152). Let it request a fresh
	// assessment: next refuses to spend another repair until that assessor supplies actionable ids.
	if (parsed.kind === 'invalid') return null;
	const responses = section(agreement, 'Repair responses');
	if (!responses || lastField(responses, 'source') !== assessmentContentSha(assessment)) return 'repair responses: add ## Repair responses to the working document with source: <assessment content sha>; answer every finding without editing the assessment';
	if (!content || lastField(responses, 'content-sha') !== content) return 'repair responses: content-sha: must name the current wf check implementation';
	const lines = responses.split('\n').filter((line) => line.trim().startsWith('- '));
	for (const finding of parsed.findings) {
		const answers = lines.filter((line) => line.trim().startsWith(`- ${finding.id}:`));
		if (answers.length !== 1 || !/^- R[1-9]\d*: (?:done: \S.+ \| evidence: \S.+|impossible: \S.+ \| owner: \S.+ \| next: \S.+)$/.test(answers[0].trim())) return `repair responses: ${finding.id} needs one done: <what ran/changed> | evidence: <measurement/reference>, or impossible: <why> | owner: <owner> | next: <recovery>`;
	}
	return null;
}
