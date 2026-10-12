// build-units.selfcheck.ts — node build-units.selfcheck.ts → exit 0 when green.
// The `## Units` build plan: which agreements build as one slice, which tables are refused (case
// ownership, numbering, dependencies), the plan sha a progress record is bound to, and the walk from
// the first unit through checkpoint reviews to the final integration.
import { advanceSlice, initializeSlices, parseBuildUnits, sliceContext, sliceProgressGap } from './build-units.ts';
import type { BuildPlan, SliceProgress, UnitSlice } from './build-units.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const throws = (f: () => unknown): boolean => {
	try {
		f();
		return false;
	} catch (e) {
		return e instanceof Error;
	}
};

const VERIFICATION = `## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | schema: column | db/schema.sql | db/schema.spec.ts::column@3 |
| 2 | schema: index | db/schema.sql | db/schema.spec.ts::index@9 |
| 3 | api: endpoint | src/api.ts | src/api.spec.ts::endpoint@4 |
| 4 | ui: list | src/List.svelte | src/List.spec.ts::list@2 |
`;
const TABLE = `## Units
| # | unit | cases | depends on | review after |
|---|---|---|---|---|
| 1 | the schema | 1, 2 | — | — |
| 2 | the API | 3 | 1 | API shape |
| 3 | the list | 4 | 1 2 | — |
`;
const agreement = (units: string, verification = VERIFICATION) => `# r — agreement\nClass: C\n## Observed\n- x — a.ts:1\n## Agreed\n- y\n${verification}${units}`;
const why = (text: string): string => { const p = parseBuildUnits(text); return p.kind === 'invalid' ? p.why : `(${p.kind})`; };

// Which agreements are a plan at all.
check('no ## Units builds as one slice', parseBuildUnits(agreement('')).kind === 'single');
check('the old prose ## Units note builds as one slice', parseBuildUnits(agreement('## Units\n1. the layout\n2. the data\n')).kind === 'single');
check('a table without the # / unit header builds as one slice', parseBuildUnits(agreement('## Units\n| step | note |\n|---|---|\n| a | b |\n')).kind === 'single');
check('no agreement builds as one slice', parseBuildUnits(null).kind === 'single');

const parsed = parseBuildUnits(agreement(TABLE));
check('a structured table is a plan', parsed.kind === 'units', JSON.stringify(parsed));
const plan = parsed as BuildPlan;
check('units are read with cases, dependencies and the review label',
	JSON.stringify(plan.units) === JSON.stringify([
		{ n: 1, title: 'the schema', cases: [1, 2], depends: [], reviewAfter: null },
		{ n: 2, title: 'the API', cases: [3], depends: [1], reviewAfter: 'API shape' },
		{ n: 3, title: 'the list', cases: [4], depends: [1, 2], reviewAfter: null },
	]), JSON.stringify(plan.units));

// Refused tables.
const row = (r: string) => agreement(TABLE.replace('| 3 | the list | 4 | 1 2 | — |', r));
check('wrong columns are refused', why(agreement('## Units\n| # | unit | cases |\n|---|---|---|\n| 1 | a | 1 |\n')).includes('columns'));
check('a table with no rows is refused', why(agreement('## Units\n| # | unit | cases | depends on | review after |\n|---|---|---|---|---|\n')).includes('no units'));
check('a short row is refused', why(row('| 3 | the list | 4 |')).includes('cells'));
check('a unit id beyond safe integers is refused', why(row('| 99999999999999999999 | the list | 4 | — | — |')).includes('positive unit number'));
check('a non-numeric unit number is refused', why(row('| x | the list | 4 | — | — |')).includes('positive unit number'));
check('unit 0 is refused', why(agreement('## Units\n| # | unit | cases | depends on | review after |\n|---|---|---|---|---|\n| 0 | all | 1 2 3 4 | — | — |\n')).includes('positive'));
check('a repeated unit number is refused', why(row('| 2 | the list | 4 | 1 | — |')).includes('ascending'));
check('a descending unit number is refused', why(agreement(TABLE.replace('| 1 | the schema', '| 5 | the schema').replace('| the API | 3 | 1 |', '| the API | 3 | 5 |'))).includes('unit 2 comes after unit 5'));
check('an empty title is refused', why(row('| 3 |  | 4 | — | — |')).includes('no title'));
check('a unit with no cases is refused', why(row('| 3 | the list | — | — | — |')).includes('no cases'));
check('a non-numeric case id is refused', why(row('| 3 | the list | 4a | — | — |')).includes('"4a"'));
check('a case named twice in a unit is refused', why(row('| 3 | the list | 4, 4 | — | — |')).includes('twice'));
check('a case not in ## Verification is refused', why(row('| 3 | the list | 4, 9 | — | — |')).includes('case 9'));
check('a case in two units is refused', why(row('| 3 | the list | 3, 4 | — | — |')).includes('case 3 is in unit 2 and unit 3'));
check('a case in no unit is refused', why(row('| 3 | the list | — | — | — |').replace('| — | — | — |', '| 4 | — | — |').replace('| 1, 2 |', '| 1 |')).includes('case 2 is in no unit'));
check('a duplicated ## Verification case is refused', why(agreement(TABLE, VERIFICATION + '| 4 | ui: again | src/List.svelte | x |\n')).includes('case 4 twice'));
check('a dependency on a later unit is refused', why(agreement(TABLE.replace('| the API | 3 | 1 |', '| the API | 3 | 3 |'))).includes('depends on unit 3'));
check('a dependency on itself is refused', why(agreement(TABLE.replace('| the API | 3 | 1 |', '| the API | 3 | 2 |'))).includes('depends on unit 2'));
check('a dependency on a missing unit is refused', why(row('| 3 | the list | 4 | 7 | — |')).includes('depends on unit 7'));

// The plan sha freezes scheduling, not mutable verification working detail.
const sha = (text: string) => { const p = parseBuildUnits(text); return p.kind === 'units' ? p.sha : `(${p.kind})`; };
check('the plan sha is deterministic', sha(agreement(TABLE)) === plan.sha && /^[0-9a-f]{64}$/.test(plan.sha));
check('re-aligning the table keeps the sha', sha(agreement(TABLE.replace('| 1 | the schema | 1, 2 | — | — |', '|1|the schema|1, 2|—|—|'))) === plan.sha);
check('a changed title changes the sha', sha(agreement(TABLE.replace('the API', 'the endpoint'))) !== plan.sha);
check('a changed review label changes the sha', sha(agreement(TABLE.replace('API shape', 'API names'))) !== plan.sha);
check('adding a helper to a verification case keeps the execution plan', sha(agreement(TABLE, VERIFICATION.replace('src/api.ts', 'src/api.ts, src/db.ts'))) === plan.sha);
check('a change in ## Agreed is not the plan', sha(agreement(TABLE).replace('- y', '- z')) === plan.sha);

// Progress shape (what readState refuses).
const start = initializeSlices(plan, 'h0');
check('initialization starts unit 1 at head', JSON.stringify(start) === JSON.stringify({ planSha: plan.sha, unit: 1, base: 'h0', reviewBase: 'h0', completed: [] }));
check('a well-formed or absent slices has no gap', sliceProgressGap(start) === null && sliceProgressGap(undefined) === null);
check('null slices is a gap', sliceProgressGap(null) !== null);
check('a missing planSha is a gap', (sliceProgressGap({ ...start, planSha: '' }) ?? '').includes('planSha'));
check('a fractional unit is a gap', (sliceProgressGap({ ...start, unit: 1.5 }) ?? '').includes('slices.unit'));
check('a missing base is a gap', (sliceProgressGap({ ...start, base: undefined }) ?? '').includes('slices.base'));
check('a missing reviewBase is a gap', (sliceProgressGap({ ...start, reviewBase: 3 }) ?? '').includes('reviewBase'));
check('a malformed reviewRepair flag is refused', (sliceProgressGap({ ...start, reviewRepair: 'yes' }) ?? '').includes('reviewRepair'));
check('a non-list completed is a gap', (sliceProgressGap({ ...start, completed: {} }) ?? '').includes('not a list'));
check('a malformed completed entry is a gap', (sliceProgressGap({ ...start, unit: 2, completed: [{ n: 1, head: 'h1' }] }) ?? '').includes('{ n, head, reviewed }'));
check('a repeated completed unit is a gap', (sliceProgressGap({ ...start, unit: 3, completed: [{ n: 1, head: 'h1', reviewed: false }, { n: 1, head: 'h2', reviewed: false }] }) ?? '').includes('after unit 1'));
check('an active unit already completed is a gap', (sliceProgressGap({ ...start, unit: 1, completed: [{ n: 1, head: 'h1', reviewed: false }] }) ?? '').includes('not after'));

// The walk: unit 1 → unit 2 (checkpoint review) → unit 3 → integration.
const text = agreement(TABLE);
check('a plan without progress is pending', sliceContext(text).kind === 'pending');
check('one slice without progress stays single', sliceContext(agreement('')).kind === 'single');
check('an invalid table is invalid with or without progress', sliceContext(row('| 3 | the list | 9 | — | — |')).kind === 'invalid' && sliceContext(row('| 3 | the list | 9 | — | — |'), start).kind === 'invalid');
const c1 = sliceContext(text, start) as UnitSlice;
check('unit 1 is active with its own files and bases', c1.kind === 'unit' && c1.unit.n === 1 && c1.base === 'h0' && c1.reviewBase === 'h0' && c1.assessmentFile === 'ASSESSMENT-unit-1.md' && c1.reviewFile === 'REVIEW-unit-1.md', JSON.stringify(c1));
const p2 = advanceSlice(c1, start, 'h1', { reviewed: false });
check('finishing unit 1 starts unit 2 at its head, review base unmoved', p2.unit === 2 && p2.base === 'h1' && p2.reviewBase === 'h0' && JSON.stringify(p2.completed) === JSON.stringify([{ n: 1, head: 'h1', reviewed: false }]));
check('advancing does not mutate the old progress', start.completed.length === 0 && start.unit === 1);
const c2 = sliceContext(text, p2) as UnitSlice;
check('unit 2 is active from unit 1\'s head', c2.kind === 'unit' && c2.unit.n === 2 && c2.base === 'h1' && c2.reviewBase === 'h0' && c2.assessmentFile === 'ASSESSMENT-unit-2.md');
check('a normal build owns only its unit, while its checkpoint covers earlier unreviewed units', c2.cases.join(',') === '3' && c2.reviewUnits.map((u) => u.n).join(',') === '1,2');
const chunkRepair = sliceContext(text, { ...p2, reviewRepair: true }) as UnitSlice;
check('checkpoint repair owns the whole reviewed chunk, not later units', chunkRepair.reviewRepair && chunkRepair.cases.join(',') === '1,2,3');
check('advancing a repaired chunk clears its repair scope', !advanceSlice(chunkRepair, { ...p2, reviewRepair: true }, 'h2', { reviewed: true }).reviewRepair);
check('unit 2 cannot complete without its checkpoint review', throws(() => advanceSlice(c2, p2, 'h2', { reviewed: false })));
check('a stale context cannot advance newer progress', throws(() => advanceSlice(c1, p2, 'h2', { reviewed: false })));
check('advancing needs a head', throws(() => advanceSlice(c1, start, '', { reviewed: false })));
const p3 = advanceSlice(c2, p2, 'h2', { reviewed: true });
check('a reviewed unit moves the review base', p3.unit === 3 && p3.base === 'h2' && p3.reviewBase === 'h2' && p3.completed.at(-1)?.reviewed === true);
const unreviewed: SliceProgress = { ...p3, completed: [p3.completed[0], { n: 2, head: 'h2', reviewed: false }] };
check('progress claiming unit 2 done without its review is invalid', (() => { const c = sliceContext(text, unreviewed); return c.kind === 'invalid' && c.why.includes('checkpoint review'); })());
const c3 = sliceContext(text, p3) as UnitSlice;
const pEnd = advanceSlice(c3, p3, 'h3', { reviewed: false });
check('finishing the last unit leaves the integration active', pEnd.unit === null && pEnd.base === 'h3' && pEnd.reviewBase === 'h2' && pEnd.completed.map((c) => c.n).join() === '1,2,3');
const end = sliceContext(text, pEnd);
check('the integration writes the round\'s ASSESSMENT.md and REVIEW.md from the last reviewed commit',
	end.kind === 'integration' && end.base === 'h2' && end.assessmentFile === 'ASSESSMENT.md' && end.reviewFile === 'REVIEW.md' && end.plan.sha === plan.sha, JSON.stringify(end));

// Progress that does not belong to the agreement's current plan.
const invalid = (p: SliceProgress, t = text): string => { const c = sliceContext(t, p); return c.kind === 'invalid' ? c.why : `(${c.kind})`; };
check('a changed plan refuses the old progress', invalid(p2, agreement(TABLE.replace('the API', 'the endpoint'))).includes('changed'));
check('changing verification working detail keeps progress', sliceContext(agreement(TABLE, VERIFICATION.replace('src/api.ts', 'src/other.ts')), p2).kind === 'unit');
check('progress on an agreement whose table is gone is invalid', invalid(p2, agreement('')).includes('no ## Units'));
check('a checkpoint-free unit cannot claim a review repair', invalid({ ...start, reviewRepair: true }).includes('no checkpoint'));
check('the integration cannot claim a unit review repair', invalid({ ...pEnd, reviewRepair: true }).includes('integration cannot'));
check('the first build and review bases must match', invalid({ ...start, reviewBase: 'wrong' }).includes('same commit'));
check('a later unit must start at the last completed head', invalid({ ...p2, base: 'wrong' }).includes('last completed unit head'));
check('a later review chunk must start at the last reviewed head', invalid({ ...p3, reviewBase: 'wrong' }).includes('last reviewed unit head'));
check('corrupt progress is invalid', invalid({ ...p2, base: '' }).includes('slices.base'));
check('skipping a unit is invalid', invalid({ ...p2, unit: 3 }).includes('unit 2 is next'));
check('completing out of plan order is invalid', invalid({ ...p3, unit: null, completed: [p3.completed[0], { n: 3, head: 'h2', reviewed: true }] }).includes('not unit 2'));
check('the integration before every unit is done is invalid', invalid({ ...p2, unit: null }).includes('the integration'));
check('an active unit after every unit is done is invalid', invalid({ ...pEnd, unit: 4 }).includes('every unit is complete'));
check('completed units beyond the plan are invalid', invalid({ ...pEnd, completed: [...pEnd.completed, { n: 4, head: 'h4', reviewed: false }] }).includes('completed unit 4'));

// A one-unit plan goes straight from its unit to the integration.
const solo = parseBuildUnits(agreement('## Units\n| # | unit | cases | depends on | review after |\n|---|---|---|---|---|\n| 1 | all | 1 2 3 4 | none | before merge |\n')) as BuildPlan;
const soloStart = initializeSlices(solo, 's0');
const soloText = agreement('## Units\n| # | unit | cases | depends on | review after |\n|---|---|---|---|---|\n| 1 | all | 1 2 3 4 | none | before merge |\n');
const soloEnd = advanceSlice(sliceContext(soloText, soloStart) as UnitSlice, soloStart, 's1', { reviewed: true });
const soloCtx = sliceContext(soloText, soloEnd);
check('a one-unit plan reaches the integration from its reviewed head', soloCtx.kind === 'integration' && soloCtx.base === 's1', JSON.stringify(soloCtx));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
