// ask.selfcheck.mjs — node ask.selfcheck.mjs → exit 0 when green.
// Pure arms: a question opens, the round waits on its person, an answer closes it, the gate holds.
import { addQuestion, appendAnswer, blockedQuestion, closeQuestion, openQuestionGate, parseArgs, questionLines } from './ask.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const t = '2026-09-24T09:00:00.000Z';
const base = { round: 'fix/x', step: 'plan', waiting_on: null, since: '2026-09-24T08:00:00.000Z' };
const one = addQuestion(base, { to: 'shay', text: 'soft-delete or hide?', dflt: 'hide' }, t);
check('a question gets q1 and its asker waits', one.questions[0].n === 1 && one.waiting_on === 'shay' && one.since === t, JSON.stringify(one));
check('the default is kept', one.questions[0].default === 'hide');
const two = addQuestion(one, { to: 'einat', text: 'error wording?' }, t);
check('a second question is q2; the round still waits on the oldest', two.questions[1].n === 2 && two.waiting_on === 'shay', JSON.stringify(two));
check('the other fields are kept', two.round === 'fix/x' && two.step === 'plan');

let threw = '';
try { closeQuestion(two, null); } catch (e) { threw = e.message; }
check('two open and no --q → refused, naming both', threw.includes('q1') && threw.includes('q2'), threw);
const after1 = closeQuestion(two, 1, t);
check('closing q1 returns it and leaves q2', after1.question.text === 'soft-delete or hide?' && after1.state.questions.length === 1, JSON.stringify(after1));
check('the round now waits on q2\'s person', after1.state.waiting_on === 'einat', after1.state.waiting_on);
const after2 = closeQuestion(after1.state, null, t);
check('the last question closes without --q; nobody is waited on', after2.state.questions.length === 0 && after2.state.waiting_on === null, JSON.stringify(after2.state));
threw = '';
try { closeQuestion(after1.state, 7); } catch (e) { threw = e.message; }
check('an unknown q is refused', threw.includes('q7'), threw);
check('a closed question number is not reused', addQuestion(after1.state, { to: 'shay', text: 'x' }, t).questions.at(-1).n === 3);
check('not even once every question is closed', addQuestion(after2.state, { to: 'shay', text: 'x' }, t).questions.at(-1).n === 3, JSON.stringify(addQuestion(after2.state, { to: 'shay', text: 'x' }, t).questions));

const args = parseArgs(['--q', '2', 'hide', 'them'], ['q']);
check('a valued flag and the words', args.q === '2' && args.positionals.join(' ') === 'hide them', JSON.stringify(args));
check('a boolean flag', parseArgs(['--blocked'], ['to'], ['blocked']).blocked === true);
const refused = (argv) => { try { parseArgs(argv, ['q']); return ''; } catch (e) { return e.message; } };
check('an unknown flag is refused, not read as the answer', refused(['--q2', 'x']) === 'unknown flag --q2', refused(['--q2', 'x']));
check('a valued flag with no value is refused', refused(['hide', '--q']) === '--q needs a value', refused(['hide', '--q']));

check('no open question → no gate', openQuestionGate(base) === null && openQuestionGate(after2.state) === null && openQuestionGate(null) === null);
const gate = openQuestionGate(two);
check('an open question gates, naming each and the way out', gate.includes('q1 → shay: soft-delete or hide?') && gate.includes('q2 → einat') && gate.includes('wf decide'), gate);

const blocked = '# BJEW-1 — blocked on commit 2\r\nTried: x\r\nQuestion: may the fix touch orders.py?\r\n';
check('the Question line of a BLOCKED.md', blockedQuestion(blocked) === 'may the fix touch orders.py?', String(blockedQuestion(blocked)));
check('no Question line → null', blockedQuestion('# b\nTried: x\n') === null);
check('an answer lands under a new ## Answer', appendAnswer(blocked, 'yes, only cancel()', '2026-09-24').endsWith('Question: may the fix touch orders.py?\n\n## Answer\n2026-09-24 yes, only cancel()\n'), JSON.stringify(appendAnswer(blocked, 'yes, only cancel()', '2026-09-24')));
check('a second answer appends under the same ## Answer', appendAnswer('# b\n\n## Answer\n2026-09-23 no\n', 'yes after all', '2026-09-24') === '# b\n\n## Answer\n2026-09-23 no\n2026-09-24 yes after all\n');

check('status lines show who, the question and the default', questionLines(two).join('|') === '? q1 → shay: soft-delete or hide? (default: hide)|? q2 → einat: error wording?', questionLines(two).join('|'));
check('no questions → no lines', questionLines(base).length === 0 && questionLines(null).length === 0);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
