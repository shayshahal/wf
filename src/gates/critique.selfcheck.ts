// critique.selfcheck.ts — node critique.selfcheck.ts → exit 0 when green.
// Pure arms: CRITIQUE.md read and judged, and its line in T2's header (critique.ts). Nothing is run.
import { critiqueGap, critiqueLines, critiqueVerdict, worstOf } from './critique.ts';

let failures = 0;
const check = (name: string, cond: boolean | undefined, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const crit = (rows: string[], verdict: string) => `# r — critique of the validation\n\n## Rows\n${rows.join('\n')}\n\nVerdict: ${verdict}\n<!-- brief: fff666 -->\n`;
const AGREE = '- AGREE · Verdict: matches plan';
const EVIDENCE = '- DISAGREE_EVIDENCE · "one": met · web/a.ts:14 — the guard returns before the call the after: measured';
const CONCERN = '- DISAGREE_CONCERN · Unplanned: none — the diff adds b.ts:3, which no row names; read it or list it';

check('verdict: read from its line', critiqueVerdict(crit([AGREE], 'AGREE')) === 'AGREE' && critiqueVerdict(crit([EVIDENCE], 'DISAGREE_EVIDENCE').replace(/\n/g, '\r\n')) === 'DISAGREE_EVIDENCE');
check('verdict: none without the line', critiqueVerdict('# r\n## Rows\n- AGREE · x\n') === null && critiqueVerdict(null) === null);
check('rows come to the worst: evidence over concern over agree', worstOf(['AGREE', 'DISAGREE_CONCERN', 'DISAGREE_EVIDENCE']) === 'DISAGREE_EVIDENCE' && worstOf(['AGREE', 'DISAGREE_CONCERN']) === 'DISAGREE_CONCERN' && worstOf(['AGREE']) === 'AGREE');

check('a critique that agrees is a handoff', critiqueGap(crit([AGREE], 'AGREE')) === null);
check('a cited disagreement and a concern: the worst is the verdict', critiqueGap(crit([AGREE, EVIDENCE, CONCERN], 'DISAGREE_EVIDENCE')) === null, String(critiqueGap(crit([AGREE, EVIDENCE, CONCERN], 'DISAGREE_EVIDENCE'))));
check('no Verdict line: not a handoff', critiqueGap('# r\n## Rows\n- AGREE · x\n')?.includes('no `Verdict:') === true);
check('no rows: not a handoff', critiqueGap(crit([], 'AGREE'))?.includes('no `## Rows`') === true);
check('a row that is not one of the three verdicts', critiqueGap(crit(['- probably fine · x'], 'AGREE'))?.includes('is not `- <AGREE') === true);
check('DISAGREE_EVIDENCE without a path:line is a concern, not evidence (the paper\'s text constraint)', critiqueGap(crit(['- DISAGREE_EVIDENCE · "one": met — looks wrong'], 'DISAGREE_EVIDENCE'))?.includes('cites no') === true);
const RANGE = '- DISAGREE_EVIDENCE · "Read-only + one Edit": met · packages/frontend/admin/src/routes/users/[id]/+page.svelte:403-404 — the Edit link is here';
check('a line range is a citation (JX-1221, 2026-10-07: `:403-404 —` was refused twice)', critiqueGap(crit([RANGE], 'DISAGREE_EVIDENCE')) === null, String(critiqueGap(crit([RANGE], 'DISAGREE_EVIDENCE'))));
check('a range without the dash and what it shows is still no citation', critiqueGap(crit(['- DISAGREE_EVIDENCE · "one": met · a.ts:403-404 is wrong'], 'DISAGREE_EVIDENCE'))?.includes('cites no') === true);
check('a verdict its rows do not come to: false consensus is refused', critiqueGap(crit([AGREE, EVIDENCE], 'AGREE'))?.includes('its rows come to DISAGREE_EVIDENCE') === true);

check('T2 header: nothing when the critic agreed or never ran', critiqueLines(crit([AGREE], 'AGREE'), 'r/CRITIQUE.md', 1).length === 0 && critiqueLines(null, 'r/CRITIQUE.md', null).length === 0);
check('T2 header: a dispute still open, beside VALIDATION.md', critiqueLines(crit([EVIDENCE], 'DISAGREE_EVIDENCE'), 'r/CRITIQUE.md', 2)[0] === 'critique: still DISAGREE_EVIDENCE after 2 exchange(s): r/CRITIQUE.md  ← read beside VALIDATION.md');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
