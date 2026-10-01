# Working on wf

wf is Shay's agent workflow (README.md). This file is for changing wf itself.

## A push to `main` is live

The installed copy (`~/.local/share/wf`) updates itself on the next `wf` command after `main`
moves. There is no staging and no CI. So, before every push:

- `node src/selfcheck.ts`, all green (the pre-push hook runs it too, once `core.hooksPath` is set)
- for a change to worktree creation, the hooks or a project's `setup`/`serve`/`teardown`: one real
  cycle from the editing clone, through Shay's entry: `node env/wf.mjs hook install` (points
  worktrunk at this clone), `node env/wf.mjs new bench/<x>`, check the stack answers,
  `WF_FORCE_REAP=1 node env/wf.mjs reap bench/<x>`,
  then `wf hook install` from the installed copy to point worktrunk back
- never run wf from this clone for real rounds: `~/bin/wf` runs the installed copy

## Core and projects

- Core (everything outside `projects/` and `env/`) names no project and no project technology: no
  app, port offset, database, language tool, tracker or person other than Shay. What a project
  differs in, it gets from `src/project.ts`.
- The kit (core and `projects/`) is what the team runs, alone. It never imports `env/` and never
  names Shay's machine (`src/boundary.selfcheck.ts`). What differs between machines goes through a
  seam (`src/seams.ts`), with Shay's piece in `env/` and plugged in by `env/wf.mjs`.
- `projects/<name>/index.ts` is the only file core imports from a project folder. Its exports are
  what the project needed, not a designed interface: add one when core needs something
  project-specific, and do not add fields "for later".
- A project's facts that hold without wf (layout, test conventions, seed data, tracker ids) live in
  that project's own repo (JewelryX: `docs/agents/`). wf reads them from the round's worktree and
  keeps no copy.
- Examples taken from past rounds (BJEW-…, TJEW-…) are history and stay where they illustrate.

## Style

- Code lives in `src/`, by area: `round/`, `gates/`, `worktrees/`, `plugin/`. A module that names
  one of wf's own files (prompts, process docs, the entry) starts from `WF_ROOT` (`src/paths.ts`),
  never from its own folder.
- One module per command, each with a `*.selfcheck.ts` beside it: pure functions checked there, the
  side-effecting shell around them kept thin.
- Comments say why, with the incident or measurement that decided it (date, round, number).
- TypeScript that Node runs as is: erasable syntax only (no `enum`, `namespace`, parameter
  properties), and imports name their `.ts` file. Node never reads the types, so only `tsc` in
  `src/selfcheck.ts` catches a wrong one. The two entries, `wf.mjs` and `env/wf.mjs`, stay JavaScript:
  the plugin, `~/bin/wf` and the hooks call them by name, and `wf.mjs` must still load on an old Node
  to say it is too old.
- No runtime dependencies: wf runs on Node alone. `typescript` and `@types/node` (package.json) are
  for the `tsc` check only.
