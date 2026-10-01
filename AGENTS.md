# Working on wf

wf is Shay's agent workflow (README.md). This file is for changing wf itself.

## A push to `main` is live

The installed copy (`~/.local/share/wf`) updates itself on the next `wf` command after `main`
moves. There is no staging and no CI. So, before every push:

- `node selfcheck.mts`, all green (the pre-push hook runs it too, once `core.hooksPath` is set)
- for a change to worktree creation, the hooks or a project's `setup`/`serve`/`teardown`: one real
  cycle from the editing clone, through Shay's entry: `node env/wf.mjs hook install` (points
  worktrunk at this clone), `node env/wf.mjs new bench/<x>`, check the stack answers,
  `WF_FORCE_REAP=1 node env/wf.mjs reap bench/<x>`,
  then `wf hook install` from the installed copy to point worktrunk back
- never run wf from this clone for real rounds: `~/bin/wf` runs the installed copy

## Core and projects

- Core (everything outside `projects/` and `env/`) names no project and no project technology: no
  app, port offset, database, language tool, tracker or person other than Shay. What a project
  differs in, it gets from `project.mts`.
- The kit (core and `projects/`) is what the team runs, alone. It never imports `env/` and never
  names Shay's machine (`boundary.selfcheck.mts`). What differs between machines goes through a
  seam (`seams.mts`), with Shay's piece in `env/` and plugged in by `env/wf.mjs`.
- `projects/<name>/index.mts` is the only file core imports from a project folder. Its exports are
  what the project needed, not a designed interface: add one when core needs something
  project-specific, and do not add fields "for later".
- A project's facts that hold without wf (layout, test conventions, seed data, tracker ids) live in
  that project's own repo (JewelryX: `docs/agents/`). wf reads them from the round's worktree and
  keeps no copy.
- Examples taken from past rounds (BJEW-…, TJEW-…) are history and stay where they illustrate.

## Style

- One module per command, each with a `*.selfcheck.mts`: pure functions checked there, the
  side-effecting shell around them kept thin.
- Comments say why, with the incident or measurement that decided it (date, round, number).
- No dependencies.
