# Worktree lifecycle

Run `wf …` from the round's worktree, not the clone it was cut from. Who creates, serves and
removes a worktree is the machine's: the kit makes them with `git worktree` in
`<repo>/.claude/worktrees/`, and an env plugs its own in (`src/seams.ts`, `createWorktree` and
`removalPlan`). What the setup does is the project's: its `setup`, `serve` and `teardown` in
`projects/<name>/index.ts` (JewelryX's: `{{project}}/STACK.md`).

Create worktrees only via `wf new <branch> --class A|B|C [--base <ref>] [--check] [--id <token>]...`
(default base `origin/<the project's base branch>`): it makes the worktree, runs the project's
setup, then `wf step classify`. A raw `git worktree add` skips the setup. `--id <ticket id>`
refuses to cut the worktree when a round folder or a commit already names the id — read
that first. Choose `--class A|B|C` from the ticket and scope before creation (required except for
`--check`): an agreement-first round has no code to measure, and `wf step classify` only ever upgrades (A→B→C), never downgrades. The class that binds
is measured again from the agreement's verification-case files (`wf next`).

Ports: one hashed port P per branch, from the branch name (`ports.ts`, 10000–19999); the project
spreads its apps from there. No worktree is served from its creation (Shay, 2026-10-04: a stack per
worktree was too much). `wf serve [--wait]` starts the project's `serve` in the background, and the
phases that drive the app run it themselves: `wf brief assess`,
`wf check` before the repro or a task marked `stack`, and `wf review`. `wf next` and `wf step`
release idle stacks at classify, agreement, held, approved and merged boundaries, and at non-review
human waits. Active build, assessment, CI waits and T2 review retain theirs; the next app-driving
phase starts the stack again. `wf serve --stop` stops a helper checkout's recorded server tree without
removing the checkout or database. Ownership is verified before stopping, and shutdown is confirmed
before clearing the PID record. A failed automatic release warns without blocking the workflow action;
an explicit stop refuses and preserves the record. Reap still stops processes before teardown.
`wf status` probes P and prints the first app's name.

Release records the observed descendants and creation times before signalling, then confirms both
process absence and closed direct endpoints. Unavailable probes are unknown, never absence. A partial
release keeps `.wf/serve-owner.json` and `serve.pid`; `wf serve --stop` retries that release. A stop
handle from an older start cannot release a replacement. A missing owner before release, a reused PID,
or an interrupted ownership lock requires inspection rather than a path-based kill. Shared infrastructure
is prepared outside the detached server tree.

Checks (including the isolated baseline runner) use an owned supervisor, a 30-minute task timeout,
and `.wf/check-processes/` recovery records. Cancellation releases the observed descendants before
returning a failed measurement. Unconfirmed release cannot supply green evidence. A later check only
clears an interrupted release record after confirming absence; unknown/running leftovers refuse a new run.

Reap changes to a surviving checkout before removal and stops on failed cleanup. Its recovery journal
lives in the common git directory, outside the target: unregistering a worktree cannot lose its path.
Retry `wf reap <branch>` from a surviving checkout to continue the saved steps. The target's directory
identity must still match the external journal; a replacement checkout is refused. A failed directory removal retains the journal.


Reap gate: `wf reap` refuses unless `.wf/state.json` says `step: "merged"`. Override with
`WF_FORCE_REAP=1`. Worktrees that never entered the workflow (no
state file) are removable. `wf reap` stops the tree's processes first, runs the project's teardown
while the worktree exists, then removes it and runs the same teardown again (each step tolerates
"already gone").

Pipeline cutover follows the agreed finish-before-release policy: finish active legacy rounds on
that installed runtime before installing the replacement. There is no state converter or second
pipeline. Planned-commit rows, their completion tokens and their decided-skip obligations (#74)
are retired with that protocol, not imported into version 2. The replacement uses one build phase
for a small task; a large agreement's structured `## Units` creates bounded build/assessment slices
and named review checkpoints. An existing prose units note stays on the single-task route; no
active round is silently reinterpreted. These slices are not obsolete `implement N` commit rows.
Verification cases remain working detail, not commit-completion obligations.

One round is one PR to the base branch: CI runs on it, T2 approves it, and it merges with
`gh pr merge <n> --merge` (a merge commit, not a squash). The round folder merges with it and stays: it is the round's memory.
Further product work starts a fresh branch through `wf new <new-branch> --reopen --class A|B|C
--id <id>`, with earlier deliveries/rulings linked in `EARLIER.md` and fresh agreement, assessment and
T2. A merged round refuses workflow mutations, and post/reap is not its next action when product
content differs from the delivered receipt (or the bound T2 tree on a pre-receipt round). Older
unbound rounds may post their saved delivery note, but cleanup needs restored original evidence or
an intentional `WF_FORCE_REAP=1` discard. The installed pre-remove hook enforces the same guard. Then
`wf step merged` opens the reap gate and `wf reap <branch>` removes the worktree (skills/round/SKILL.md,
*T2 approved*).
