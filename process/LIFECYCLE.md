# Worktree lifecycle

wf owns the creation, the placement and the cleanup of the round workspace.
- Every adapter uses the same checkout: `<repo>/.claude/worktrees/<slug>`. For a bare layout, the
  checkout is beside the bare repository.
- The machine chooses how to allocate and remove it (`src/seams.ts`, `createWorktree` and
  `removalPlan`). The location does not change for each host.
- A native host opens this existing checkout. It does not create a second round worktree.
- Run `wf …` in that checkout. Do not run it in the clone that the checkout was cut from.
- The setup is the work of the project: its `setup`, `serve` and `teardown` in
  `projects/<name>/index.ts`. `wf notes` names the guidance of the configured project.

## Workspace binding and resume

One round has one checkout. The command cwd, the chat and file tools, the implementation and the
evidence all refer to that exact worktree and its actual Git branch.

- In a host with a pinned session workspace, bind the session to the round checkout before you
  work. A change of the shell cwd changes only the shell. Use the open or launch capability of the
  host for an existing workspace.
- If the current session cannot rebind, hand off to a session that can. Give it: the absolute
  worktree path, the configured wf entry, the working document and the next action.
- A binding that is missing or cannot be verified is a blocker. It is not permission to work
  through links between worktrees.
- To resume, work in the same checkout and run `wf next`. Keep its saved setup, classification and
  round files. A new worktree, or a repeated initialization, is a new round. It is not a resume.
- For cleanup, first leave the bound round session. Then run reap from a surviving checkout or
  session. If you delete the workspace of a pinned session, its later resume fails. This is true
  even when another shell changed its directory.
- The native reader verifies only the calling session. Archive or leave the sibling sessions that
  are bound to the round too.
- Existing rounds keep their registered paths. This policy does not migrate them. It does not
  change the host-wide worktree settings.

### A host's own checkout (`wf new <branch> --here`)

A session host can give a session a checkout of its own: T3's `delegate_task` with
`isolation: "worktree"` gives the child `~/.t3/worktrees/<project>/t3-<id>` on a branch T3 named.
A running thread cannot rebind, and the host cannot bind a subagent to a checkout wf made
(measured 2026-11-28). So the round goes to the checkout instead:

```mermaid
sequenceDiagram
  participant P as Parent thread
  participant C as Child (T3 subagent)
  participant W as wf
  P->>C: delegate_task, isolation "worktree"
  Note over C: bound to its own T3 worktree, branch T3 named
  C->>W: wf new <branch> --here --class A|B|C [--id <id>]
  W->>W: check binding, fetch base, fast-forward, rename branch, setup, classify
  C->>W: wf next ... wf deliver
  C->>W: wf reap <branch> (stack, database, .wf/; the checkout stays)
  C-->>P: finishes; T3 wakes the parent
```

- Run it from the bound checkout. It refuses, before any change: no native session or an
  unavailable binding; a session bound to the project root; a shell outside the bound checkout; the
  repository's main checkout; a detached HEAD or a base/release branch; a checkout that is already a
  round; uncommitted changes; a host branch name that Git no longer shows.
- The base: wf fetches it first. A checkout with no commits of its own is fast-forwarded to it (T3
  cut a subagent's checkout from a local base branch months behind its remote, 2026-11-28). One with
  commits of its own is refused with `git rebase <base>`: those commits are the agent's work.
- The branch: wf renames the host's branch to `<branch>`. Ports, stack hostnames, the database and
  the PR branch derive from the branch name, and so do the project's branch rules. T3 keeps showing
  its old name (`t3_worktree_status`, measured). `.wf/state.json` records both as `adopted`, and the
  binding check accepts that one old name at this exact path, while Git is on the round's branch.
  The path match is the JX-1426 protection.
- Then the same as a created round: the project's setup, `wf step classify`, the round folder, the
  state, the clone's `launch.json`. No existing-worktree handoff: the session is already bound.
- A failed setup leaves the renamed checkout. Run the same command again to repeat the setup.
- Plain `wf new` from a host checkout bound to this session is refused: its new worktree could
  never be this session's.
- Reap of an adopted round may run in the bound session itself. It stops what the round started,
  runs the project's teardown, archives the round record and removes `.wf/`. The checkout and its
  branch stay: the host made them, its thread may still be bound there, and Git cannot delete a
  branch that is checked out. Remove them through the host (T3: delete the thread's worktree). A
  failed step keeps `.wf/`; run reap again (each step is repeat-safe).
- Without delegation (a bare-repository project, where T3 cannot make worktrees), the fallback is
  the existing-worktree launch above. It does not wake its parent.

## Create and prepare

Create worktrees only with:
`wf new <branch> --class A|B|C [--base <ref>] [--check] [--id <token>]...`
(or adopt a session host's own checkout with `--here`, above).

- The default base is `origin/<the project's base branch>`.
- The command makes the worktree, runs the setup of the project, then runs `wf step classify`.
- A raw `git worktree add` skips the setup.
- `--id <ticket id>` refuses to cut the worktree when a round folder or a commit already names the
  id. Read that first.
- Choose `--class A|B|C` from the ticket and the scope before creation. It is required, except for
  `--check`. An agreement-first round has no code to measure.
- `wf step classify` only upgrades the class (A→B→C). It never downgrades.
- The class that binds is measured again from the declared scope and the changed files (`wf next`).

## Ports and stacks

- Each branch has one hashed port P, from the branch name (`ports.ts`, 10000–19999). The project
  spreads its apps from there.
- No worktree is served from its creation. (Shay, 2026-10-04: a stack for each worktree was too
  much.)
- `wf serve [--wait]` starts the `serve` of the project in the background.
- The phases that drive the app run it themselves: `wf brief assess`, `wf check` for an affected
  task marked `stack`, and `wf review`.
- `wf next` and `wf step` release idle stacks at these boundaries: classify, agreement, held,
  approved, merged, and the human waits that are not a review.
- These phases keep their stack: active build, assessment, CI waits and T2 review. The next phase
  that drives the app starts the stack again.
- `wf serve --stop` stops the recorded server tree of a helper checkout. It does not remove the
  checkout or the database.
- Before it stops, wf verifies the ownership. wf confirms the shutdown before it clears the PID
  record.
- A failed automatic release gives a warning. It does not block the workflow action. An explicit
  stop refuses and keeps the record.
- Reap still stops the processes before the teardown.
- `wf status` probes P. It prints the name of the first app.

### Release of a stack

1. Release records the observed descendants and their creation times before it signals.
2. It confirms that the processes are absent and that the direct endpoints are closed.
3. A probe that is not available means unknown. It never means absence.
4. A partial release keeps `.wf/serve-owner.json` and `serve.pid`. `wf serve --stop` tries that
   release again.
5. A stop handle from an older start cannot release a replacement.
6. An interrupted release can finish from its saved identity, also when `serve.pid` was already
   removed.
7. A lock whose creator is provably dead is reclaimed under a serialized acquisition guard.
   - A live owner, a malformed owner, an unavailable owner, or an abandoned guard needs inspection.
   - Never kill by path.
8. A start with an unavailable identity fails explicitly. It keeps its launch reference. It does not
   claim a successful start.
9. Shared infrastructure is prepared outside the detached server tree.

## Checks

Checks (the isolated baseline runner included) use an owned supervisor, a 30-minute task timeout
and the recovery records in `.wf/check-processes/`.
- Cancellation releases the observed descendants before it returns a failed measurement.
- A release that is not confirmed cannot supply green evidence.
- A later check clears an interrupted release record only after it confirms absence. Leftovers that
  are unknown or running refuse a new run.
- When the parent is lost, the last established process identities stay recorded. This is also true
  when the disconnect probe is not available.

## Reap

- Reap changes to a surviving checkout before the removal. It stops on a failed cleanup.
- Its recovery journal is in the common git directory, outside the target. When a worktree is
  unregistered, its path is not lost.
- To continue the saved steps, run `wf reap <branch>` again from a surviving checkout.
- The directory identity of the target must still match the external journal. A replacement
  checkout is refused.
- A journal with no target identity can finish only while the target is still absent. It never
  adopts a directory that was created later.
- A failed directory removal keeps the journal.
- A paperwork failure releases the reap lock. It does not delete the target.

**Reap gate.**
- `wf reap` refuses unless `.wf/state.json` says `step: "merged"`.
- Override: `WF_FORCE_REAP=1`.
- A worktree that never entered the workflow (no state file) can be removed.
- `wf reap` stops the processes of the tree first. Then it runs the teardown of the project while
  the worktree exists. Then it removes the worktree. Then it runs the same teardown again. Each step
  tolerates "already gone".

## Pipeline cutover

The agreed policy is finish before release. Finish the active rounds on their installed runtime
before you install the replacement.
- There is no state converter. There is no second pipeline.
- Old state is refused before any mutation. It is not silently reinterpreted.
- The replacement uses: build and verification, one independent final assessment, and final T2.
- Agents own the steps and the worker sessions.
- Optional checkpoints that humans agreed use `wf review --checkpoint`. Approval resumes the build.
  It never permits delivery.
- Verification plans stay working guidance. They are not executable case or unit state.

## Delivery and follow-up

- One round is one PR to the base branch.
- After T2, `wf deliver` publishes the PR and leaves it open. Then the project tracker note says
  that the work is in the linked PR and awaits merge. A ticketless round has no note.
- `wf deliver` never pushes a branch behind its base. It fetches the base and rebases onto it, so the
  pre-push hook checks the tree that will merge (2026-11-02: #662 merged 31 minutes behind a dev that
  had #657, and dev's svelte-check went red). An identical patch (`git patch-id`) keeps the T2
  approval. A conflict or a changed patch is put back and refused: rebase by hand, re-run the checks,
  then a fresh assessment and T2.
- The worktree and the branch stay until the person merges.
- After that merge, run `wf deliver` again. It records the confirmed receipt and unlocks the normal
  reap. It then runs the project's full check on the merged base, in a temporary worktree. A red or
  unchecked base does not undo the delivery; deliver prints it and `wf next` tells the user.
- The round folder merges with the PR and stays. It is the memory of the round.
- For more product work, start a fresh branch: `wf new <new-branch> --reopen --class A|B|C --id <id>`.
  Earlier deliveries and rulings are linked in `EARLIER.md`. The new round has a fresh agreement,
  assessment and T2.

**Merged rounds.**
- A merged round refuses workflow mutations.
- Post and reap are not its next action when the product content differs from the delivered
  receipt (or from the bound T2 tree on a round before receipts).
- Older rounds that are not bound can post their saved delivery note. Their cleanup needs the
  original evidence restored, or an intentional `WF_FORCE_REAP=1` discard.
- The installed pre-remove hook enforces the same guard.
- Then `wf step merged` opens the reap gate. `wf reap <branch>` removes the worktree
  (skills/round/SKILL.md, *T2 approved*).
