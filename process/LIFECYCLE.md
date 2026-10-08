# Worktree lifecycle

Run `wf …` from the round's worktree, not the clone it was cut from. Who creates, serves and
removes a worktree is the machine's: the kit makes them with `git worktree` in
`<repo>/.claude/worktrees/`, and an env plugs its own in (`src/seams.ts`, `createWorktree` and
`removalPlan`). What the setup does is the project's: its `setup`, `serve` and `teardown` in
`projects/<name>/index.ts` (JewelryX's: `{{project}}/STACK.md`).

Create worktrees only via `wf new <branch> [--base <ref>] [--class B|C] [--check] [--id <token>]...`
(default base `origin/<the project's base branch>`): it makes the worktree, runs the project's
setup, then `wf step classify`. A raw `git worktree add` skips the setup. `--id <ticket id>`
refuses to cut the worktree when a round folder or a commit already names the id — read
that first. `--class B|C` asserts the class at creation: a design-first round has no code to
measure, and `wf step classify` only ever upgrades (A→B→C), never downgrades. The class that binds
is measured again from the plan's own files (`wf next`).

Ports: one hashed port P per branch, from the branch name (`ports.ts`, 10000–19999); the project
spreads its apps from there. No worktree is served from its creation (Shay, 2026-10-04: a stack per
worktree was too much). `wf serve [--wait]` starts the project's `serve` in the background, and the
phases that drive the app run it themselves: `wf brief research` and `wf brief validate`,
`wf check` before the repro or a task marked `stack`, and `wf review`. It stops at reap. `wf status`
probes P and prints the first app's name.

Reap gate: `wf reap` refuses unless `.wf/state.json` says `step: "merged"`. Override with
`WF_FORCE_REAP=1`. Worktrees that never entered the workflow (no
state file) are removable. `wf reap` stops the tree's processes first, runs the project's teardown
while the worktree exists, then removes it and runs the same teardown again (each step tolerates
"already gone").

One round is one PR to the base branch: CI runs on it, T2 approves it, and it merges with
`gh pr merge <n> --merge` (a merge commit, not a squash: the round's commits stay as planned, one
per PLAN.md row). The round folder merges with it and stays: it is the round's memory. Then
`wf step merged` opens the reap gate and `wf reap <branch>` removes the worktree (skills/round/SKILL.md,
*T2 approved*).
