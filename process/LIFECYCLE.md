# Worktree lifecycle

Run `wf …` from a worktree, never from the bare root. The worktree hooks are wf's, not the
project's: `wf hook install` writes them into worktrunk's user config for this project only
(`hook.mjs`); run it again after changing `hook.mjs` or the project's `setup` steps. User hooks
need no approval. What the hooks do is the project's: its `setup`, `serve` and `teardown` in
`projects/<name>/index.mjs` (JewelryX's: `{{project}}/STACK.md`).

Create worktrees only via `wf new <branch> [--base <ref>] [--class B|C] [--id <token>]...`
(default base `origin/<the project's base branch>`) — it runs `wt switch --create --base --no-hooks`,
then wf's own pre/post-start hooks (`wt hook <type> user:`), whichever folder it runs from; raw
`git worktree add` skips the server) then `wf step classify`. `--id <ticket id>`
refuses to cut the worktree when a round folder or a commit already names the id — read
that first. `--class B|C` asserts the class at creation: a design-first round has no code to
measure, and `wf step classify` only ever upgrades (A→B→C), never downgrades.

Ports: one hashed port P per branch (`{{ branch | hash_port }}`, 10000–19999); the project spreads
its apps from there. Post-start runs the project's `serve` under `wt step tether`: killing the
tether stops the servers. `wf status` probes P and prints the first app's name; `wf review`
restarts a dead tether.

Reap gate: `wt remove` runs a pre-remove hook that refuses
unless `.wf/state.json` says `step: "merged"`. Override with
`WF_FORCE_REAP=1`. Worktrees that never entered the workflow (no
state file) are removable. Post-remove runs the project's teardown. `wf reap` stops the tree's
processes first, then removes it and runs the same teardown again (each step tolerates "already gone").

One round is one PR to the base branch: CI runs on it, T2 approves it, and it merges with
`gh pr merge <n> --merge` (a merge commit, not a squash: the round's commits stay as planned, one
per PLAN.md row). The round folder merges with it and stays: it is the round's memory. Then
`wf step merged` opens the reap gate and `wf reap <branch>` removes the worktree (skills/round/SKILL.md,
*T2 approved*).
