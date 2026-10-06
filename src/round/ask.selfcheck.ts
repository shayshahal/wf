// ask.selfcheck.ts — node ask.selfcheck.ts → exit 0 when green.
// Pure arms: a question opens, the round waits on its person, an answer closes it, the gate holds.
import { addQuestion, appendAnswer, blockedQuestion, closeQuestion, openQuestionGate, parseArgs, pendingRevisions, questionLines, researchGap, researchState, reviseState } from './ask.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail: unknown = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const t = '2026-09-24T09:00:00.000Z';
const base = { round: 'fix/x', step: 'plan', waiting_on: null, since: '2026-09-24T08:00:00.000Z' };
const one = addQuestion(base, { to: 'user', text: 'soft-delete or hide?', dflt: 'hide' }, t);
check('a question gets q1 and its asker waits', one.questions[0].n === 1 && one.waiting_on === 'user' && one.since === t, JSON.stringify(one));
check('the default is kept', one.questions[0].default === 'hide');
const two = addQuestion(one, { to: 'einat', text: 'error wording?' }, t);
check('a second question is q2; the round still waits on the oldest', two.questions[1].n === 2 && two.waiting_on === 'user', JSON.stringify(two));
check('the other fields are kept', two.round === 'fix/x' && two.step === 'plan');

let threw = '';
try { closeQuestion(two, null); } catch (e) { threw = (e as Error).message; }
check('two open and no --q → refused, naming both', threw.includes('q1') && threw.includes('q2'), threw);
const after1 = closeQuestion(two, 1, t);
check('closing q1 returns it and leaves q2', after1.question.text === 'soft-delete or hide?' && after1.state.questions.length === 1, JSON.stringify(after1));
check('the round now waits on q2\'s person', after1.state.waiting_on === 'einat', after1.state.waiting_on);
const ruled = closeQuestion(two, 1, t, 'soft-delete');
check('a closed question keeps its answer, for wf next to act on', ruled.state.answered.at(-1)!.n === 1 && ruled.state.answered.at(-1)!.answer === 'soft-delete', JSON.stringify(ruled.state.answered));
const after2 = closeQuestion(after1.state, null, t);
check('the last question closes without --q; nobody is waited on', after2.state.questions.length === 0 && after2.state.waiting_on === null, JSON.stringify(after2.state));
threw = '';
try { closeQuestion(after1.state, 7); } catch (e) { threw = (e as Error).message; }
check('an unknown q is refused', threw.includes('q7'), threw);
check('a closed question number is not reused', addQuestion(after1.state, { to: 'user', text: 'x' }, t).questions.at(-1)!.n === 3);
check('not even once every question is closed', addQuestion(after2.state, { to: 'user', text: 'x' }, t).questions.at(-1)!.n === 3, JSON.stringify(addQuestion(after2.state, { to: 'user', text: 'x' }, t).questions));

const args = parseArgs(['--q', '2', 'hide', 'them'], ['q']);
check('a valued flag and the words', args.q === '2' && args.positionals.join(' ') === 'hide them', JSON.stringify(args));
check('a boolean flag', parseArgs(['--blocked'], ['to'], ['blocked']).blocked === true);
const refused = (argv: string[]) => { try { parseArgs(argv, ['q']); return ''; } catch (e) { return (e as Error).message; } };
check('an unknown flag is refused, not read as the answer', refused(['--q2', 'x']) === 'unknown flag --q2', refused(['--q2', 'x']));
check('a valued flag with no value is refused', refused(['hide', '--q']) === '--q needs a value', refused(['hide', '--q']));

check('no open question → no gate', openQuestionGate(base) === null && openQuestionGate(after2.state) === null && openQuestionGate(null) === null);
const gate = openQuestionGate(two)!;
check('an open question gates, naming each and the way out', gate.includes('q1 → user: soft-delete or hide?') && gate.includes('q2 → einat') && gate.includes('wf decide'), gate);

const blocked = '# BJEW-1 — blocked on commit 2\r\nTried: x\r\nQuestion: may the fix touch orders.py?\r\n';
check('the Question line of a BLOCKED.md', blockedQuestion(blocked) === 'may the fix touch orders.py?', String(blockedQuestion(blocked)));
check('no Question line → null', blockedQuestion('# b\nTried: x\n') === null);
check('an answer lands under a new ## Answer', appendAnswer(blocked, 'yes, only cancel()', '2026-09-24').endsWith('Question: may the fix touch orders.py?\n\n## Answer\n2026-09-24 yes, only cancel()\n'), JSON.stringify(appendAnswer(blocked, 'yes, only cancel()', '2026-09-24')));
check('a second answer appends under the same ## Answer', appendAnswer('# b\n\n## Answer\n2026-09-23 no\n', 'yes after all', '2026-09-24') === '# b\n\n## Answer\n2026-09-23 no\n2026-09-24 yes after all\n');

check('status lines show who, the question and the default', questionLines(two).join('|') === '? q1 → user: soft-delete or hide? (default: hide)|? q2 → einat: error wording?', questionLines(two).join('|'));
check('no questions → no lines', questionLines(base).length === 0 && questionLines(null).length === 0);

// wf decide --revise: an answer that says the plan must change, from any step (BJEW-461, 2026-10-06).
const t2 = '2026-09-24T10:00:00.000Z';
const implementing = { ...base, step: 'implement', history: [{ step: 'implement', at: t }] };
const sent = reviseState(implementing, '  the confirm opens behind the modal ', t2);
check('the round goes back to plan, with the answer kept (trimmed)', sent.step === 'plan' && sent.revisions?.length === 1 && sent.revisions[0].text === 'the confirm opens behind the modal' && sent.revisions[0].at === t2 && sent.history?.at(-1)?.step === 'plan', JSON.stringify(sent));
check('a second answer is added, not replacing the first', reviseState(sent, 'and again', t2).revisions?.length === 2);
check('an open question still holds the round on its person', reviseState({ ...implementing, questions: [{ n: 5, to: 'einat', text: 'x', asked: t }] }, 'y', t2).waiting_on === 'einat');
check('a revision is pending until a plan brief is newer than it', pendingRevisions(sent.revisions, undefined).length === 1 && pendingRevisions(sent.revisions, t).length === 1 && pendingRevisions(sent.revisions, '2026-09-24T11:00:00.000Z').length === 0 && pendingRevisions(undefined, undefined).length === 0);
check('--revise is a flag of decide', parseArgs(['--revise', '--q', '2', 'x'], ['q'], ['revise']).revise === true);

// wf decide --research: new evidence sends a round that has not gone to plan back to a fresh research (BJEW-669, 2026-10-06).
const researched = researchState({ ...base, step: 'research', history: [{ step: 'research', at: t }] }, '  the three duplicate wishlist rows on QA ', t2);
check('the round stays at research, with the request kept (trimmed) and not as a plan revision', researched.step === 'research' && researched.researchRequests?.length === 1 && researched.researchRequests[0].text === 'the three duplicate wishlist rows on QA' && researched.researchRequests[0].at === t2 && !researched.revisions?.length && researched.history?.length === 1, JSON.stringify(researched));
check('a second request is added, not replacing the first', researchState(researched, 'and the seed', t2).researchRequests?.length === 2);
check('an open question still holds the round on its person', researchState({ ...base, questions: [{ n: 5, to: 'einat', text: 'x', asked: t }] }, 'y', t2).waiting_on === 'einat');
check('a request is pending until a research brief is newer than it', pendingRevisions(researched.researchRequests, t).length === 1 && pendingRevisions(researched.researchRequests, '2026-09-24T11:00:00.000Z').length === 0);
check('--research is a flag of decide', parseArgs(['--research', 'x'], ['q'], ['revise', 'research']).research === true);
check('research again is refused once the round has gone to plan, naming --revise', researchGap({ ...base, step: 'plan' })?.includes('past research') === true && researchGap({ ...base, step: 'implement' })?.includes('wf decide --revise') === true);
check('and allowed before it', researchGap({ ...base, step: 'research' }) === null && researchGap({ ...base, step: 'classify' }) === null && researchGap(null) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
