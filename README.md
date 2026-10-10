# wf

Shay's agent workflow: a ticket becomes a merged PR through one working agreement (TICKET.md for
an ordinary round, AGREEMENT.md for a consequential one), a build that checks and steers,
deterministic checks (`wf check`), one final independent assessment, and two human gates (T1 on the
agreement for consequential work, T2 on the diff, both in plannotator). Runs in pi and in Claude
Code, on Windows.

It lives outside every project's repo on purpose. A project's repo keeps only the round memory each
round commits (for JewelryX, `bug-reports/<round>/`).

## Where things are

- `wf.mjs`: the kit's entry. The code is under `src/`, one module per command; the pure functions are
  checked by the `*.selfcheck.ts` files `src/selfcheck.ts` runs (beside the module that owns them):
  - `src/run.ts` is the dispatcher; `src/paths.ts` says where wf's own files are (`WF_ROOT`)
  - `src/models.ts`: each phase's effort level (`low` for the read-only judges, `medium` for the
    rest) and `wf models`, the model each level runs on here. Agent files say `effort:`, never a
    model: Claude Code's aliases are the kit's, pi's patterns are Shay's (`env/models.ts`)
  - `src/seams.ts`: what differs between machines (worktrees, the database, review screen,
    notifications, the model for each effort level) and the kit's defaults for it. An env's own
    entry plugs its pieces in: `env/wf.mjs` is Shay's.
  - `src/project.ts` → `projects/<name>/`: everything project-specific. See *Projects* below.
  - `src/round/`: a round's state and its loop. `state.ts` is `.wf/state.json` (versioned; an
    old-route round is refused before mutation); `next.ts` is `wf next`, the round's next action
    from its state and files (the orchestrator's whole loop); `agreement.ts` is the working
    agreement (which file it is, the agreed-material sha T1 binds, the verification cases);
    `brief.ts` + `prompt.ts` are `wf brief <phase>`, what a phase agent runs first;
    `step`, `ask`/`decide` (`decide --revise` sends a round back to `agree` for a new T1),
    `status`, `notes`, and `handoff-hook.ts` (`wf handoff`, the Claude Code hooks)
  - `src/gates/`: what a round has to pass. `classify`, T1 (`agree.ts`) and T2 (`review.ts`,
    both written through `review-format.ts`), `wf check` (`check.ts`; `--repro`, the three runs of
    a repro case; `--suites`, the whole suites the round's diff reaches; and, on a verification
    case, the case's own test with the change taken back to HEAD — red-base; `--case` names one),
    and `wf deliver`
  - `src/worktrees/`: `worktree.ts` is the one interface to worktrees: list, ports and slugs
    (`ports.ts`), create (`wf new`), remove (`wf reap`). Where no env plugs its own in,
    `git-worktree.ts` makes them in `<repo>/.claude/worktrees/`. No worktree is served from its
    creation: `wf serve` (`serve.ts`) runs the stack in the background (pid and logs in the
    worktree's `.wf/`), started by the phases that use it (`wf brief assess`, `wf check`
    before the repro or a test that drives the app, `wf review`)
  - `src/plugin/`: `plugin.ts` writes `claude/agents/` from `agents/`; `anchor.ts` fills the paths
    in text (below)
  - `src/selfcheck.ts` runs every selfcheck and tsc; `src/boundary.selfcheck.ts` fails if the kit
    reaches into `env/`
- `env/`: Shay's machine, which the kit never imports: worktrunk and its hooks (`env/hook.ts`,
  `env/worktrees.ts`), self-update (`env/update.ts`), plannotator and herdr (`env/adapters/`), and
  per project where the worktrees' databases live (JewelryX: one MongoDB) and portless
  (`env/projects/`).
  `env/projects/jewelryx/rework.ts` measures how much of each change's code is changed again within N days, and by
  what (a fix, a revert, a sweep, other work): wf rounds against other ticket work and other PRs
- `skills/round/SKILL.md`: the orchestrator skill ("start 662", "resume 662"); `skills/agreement-session/` for T1; `skills/show-me/` for a view
- `prompts/`: one prompt per phase, `agree`, `build` and `assess` (`wf prompt <phase>` prints it)
- `.claude-plugin/` + `claude/`: the Claude Code plugin (manifest, marketplace, agents, hooks)
- `agents/`: `round-worker` (every phase), `codebase-locator` and `codebase-analyzer` (agree, pi only), `harness-fixer` (harness trouble, outside the round)
- `process/`: lifecycle, classes, the agreement template (`AGREEMENT-TEMPLATE.md`), the views an agreement carries (`SHOW-ME.md`), review format, touchpoints, standards
- `docs/plans/2026-09-17-workflow-v2.md`: the plan wf was built from (history; done)
- `docs/research/papers-and-first-principles.md`: what wf is for, and the five papers read after it was built
- `docs/research/show-me-maintainability-papers.html`: five papers on what happens to agent code after it merges, against wf (notes per paper in `docs/research/papers/`)
- `docs/demo/`: the agreement pages rendered (`process/SHOW-ME.md`, `planPage`, the `manual:` cell) — `node docs/demo/make-demo.mjs`, then open `.wf/AGREEMENT-T1.html` (T1, the page `wf agree` annotates) and `.wf/AGREEMENT.html` (T2)

Text names wf's own files as `{{wf}}/…` (prompts, docs) or `${CLAUDE_PLUGIN_ROOT}/…` (the skills),
and the project's folder as `{{project}}/…`: `wf prompt`, Claude Code (for the plugin) and the
installed copy fill in the real paths (`anchor.ts`).

## Install (the team: the Claude Code plugin)

The kit alone, as a Claude Code plugin: this repo is its marketplace (`.claude-plugin/`).

- **Install:** in Claude Code Desktop, add the marketplace `shayshahal/wf` and install `wf`; or
  `claude plugin marketplace add shayshahal/wf` then `claude plugin install wf@wf`.
- **It carries:**
  - the skills `wf:round`, `wf:agreement-session` and `wf:show-me`;
  - the agents `wf:round-worker`, `wf:codebase-locator`, `wf:codebase-analyzer` and `wf:harness-fixer` (generated
    from `agents/` by `node plugin.ts`);
  - two hooks: a phase agent is sent back once while its handoff is missing (`wf handoff
    check`), and no fork is started inside a round (`wf handoff no-fork`).
- **Needs:** git, gh, node ≥ 22.18 (wf is TypeScript, which Node runs as is from 22.18), the project's own tools (JewelryX: pnpm, uv), and one MongoDB
  (`MONGO_URL`, default `mongodb://127.0.0.1:27017`; JewelryX: unset and down, wf brings up the repo's
  own with Docker). The project's `.env` files sit in the
  person's clone, where they keep them to run the app; every round's worktree copies them.
- **Try a change without installing:** `claude --plugin-dir <this clone>`.
- **Updates:** turn on auto-update for the `wf` marketplace (`/plugin` → Marketplaces → wf →
  Enable auto-update). It is off for every marketplace but Anthropic's, and the plugin then stays at
  the version first installed (BJEW-562, 2026-09-27: 0.1.0 ran the round after 0.1.2 merged). A
  push reaches the team only with a new `version` in `.claude-plugin/plugin.json`: that bump is the
  release. Auto-update runs inside a session, up to ten minutes after its first message, and the
  session keeps the version it started with: a merge reaches the session after next (BJEW-602,
  2026-09-27: started 15 minutes after 0.1.6 merged, it ran 0.1.4 and posted to Monday before T2).
  To start a round on what was just merged: `claude plugin update wf@wf` in a shell first.
- **A round's session:** open the clone as it is: its own branch in the branch picker, the
  *worktree* box off. `wf new` makes the round's branch and worktree, and the session moves into
  it; `resume <id>` does the same. Picking the round's branch fails (git: it is checked out in the
  round's worktree), and a Desktop worktree is one the round never uses.
- **Does it reproduce?** `/wf:round check <id>`: a round that measures the ticket's `## Repro` and
  stops, with the tracker untouched. "go" turns it into the round; "stop" reaps it.

## Projects

wf runs rounds on one project at a time, named in `project.ts`. Its folder, `projects/<name>/`,
holds everything wf knows about it, and `index.ts` there is the only file the rest of wf imports:

- names, ports and URLs of its apps; which changed files are pages
- `setup` (the pre-start steps), `serve`, `teardown`
- `checks`: the commands `wf check` runs for a diff
- its round folder, base branch, round branches, people, contract-paths file, tracker note
- `guidance`: the folder of its notes for agents, in its own repo. A note whose frontmatter has
  `globs:` (Amp's AGENTS.md form, from the repo root) is put in the brief of each commit whose row
  touches a matching file (`src/round/guidance.ts`); the rest are named by the phase prompts
- `commands`: wf subcommands only this project has (JewelryX: `seed`, `show`)

Next to it: `ROUND.md` (tracker, statuses, people, branches: read by the round skill),
`prompts/<phase>.md` (appended to that phase's prompt) and whatever implements the above.

There is one project, JewelryX. When a second one arrives, it gets a folder like this one, and
what the two share becomes the interface. Not before.

## Install (Shay's machine, the kit with `env/`)

The team installs the kit alone (docs/plans/2026-09-27-kit-and-env.md, step 5). Needs: git, node ≥ 22.18, [worktrunk](https://github.com/max-sixty/worktrunk) (`wt`), `gh`, pi and/or
Claude Code, plus what the project's `setup` runs (JewelryX: pnpm, uv, docker, portless).

1. `git clone https://github.com/shayshahal/wf ~/work/wf`: the editing clone. Never run wf from it.
   Then `git -C ~/work/wf config core.hooksPath .githooks`: its pre-push hook runs every self-check,
   and `npm ci` in it: tsc, which the self-checks run (wf itself needs no packages).
2. `node ~/work/wf/env/update.ts`: installs the committed code into `~/.local/share/wf`, and wf's
   agents into pi (`~/.pi/agent/agents`). Claude Code gets wf from the plugin, as the team does:
   nothing of wf goes into `~/.claude/`, where a user-level agent or skill would outrank the plugin's.
3. Put `wf` on the PATH through Shay's entry: `~/bin/wf` is
   `exec node "$HOME/.local/share/wf/env/wf.mjs" "$@"`, and `~/bin/wf.cmd` is
   `@node "%USERPROFILE%\.local\share\wf\env\wf.mjs" %*`.
4. Skills: add `~/.local/share/wf/skills/round`, `~/.local/share/wf/skills/agreement-session` and
   `~/.local/share/wf/skills/show-me` to pi's `settings.json` `skills`.
5. `wf hook install`: worktrunk's user config gets the project's hooks, calling the installed copy's
   `env/wf.mjs`.
6. The project's clone: a bare repo, and a worktree for its base branch (JewelryX):
   ```
   git clone --bare https://github.com/Raynw-MediaTech/jeweleryx ~/work/jeweleryx/.bare
   echo 'gitdir: ./.bare' > ~/work/jeweleryx/.git
   git -C ~/work/jeweleryx/.bare config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
   git -C ~/work/jeweleryx/.bare fetch origin      # a bare clone has no origin/dev until this
   git -C ~/work/jeweleryx/.bare worktree add ~/.herdr/worktrees/jeweleryx/dev dev
   ```
7. The project's secrets, on this machine (JewelryX: the four `.env` files `.worktreeinclude` names,
   from `.env.example` plus the real values) at the same paths under `~/.config/wf/<project>/`.
   Every new worktree copies them from there.

## Update

After a push to `main`, the next `wf` command installs it by itself and prints
`wf: updated <old> → <new>`. `wf update` fetches first. After changing `env/hook.ts` or the project's
`setup` steps: `wf hook install` again.

## Self-checks

From this folder: `node src/selfcheck.ts` (every `*.selfcheck.ts`, wf's and the projects', `tsc`, and
lint-kit's error-handling rules through `eslint`, in parallel; `npm ci` first). Pure checks, no network; `review.selfcheck.ts` needs a git checkout (this one). The pre-push hook
runs it and refuses a red push.
