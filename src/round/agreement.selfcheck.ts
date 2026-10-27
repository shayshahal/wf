// agreement.selfcheck.ts — node agreement.selfcheck.ts → exit 0 when green.
// The round agreement (#110-#111) and its assessment format: which file is the agreement, the
// agreed-material sha T1 binds (progress edits must not invalidate it), the gap a build cannot start
// past, and the assessment verdict/intent rules.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anticipatedPaths, withoutT2Walk } from './agreement.ts';
import { agreementClass, agreementFile, agreementGap, agreementPath, agreementSha, revisionSha, assessmentGap, assessmentHead, assessmentContentSha, assessmentRulingSource, isAssessmentRulingSource, assessmentVerdict, ASSESSMENT_FILE, caseFiles, consequential, concisenessGap, notAskedFor, notAskedForGap, section, verificationCases } from './agreement.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('class A\'s agreement is the ticket; B/C have AGREEMENT.md', agreementFile('A') === 'TICKET.md' && agreementFile('B') === 'AGREEMENT.md' && agreementFile('C') === 'AGREEMENT.md');
check('consequential is B or C', consequential('B') && consequential('C') && !consequential('A') && !consequential(null));
check('a section body is read, heading excluded', section('## Observed\n- x\n\n## Agreed\n- y\n', 'Observed') === '- x\n\n');
check('anticipated paths read explicit scope and file hints, normalize and deduplicate', JSON.stringify(anticipatedPaths('## Scope\r\n- paths: `./src/shared/new.ts`, src\\api\\new.ts\r\n- Excluding: `src/ignored.ts`\r\n## Files\r\n- `src/shared/new.ts`\r\n- package.json\r\n## Notes\r\npaths: src/history.ts\r\n')) === JSON.stringify(['src/shared/new.ts', 'src/api/new.ts', 'package.json']));
check('routine prose and absent hints require no speculative file plan', anticipatedPaths('## Scope\n- Fix the label.\n').length === 0 && anticipatedPaths(null).length === 0);

const AGREEMENT = `# r — agreement
Class: B
## Observed
- the header renders at the top — \`src/Page.svelte:12\`
## Agreed
- Behavior: two columns. Excluding: the data shown.
- T2 walk: open: b2b /catalog as buyer
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | layout: sidebar | src/Page.svelte | src/Page.spec.ts::sidebar@4 |
`;
check('agreementClass reads the Class line', agreementClass(AGREEMENT) === 'B');
const cases = verificationCases(AGREEMENT);
check('a B/C agreement with observed, agreed and a case has no gap', agreementGap(AGREEMENT, 'B', 'fix/x') === null);
check('no AGREEMENT.md is a gap naming it', agreementGap(null, 'B') === `no AGREEMENT.md`);
check('an agreement with no ## Observed is a gap', (agreementGap(AGREEMENT.replace(/## Observed\n- .*\n/, ''), 'B') ?? '').includes('## Observed'));
check('an agreement with no ## Verification cases is a gap', (agreementGap(AGREEMENT.replace(/\| 1 \|[^\n]*\n/, ''), 'B') ?? '').includes('## Verification'));
check('a B/C agreement missing the walk is refused before T1', (agreementGap(AGREEMENT.replace('- T2 walk: open: b2b /catalog as buyer\n', ''), 'B') ?? '').includes('T2 walk'));
check('a blank walk is refused before T1', (agreementGap(AGREEMENT.replace('open: b2b /catalog as buyer', ''), 'C') ?? '').includes('T2 walk'));
check('an explicit no-walk reason is valid for work without a page', agreementGap(AGREEMENT.replace('open: b2b /catalog as buyer', 'none — the contract test is the proof'), 'B') === null);
// #234: T1 must admit exactly the target and preparation that show can read.
for (const target of ['the catalog', 'b2b /catalog [review note]', 'b2b /catalog <!-- note -->', '`b2b /catalog` <!-- note -->', '`b2b /catalog']) {
	check(`T1 refuses malformed open target: ${target}`, agreementGap(AGREEMENT.replace('open: b2b /catalog as buyer', `open: ${target}`), 'B') !== null);
}
check('T1 refuses malformed setup even with a valid target', agreementGap(AGREEMENT.replace('open: b2b /catalog as buyer', 'open: b2b /catalog as buyer\n  setup: cd backend && run setup'), 'B') !== null);
check('an ordinary ticket needs no agreement document', agreementGap('# t\n## Intent\n- x\n', 'A') === null);
// JX-1367 (2026-10-18): an addition no source asked for is listed on its own, so T1 rules on it.
const UNASKED = (bullet: string) => `## Agreed\n- Behavior: hold VAT with the bid.\n${bullet}- T2 walk: none — backend\n`;
check('no Not asked for bullet is a gap before T1', (notAskedForGap(UNASKED('')) ?? '').includes('Not asked for'));
check('a bare none is a gap: it must say why', (notAskedForGap(UNASKED('- **Not asked for.** none\n')) ?? '').includes('Not asked for'));
check('none with a reason passes and lists nothing', notAskedForGap(UNASKED('- **Not asked for.** none — the ticket names every change\n')) === null && notAskedFor(UNASKED('- **Not asked for.** none — the ticket names every change\n')).length === 0);
const LISTED = UNASKED('- **Not asked for.**\n  - a held-total line on the bid form — the split legs must total it\n');
check('each addition is listed on its own, and the T2 walk is not swallowed', notAskedForGap(LISTED) === null && JSON.stringify(notAskedFor(LISTED)) === JSON.stringify(['a held-total line on the bid form — the split legs must total it']));
check('files split from a case cell', caseFiles(cases[0]).join() === 'src/Page.svelte');

// The material sha: what T1 approves. A progress edit to ## Verification or the addition of a
// ## Units note must not change it; a behavior change in ## Agreed must (#111.5, #111.4).
const dir = mkdtempSync(join(tmpdir(), 'wf-agr-'));
const write = (text: string) => { writeFileSync(join(dir, 'AGREEMENT.md'), text); return agreementSha(dir, 'B', null); };
const s0 = write(AGREEMENT);
const s1 = write(AGREEMENT + '\n## Units\n1. the layout\n');
check('a ## Units progress note does not change the agreed material sha', s1 === s0, `${s0} vs ${s1}`);
const s2 = write(AGREEMENT.replace('| 1 | layout: sidebar | src/Page.svelte | src/Page.spec.ts::sidebar@4 |', '| 1 | layout: sidebar | src/Page.svelte, src/Helper.ts | src/Page.spec.ts::sidebar@4 |'));
check('adding an ordinary helper to a case does not renew T1 (the case is working detail)', s2 === s0, `${s0} vs ${s2}`);
const s3 = write(AGREEMENT.replace('two columns', 'three columns'));
check('a behavior change in ## Agreed changes the sha (renewed agreement)', s3 !== s0);
for (const marker of ['T2 walk:', '**T2 walk.**']) {
	for (const newline of ['\n', '\r\n']) {
		const base = AGREEMENT.replace('T2 walk:', marker).replace('## Verification', '- **Not asked for.** none - the request covers everything\n- Exclusions: preserve the data.\n## Verification').replace(/\n/g, newline);
		const sha = write(base);
		const edited = base.replace('open: b2b /catalog as buyer', `open: admin /orders${newline}  ready: script ["node","scenario.mjs","ready"]${newline}  setup: script ["node","scenario.mjs","prepare"]`);
		check(`recipe-only edits preserve T1 sha (${marker}, ${JSON.stringify(newline)})`, write(edited) === sha);
		for (const [before, after] of [['two columns', 'three columns'], ['the header renders', 'the header fails'], ['the request covers everything', 'a new control'], ['preserve the data', 'replace the data']]) {
			check(`sibling material stays T1 bound: ${before}`, write(edited.replace(before, after)) !== sha);
		}
	}
}
for (const newline of ['\n', '\r\n']) {
	const before = ['## Observed', '- a fact', '## Agreed', '- Behavior: keep this.', '- T2 walk: open: b2b /x', '  setup: a command', '- Note: keep this too.', '  Including this sibling continuation.', '## Verification', '| 1 | a | b | c |', ''].join(newline);
	const expected = before.replace(['- T2 walk: open: b2b /x', '  setup: a command', ''].join(newline), '');
	check(`walk stripping preserves every sibling byte (${JSON.stringify(newline)})`, withoutT2Walk(before) === expected);
}
check('walk stripping does not interpret an Observed walk as working detail', withoutT2Walk('## Observed\n- T2 walk: a fact\n## Agreed\n- Behavior: x\n') === '## Observed\n- T2 walk: a fact\n## Agreed\n- Behavior: x\n');
check('a path is the agreement file for the class', agreementPath(dir, 'B', null) === join(dir, 'AGREEMENT.md'));
const ticket = writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- x\n\n## Repro\ncommand: yarn repro\n');
void ticket;
const a0 = agreementSha(dir, 'A', null);
writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- x\n\n## Repro\ncommand: yarn other\n');
check('a class A sha binds ## Intent, not the mutable ## Repro command', agreementSha(dir, 'A', null) === a0);
writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- y\n');
check('a changed ## Intent changes the class A sha', agreementSha(dir, 'A', null) !== a0);
const r0 = (t: string) => { writeFileSync(join(dir, 'TICKET.md'), t); return revisionSha(dir, 'A', null); };
const rBase = '# t\n\n## Intent\n- x\n\n## Agreed\n- a\n';
const r1 = r0(rBase);
check('class A revisionSha ignores ## Decisions (wf decide appends it)', r0(rBase + '\n## Decisions\n- q1\n') === r1);
check('class A revisionSha moves when ## Agreed changes', r0(rBase.replace('- a', '- b')) !== r1);
check('class A revisionSha moves when ## Verification is added', r0(rBase + '\n## Verification\n| 1 | m |\n') !== r1);
rmSync(dir, { recursive: true, force: true });

// The assessment format.
const assess = (patch: { verdict?: string; head?: string; material?: string; intent?: string; agreement?: string; design?: string } = {}) => `# r — assessment
Verdict: ${patch.verdict ?? 'clean'}
head: ${patch.head ?? 'abc123'}
## Intent
${patch.intent ?? '- "x": met: a.ts:1 · before: red · after: green'}
## Agreement
${patch.agreement ?? (patch.material ? `material: ${patch.material}` : 'none')}
${patch.design ? `## Design\n${patch.design}\n` : ''}`;
check('a complete header needs no prose grammar', assessmentGap('Verdict: clean\nhead: H1\n') === null);
check('no assessment is a gap', assessmentGap(null) === `no ${ASSESSMENT_FILE}`);
check('missing verdict is a gap', assessmentGap('head: H1\n') !== null);
check('unknown verdict is a gap', assessmentGap('Verdict: maybe\nhead: H1\n') !== null);
check('missing head is a gap', assessmentGap('Verdict: clean\n') !== null);
// The ruling owns the judgment: only the explicit verdict and measured head are machine-read. Prose
// above a verdict — an unmet intent, a surviving agreed effect, a material note, an unmeasured case —
// no longer changes the gate; the verdict the reviewer wrote does.
for (const verdict of ['clean', 'repair', 'blocked']) {
	for (const prose of ['## Intent\n- looks fine', '## Intent\n- not met: still broken', '## Agreement\nsurviving: alternate path\nmaterial: scope changed', '## Live\nNOT MEASURED — unavailable']) {
		check(`${verdict} does not interpret ${prose}`, assessmentGap(`Verdict: ${verdict}\nhead: H1\n${prose}\n`) === null);
	}
}
check('assessment content identity normalizes checkout newlines', assessmentContentSha(assess()) === assessmentContentSha(assess().replace(/\n/g, '\r\n')));
check('assessment content identity changes with prose', assessmentContentSha(assess()) !== assessmentContentSha(assess() + 'new judgment\n'));
check('assessment ruling source is recognized', isAssessmentRulingSource(assessmentRulingSource(assess())));
check('unrelated source is not an assessment ruling', !isAssessmentRulingSource('BLOCKED.md'));

// A class B/C agreement is short enough to read at T1: caps on Observed, Agreed and Verification.
const wordsOf = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const shortAgreement = `# A\n\n## Observed\n- ${wordsOf(20)}\n- b\n\n## Agreed\n- **Behavior.** ${wordsOf(22)}\n- **T2 walk.** open: b2b /x as buyer\n  ready: api a {} as buyer ${wordsOf(40)}\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | a | \`p\` | \`c\` |\n`;
check('a short agreement is within the caps', concisenessGap(shortAgreement) === null, String(concisenessGap(shortAgreement)));
check('the T2 walk recipe is exempt from the word cap', concisenessGap(shortAgreement) === null);
check('an Observed bullet over 20 words is named', /## Observed, 21 words/.test(concisenessGap(shortAgreement.replace(wordsOf(20), wordsOf(21))) ?? ''));
check('more than 5 Observed bullets is named', /## Observed has 6 bullets/.test(concisenessGap(shortAgreement.replace('- b\n', '- b\n- c\n- d\n- e\n- f\n')) ?? ''));
check('an Agreed bullet over 25 words is named, with its start', /## Agreed, 26 words .*Behavior/.test(concisenessGap(shortAgreement.replace(wordsOf(22), wordsOf(25))) ?? ''));
check('a wrapped bullet counts as one', /## Agreed, 3\d words/.test(concisenessGap(shortAgreement.replace(`${wordsOf(22)}\n`, `${wordsOf(22)}\n  ${wordsOf(10)}\n`)) ?? ''));
check('more than 6 verification rows is named', /## Verification has 7 rows/.test(concisenessGap(shortAgreement + [2, 3, 4, 5, 6, 7].map((n) => `| ${n} | a | \`p\` | \`c\` |\n`).join('')) ?? ''));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
