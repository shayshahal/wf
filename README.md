# wf

Shay's agent workflow: a ticket becomes a merged PR through fresh-context phases (research → plan
→ one agent per commit → validate), deterministic checks (`wf check`), and two human gates (T1
plan, T2 diff, both in plannotator). Runs in pi and in Claude Code, on Windows.

It lives outside every project's repo on purpose. A project's repo keeps only the round memory each
round commits (for JewelryX, `bug-reports/<round>/`).

## Where things are

- `wf.mjs`: the CLI dispatcher; one module per command, each with a `*.selfcheck.mjs`
- `skills/round/SKILL.md`: the orchestrator skill ("start 662", "resume 662"); `skills/design-session/` for T1
- `prompts/`: one prompt per phase, printed by `wf prompt <phase>`
- `agents/`: `round-worker` (every phase), `codebase-locator` and `codebase-analyzer` (research, pi only)
- `process/`: lifecycle, classes, design session, review format, touchpoints
- `worktree.mjs`: the one interface to worktrees: list, ports and slugs, create, remove
- `hook.mjs`: what worktrunk runs around a worktree; `wf hook install` writes the hooks into
  worktrunk's user config
- `project.mjs` → `projects/<name>/`: everything project-specific. See *Projects* below.
- `docs/plans/2026-09-17-workflow-v2.md`: the plan wf was built from (history; done)

Text names wf's own files as `{{wf}}/…` and the project's folder as `{{project}}/…`: `wf prompt`
and the installed copy fill in the real paths.

## Projects

wf runs rounds on one project at a time, named in `project.mjs`. Its folder, `projects/<name>/`,
holds everything wf knows about it, and `index.mjs` there is the only file the rest of wf imports:

- names, ports and URLs of its apps; which changed files are pages
- `setup` (the pre-start steps), `serve`, `teardown`
- `checks`: the commands `wf check` runs for a diff
- its round folder, base branch, round branches, people, contract-paths file, tracker note
- `commands`: wf subcommands only this project has (JewelryX: `seed`, `show`, `stacks`)

Next to it: `ROUND.md` (tracker, statuses, people, branches: read by the round skill),
`prompts/<phase>.md` (appended to that phase's prompt) and whatever implements the above.

There is one project, JewelryX. When a second one arrives, it gets a folder like this one, and
what the two share becomes the interface. Not before.

## Install (a fresh machine)

Needs: git, node ≥ 22, [worktrunk](https://github.com/max-sixty/worktrunk) (`wt`), `gh`, pi and/or
Claude Code, plus what the project's `setup` runs (JewelryX: pnpm, uv, docker, portless).

1. `git clone https://github.com/shayshahal/wf ~/work/wf`: the editing clone. Never run wf from it.
2. `node ~/work/wf/update.mjs`: installs the committed code into `~/.local/share/wf`, and wf's
   agents into pi (`~/.pi/agent/agents`) and Claude Code (`~/.claude/agents`, `round-worker` only).
3. Put `wf` on the PATH: `~/bin/wf` is `exec node "$HOME/.local/share/wf/wf.mjs" "$@"`, and
   `~/bin/wf.cmd` is `@node "%USERPROFILE%\.local\share\wf\wf.mjs" %*`.
4. Skills: add `~/.local/share/wf/skills/round` and `~/.local/share/wf/skills/design-session` to
   pi's `settings.json` `skills`; for Claude Code, link them into `~/.claude/skills/`.
5. `wf hook install`: worktrunk's user config gets the project's hooks, calling the installed copy.
6. The project's clone: a bare repo with a worktree for its base branch (JewelryX:
   `~/work/jeweleryx/.bare`, `dev` at `~/.herdr/worktrees/jeweleryx/dev`), and that worktree's
   ignored files (JewelryX: the four `.env` files named in `.worktreeinclude`, from `.env.example`
   plus the secrets). Every new worktree copies them from there.

## Update

After a push to `main`, the next `wf` command installs it by itself and prints
`wf: updated <old> → <new>`. `wf update` fetches first. After changing `hook.mjs` or the project's
`setup` steps: `wf hook install` again.

## Self-checks

From this folder: `for f in *.selfcheck.mjs projects/*/*.selfcheck.mjs; do node "$f" || echo "FAIL $f"; done`.
Pure checks, no network; `review.selfcheck.mjs` needs a git checkout (this one).
