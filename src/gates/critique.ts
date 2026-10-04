// critique.ts — the critic of a validation: a fresh agent that audits VALIDATION.md, not the code,
// before the person sees it. Adversarial Review (Qiu and Gill, arXiv 2608.18167, 2026-08-16): a
// reviewer and a critic exchange review text only, with the artifact frozen, and the main agent edits
// once they settle. Two parts of it decided this module's shape:
//   - a bare AGREE | DISAGREE critic did worst of every method on real PR review (SWE-PRBench F1
//     0.457, false consensus); three verdicts, one of which must cite code, did best (0.533)
//   - a second independent reviewer gained nothing over one (75% vs 77% on LiveCodeBench hard), so
//     the critic answers the review, it does not write another
// wf already had the reviewer (validate) and the editor (fix-review); this is the critic. One
// `critique` agent (prompts/critique.md) writes CRITIQUE.md; a disagreement sends validate back with
// `--answer`, at most MAX_EXCHANGES critiques per validation. A dispute still open after that goes to
// T2 beside VALIDATION.md, never resolved by wf.

export const CRITIQUE_FILE = 'CRITIQUE.md';

// The paper capped the inner loop at 5; wf already caps a phase at two briefs (next.ts MAX_BRIEFS),
// and every exchange is a validate and a critique agent.
export const MAX_EXCHANGES = 2;

export const VERDICTS = ['AGREE', 'DISAGREE_EVIDENCE', 'DISAGREE_CONCERN'] as const;
export type Verdict = (typeof VERDICTS)[number];

const VERDICT = /^Verdict:[ \t]*(AGREE|DISAGREE_EVIDENCE|DISAGREE_CONCERN)[ \t]*$/m;
// - AGREE · <the VALIDATION.md line>
// - DISAGREE_EVIDENCE · <the line> · <path>:<line> — <what the code there shows>
// - DISAGREE_CONCERN · <the line> — <the evidence that would settle it>
const ROW = /^[-*]\s+(AGREE|DISAGREE_EVIDENCE|DISAGREE_CONCERN)\s+·\s+(.+)$/;
const CITES = /\S+:\d+\s+—\s+\S/;

const rowsOf = (body: string) => {
	const section = /^## Rows[ \t]*\n([\s\S]*?)(?=^## |^Verdict:|(?![\s\S]))/m.exec(body)?.[1] ?? '';
	return section.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--'));
};

// Pure: CRITIQUE.md's Verdict line, or null.
export function critiqueVerdict(text: string | null | undefined): Verdict | null {
	return (VERDICT.exec((text ?? '').replace(/\r\n/g, '\n'))?.[1] as Verdict | undefined) ?? null;
}

// Pure: the verdict a set of rows comes to: any cited disagreement, else any concern, else AGREE.
export const worstOf = (verdicts: string[]): Verdict => (['DISAGREE_EVIDENCE', 'DISAGREE_CONCERN'] as const).find((v) => verdicts.includes(v)) ?? 'AGREE';

// Pure: null when CRITIQUE.md is a critique wf can act on, else what is wrong with it.
export function critiqueGap(text: string, file = CRITIQUE_FILE): string | null {
	const body = text.replace(/\r\n/g, '\n');
	const verdict = critiqueVerdict(body);
	if (!verdict) return `${file} has no \`Verdict: AGREE | DISAGREE_EVIDENCE | DISAGREE_CONCERN\` line`;
	const rows = rowsOf(body);
	if (!rows.length) return `${file} has no \`## Rows\` lines`;
	const parsed: string[] = [];
	for (const l of rows) {
		const m = ROW.exec(l);
		if (!m) return `${file} ## Rows: "${l.slice(0, 80)}" is not \`- <AGREE | DISAGREE_EVIDENCE | DISAGREE_CONCERN> · <the VALIDATION.md line> …\``;
		if (m[1] === 'DISAGREE_EVIDENCE' && !CITES.test(m[2])) return `${file} ## Rows: "${l.slice(0, 80)}" disagrees on evidence and cites no \`<path>:<line> — <what it shows>\` (with none, it is DISAGREE_CONCERN)`;
		parsed.push(m[1]);
	}
	if (worstOf(parsed) !== verdict) return `${file} says ${verdict}, and its rows come to ${worstOf(parsed)}`;
	return null;
}

// Pure: the line T2's header carries for the last critique, or none when it agreed (or there is none:
// a round validated before the critic).
export function critiqueLines(text: string | null, file: string, exchange: number | null): string[] {
	const verdict = critiqueVerdict(text);
	if (!verdict || verdict === 'AGREE') return [];
	return [`critique: still ${verdict} after ${exchange ?? '?'} exchange(s): ${file}  ← read beside VALIDATION.md`];
}
