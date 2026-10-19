# Capability fallbacks

Execution is adaptable; required proof and authority are not. Use the smallest available capability
that establishes the same outcome, and identify its limits.

| Capability absent | Useful fallback | What remains required |
|---|---|---|
| Native skill discovery | Read `SKILL.md` explicitly and resolve its relative files from this folder | The same instructions and tool prerequisites |
| Subagent tool / named wf agent | Build in the current session; delegate only when useful | A separate fresh context for independent assessment |
| Background workers / durable jobs | Work while active, save progress, then resume | No claim that anything runs after the host/session exits |
| Automatic wakeups / Inbox integration | Retrieve replies with `wf inbox` on resume, or ask directly | Record actual decisions with `wf decide`; no approval from silence |
| Native tracker MCP | Use an existing authorized project CLI/REST path or supplied ticket material | Complete intake and explicit missing material; no invented tracker update |
| Native browser / review pane | Use project-owned executable checks, an external browser/review UI, or the person's inspection | The required behavior must actually be measured; convenience alternatives are not automatically equivalent proof |
| Plannotator adapter | Show the generated review artifacts and record the person's actual verdict | Current content identity, comments and explicit approval |
| Fresh independent reviewer | Hand off the worktree/entry/brief to another session or harness | Review stays pending until that context has assessed it |
| Project test/runtime prerequisite | Use authorized project setup, or save the exact blocker and rerun command | Required verification stays unmeasured; unrelated infrastructure repair is not implicit scope |
| Delivery credentials / network | Retain the approved work and remote-effect records; reconcile on resume | No guessed push/PR/merge/post result, duplicate blind mutation, or premature cleanup |

Discover the project's existing tools before calling a capability absent. Prefer a known executable
check or disposable fixture within scope over a new platform integration. A failed runner is not a
failed product test, and an inaccessible environment is not proof the requested behavior works.

For every blocker, retain: operation and observed failure, affected promise, available independent
work, owner/authority needed, and the exact next action. Send the person only a decision they need
to make or a useful handover. Keep reusable project repairs with the project, not as hidden changes
to a harness's global configuration.
