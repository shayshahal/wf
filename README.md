# wf

Shay's agent workflow for JewelryX rounds: a ticket becomes a merged PR through fresh-context
phases (research → plan → one agent per commit → validate), deterministic checks (`wf check`),
and two human gates (T1 plan, T2 diff, both in plannotator). Runs in pi and in Claude Code.

It lives outside the JewelryX repo on purpose. The JewelryX repo keeps only the round memory
each round commits (`bug-reports/<round>/`, described in that repo's `bug-reports/README.md`).

## Where things are

- `JewelryX-Tools/wf/`: the `wf` CLI (`wf.mjs` dispatches; one module per command, each with a `*.selfcheck.mjs`)
- `JewelryX-Tools/wf/skills/round/SKILL.md`: the orchestrator skill ("start 662", "resume 662")
- `JewelryX-Tools/wf/prompts/`: one prompt per phase, printed by `wf prompt <phase>`
- `JewelryX-Tools/wf/process/`: classes, design session, review format, touchpoints
- `scripts/worktree-ports.mjs`, `docs/agents/`, `.gitattributes`: what wf needs from the project

The layout keeps JewelryX's paths, so nothing had to change when wf moved here.

## Install and update

Edit here (`~/work/wf`); never run wf from this folder. `~/bin/wf` runs the installed copy in
`~/.local/share/jewelryx-wf`, which holds committed code only. After a push, the next `wf`
command installs it by itself and prints `wf: updated <old> → <new>`. `wf update` fetches first.

Self-checks: run each `JewelryX-Tools/wf/*.selfcheck.mjs` from inside a JewelryX worktree.
