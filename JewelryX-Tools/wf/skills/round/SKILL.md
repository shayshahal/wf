---
name: round
description: Run a JewelryX round from a ticket to a merged PR — "start 662", "start BJEW-586", "resume", "what's waiting". One fresh agent per phase (research → plan → one per commit), deterministic checks between, Shay at two gates. Use for any bug or CR on the Monday boards. Replaces bug-fix-orchestrator and cr-implement-orchestrator.
---

# Round

You dispatch; you do not build. Your context is the expensive one: read results, not
transcripts; read `wf status`, not files, unless a gate needs your judgement.

**Where `wf` runs.** `wf` is a command on Shay's PATH: `~/bin/wf` runs the installed copy in
`~/.local/share/jewelryx-wf`, which is committed code only; `dev` does not carry it. `workflow-v2` is
where wf is *edited*: a pushed change is live on the next `wf` run, which prints `wf: updated <old> → <new>`
and the commits. When you see that line mid-round, tell Shay once, verbatim: the rules may have changed between phases. Every step *inside a round* runs with the round's
worktree as cwd; `wf new` and `wf status` run from anywhere in the repo. One round per session:
the files hold the state, so "resume <id>" in a new session picks up where this one stopped.
The few things that differ between pi and Claude Code are in *Dispatch in this harness* at the end.

## Start: "start <id>"

1. Fetch the Monday item (Bugs board `BJEW-`, Tasks board `TJEW-`; both boards by numeric id).
   Read the **whole** thread first: every update and every reply, oldest first, and every asset —
   those attached to updates **and those in the item's file columns**
   (`monday_get_assets` → `public_url` → download into the round folder → `read` the image).
   An attachment you did not open is a fact withheld from research (BJEW-461: the 08-12
   screenshot showed the admin as the order's seller; TICKET.md said "no screenshot").
   Write `TICKET.md` — title, the thread in order, each image described by what it shows,
   reporter, and "Shay said" only if Shay's message said something. Never write a fact you did
   not check (a branch is not a deployment). That is the only Monday call an agent never makes.
   A TJEW item that is a sentence is not a ticket: ask Shay ≤5 scope questions first (what it
   must do, for whom, what it must *not* touch — widen until he says "out of scope") and write
   the answers into `TICKET.md` under `## Scope`. That is where the plan's `## Not doing` comes from.
2. `wf new <branch> --id <id>` → worktree, stack, seed, `{{folder}}`. It refuses a third
   live round; if it does, say which two are running and stop. Set the Monday item's status
   to *In Progress*.
3. `wf prompt research` prints the prompt. Dispatch it, verbatim, to a fresh `round-worker` agent
   (`JewelryX-Tools/wf/agents/round-worker.md`) on Opus, in the round's worktree. **Every** round
   dispatch is a `round-worker`; the one exception is the design session, which Shay talks to.

## On each result

Read the phase's file, not the reply: `RESEARCH.md`, `PLAN.md`, `git log` + `BLOCKED.md`,
`VALIDATION.md`. The reply is often the text an agent wrote before its last tool call
(BJEW-603: four agents in a row, the files right every time). Then, by the phase that finished:

| finished | do |
|---|---|
| research | `wf step plan` → dispatch `wf prompt plan` the same way. |
| plan, class A | `wf step implement` → dispatch `wf prompt implement 1`. |
| plan, class B/C | `wf step plan --class <B\|C>` (the plan's `Class:` line; paths measure nothing before the first commit). Start the design session (see *Dispatch in this harness*; it reads `JewelryX-Tools/wf/process/DESIGN-SESSION.md` and TICKET/RESEARCH/PLAN). It writes `SPEC.md` with Shay and, on "shared", runs `wf step design`, which refuses to run without `SPEC.md`. Tell Shay: `<id>: T1 open — then wf design <branch>`. Stop. |
| plan, Asks non-empty | Show Shay the Asks verbatim, one line each with the default. Stop. Shay's answer → `wf decide` records it → continue as class says. |
| T1 approved | `wf step implement` → dispatch `wf prompt implement 1`. Annotated → dispatch `wf prompt plan --revise` (it reads `SPEC-REVIEW.md`). |
| commit n green | dispatch `wf prompt implement n+1`; after the last: class B/C first dispatches `wf prompt as-built` (it writes `proof/CALL-STACK-AS-BUILT.md`, which `wf review` requires), then every class dispatches `wf prompt validate`. Both use model `anthropic/claude-sonnet-5` and tools `read,bash,write`. |
| validate | verdict `matches plan` → `wf deliver`. `deviates` → show Shay the deviation lines; Shay says fix (→ `wf prompt fix-review` with VALIDATION.md as the review) or accept (→ deliver). |
| BLOCKED | Show Shay the Question line, verbatim, with the round id. Stop. Answer → append it under `## Answer` in BLOCKED.md, dispatch `wf prompt implement n` again (fresh agent; it reads BLOCKED.md). |
| deliver | prints the PR url. `wf step review`; post `MONDAY.md` as a comment (its English lines in plain Hebrew) and set the item to *Fixed in Local* (Bugs board; it has no *In Review*, Shay 2026-09-23). Tell Shay `<id>: PR #n — opening the fix and the review`. Run `wf show` from the worktree first (it returns at once: a browser window on the round's stack, logged in, on the plan's `open:` page), then `wf review <branch>` yourself from the worktree (bash timeout 3600 s): it opens plannotator on the diff and blocks until Shay submits. Read the `verdict:` line it wrote to `REVIEW.md`, then `wf review <branch> --done`. |
| T2 approved | `gh pr merge <n> --merge` (Shay's approval is the merge; never merge without it), then `git push origin --delete <branch>` (not `--delete-branch`: gh would try to check out `dev` in the round's worktree, and `dev` is checked out in the root). `wf step merged` → `wf reap <branch>`. The item stays *Fixed in Local*: Shay sets the QA statuses himself when he moves dev to QA. |
| T2 annotated (`changes-requested`) | dispatch `wf prompt fix-review` (reads `REVIEW.md`; one commit, fenced to the files it names). `wf check` fences against the last PLAN.md row, so a fix in a file no row lists first gets a new row (`fix(review): …`, its files, `repro`) and `wf prompt implement <n>` to record it (3187601171). Then deliver again, which opens the review again. |
| T2 dismissed (closed without submitting) | Nothing merges. Tell Shay the review was closed and stop. |

Every dispatch is a **fresh** agent. Never resume or message a finished round agent. Never read an
agent's session file to "see what happened" — if the reply is not enough, the prompt is wrong;
fix the prompt file.

## Talking to Shay

Only these, only when they happen:
- a plan is waiting (class B/C): one line with the command
- Asks or a BLOCKED question: verbatim, one line each
- a PR is waiting: one line with the command
- a round finished: `<id> merged, reaped`

No progress narration. No summaries of what the agent did. "What's waiting?" → `wf status
--all` and paste it. Anything else Shay asks about a round: answer from `RESEARCH.md` /
`PLAN.md` / `git log`, not from memory of the transcript.

## Resume: "resume <id>" or a new session

`wf status --all` says the phase and who it waits on. Dispatch the next phase from the
table above. Nothing lives in your context that the files do not have.

## Authority — who may do what

| mutation | who |
|---|---|
| merge to `dev`, deploy | Shay |
| Monday status and comments | you, from `MONDAY.md`; never an agent |
| edit `repro/` or a test the row did not list | nobody inside a round — that is a plan change, through `plan --revise` |
| touch `dev`, another round's worktree, `~/.pi` | never from a round |
| `wf stacks up\|down` (permanent dev + QA stacks at `dev.*.jewelryx.localhost`, `qa.jewelryx.localhost`) | Shay; `wf stacks status` is read-only |
| `--no-verify`, widening a fence, lowering a threshold | never |

## When a round goes wrong

A BLOCKED, a plan Shay rejected, a validate that deviates, a round that took twice the budget:
that is a harness gap, not a bad agent. Find the **earliest** handoff that lacked what the job
needed, classify it — context missing · capability missing or hard to find · no owner for an
invariant · authority · proof was an internal proxy · feedback lost — and put the smallest fix
**at the owner**: a type, a test, a `wf` check, a doc the lenses read, a seed fixture. A prompt
paragraph only when the gap is genuinely context, and then one line. Rerun the same round
fresh; keep the fix only if the rerun is better. Tell Shay in one line what changed and why.

## Two rules that override everything

- **Two rounds live at once, max.** The box cannot run three stacks; every flake is repaid in
  agent turns.
- **Harness trouble is not round trouble.** A `wt` hook failing, a `dev` merge conflict, a
  broken test on `dev`: fix it in its own worktree, in its own PR, with a `scout`, and tell
  Shay in one line. It never enters a round's folder or a round agent's prompt.

## Dispatch in this harness

You are in pi if you have the `subagent` tool, in Claude Code if you have the `Agent` tool.

| | pi | Claude Code |
|---|---|---|
| this session runs from | anywhere in the repo | the round's worktree: a Claude Code agent works in the session's folder. `start <id>` from elsewhere: run `wf new`, tell Shay `open Claude Code in <worktree> and say "resume <id>"`, stop. |
| dispatch | `subagent({ name: "<id> <phase>", agent: "round-worker", model: "anthropic/claude-opus-5-5:medium", tools: "read,bash,write,edit,subagent", cwd: <worktree>, task: <prompt> })` — plan and later phases without `subagent` unless the prompt asks. End your turn; the harness wakes you with the result. | Agent tool: `subagent_type: "round-worker"`, `model: "opus"`, `prompt: <prompt>`. It returns when the agent is done. |
| the agent closes | `round-worker` has `auto-exit: true`: its pane closes when its turn ends. Without it the pane waits for `subagent_done` and stays open when the agent forgets. | always: the Agent tool returns. |
| design session (B/C) | `subagent` with `interactive: true`, cwd the worktree: its own pane, which Shay talks to. | this session runs it: read `DESIGN-SESSION.md` and hold the conversation with Shay here. |
