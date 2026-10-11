// agreement.selfcheck.ts — node agreement.selfcheck.ts → exit 0 when green.
// The round agreement (#110-#111) and its assessment format: which file is the agreement, the
// agreed-material sha T1 binds (progress edits must not invalidate it), the gap a build cannot start
// past, and the assessment verdict/intent rules.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agreementClass, agreementFile, agreementGap, agreementPath, agreementSha, assessmentGap, assessmentHead, assessmentMaterial, assessmentVerdict, ASSESSMENT_FILE, caseFiles, consequential, intentGap, section, verificationCases } from './agreement.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('class A\'s agreement is the ticket; B/C have AGREEMENT.md', agreementFile('A') === 'TICKET.md' && agreementFile('B') === 'AGREEMENT.md' && agreementFile('C') === 'AGREEMENT.md');
check('consequential is B or C', consequential('B') && consequential('C') && !consequential('A') && !consequential(null));
check('a section body is read, heading excluded', section('## Observed\n- x\n\n## Agreed\n- y\n', 'Observed') === '- x\n\n');

const AGREEMENT = `# r — agreement
Class: B
## Observed
- the header renders at the top — \`src/Page.svelte:12\`
## Agreed
- Behavior: two columns. Excluding: the data shown.
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
check('an ordinary ticket needs no agreement document', agreementGap('# t\n## Intent\n- x\n', 'A') === null);
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
check('a path is the agreement file for the class', agreementPath(dir, 'B', null) === join(dir, 'AGREEMENT.md'));
const ticket = writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- x\n\n## Repro\ncommand: yarn repro\n');
void ticket;
const a0 = agreementSha(dir, 'A', null);
writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- x\n\n## Repro\ncommand: yarn other\n');
check('a class A sha binds ## Intent, not the mutable ## Repro command', agreementSha(dir, 'A', null) === a0);
writeFileSync(join(dir, 'TICKET.md'), '# t\n\n## Intent\n- y\n');
check('a changed ## Intent changes the class A sha', agreementSha(dir, 'A', null) !== a0);
rmSync(dir, { recursive: true, force: true });

// The assessment format.
const assess = (patch: { verdict?: string; head?: string; material?: string; intent?: string } = {}) => `# r — assessment
Verdict: ${patch.verdict ?? 'clean'}
head: ${patch.head ?? 'abc123'}
## Intent
${patch.intent ?? '- "x": met: a.ts:1 · before: red · after: green'}
## Agreement
${patch.material ? `material: ${patch.material}` : 'none'}
`;
check('the assessment verdict is read', assessmentVerdict(assess()) === 'clean' && assessmentVerdict(assess({ verdict: 'repair' })) === 'repair' && assessmentVerdict(assess({ verdict: 'blocked' })) === 'blocked');
check('the assessment head is read', assessmentHead(assess({ head: 'H1' })) === 'H1');
check('a material line under ## Agreement is read', assessmentMaterial(assess({ material: 'the API shape moved' })) === 'the API shape moved' && assessmentMaterial(assess()) === null);
check('a clean assessment with a measured intent has no gap', assessmentGap(assess()) === null);
check('no ASSESSMENT.md is a gap naming it', assessmentGap(null) === `no ${ASSESSMENT_FILE}`);
check('a VERDICT-less assessment is a gap', (assessmentGap(assess().replace(/^Verdict:.*\n/m, '')) ?? '').includes('Verdict'));
check('an intent line with no verdict is a gap', (assessmentGap(assess({ intent: '- "x": looks fine' })) ?? '').includes('has no verdict'));
check('a met line without before/after is a gap', (assessmentGap(assess({ intent: '- "x": met: a.ts:1' })) ?? '').includes('before'));
check('NOT MEASURED and left out: are verdicts', intentGap('## Intent\n- "x": NOT MEASURED\n- "y": left out: moved to a new ticket\n') === null);
check('an empty left out: is a gap', (intentGap('## Intent\n- "y": left out:\n') ?? '').includes('no reason'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
