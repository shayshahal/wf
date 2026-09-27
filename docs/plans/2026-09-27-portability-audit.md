# Audit: what wf assumes about Shay's machine, for the team in Claude Code Desktop

Date: 2026-09-27. Target (Shay): Saar and Einat run rounds on **their own machines, in Claude Code
Desktop**, not in pi, and with none of Shay's tools assumed. This audit lists every assumption wf
and the round make about Shay's environment, with the file that holds it and what could replace it.
It decides nothing: *Questions for Shay* at the end come first.

Sources: wf at `plans/verification-skill` (`aec0d7b`); Claude Code docs read 2026-09-27
(`code.claude.com/docs/en/desktop`, `/sub-agents`, `/worktrees`).

## What Claude Code Desktop brings (and what it replaces)

| Desktop has | Doc | Could replace in wf |
|---|---|---|
| A worktree per session, under `.claude/worktrees/`, copying `.worktreeinclude` files | desktop, worktrees | worktrunk's create and remove |
| `WorktreeCreate` / `WorktreeRemove` hooks that replace worktree creation entirely | worktrees | wt's setup and teardown hooks: the hook can run `wf new` |
| `.claude/launch.json`: several dev servers per project, `autoPort` hands a free port as `PORT` | desktop | `serve` and portless, maybe the port hash too |
| A Browser pane that previews the running app, with *Persist sessions* for logins | desktop | `wf show` for T2 |
| A diff view with line comments that go back to the session, and PR/CI monitoring through `gh` | desktop | plannotator for T2 |
| Subagents that start fresh; forks that can be denied with `Agent(fork)` in `.claude/settings.json`; `SubagentStop` hooks | sub-agents | the round's "fresh agent + handoff file" rules (enforcement plan) |
| Plugins: skills, agents and hooks, installed from a git marketplace inside the app | desktop | wf's install (`update.mjs`, `~/bin/wf`, skill paths) |
| Connectors (MCP) added from the app | desktop | the Monday tools ROUND.md uses |
| The same settings files as the CLI | desktop | project settings and hooks committed in JewelryX |

## Assumptions, by area

Size: **S** a few lines · **M** a module · **L** a redesign of that piece.

### 1. Installing and updating wf

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| The editing clone is at `~/work/wf`; updates copy from its `.git` | `update.mjs:14` (`SOURCE`) | no such clone | install from the GitHub repo (a plugin marketplace), not from a local clone | M |
| The installed copy at `~/.local/share/wf`, and `~/bin/wf` on PATH | `update.mjs:12`, README *Install* 2–3 | no `~/bin` on PATH on Windows or macOS by default | a plugin: skills call `node <plugin root>/wf.mjs`; `wf prompt` already writes absolute paths into prompts | M |
| Agents copied to `~/.pi/agent/agents` and `~/.claude/agents` | `update.mjs:68-69` | works for Claude Code; the pi half is unused | the plugin's `agents/` | S |
| Skills added by hand to pi's settings | README *Install* 4 | not pi | the plugin's `skills/` | S |
| Self-update on every command when `main` moved | `update.mjs` | a push to `main` goes live on their machines too | plugin versions: the team updates on purpose | S |

### 2. Worktrees

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| worktrunk (`wt`) creates and removes worktrees and runs the hooks | `worktree.mjs:84,122`, `hook.mjs` | not installed | `git worktree add` + wf running the setup steps itself; or Desktop's `WorktreeCreate` hook calling `wf new` | L |
| **Ports come from `wt step eval hash_port`** | `worktree.mjs:43-57`; used by `prompt.mjs`, `new.mjs`, `show`, the repro config | no `wt`, so no ports, and every prompt's URLs break | the same hash in plain JS (wt's filter is deterministic: check it matches for existing branches) | S |
| Worktrees at `~/.herdr/worktrees/jeweleryx/` (wt's configured path) | `stacks.mjs:31` | none | only `wf stacks` reads it (Shay-only) | — |
| A bare repo plus a worktree for `dev` | README *Install* 6 | a normal clone | wf reads `git worktree list`; confirm nothing needs the bare layout | S |

### 3. A worktree's stack

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| Docker runs a MongoDB container per worktree | `db.mjs:55-74`, `mongo.compose.yml` | Docker Desktop may not be installed | one local MongoDB, a database per worktree (`jewelryx_<slug>`, already per-slug); or keep Docker as a stated requirement | M |
| portless names every app `<slug>.<app>.jewelryx.localhost` | `dev.mjs` | not installed | direct ports (`PORTLESS=0` exists); the verification CLI and repros already use them | S |
| Secrets come from `~/.config/wf/jewelryx` | `env.mjs:12` | empty | copy from the person's main checkout, as `.worktreeinclude` means (Desktop does this for its own worktrees) | S |
| `uv`, `pnpm`, node 26 | setup steps, `db_snapshot.py`, `control-jewelryx` | a JewelryX dev machine has them; Einat's may not | state as prerequisites; `doctor` checks them | S |
| The three dev servers run under `wt step tether` | `hook.mjs:27`, `dev.mjs` | no `wt` | `.claude/launch.json` (Desktop starts and shows them), or `wf new` starting them detached | M |

### 4. The harness

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| The orchestrator dispatches with pi's `subagent` | `skills/round/SKILL.md` *Dispatch in this harness* | the Claude Code column exists but has never run a round | run one round in Claude Code | — |
| Model ids in pi's form (`anthropic/claude-sonnet-5`) | `agents/codebase-*.md:4` | Claude Code takes `sonnet` or `claude-sonnet-5` | per-harness agent files, or plain aliases | S |
| `wf review` blocks a bash call for up to an hour | `SKILL.md:62` | Claude Code's Bash tool has a much shorter default limit (to verify) | T2 in Desktop's diff view, or `wf review` returning at once and a second command reading the verdict | M |
| herdr pane metadata | `adapters/herdr.mjs` | absent; the adapter is best-effort | nothing to do | — |
| Fresh agent and handoff file are rules, not checks | round skill | same in Desktop | `wf brief` + token + required handoff files; `Agent(fork)` denied in the project's settings | M |

### 5. The operating system

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| Windows-only process control (`schtasks`, `powershell`, `taskkill`) | `stacks.mjs` | only `wf stacks`, Shay-only, loaded lazily | nothing, if the team never runs it | — |
| Prompts tell agents the files are CRLF | `prompts/*.md` | true on Windows with autocrlf; wrong on macOS | "keep each file's line endings" | S |
| Git Bash quirks | `update.mjs:49` (tar), `unMsys` | harmless elsewhere | — | — |
| Junctions for skill links | `round.mjs` | Node ignores the type off Windows | — | — |

### 6. People and authority

| Assumption | Where | On a team machine | Replacement | Size |
|---|---|---|---|---|
| Shay is the gate at T1 and T2, and the only one who merges | round skill, `ROUND.md`, `step.mjs` (`waiting_on: shay`) | a round Saar runs still waits on Shay? | decide who gates a team round | — |
| The orchestrator talks to "Shay" | round skill *Talking to Shay* | the person running it | "the person running the round", Shay where authority is his | S |
| Monday through MCP tools (`monday_get_assets`) | `ROUND.md` | a Monday connector must be set up in their Desktop | a stated prerequisite, or the person pastes the ticket | S |

### 7. What is already portable

- The verification skill: Node, playwright-cli, and `uv` for `db_snapshot.py`. It is linked into
  `.claude/skills` in wf's worktrees. Outside wf, the team gets it only once it is in `dev` and
  linked (today `newRound` links it and `link-tools` does not, on purpose).
- `wf check`, `wf prompt`, `wf ask/decide`, the state file, the round folder: plain Node and git.
- The phase prompts: nothing pi-specific except model names in agent files.

## Questions for Shay

1. **Does Saar or Einat run a round end to end, or only part of it** (for example research and
   repro, then the PR to you)? That decides who the T1/T2 gates are and whether Monday, merge and
   T2 matter on their machines.
2. **Their OS, and whether Docker Desktop, `uv` and `pnpm` are installed.** I don't know what either
   of them has; v1's verify skills drive a running stack, so whoever runs v1 has one.
3. **Worktrees: Desktop's own sessions, or `wf new`?** Desktop makes one per session, and the
   round needs one per round with a stack. A `WorktreeCreate` hook calling `wf new` joins the two.
4. **Distribution: a Claude Code plugin from the wf repo?** It installs inside Desktop and replaces
   `update.mjs` and `~/bin/wf` for the team, while Shay keeps his install.

## Order, once answered

The smallest change that unblocks everything else is **ports without `wt`** (2, S): every prompt,
the repro config and `wf show` need them. Then install as a plugin (1), then worktree creation and
the stack (2, 3), then the enforcement plan (4), then one real round in Desktop on a team machine.
