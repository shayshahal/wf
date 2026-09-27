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
  self-update, pi's agent install.
- **Which one runs is the entry file** (decided 2026-09-27, over an environment variable). The
  kit's `wf.mjs` runs the kit with its defaults; `env/wf.mjs` runs the same kit with Shay's pieces
  plugged into the seams. `~/bin/wf` and worktrunk's hooks call `env/wf.mjs`; the plugin calls the
  kit's. Every command wf starts or prints for an agent names the entry that is running, so a
  round started from one stays in it. An environment variable would have to reach every process
  (hooks, agents, panes), and a missing one would silently run the team's setup on Shay's machine.
- **The rule:** nothing in the kit imports from `env/` or names a machine path; the kit does not
  know the env exists. A selfcheck fails otherwise.

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
| The dev servers | started detached by `wf new` on P, P+10000, P+20000; logs and pids in `.wf/`; stopped by `wf reap`. `wf new` also writes the worktree's `.claude/launch.json` in attach mode, so Desktop's Browser pane shows them (step 3) | `wt tether`, behind portless names |
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
| **Where the orchestrator runs** | a pi session anywhere in the repo | a Desktop session on their clone of JewelryX (whatever it has checked out; the round branches off `origin/dev` either way). After `wf new` it moves into the round's worktree, or they open a new session there (step 5 decides which) |
| **Fetch the ticket** | Monday MCP tools in pi | the Monday connector in Desktop |
| **Worktree** | `wt` in `~/.herdr/worktrees/jeweleryx/<slug>`, from the bare repo | `git worktree add` in `<repo>/.claude/worktrees/<slug>`, from their clone |
| **Setup** | the same steps: secrets, `.env` with production credentials blanked, install and build, verification tools, seed | the same steps, secrets copied from their main checkout |
| **Database** | a MongoDB container per worktree | a database per worktree in their one MongoDB |
| **Dev servers** | `wt tether`, reached at `<slug>.b2b.jewelryx.localhost` and the like | started by `wf new`, reached at `localhost:P` and the like |
| **Ports** | P from the branch | the same P |
| **Moving to the next phase** | the orchestrator runs `wf next` after each phase and does what it prints (step 4) | the same |
| **Dispatch a phase** | pi `subagent` with `round-worker`, in a herdr pane | the `Agent` tool with the plugin's `round-worker`, in Desktop's tasks pane |
| **Fresh context and handoff** | `wf brief`, the token and the required handoff files | the same, plus forks denied and a `SubagentStop` hook that refuses to end without the handoff file |
| **Driving the app** | `control-jewelryx` and playwright-cli, one browser per checkout | the same |
| **T1 (class B/C)** | `wf design`: plannotator on SPEC.md's `## For T1` | `wf design`: the `## For T1` extract and `SPEC-REVIEW.md` open in their editor; they write the verdict line; `wf step implement` refuses until it approves the current SPEC.md (exists today: `t1Gap`) |
| **T2: see the fix** | `wf show`: a headed browser, logged in, on the plan's page | Desktop's Browser pane on the round's B2B or admin (from the worktree's `launch.json`); the orchestrator logs in there with the seed user and opens the plan's `open:` page. `wf show` also works, in a separate window |
| **T2: review the diff** | `wf review`: plannotator on the diff; the orchestrator's bash call waits up to an hour | `wf review` writes `REVIEW.md` and opens it in their editor, then returns; they read the diff in Desktop's diff view, write the verdict line, and say so; the orchestrator runs `wf review --done` |
| **Deliver** | `wf deliver`: push, PR, tracker note | the same; Desktop's CI bar also watches the PR |
| **Merge** | Shay, after his T2 | the round's runner, after their T2 (decided 2026-09-27); `ROUND.md` changes from "Shay only" to "whoever ran the round, after T2 approved". Deploying stays Shay's |
| **Status across rounds** | `wf status --all`, herdr panes | `wf status --all`, Desktop's sidebar |
| **Cleanup** | `wf reap`: `wt remove`, the container, its volume and network, portless routes | `wf reap`: stop the servers, drop the round's database, `git worktree remove` |
| **Dev and QA stacks** | `wf stacks` | none |
| **Changing the method** | push to `main`; live for Shay at once | reaches them with the next plugin version Shay releases |

## Constraints

- **Shay's workflow does not regress.** Every step ends with one real cycle through `env/wf.mjs`
  (wf AGENTS.md), and it must behave as before.
- **The team's v1 stays untouched until this ships.** The plugin's release retires v1's
  orchestrators (step 7, decided 2026-09-27); until then the verification plan's *Constraint* holds.
- **No round config in the project repo** (above).

## Steps

### 1. Ports without worktrunk

- **What:** `basePortForBranch` and `slugForBranch` in plain JS, reproducing wt's `hash_port` and
  `sanitize`. `worktree.mjs` stops calling `wt step eval`.
- **Why:** every prompt's URLs, the repro config and `wf show` need the ports, and today only `wt`
  can compute them (audit, 2).
- **Check:** equal to `wt step eval` for every live branch and 200 generated names, kept as a
  selfcheck table.
- **Result (2026-09-27): done.**
  - `ports.mjs` implements SipHash-1-3 with zero keys (Rust's `DefaultHasher`) over the branch's
    UTF-8 bytes plus `0xFF`, and the `/`/`\` → `-` rule, from worktrunk 0.76.0's source
    (`expansion.rs`, `string_to_port` and `sanitize_branch_name`).
  - It matched `wt` on 307 names, 0 mismatches: the repo's 97 branches and 210 generated ones
    (Hebrew, CJK, emoji, spaces, backslashes, lengths around the 8-byte blocks). The table is
    `ports.selfcheck.json`.
  - `worktree.mjs` keeps its exports; no wf command spawns `wt` for a port or name any more.
  - Cycle from the editing clone: `wf new bench/port-check`. The setup hook (port from wt), the repro
    config (port from `ports.mjs`) and the running servers all used 13490; `doctor` green; reaped.

### 2. Draw the line: `env/` and its entry

- **What:**
  - The dispatcher becomes `run(argv, seams)` in the kit. `wf.mjs` calls it with the kit's
    defaults, `env/wf.mjs` with Shay's pieces.
  - Move behind the seams: worktrunk create/remove and hooks (`hook.mjs`), the bare layout,
    Docker MongoDB (`db.mjs`'s compose parts, `mongo.compose.yml`), portless (`dev.mjs`, and the
    portless names the review skeleton prints: `review-format.mjs` `devUrlsFor`),
    `stacks.mjs` and the QA compose file, self-update (`update.mjs`), the plannotator and herdr
    adapters, pi's agent install.
  - The two places the kit names itself use the running entry: `wf new` starting
    `wf step classify`, and the `node …/wf.mjs` that `wf prompt` writes into every prompt.
  - A seam with no kit default yet (worktree creation, the database, secrets) stops with "step 3
    of the kit plan" when run through the kit's entry.
  - A selfcheck: no kit file imports `env/`, and none names `~/.herdr`, `.bare`, `LOCALAPPDATA`,
    `~/.config/wf` or `~/work/wf`.
  - The switch on Shay's machine: `~/bin/wf` runs `env/wf.mjs` when the installed copy has it and
    `wf.mjs` otherwise (set before the merge, so it works on both sides of it), and `wf hook
    install` re-points worktrunk's hooks after the merge.
- **Check:** `node selfcheck.mjs` green; one cycle through `env/wf.mjs` (`wf new bench/env`, the
  stack answers, `doctor`, `wf show`, `wf reap`) behaves as today; an agent's prompt from that
  round names `env/wf.mjs`.
- **Result (2026-09-27): done.**
  - Kit: `seams.mjs` (entry, createWorktree, removalPlan, reviewUI, notify, commands, project),
    `run.mjs` (the dispatcher), `wf.mjs` (the kit's entry), `anchor.mjs`. JewelryX's folder lists
    what it reads from the machine (`machine()` in `projects/jewelryx/index.mjs`): the secrets
    folder, the database (url, up, seedUrl, teardown), browser names, how servers are wrapped,
    extra teardown. `wf seed --reset` drops through the worktree's python, not a mongo shell.
  - Env: `env/wf.mjs`, and moved with their history: `hook.mjs`, `update.mjs`, the herdr and
    plannotator adapters, `stacks.mjs`, the compose files, `STACK.md`; new: `worktrees.mjs` (wt
    create/remove), `projects/jewelryx/{index,mongo,dev}.mjs`.
  - `boundary.selfcheck.mjs`: 44 kit files, none imports `env/` or names the machine. 19
    selfchecks green.
  - Through the kit's entry: `wf status` works; `wf new` refuses with the step-3 message and
    creates nothing; `stacks` and `hook` do not exist.
  - Cycle through `env/wf.mjs` from the editing clone: `wf new bench/env` in 33 s, its own
    container on 43472, the portless name answers, `doctor` 8/8, `wf seed --reset` 5.7 s,
    `wf status`, `wf show`. The research prompt names `env/wf.mjs` three times (the kit's entry
    names `wf.mjs`). `wf reap` left no worktree, container, volume or branch.
  - `~/bin/wf` runs `env/wf.mjs` when the installed copy has it, else `wf.mjs` (backup
    `~/bin/wf.bak-2026-09-27`).

### 3. The kit's defaults run on their own

- **What:**
  - The kit column of *The seams*: `git worktree` create and remove in `<repo>/.claude/worktrees/`
    (Desktop's own place, decided 2026-09-27), a database in the MongoDB at `MONGO_URL`, detached
    servers with pids and logs in `.wf/`, secrets from the person's clone.
  - `wf new` writes the worktree's `.claude/launch.json` with three entries in attach mode: a
    `url` per app on the worktree's ports and no command, so Desktop's Browser pane opens the
    round's apps without running them (`.claude/` is gitignored in JewelryX, `.gitignore:161`).
- **Why wf starts the servers, not Desktop:** Desktop can run all three from `launch.json`, with
  fixed ports per worktree and each server's env naming the others. But the stack must be up
  before research starts and stay up for the whole round, while Desktop starts a server when the
  session asks for a preview. wf starting them keeps one way for every harness; Desktop only shows
  them. If step 5 shows the session keeps its servers for the whole round, wf can write command
  entries instead and stop starting them.
- **Check:** on Shay's machine through the kit's `wf.mjs`, with `wt`, `portless` and plannotator
  off the PATH, against one MongoDB on 27017: `wf new bench/plain`, the stack answers, `doctor` green, a
  repro runs, `wf show`, `wf reap` leaves no server, database or worktree behind.
- **Result (2026-09-27): done.**
  - Kit: `git-worktree.mjs` (create: `git worktree add`, the setup steps side by side, then the
    stack; remove: stop it, the project's teardown while the worktree exists, rm, prune);
    `wf serve` (`serve.mjs`: the stack detached, pid in `.wf/serve.pid`, refuses to start a second
    while one is booting; also how a person restarts a stack that died); `wf new` writes
    `.claude/launch.json`. JewelryX's kit machine: secrets from the main checkout, the database in
    `MONGO_URL` (default 27017, checked before seeding), dropped on reap through the worktree's
    python. The project's `teardown` takes `{ slug, worktree }`.
  - Check, as the team has it: a plain `git clone` on `main` with the four `.env` files in it;
    `wt` (in `~/bin` and WinGet's links), portless, plannotator and herdr off the PATH; the
    project's MongoDB on 27017. `wf new bench/plain` in 29 s, the stack answered 5 s later,
    `doctor` 8/8, a repro green in 39 s (logged in from saved state), `wf show` on the seller's
    orders, `wf seed --reset` 8.2 s, `wf status`, prompts name the kit's `wf.mjs`. Killed stack:
    `wf serve` had it back in ~9 s. A wrong `MONGO_URL` stops setup naming it. `wf reap` left no
    process, port, database or worktree.
  - Found by it: JewelryX's `main` has no `.claude/` in its `.gitignore` (dev has, line 161), so
    a clone on `main` listed the rounds as untracked; the kit adds `/.claude/worktrees/` to the
    repo's exclude file. `uv sync` and git's checkout progress flooded `wf new`'s output (now
    `--quiet`).
  - Shay's cycle through `env/wf.mjs` after it: 28 s, portless 200, `doctor` 8/8, reap clean.

### 4. Enforce fresh context and the handoff (kit)

- **What:**
  - `wf brief <phase>`: the dispatch sends one line ("run `wf brief research` and do exactly what
    it prints"), so the brief is wf's own text, never the orchestrator's summary.
  - Each brief records a token; the phase's file carries it.
  - `wf next`: reads the state and the round folder and prints the one thing to do now:
    `dispatch <the one-line brief>`, `ask <person>: <question>`, `wait <person>`, `deliver` or
    `done`. The round skill's *On each result* table becomes this command, with a selfcheck per
    row. The orchestrator's whole job is a loop: run `wf next`, dispatch a fresh `round-worker`
    with the line it printed, or tell the person; when the agent returns, run `wf next` again.
    Phases follow each other automatically, each in a fresh context, and the loop stops only where
    a person is needed (Asks, BLOCKED, T1, T2). The orchestrator holds only these lines and the
    agents' short replies, so its own context stays small over a round.
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
  - whether the orchestrator can drive the Browser pane (log in with the seed user, open the
    plan's page) for T2;
  - whether a session's servers live for the whole round (step 3's *Why*);
  - that the editor fallback does not block: `editor.mjs` waits for the editor it spawns, which
    is fine for VS Code's `code` (it returns at once) and hangs on a terminal editor with no
    terminal.
- **Check:** one bench round (a replayed ticket) in Desktop, start to PR, run by me in the fresh
  setup of step 6.

### 6. Shay runs a round the way the team will

- **What:** I set up a fresh JewelryX the way a team member has it, and Shay runs one round there
  in Desktop:
  - a plain clone of the real JewelryX repo (no bare repo, no herdr path), with `dev` checked out
    and its `.env` files. The round is a real ticket: its PR and merge go into the real `dev`
    (Shay, 2026-09-27);
  - one MongoDB on 27017;
  - the plugin installed from the wf marketplace (the kit's entry);
  - nothing of Shay's reachable from it: today the env installs wf's agents into
    `~/.claude/agents`, and a user-level agent overrides a plugin's agent with the same name
    (Claude Code: user scope ranks above plugins). The env stops installing Claude Code agents
    (the plugin carries them), and the setup confirms none is left.
- **Check:** the round reaches a merged PR with nothing from Shay's env. Every place it stalls
  becomes a fix at its owner (round skill, *When a round goes wrong*).

### 7. Ship it to the team

- **What:**
  - Release the first plugin version (a tag on `main`).
  - `ROUND.md`: the round's runner merges after T2 approved; deploying stays Shay's.
  - Retire v1's orchestrators in JewelryX (`bug-fix-orchestrator`, `cr-implement-orchestrator`
    and what only they use): v1 is deprecated when this ships (Shay, 2026-09-27), so "start <id>"
    has one owner. This ends the verification plan's *Constraint*.
  - Saar and Einat install the plugin; their first rounds are the adoption measure (the
    verification plan's step 7 counts).

## Decided (2026-09-27)

1. **Merging a team round:** the round's runner merges after their T2. Deploying stays Shay's.
2. **Worktrees:** Desktop's own place, `<repo>/.claude/worktrees/<slug>`.
3. **Releasing the plugin:** a tag on `main`, after a round that went well or on demand.
4. **The trigger:** none separate. Shipping this retires v1's orchestrators (step 7).

## Not in this plan

- Moving the round config into the project repo: version drift between kit and project for no
  gain the team needs (the complexity review).
- A second project: the kit stays portable as today; its second project decides what is shared.
- Desktop running the servers from `launch.json` (step 3's *Why*): possible, not needed while wf
  starts them.
