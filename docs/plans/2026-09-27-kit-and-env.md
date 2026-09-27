# Plan: the round kit and Shay's env — one wf, two ways to run it

Date: 2026-09-27. Status: proposed. Follows `2026-09-27-portability-audit.md` (the assumptions this
removes) and comes after `2026-09-27-verification-skill.md` step 5 (PR #1) lands.

## Goal

Saar and Einat run whole rounds on their own machines in **Claude Code Desktop**, with ordinary
developer tools and one MongoDB. Shay keeps his workflow as it is: worktrunk and the bare repo, a
MongoDB container per worktree, portless, plannotator, pi, herdr, the dev and QA stacks, and
self-update from `main`. wf stays portable to other projects as it is today.

## The split

One repo, two layers, one rule between them.

- **The kit:** today's core (`*.mjs` at the root, `prompts/`, `process/`, `skills/`, `agents/`)
  plus `projects/<name>/` minus what is Shay's machine. It is what the team installs, as a Claude
  Code plugin. It runs with nothing but git, node, the project's own tools and one database.
- **The env (`env/`):** everything about Shay's machine: worktrunk, the bare repo layout, herdr,
  Docker MongoDB per worktree, portless, `wt tether`, plannotator, the dev and QA stacks,
  self-update, pi's agent install. It is active only when `WF_ENV=shay` (`~/bin/wf` sets it).
- **The rule:** nothing in the kit imports from `env/` or names a machine path. A selfcheck fails
  otherwise. The env plugs in through the seams below; with no env, the kit's defaults run.

What the project owns does not change: JewelryX keeps its facts (`docs/agents/`) and its
verification skill (`docs/agents/verify-jewelryx/`). No round config moves into the project repo:
a config there would meet whichever kit version is installed and drift from it (the complexity
review, 2026-09-27).

### The seams: where the env plugs into the kit

| Seam | Kit default (the team) | Env (Shay) |
|---|---|---|
| Create and remove a worktree | `git worktree add -b <branch> <repo>/.claude/worktrees/<slug> origin/<base>`, and `git worktree remove` | `wt switch --create` into `~/.herdr/worktrees/…` from the bare repo; `wt remove` |
| Ports | P from the branch, computed in plain JS; the same numbers as wt's `hash_port` | the same function |
| The database | `jewelryx_<slug>` in the MongoDB at `MONGO_URL` (default `mongodb://127.0.0.1:27017`) | a container per worktree at 40000+(P−10000) |
| The dev servers | started detached by `wf new` on P, P+10000, P+20000; logs and pids in `.wf/`; stopped by `wf reap` | `wt tether`, behind portless names |
| Secrets | copied from the person's main checkout (the files `.worktreeinclude` names) | `~/.config/wf/jewelryx` |
| T1 and T2 UI | the verdict file opens in `$VISUAL`/`$EDITOR`/VS Code (exists today: `editor.mjs`) | plannotator (`adapters/plannotator.mjs`) |
| Notifications | none | herdr pane metadata (`adapters/herdr.mjs`) |
| Install and update | the Claude Code plugin, a pinned version | the editing clone and `update.mjs` self-update |

## Running a round: Shay's workflow and Claude Code Desktop

The phases, prompts, handoff files, `wf check`, the gates and the verification skill are the same
in both. What differs is the machine and the harness.

| Stage | Shay: wf with the env, in pi | The team: the kit, in Claude Code Desktop |
|---|---|---|
| **Install** | editing clone at `~/work/wf`, installed copy in `~/.local/share/wf`, `~/bin/wf` | install the wf plugin from its marketplace (the wf repo) inside Desktop |
| **Update** | automatic on the next `wf` command after `main` moves | when they update the plugin; they get the version Shay released, not every push |
| **Prerequisites** | wt, Docker, portless, plannotator, pi, herdr, gh, node, pnpm, uv | git, gh, node, pnpm, uv, one MongoDB, the Monday connector |
| **Where the orchestrator runs** | a pi session anywhere in the repo | a Desktop session on their main checkout. After `wf new` it moves into the round's worktree, or they open a new session there (step 5 decides which) |
| **Fetch the ticket** | Monday MCP tools in pi | the Monday connector in Desktop |
| **Worktree** | `wt` in `~/.herdr/worktrees/jeweleryx/<slug>`, from the bare repo | `git worktree add` in `<repo>/.claude/worktrees/<slug>`, from their clone |
| **Setup** | the same steps: secrets, `.env` with production credentials blanked, install and build, verification tools, seed | the same steps, secrets copied from their main checkout |
| **Database** | a MongoDB container per worktree | a database per worktree in their one MongoDB |
| **Dev servers** | `wt tether`, reached at `<slug>.b2b.jewelryx.localhost` and the like | started by `wf new`, reached at `localhost:P` and the like |
| **Ports** | P from the branch | the same P |
| **Dispatch a phase** | pi `subagent` with `round-worker`, in a herdr pane | the `Agent` tool with the plugin's `round-worker`, in Desktop's tasks pane |
| **Fresh context and handoff** | `wf brief`, the token and the required handoff files | the same, plus forks denied and a `SubagentStop` hook that refuses to end without the handoff file |
| **Driving the app** | `control-jewelryx` and playwright-cli, one browser per checkout | the same |
| **T1 (class B/C)** | `wf design`: plannotator on SPEC.md's `## For T1` | `wf design`: the `## For T1` extract and `SPEC-REVIEW.md` open in their editor; they write the verdict line; `wf step implement` refuses until it approves the current SPEC.md (exists today: `t1Gap`) |
| **T2: see the fix** | `wf show`: a headed browser, logged in, on the plan's page | the same `wf show` (it is `control-jewelryx open … --headed`) |
| **T2: review the diff** | `wf review`: plannotator on the diff; the orchestrator's bash call waits up to an hour | `wf review` writes `REVIEW.md` and opens it in their editor, then returns; they read the diff in Desktop's diff view, write the verdict line, and say so; the orchestrator runs `wf review --done` |
| **Deliver** | `wf deliver`: push, PR, tracker note | the same; Desktop's CI bar also watches the PR |
| **Merge** | Shay | per `ROUND.md`: today Shay only, so a team round ends with a PR waiting on Shay (decision 1) |
| **Status across rounds** | `wf status --all`, herdr panes | `wf status --all`, Desktop's sidebar |
| **Cleanup** | `wf reap`: `wt remove`, the container, its volume and network, portless routes | `wf reap`: stop the servers, drop the round's database, `git worktree remove` |
| **Dev and QA stacks** | `wf stacks` | none |
| **Changing the method** | push to `main`; live for Shay at once | reaches them with the next plugin version Shay releases |

## Constraints

- **Shay's workflow does not regress.** Every step ends with one real cycle with `WF_ENV=shay`
  (wf AGENTS.md), and it must behave as before.
- **The team's v1 stays untouched** (the verification plan's *Constraint*). Until v1 is retired,
  the kit's round skill answers a trigger v1 does not (decision 4).
- **No round config in the project repo** (above).

## Steps

### 1. Ports without worktrunk

- **What:** `basePortForBranch` and `slugForBranch` in plain JS, reproducing wt's `hash_port` and
  `sanitize`. `worktree.mjs` stops calling `wt step eval`.
- **Why:** every prompt's URLs, the repro config and `wf show` need the ports, and today only `wt`
  can compute them (audit, 2).
- **Check:** equal to `wt step eval` for every live branch and 200 generated names, kept as a
  selfcheck table.

### 2. Draw the line: `env/` and `WF_ENV`

- **What:**
  - Move behind the seams: worktrunk create/remove and hooks (`hook.mjs`), the bare layout,
    Docker MongoDB (`db.mjs`'s compose parts, `mongo.compose.yml`), portless (`dev.mjs`, and the
    portless names the review skeleton prints: `review-format.mjs` `devUrlsFor`),
    `stacks.mjs` and the QA compose file, self-update (`update.mjs`), the plannotator and herdr
    adapters, pi's agent install.
  - The kit loads `env/index.mjs` only when `WF_ENV=shay`.
  - A selfcheck: no kit file imports `env/`, and none names `~/.herdr`, `.bare`, `LOCALAPPDATA`,
    `~/.config/wf` or `~/work/wf`.
- **Check:** `node selfcheck.mjs` green; one `WF_ENV=shay` cycle (`wf new bench/env`, the stack
  answers, `doctor`, `wf show`, `wf reap`) behaves as today.

### 3. The kit's defaults run on their own

- **What:** the kit column of *The seams*: `git worktree` create and remove, a database in the
  MongoDB at `MONGO_URL`, detached servers with pids and logs in `.wf/`, secrets from the main
  checkout.
- **Check:** on Shay's machine with `WF_ENV` unset, and `wt`, `portless` and plannotator off the
  PATH, against one MongoDB on 27017: `wf new bench/plain`, the stack answers, `doctor` green, a
  repro runs, `wf show`, `wf reap` leaves no server, database or worktree behind.

### 4. Enforce fresh context and the handoff (kit)

- **What:**
  - `wf brief <phase>`: the dispatch sends one line ("run `wf brief research` and do exactly what
    it prints"), so the brief is wf's own text, never the orchestrator's summary.
  - Each brief records a token; the phase's file carries it.
  - The command that consumes a handoff refuses without the current file and its sections:
    RESEARCH.md with a repro command before `plan`; PLAN.md rows before `implement`; VALIDATION.md
    with a verdict before `deliver`.
- **Why:** today these are rules in the round skill; nothing checks them, and a brief once went out
  as the literal text `$(cat /tmp/r1.txt)` (2026-09-27).
- **Check:** selfchecks for each refusal; one pi round with no change in outcome.

### 5. The Claude Code plugin

- **What:**
  - `.claude-plugin/plugin.json` and a marketplace entry in the wf repo: `skills/round`,
    `skills/design-session`, `agents/round-worker` and the research agents with Claude Code model
    names (pi's copies keep pi's names, installed by the env).
  - A `SubagentStop` hook: `wf handoff check` keeps a phase agent from ending without its file.
  - Forks denied (`Agent(fork)`).
  - The skill's Claude Code column rewritten for Desktop, from what this step measures.
- **To find out, in this step:**
  - how a plugin skill names the plugin's own folder (`wf` has to be run from there);
  - whether a plugin can ship the fork rule, or the person adds one line to their settings;
  - whether the session can move into the round's worktree after `wf new` (`EnterWorktree`),
    or the person opens a new session there;
  - how long a Bash call may run (T2 must not depend on it);
  - that the editor fallback does not block: `editor.mjs` waits for the editor it spawns, which
    is fine for VS Code's `code` (it returns at once) and hangs on a terminal editor with no
    terminal.
- **Check:** one bench round (a replayed ticket) in Desktop, under a separate Windows user with
  none of Shay's tools or files, start to PR.

### 6. Pilot with Saar

- **What:** Saar runs one real round in Desktop on his machine.
- **Check:** it reaches a PR with no help from Shay beyond T2 and the merge. Every place he got
  stuck becomes a fix at its owner (round skill, *When a round goes wrong*).

## Decisions for Shay

1. **Merging a team round.** `ROUND.md` says only Shay merges to `dev`. Keep it (a team round ends
   at a PR waiting on Shay), or let the round's runner merge after T2.
2. **Where the kit puts worktrees:** `<repo>/.claude/worktrees/<slug>` (Desktop's own place, which
   it already knows how to clean up), or next to the repo.
3. **Releasing the plugin:** when a version is cut (a tag on `main` after a round that went well,
   or on demand).
4. **The team's trigger** while v1's orchestrators still answer "start <id>".

## Not in this plan

- Moving the round config into the project repo: version drift between kit and project for no
  gain the team needs (the complexity review).
- A second project: the kit stays portable as today; its second project decides what is shared.
- Desktop's `.claude/launch.json` for the servers: JewelryX's three servers need each other's
  ports, which `autoPort` hands out independently; the kit starts them itself.
