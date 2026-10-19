// session.selfcheck.ts — node session.selfcheck.ts → exit 0 when green.
// Optional actual-context references and the change-only rule
// that lets a richer transcript update but not a null one erase.
import { harnessSession, sessionChanged, withSession } from './session.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// pi: PI_SESSION_ID with and without a transcript. A nested Claude var does not override it.
check('pi session reads its id and file', JSON.stringify(harnessSession({ PI_SESSION_ID: 'abc', PI_SESSION_FILE: 'C:/s/abc.jsonl' })) === JSON.stringify({ harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' }));
check('pi without a file keeps a null transcript', harnessSession({ PI_SESSION_ID: 'abc' })?.transcript === null);
check('pi wins over a Claude id in the same env', harnessSession({ PI_SESSION_ID: 'pi', CLAUDE_CODE_SESSION_ID: 'cl' })?.harness === 'pi');
// Claude's env id is the round's shared session, not the worker's: recording it would name the parent
// as the worker (2.1.280: the shell env sets CLAUDE_CODE_SESSION_ID from the session id, 2026-10-10).
check('Claude env names the shared session, never the worker', harnessSession({ CLAUDE_CODE_SESSION_ID: 'cl' }) === null);
check('no harness vars: no reference, never a guess', harnessSession({}) === null && harnessSession({ PI_SESSION_ID: '  ' }) === null);

// The change-only rule: a re-read brief in the same session is not a new fact.
const base = { wf_version: 3, step: 'build' } as State;
const ref = { harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' };
check('a first session is a change', sessionChanged(base, ref, 'build'));
check('the same session at the same step is not a change', !sessionChanged(withSession(base, ref, 'build'), ref, 'build'));
check('the same session at a new step is a change', sessionChanged(withSession(base, ref, 'build'), ref, 'assess'));
check('another session is a change', sessionChanged(withSession(base, ref, 'build'), { harness: 'pi', id: 'other', transcript: null }, 'build'));
check('no reference at all is not a change', !sessionChanged(base, null, 'build'));
// A richer transcript for the same session is a new fact; a null one is not.
const held = withSession(base, { harness: 'claude', id: 'a1', transcript: null }, 'build');
check('a known transcript enriches a previously null reference', sessionChanged(held, { harness: 'claude', id: 'a1', transcript: 'C:/t/agent-a1.jsonl' }, 'build'));
check('an env/brief re-read with a null transcript does not erase a richer one', !sessionChanged(withSession(base, { harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' }, 'build'), { harness: 'pi', id: 'abc', transcript: null }, 'build'));
check('withSession records the step and the time', (() => { const s = withSession(base, ref, 'assess', '2026-10-10T00:00:00.000Z'); return s.session?.step === 'assess' && s.session?.at === '2026-10-10T00:00:00.000Z' && s.step === 'build'; })());
check('withSession keeps a held transcript when the incoming one is null', withSession(withSession(base, { harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' }, 'build'), { harness: 'pi', id: 'abc', transcript: null }, 'assess').session?.transcript === 'C:/s/abc.jsonl');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
