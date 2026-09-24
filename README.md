# wf

Shay's agent workflow for JewelryX rounds: a ticket becomes a merged PR through fresh-context
phases (research → plan → one agent per commit → validate), deterministic checks (`wf check`),
and two human gates (T1 plan, T2 diff, both in plannotator). Runs in pi and in Claude Code.

It lives outside the JewelryX repo on purpose. The JewelryX repo keeps only the round memory
each round commits (`bug-reports/<round>/`, described in that repo's `bug-reports/README.md`).

## Where things are

- `wf.mjs`: the CLI dispatcher; one module per command, each with a `*.selfcheck.mjs`
- `skills/round/SKILL.md`: the orchestrator skill ("start 662", "resume 662"); `skills/design-session/` for T1
- `prompts/`: one prompt per phase, printed by `wf prompt <phase>`
- `agents/`: `round-worker` (every phase), `codebase-locator` and `codebase-analyzer` (research, pi only)
- `process/`: classes, design session, review format, touchpoints
- `worktree.mjs`: the one interface to worktrees: list, names and ports, create, remove
- `hook.mjs`, `stack/`: what worktrunk runs around a worktree (setup, dev servers, database, gate,
  cleanup); `wf hook install` writes the hooks into worktrunk's user config
- `docker-compose.qa-local.yml`: the override `wf stacks` layers over the QA worktree's compose file
- `docs/plans/2026-09-17-workflow-v2.md`: the plan wf was built from

Text names wf's own files as `{{wf}}/…`: `wf prompt` and the installed copy fill in the real path.

## Install and update

Edit here (`~/work/wf`); never run wf from this folder. `~/bin/wf` runs the installed copy in
`~/.local/share/jewelryx-wf`, which holds committed code only. After a push, the next `wf`
command installs it by itself and prints `wf: updated <old> → <new>`. `wf update` fetches first.
Once per machine, and after changing `hook.mjs`: `wf hook install` (from the installed copy, so
the hooks call it).

Self-checks: run each `*.selfcheck.mjs` from inside a JewelryX worktree.

What wf reads from the project, in the round's worktree: `docs/agents/` (`testing.md`, `layout.md`,
`seed.md`, `monday.md`, `contract-paths.txt` for class B) and the fixture seeder
`packages/backend/scripts/seed_fixtures.py`. wf keeps no copy of any of them.
