# Capability fallbacks

You can adapt the execution. You cannot adapt the required proof or the required authority. Use the
smallest available capability that gives the same outcome. State its limits.

| Capability absent | Fallback | What stays required |
|---|---|---|
| Native skill discovery | Read `SKILL.md` explicitly. Resolve its relative files from this folder. | The same instructions and tool prerequisites. |
| Subagent tool / named wf agent | Build in the current session. Delegate only when it helps. | A separate fresh context for the independent assessment. |
| Background workers / durable jobs | Work while the session is active. Save progress. Resume later. | Do not claim that anything runs after the host or session exits. |
| Automatic wakeups / Inbox integration | On resume, get the replies with `wf inbox`, or ask directly. | Record actual decisions with `wf decide`. Silence is not approval. |
| Native tracker MCP | Use an existing authorized project CLI or REST path, or the ticket material that you were given. | Complete intake. Name the missing material. Do not invent a tracker update. |
| Native browser / review pane | Use the executable checks of the project, an external browser or review UI, or the inspection of the person. | Measure the required behavior. A convenient alternative is not automatically the same proof. |
| Plannotator adapter | Show the generated review artifacts. Record the actual verdict of the person. | The current content identity, the comments and the explicit approval. |
| Fresh independent reviewer | Hand the worktree, the entry and the brief to another session or harness. | The review stays pending until that context has assessed it. |
| Project test or runtime prerequisite | Use the authorized project setup. Or save the exact blocker and the rerun command. | The required verification stays not measured. Repair of unrelated infrastructure is not implicit scope. |
| Delivery credentials / network | Keep the approved work and the remote-effect records. Reconcile on resume. | Do not guess a push, PR, merge or post result. Do not repeat a mutation blindly. Do not clean up early. |

## Rules

- Use the native presentation tools of the session first. `process/SHOW-ME.md` (from the wf root)
  owns the decision-sheet rules and the generated-UI rules. A configured presentation adapter
  supplies the tool guidance. If a tool is missing, show the exact files and name the limitation.
- Before you call a capability absent, find the existing tools of the project.
- Prefer a known executable check or a disposable fixture inside the scope. Do not build a new
  platform integration.
- A failed runner is not a failed product test.
- An environment that you cannot access is not proof that the requested behavior works.

## Record for each blocker

- the operation and the observed failure
- the affected promise
- the independent work that is available
- the owner or authority that is needed
- the exact next action

Send the person only a decision that they must make, or a useful handover. Keep reusable project
repairs with the project. Do not hide them as changes to the global configuration of a harness.
