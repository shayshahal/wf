// session.selfcheck.ts — node session.selfcheck.ts → exit 0 when green.
// The harness session wf records as a reference: pi's env vars, Claude's hook fields, and the
// change-only rule that keeps a re-read brief from rewriting state.
import { harnessSession, hookSession, sessionChanged, withSession } from './session.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// pi: PI_SESSION_ID with and without a transcript; a nested Claude var does not override it.
check('pi session reads its id and file', JSON.stringify(harnessSession({ PI_SESSION_ID: 'abc', PI_SESSION_FILE: 'C:/s/abc.jsonl' })) === JSON.stringify({ harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' }));
check('pi without a file keeps a null transcript', harnessSession({ PI_SESSION_ID: 'abc' })?.transcript === null);
check('pi wins over a Claude id in the same env', harnessSession({ PI_SESSION_ID: 'pi', CLAUDE_CODE_SESSION_ID: 'cl' })?.harness === 'pi');
check('claude reads its env id, no transcript there', JSON.stringify(harnessSession({ CLAUDE_CODE_SESSION_ID: 'cl' })) === JSON.stringify({ harness: 'claude', id: 'cl', transcript: null }));
check('no harness vars: no reference, never a guess', harnessSession({}) === null && harnessSession({ PI_SESSION_ID: '  ' }) === null);

// The Claude hook input: session_id/transcript_path are the hook contract's own fields.
check('a hook input reads session_id and transcript_path', JSON.stringify(hookSession({ session_id: 's1', transcript_path: 'C:/t/s1.jsonl' })) === JSON.stringify({ harness: 'claude', id: 's1', transcript: 'C:/t/s1.jsonl' }));
check('a hook without session_id falls back to the env id', hookSession({}, { CLAUDE_CODE_SESSION_ID: 'env1' })?.id === 'env1');
check('a host that names no session records nothing', hookSession({}) === null);

// The change-only rule: a re-read brief in the same session is not a new fact.
const base = { wf_version: 2, step: 'build' } as State;
const ref = { harness: 'pi', id: 'abc', transcript: 'C:/s/abc.jsonl' };
check('a first session is a change', sessionChanged(base, ref, 'build'));
check('the same session at the same step is not a change', !sessionChanged(withSession(base, ref, 'build'), ref, 'build'));
check('the same session at a new step is a change', sessionChanged(withSession(base, ref, 'build'), ref, 'assess'));
check('another session is a change', sessionChanged(withSession(base, ref, 'build'), { harness: 'pi', id: 'other' }, 'build'));
check('no reference at all is not a change', !sessionChanged(base, null, 'build'));
check('withSession records the step and the time', (() => { const s = withSession(base, ref, 'assess', '2026-10-10T00:00:00.000Z'); return s.session?.step === 'assess' && s.session?.at === '2026-10-10T00:00:00.000Z' && s.step === 'build'; })());

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
