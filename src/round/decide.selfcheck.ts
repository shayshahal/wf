// decide.selfcheck.ts — node src/round/decide.selfcheck.ts → exit 0 when green.
// `wf ask` then `wf decide` through the real CLI before any AGREEMENT.md exists (JX-284, 2026-10-18:
// the agreement write threw ENOENT after the question closed, so the answer never reached state.decisions).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const dir = mkdtempSync(join(tmpdir(), 'wf-decide-'));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
git('init', '-q', '-b', 'main');
writeFileSync(join(dir, 'a'), 'a\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
git('checkout', '-q', '-b', 'fix/decide');
mkdirSync(join(dir, 'bug-reports/r'), { recursive: true });
writeFileSync(join(dir, 'bug-reports/r/TICKET.md'), '# r — ticket\n## Intent\n- "x": y\n');
mkdirSync(join(dir, '.wf'), { recursive: true });
writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ wf_version: 3, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'B' }, null, 2)}\n`);
function cli(...args: string[]) {
	const r = wfSync(args, { cwd: dir });
	return r.status === 0 ? { out: r.stdout, code: 0 } : { out: `${r.stdout}${r.stderr}`, code: r.status };
}

const ask = cli('ask', 'x', '--to', 'einat');
check('ask exits 0', ask.code === 0, ask.out);
const decide = cli('decide', '--q', '1', 'y');
check('decide exits 0 with no agreement', decide.code === 0, decide.out);
check('decide says where the answer was kept', /q1 closed · recorded/.test(decide.out), decide.out);
const state = JSON.parse(readFileSync(join(dir, '.wf/state.json'), 'utf8')) as { decisions?: string[]; questions?: unknown[] };
check('question closed', (state.questions ?? []).length === 0);
check('decision in state.decisions', JSON.stringify(state.decisions).includes('x → einat: y'), JSON.stringify(state.decisions));
const next = cli('next');
check('next dispatches agree', /agree/.test(next.out), next.out);

// #193: an interruption between the state write and the document projection. Each case injects the
// failure by restoring the document to what it was before `wf decide`, then lets `wf next` / `wf brief`
// recover it from the recorded decision.
type StateShape = { decisions?: { id?: string; text: string }[]; questions?: unknown[] };
const stateOf = () => JSON.parse(readFileSync(join(dir, '.wf/state.json'), 'utf8')) as StateShape;
const setState = (patch: object) => writeFileSync(join(dir, '.wf/state.json'), `${JSON.stringify({ ...stateOf(), ...patch }, null, 2)}\n`);
const count = (text: string, needle: string) => text.split(needle).length - 1;
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const agreementFile = join(dir, 'bug-reports/r/AGREEMENT.md');
const blockedFile = join(dir, 'bug-reports/r/BLOCKED.md');
const agreementBase = '# r — agreement\n\n## Decisions\n- earlier\n';
writeFileSync(agreementFile, agreementBase);

// Question answer → agreement § Decisions, interrupted before the document write.
check('ask for a decision', cli('ask', 'which flag', '--to', 'einat').code === 0);
const answeredQ = cli('decide', '--q', '2', 'use flag A');
check('decide with an agreement exits 0', answeredQ.code === 0, answeredQ.out);
const withLine = readFileSync(agreementFile, 'utf8');
check('the line carries the question identity', count(withLine, '<!-- wf:q2 -->') === 1, withLine);
check('the state holds the decision record with that identity', stateOf().decisions?.some((d) => d.id === 'q2') === true);
writeFileSync(agreementFile, agreementBase);
cli('next');
const recovered = readFileSync(agreementFile, 'utf8');
check('interrupted after state close: next projects the recorded answer', count(recovered, 'which flag → einat: use flag A') === 1, recovered);
cli('next');
cli('brief', 'agree');
check('replay appends nothing more', readFileSync(agreementFile, 'utf8') === recovered);
writeFileSync(agreementFile, `${recovered}\n## Notes\nkept\n`);
cli('next');
const edited = readFileSync(agreementFile, 'utf8');
check('an unrelated edit survives a recovery, with no duplicate', edited.includes('kept') && count(edited, '<!-- wf:q2 -->') === 1, edited);

// A decision nobody asked for: state first, so an interrupted append is recovered, and an identical
// later decision is its own operation.
writeFileSync(agreementFile, agreementBase);
check('decide with no question: first', cli('decide', 'same words').code === 0);
check('decide with no question: identical words later', cli('decide', 'same words').code === 0);
const ids = (stateOf().decisions ?? []).filter((d) => d.text === 'same words').map((d) => d.id);
check('two operations, two identities', ids.length === 2 && ids[0] !== ids[1], JSON.stringify(ids));
check('both are projected once each', count(readFileSync(agreementFile, 'utf8'), 'same words') === 2);
writeFileSync(agreementFile, agreementBase);
cli('next');
check('reverse order: interrupted after state, both come back once each', count(readFileSync(agreementFile, 'utf8'), 'same words') === 2);
check('a decision made before any agreement existed is not appended later', !readFileSync(agreementFile, 'utf8').includes('x → einat: y'));

// BLOCKED.md: interrupted after the question closed.
setState({ step: 'build', class: 'A' });
const blockedBase = '# blocked\nQuestion: which table?\n';
writeFileSync(blockedFile, blockedBase);
check('ask --blocked', cli('ask', '--blocked', '--to', 'einat').code === 0);
check('decide the blocked question', cli('decide', 'the orders table').code === 0);
const answeredFile = readFileSync(blockedFile, 'utf8');
check('answer written with its identity', /## Answer/.test(answeredFile) && count(answeredFile, '<!-- wf:q') === 1, answeredFile);
writeFileSync(blockedFile, blockedBase);
const briefed = cli('brief', 'build');
check('brief after the interruption carries the exact answer', briefed.out.includes('the orders table'), briefed.out.slice(-300));
check('and the file has it once', count(readFileSync(blockedFile, 'utf8'), 'the orders table') === 1);
const again = cli('brief', 'build');
check('replay: still once', count(readFileSync(blockedFile, 'utf8'), 'the orders table') === 1 && again.code === 0);

// A new block with the same Question, written after the answer, is not given the old answer.
writeFileSync(blockedFile, blockedBase);
sleep(1300);
writeFileSync(blockedFile, `${blockedBase}\nstill stuck\n`);
cli('next');
check('a rewritten block stays unanswered', !/## Answer/.test(readFileSync(blockedFile, 'utf8')));
// A genuinely new question stays open and does not get the old answer.
writeFileSync(blockedFile, '# blocked\nQuestion: another thing?\n');
check('new question opens', cli('ask', '--blocked', '--to', 'einat').code === 0 && (stateOf().questions ?? []).length === 1);
cli('next');
check('the old answer is not projected onto the new question', !/## Answer/.test(readFileSync(blockedFile, 'utf8')));


if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall green');
