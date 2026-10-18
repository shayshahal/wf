// handoff-hook.selfcheck.ts — node handoff-hook.selfcheck.ts → exit 0 when green.
// The hook no longer judges a handoff: the agent owns its sessions and when a phase ends (approved
// agent-owned harness/session management). What remains is the session rule the hook applies, so a
// parent or non-worker event cannot record itself as the phase worker (#114).
import { hookSession } from './session.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// The session rule the hook applies: only the round-worker's own hook names the worker.
check('a worker SubagentStop records the worker', hookSession({ agent_id: 'a1', agent_type: 'wf:round-worker', agent_transcript_path: 'C:/t/agent-a1.jsonl' })?.id === 'a1');
check("the orchestrator's Agent PreToolUse records nothing", hookSession({ session_id: 's1', transcript_path: 'C:/t/s1.jsonl' }) === null);
check('a locator handback records nothing', hookSession({ agent_id: 'l1', agent_type: 'wf:codebase-locator', agent_transcript_path: 'C:/t/agent-l1.jsonl' }) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
