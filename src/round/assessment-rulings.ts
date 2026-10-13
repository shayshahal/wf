// assessment-rulings.ts — the verification question's identity and the repair it obliges.
// JX-275, 2026-10-12 (#126): a clean assessment's fix ruling stayed in answered[], but the
// build saw neither the gaps nor the person's words. Checks/rebase dispatch must not erase it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lastField } from '../gates/review-format.ts';
import { ASSESSMENT_FILE, assessmentHead, assessmentOpenGaps, section } from './agreement.ts';
import type { SliceContext } from './build-units.ts';
import type { Question } from './state.ts';

/** Assessment rulings stay in answered[], including unit verdicts; they are not agreement edits. */
export function isAssessmentRulingSource(source: string | undefined): boolean {
	return /^ASSESSMENT(?:-unit-[1-9]\d*)?\.md(?:#|$)/.test(source ?? '');
}

/** Ruling identity uses the assessed head, not current HEAD, so a rebase preserves pending feedback. */
export function assessmentRulingSource(text: string | null, context: SliceContext): string {
	const file = context.kind === 'unit' ? context.assessmentFile : ASSESSMENT_FILE;
	return `${file}#${assessmentHead(text) ?? 'unknown'}${context.kind === 'unit' ? `#plan:${context.plan.sha}#base:${context.base}` : context.kind === 'integration' ? `#plan:${context.plan.sha}` : ''}`;
}

/** Assessment content identity ignores checkout newline conversion, never filesystem timestamps. */
export function assessmentContentSha(text: string | null): string | null {
	return text === null ? null : createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

/** Frozen verification lines identify one fix-or-accept question, independently of the current tree. */
export const verificationGapsHash = (gaps: readonly string[]): string => createHash('sha256').update(gaps.join('\n')).digest('hex').slice(0, 8);

/** Validate new persisted gap metadata without reinterpreting old questions that did not carry it. */
export function verificationQuestionGap(question: unknown): string | null {
	if (question === null || typeof question !== 'object' || !('verification_gaps' in question)) return null;
	if (!('n' in question) || typeof question.n !== 'number' || !Number.isSafeInteger(question.n) || question.n < 1) return 'verification_gaps question must have a positive integer n';
	const gaps = question.verification_gaps;
	if (!Array.isArray(gaps) || !gaps.length) return 'verification_gaps must be a nonempty array of verification lines';
	const lines: string[] = [];
	for (const gap of gaps) {
		if (typeof gap !== 'string' || !gap.trim()) return 'verification_gaps must be a nonempty array of verification lines';
		lines.push(gap);
	}
	if (!('source' in question) || typeof question.source !== 'string' || !isAssessmentRulingSource(question.source) || !question.source.endsWith(`#open:${verificationGapsHash(lines)}`)) return 'verification_gaps do not match their question source';
	return null;
}

/** Pending verification fix rulings for this assessment/scope; accepts and closed gaps are not repairs. */
export function verificationFixRulings(text: string | null, context: SliceContext, answered: readonly Question[], currentSuiteGap: string | null = null): Question[] {
	if (context.kind === 'invalid' || context.kind === 'pending' || (!assessmentOpenGaps(text).length && !currentSuiteGap)) return [];
	const prefix = `${assessmentRulingSource(text, context)}#open:`;
	const current = [...assessmentOpenGaps(text), ...(currentSuiteGap ? [currentSuiteGap] : [])];
	const pending = new Set<Question>();
	for (const gap of current) {
		const ruling = answered.findLast((q) => {
			if (!q.source?.startsWith(prefix)) return false;
			if (q.verification_gaps) return q.verification_gaps.includes(gap);
			// Pre-#126 records have only the exact lines in wf's question text. Keep those pending
			// repairs readable without a state migration; the source still binds their assessed scope.
			return q.text.includes(gap);
		});
		// A later ruling can cover an expanded set at the same HEAD. Its accept supersedes an
		// earlier fix for that line; do not resurrect the repair when the build resumes.
		if (ruling && !/^\s*accept\b/i.test(ruling.answer ?? '')) pending.add(ruling);
	}
	return [...pending];
}

/** Only a ruled verification repair needs this measurement record; ordinary builds add no artifact. */
export function verificationProofFile(folder: string, question: Question): string {
	return `${folder}/proof/verification-q${question.n}.md`;
}

/** Refuse a repair handoff without question-bound, current measurement evidence; the assessor judges its truth. */
export function verificationProofGap(toplevel: string, input: { folder: string; rulings: readonly Question[]; head: string; content: string | null }): string | null {
	for (const q of input.rulings) {
		const file = verificationProofFile(input.folder, q);
		const fail = (why: string) => `verification repair q${q.n}: ${file} ${why} — produce the requested proof, or write ${input.folder}/BLOCKED.md; a wf check green alone does not close this ruling`;
		let text: string;
		try { text = readFileSync(join(toplevel, file), 'utf8'); } catch (error) {
			return fail(`cannot be read (${error instanceof Error ? error.message : String(error)})`);
		}
		if (lastField(text, 'source') !== q.source) return fail('must name this ruling\'s source: exactly');
		if (lastField(text, 'head') !== input.head) return fail('must name the current head:');
		if (input.content === null || lastField(text, 'content-sha') !== input.content) return fail('must name the current implementation content-sha:');
		const measurement = section(text, 'Measurement');
		if (!measurement?.trim() || /\b(INCONCLUSIVE|NOT VERIFIED|NOT MEASURED)\b/i.test(measurement)) return fail('needs ## Measurement with the requested check, observed result and evidence references');
	}
	return null;
}
