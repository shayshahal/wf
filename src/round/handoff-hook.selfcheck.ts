// handoff-hook.selfcheck.ts — node handoff-hook.selfcheck.ts → exit 0 when green.
// The two pure decisions the Claude Code hooks make: whether a hand-back may end (stopGap) and
// whether an Agent call is a refused fork (forkGap) — plus the session rule the hook applies, so a
// parent or non-worker event cannot record itself as the phase worker (#114).
import { forkGap, stopGap } from './handoff-hook.ts';
import { hookSession } from './session.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const state = (patch: Partial<State>): State => ({ wf_version: 2, ...patch } as State);
const files = (patch: Partial<{ agreement: string | null; assessment: string | null; blocked: boolean; commits: boolean }> = {}) =>
  ({ agreement: null, assessment: null, blocked: false, commits: false, ...patch });
const validAssessment = 'head: 0123456789012345678901234567890123456789\nVerdict: clean\n\n## Intent\n- does x — met: before: 1 after: 2\n';

// stopGap — the hand-off safety sends a finished worker back once per visit, including a repair.
check('no round: nothing to hold', stopGap(null, files()) === null);
check('a visit already sent back is let through', stopGap(state({ step: 'agree', since: 'visit-1', handoff_sent_back: 'agree@visit-1' }), files()) === null);
check('a repaired visit owes its handoff again', stopGap(state({ step: 'agree', since: 'visit-2', handoff_sent_back: 'agree@visit-1' }), files()) !== null);
check('agree class A without a ticket asks for it', stopGap(state({ step: 'agree', class: 'A' }), files())?.includes('TICKET.md') === true);
check('agree class A with ## Intent is done', stopGap(state({ step: 'agree', class: 'A' }), files({ agreement: '## Intent\n- fix the thing\n' })) === null);
check('agree class B asks for AGREEMENT.md', stopGap(state({ step: 'agree', class: 'B' }), files())?.includes('AGREEMENT.md') === true);
check('agree class B with no facts is a gap', stopGap(state({ step: 'agree', class: 'B' }), files({ agreement: '# AGREEMENT.md\n' }))?.includes('## Observed') === true);
check('build with no commit and no block asks for one', stopGap(state({ step: 'build' }), files())?.includes('no commit yet') === true);
check('build with a commit is done', stopGap(state({ step: 'build' }), files({ commits: true })) === null);
check('a blocked build is done', stopGap(state({ step: 'build' }), files({ blocked: true })) === null);
check('assess without ASSESSMENT.md asks for it', stopGap(state({ step: 'assess' }), files())?.startsWith('write ASSESSMENT.md') === true);
check('assess with a complete ASSESSMENT.md is done', stopGap(state({ step: 'assess' }), files({ assessment: validAssessment })) === null);
check('a later step owes nothing', stopGap(state({ step: 'review' }), files()) === null);

// forkGap — a fork carries the whole conversation; anything else is allowed.
check('a fork subagent is refused', forkGap({ tool_input: { subagent_type: 'fork' } })?.includes('no forks') === true);
check('a round-worker dispatch is allowed', forkGap({ tool_input: { subagent_type: 'wf:round-worker' } }) === null);
check('an event with no tool_input is allowed', forkGap({}) === null);

// The session rule the hook applies: only the round-worker's own hook names the worker.
check('a worker SubagentStop records the worker', hookSession({ agent_id: 'a1', agent_type: 'wf:round-worker', agent_transcript_path: 'C:/t/agent-a1.jsonl' })?.id === 'a1');
check("the orchestrator's Agent PreToolUse records nothing", hookSession({ session_id: 's1', transcript_path: 'C:/t/s1.jsonl' }) === null);
check('a locator handback records nothing', hookSession({ agent_id: 'l1', agent_type: 'wf:codebase-locator', agent_transcript_path: 'C:/t/agent-l1.jsonl' }) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
