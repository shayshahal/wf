// handoff.selfcheck.ts — node handoff.selfcheck.ts → exit 0 when green.
// Pure arms: what each phase hands off and whether it answers the last brief (handoff.ts), and the
// handoff a brief ends with (brief.ts). Nothing is run.
import { briefGap, handoffText } from './brief.ts';
import { briefKey, briefsAfter, handoffGap, planAsks, planClass, rowDone, runsAfter, tokenOf, validationVerdict } from './handoff.ts';

let failures = 0;
const check = (name: string, cond: boolean | undefined, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const research = '# r\r\n## Repro\r\ncommand: pnpm x\r\nred output:\r\n<!-- brief: 3f9a1c -->\r\n';
check('the token is read from its HTML comment, CRLF or not', tokenOf(research) === '3f9a1c' && tokenOf('no token') === null);
// A revised plan voids the implement briefs, and the count of agents that ran must survive it.
const before = { research: { token: 'a', at: 't', count: 1 }, 'implement 1': { token: 'b', at: 't', count: 1 }, 'implement 2': { token: 'c', at: 't', count: 2 }, plan: { token: 'd', at: 't', count: 1 } };
const voided = Object.keys(briefsAfter('plan', ['plan', '--revise'], before)).join();
check('a revised plan voids the implement briefs', voided === 'research,plan', voided);
const counted = runsAfter({ research: 1, implement: 2 }, 'implement');
check('the agent counts survive it: the phase is tallied, nothing is removed', JSON.stringify(counted) === '{"research":1,"implement":3}', JSON.stringify(counted));
check('the first brief of a phase is 1', runsAfter(undefined, 'plan').plan === 1);
check('the last token wins', tokenOf('<!-- brief: aaa -->\n<!-- brief: bbb -->') === 'bbb');
check('RESEARCH.md answering the brief, with a repro command: handed off', handoffGap('research', research, { token: '3f9a1c' }) === null);
check('another brief\'s file is not the handoff', handoffGap('research', research, { token: '000000' })?.includes('not the answer to the last brief'));
check('before plan: a RESEARCH.md with no repro command is refused', handoffGap('research', '# r\n## Repro\nred output:\n', null) === 'RESEARCH.md ## Repro has no `command:` line');
check('no file at all', handoffGap('plan', null, { token: 'x' }) === 'no PLAN.md');
check('before implement: a PLAN.md with no commit rows is refused', handoffGap('plan', '# p\n## Commits\n| # | message | files | check |\n', null) === 'PLAN.md ## Commits has no rows');
check('before deliver: a VALIDATION.md with no verdict is refused', handoffGap('validate', '# v\nVerdict: pending\n', null)?.includes('no `Verdict:'));
const intent = (lines: string[]) => `Verdict: matches plan\n\n## Intent\n${lines.join('\n')}\n`;
const MET = '"time kept before the date": met: DateTimePicker.svelte:100 \u00b7 before: 12:00 AM (RESEARCH.md red output) \u00b7 after: 10:00 PM (repro green)';
check('a round begun before briefs is judged on its sections alone', handoffGap('validate', intent([MET]), undefined) === null);
check('Intent: met with a before and an after, NOT MEASURED, not met and left out are verdicts', handoffGap('validate', intent([MET, '"hover": NOT MEASURED \u2014 CalendarPanel.svelte:195 \u00b7 research did not measure hover', '"x": not met: no handler', '"y": left out: the admin picker']), null) === null);
check('Intent: met from the code alone is refused (the TJEW-682 replay\'s month dropdown)', handoffGap('validate', intent(['"months scroll on wheel, not hover": met: CalendarPanel.svelte:195']), null)?.includes('without a before: and an after:'));
check('Intent: a line with no verdict is refused', handoffGap('validate', intent(['"popover width": fine']), null)?.includes('has no verdict'));
const REVERSED = '"Read-only + one Edit in the top bar": changed at T2 #5 (PM: click-to-edit, no edit page)';
check('Intent: a line a later ruling reversed, as `left out: overruled by …`, passes', handoffGap('validate', intent(['"Read-only + one Edit": left out: overruled by PM at T2 #5 (REVIEW.md): "edit is in the page, means no edit page. remove it entirely"']), null) === null);
check('Intent: "changed at T2" is refused, and the message says what to write', (() => { const g = handoffGap('validate', intent([REVERSED]), null); return !!g?.includes('has no verdict') && g.includes('left out: overruled by <who, when, the ruling quoted>'); })());
check('Intent: a bare `left out:` is refused', handoffGap('validate', intent(['"x": left out:']), null)?.includes('left out with no reason'));
check('Intent: no section is refused', handoffGap('validate', 'Verdict: matches plan\n', null)?.includes('no `## Intent` lines'));
check('verdicts', validationVerdict('Verdict: deviates\n') === 'deviates' && validationVerdict('Verdict: matches plan — all rows') === 'matches plan');
check('class line', planClass('# p\nClass: B — a contract path\n') === 'B' && planClass('# p\n') === null);

const asks = planAsks('## Asks\n- Round to 2 places? — default: 2\n- Which label\n\n## Other\n- not an ask\n');
check('Asks: one per line, with its default when it has one', asks.length === 2 && asks[0].text === 'Round to 2 places?' && asks[0].dflt === '2' && asks[1].dflt === null, JSON.stringify(asks));
check('Asks: "none", or no section, is none', planAsks('## Asks\n- none\n').length === 0 && planAsks('## Asks\nnone\n').length === 0 && planAsks('# p\n').length === 0);

const row = { n: 2, message: '`fix(x): two`' };
check('a row is done with its commit and a green check', rowDone(row, { subjects: ['fix(x): two'], checks: [{ row: 2, result: 'green' }] }));
check('not without the green check, not with another row\'s', !rowDone(row, { subjects: ['fix(x): two'], checks: [{ row: 1, result: 'green' }, { row: 2, result: 'red' }] }));
check('brief keys: implement carries its row, standards its rule', briefKey('implement', 3) === 'implement 3' && briefKey('standards', 'api/errors') === 'standards api/errors' && briefKey('plan', '--revise') === 'plan');
check('a standards report is judged on its own file\'s sections', handoffGap('standards', 'Result: maybe\n<!-- brief: aa -->', { token: 'aa' }, 'standards/perf.md') === 'standards/perf.md has no `Result: pass | issues` line' && handoffGap('standards', null, null, 'standards/perf.md') === 'no standards/perf.md');

check('a file phase is told the exact token line', handoffText({ phase: 'research', folder: 'bug-reports/r', token: 'abc123' }).includes('End `bug-reports/r/RESEARCH.md` with this line, exactly: `<!-- brief: abc123 -->`'));
check('a critique is judged on its rows and verdict, and the validate --answer brief keys as validate', handoffGap('critique', '## Rows\n- AGREE · x\n<!-- brief: aa -->', { token: 'aa' })?.includes('no `Verdict: AGREE') === true && handoffGap('critique', null, null) === 'no CRITIQUE.md' && briefKey('validate', '--answer') === 'validate');
check('a standards agent is told its own report file', handoffText({ phase: 'standards', folder: 'f', token: 'abc123', file: 'standards/api/errors.md' }).includes('End `f/standards/api/errors.md` with this line, exactly: `<!-- brief: abc123 -->`'));
check('implement hands off its commit, no token', !handoffText({ phase: 'implement', folder: 'f', token: 'abc123' }).includes('abc123'));

// ── a brief only for what wf next dispatches (brief.ts briefGap)
const nextSays = "dispatch implement 1: run `node C:/wf/wf.mjs brief implement 1` in this worktree and do exactly what it prints";
check("the brief wf next dispatches is given, with the model it names", briefGap(["implement", "1"], "dispatch implement 1 (model: opus): run x") === null && briefGap(["implement", "1"], "dispatch implement 10 (model: opus): run x") !== null);
check("the brief wf next dispatches is given", briefGap(["implement", "1"], nextSays) === null && briefGap(["plan", "--revise"], "dispatch plan --revise: run x") === null);
check("any other is refused, naming wf prompt for a preview", briefGap(["plan", "--revise"], nextSays)?.includes("wf prompt plan --revise") && briefGap(["implement", "2"], nextSays) !== null && briefGap(["implement", "1"], "wait user: q1 x")?.includes("it says: wait user: q1 x"));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
