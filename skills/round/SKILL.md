---
name: round
description: Run a round from a ticket to a merged PR — "start 662", "start BJEW-586", "check BJEW-461", "does it reproduce", "resume", "what's waiting". One fresh agent per phase (research → plan → one per commit), deterministic checks between, the user at two gates. Use for any bug or feature ticket on the project's tracker. Replaces bug-fix-orchestrator and cr-implement-orchestrator.
---

# Round

You dispatch; you do not build. Your context is the expensive one: read results, not
transcripts; read `wf status`, not files, unless a gate needs your judgement.

**Where `wf` runs.** wf is not in the project's repo; the project is a worktree it works in.
- In the Claude Code plugin, `wf` means `node "${CLAUDE_PLUGIN_ROOT}/wf.mjs"`: run every `wf` below that way.
  The lines `wf next` prints already name it in full.
- In pi (Shay's env) `wf` is a command on the PATH: that env over the kit, the installed copy in
  `~/.local/share/wf`. It follows `main` by itself: a run that prints `wf: updated <old> → <new>`
  means the rules may have changed between phases; tell the user once, verbatim.

Every step *inside a round* runs with the round's worktree as cwd; `wf new` and `wf status` run
from anywhere in the repo. One round per session: the files hold the state, so "resume <id>" in a
new session picks up where this one stopped. The few things that differ between pi and Claude Code
are in *Dispatch in this harness* at the end.

**The project's notes.** `wf notes` prints them (its ROUND.md): where its tickets live and how to fetch one,
which tracker statuses to set when, who its people are, and its branches. Read it once per
session, before *Start*: every *tracker*, *status* and *base branch* below means what it says there.

## Start: "start <id>"

1. Fetch the ticket from the tracker (how: ROUND.md).
   Read the **whole** thread first: every update and every reply, oldest first, and every
   attachment, downloaded into the round folder and read.
   An attachment you did not open is a fact withheld from research (BJEW-461: the 08-12
   screenshot showed the admin as the order's seller; TICKET.md said "no screenshot").
   Write `TICKET.md` — title, the thread in order, each image described by what it shows,
   reporter, and "the user said" only if their message said something. Never write a fact you did
   not check (a branch is not a deployment). Only you call the tracker; an agent never does.
   `TICKET.md` opens with `## Intent`: what was asked, in the askers' own words (the reporter's
   lines, the product owner's rules, the user's scope answers), quoted exactly, each with who and when, in thread
   order. Never paraphrase, summarise, widen or add to it: validation judges the round against
   it, and `wf brief` refuses a `TICKET.md` without it. Image descriptions and your notes go below.
   A ticket that is a sentence is not a ticket: ask the user ≤5 scope questions first (what it
   must do, for whom, what it must *not* touch — widen until they say "out of scope") and write
   the answers into `TICKET.md` under `## Scope`. That is where the plan's `## Not doing` comes from.
2. `wf new <branch> --id <id>` → worktree, stack, seed, `{{folder}}`. It refuses a third
   live round; if it does, say which two are running and stop. Set the ticket's started status.
3. The loop below, from the round's worktree.

## Check: "check <id>", "does <id> reproduce"

Whether the ticket reproduces, before anyone commits to fixing it: a round that stops after research.
1. As *Start* 1: the ticket, the whole thread, `TICKET.md` with its `## Intent`.
2. `wf new <branch> --id <id> --check`. No tracker status: the tracker hears nothing from a check.
3. The loop. After research, `wf next` prints `wait user: check — …`: tell the user whether it
   reproduced, from `RESEARCH.md`: its `## Diverges at` and `## Repro` sections, verbatim, and the
   `## Could not find` lines. Stop.
   - "go": `wf step plan`, set the ticket's started status, and the loop goes on as a round's.
   - "stop": what the tracker hears is the user's call (a question to the reporter goes as they
     word it). Then the `reap` line `wf next` printed, and tell the user `<id> checked, reaped`.
   - A ticket about a deployed environment (QA, production) that the round's stack cannot show:
     say so, and do that part with the user in this session. Never change data there without their yes.

## The loop

`wf next` reads the round's state and files and prints the one thing to do now; it does the
bookkeeping itself (the step, recording a question the round now waits on). Run it, do what it
printed, run it again. Phases follow each other with no judgement of yours; the loop stops only
where a person is needed. An agent's reply is not state: `wf next` reads the files (BJEW-603:
four replies in a row were the text before the last tool call, the files right every time).

| `wf next` printed | do |
|---|---|
| `dispatch <phase>: <line>` | a fresh `round-worker` (*Dispatch in this harness*), named `<id> <phase>`, with `<line>` as its whole task: it runs `wf brief` itself, so its brief is wf's own text. `as-built` and `validate`: model `anthropic/claude-sonnet-5`, tools `read,bash,write`. When it returns, `wf next`. |
| `wait <person>: q<n> …` | The user: ask with the question tool (*Dispatch in this harness*), all the round's `q<n>` lines in one call, each line verbatim as its question; its options: the line's `(default: …)` first, then the other answers the question names (`fix` / `accept` for a `fix or accept` one); a typed answer is always open. Someone else: tell them each line verbatim, with the round id. Stop. Ask once: a late agent report (*Dispatch in this harness*) is no reason to ask again. Their answer → `wf decide --q <n> "<their words>"` (the default option: `default`), then `wf next`: an answer against a plan Ask's default makes it dispatch `plan --revise`. A `fix or accept` question is answered with a line that starts `fix` or `accept`. |
| `wait user: …` (no q) | tell the user the line with the round id (T1 waiting, a round held, a phase that failed twice). Stop. When they say it is done, `wf next`. |
| `design: …` | start the design session (*Dispatch in this harness*; it reads `${CLAUDE_PLUGIN_ROOT}/process/DESIGN-SESSION.md` and TICKET/RESEARCH/PLAN). It writes `SPEC.md` with the user and, on "shared", runs `wf step design`. Then `wf next`. |
| `deliver: …` | T2 approved; the approval is the merge. Run `wf deliver`: it pushes, opens the PR, merges it and deletes the branch, then prints the PR url and the tracker note it wrote. A push the project's pre-push hook refused becomes a T2 fix (`wf deliver` says so): `wf next`. Only then post the note and set the delivered status (ROUND.md): the tracker hears last. Run `wf reap <branch>`, and tell the user `<id> merged, reaped` with the `round …` line it printed (where the round spent its time and where it was stopped; every round adds it to `~/.cache/wf-reaped/ROUNDS.md`). |
| `review: …` | See the fix first (ROUND.md's *T2*, done as *Dispatch in this harness* says), then `wf review <branch>` yourself from the worktree. With plannotator (pi) it blocks until they submit: bash timeout 3600 s. Without it, it returns: under Claude Code with `REVIEW.md`'s path (the person uses the diff view: *Dispatch in this harness*), elsewhere with `REVIEW.md` open in an editor. Tell the user, stop, and go on when they say the verdict is in. Read the `verdict:` line it wrote to `REVIEW.md`, then `wf review <branch> --done` and `wf next`. T2 is local: no PR exists yet, and nothing is pushed until it approves. |
| `done` | nothing is left. |

A T2 that asks for a fix in a file no PLAN.md row lists first gets a new row (`fix(review): …`, its
files, `repro`): `wf check` fences against the rows (3187601171). Every dispatch is a **fresh**
agent: never resume or message a finished round agent, and never read its session file to "see
what happened". If a line `wf next` printed is wrong for the round, the fix is in wf (`next.mts`),
not a step you take around it: stop and tell the user. `wf brief` is the dispatched agent's (it refuses
a brief `wf next` is not dispatching); to read a phase's prompt, `wf prompt`. PLAN.md is the plan
agent's and `.wf/state.json` is wf's: you edit neither (BJEW-562, 2026-09-27: a previewed brief
voided the plan's handoff, then the plan and the state were edited by hand).

## Talking to the user

Only these, only when they happen:
- a plan is waiting (class B/C): one line with the command
- Asks or a BLOCKED question: verbatim, each first recorded with `wf ask`, then asked with the
  question tool, not written into the chat (BJEW-562, 2026-09-27: asked as text, then asked again
  on each late agent report). A
  question that is only in this chat dies with the session; `wf brief` and `wf deliver` refuse
  while a recorded one is open, so an answer is never skipped. Someone else (ROUND.md, *People*): `--to <name>`.
- T2 is waiting: one line with where to look (*Dispatch in this harness*)
- a round finished: `<id> merged, reaped`, and reap's `round …` line

No progress narration. No summaries of what the agent did. "What's waiting?" → `wf status
--all` and paste it. Anything else the user asks about a round: answer from `RESEARCH.md` /
`PLAN.md` / `git log`, not from memory of the transcript.

## Resume: "resume <id>" or a new session

`wf status --all` says which rounds exist, who each waits on, and the open questions word for
word. In the round's worktree, *The loop*. Nothing lives in your context that the files do not have.

## Authority — who may do what

| mutation | who |
|---|---|
| merge to the base branch | `wf deliver`, only after the person's T2 approved (it refuses otherwise) |
| deploy | Shay |
| tracker status and comments | you, from the tracker note; never an agent |
| edit `repro/` or a test the row did not list | nobody inside a round — that is a plan change, through `plan --revise` |
| touch the base branch's checkout, another round's worktree, `~/.pi` | never from a round |
| `--no-verify`, widening a fence, lowering a threshold | never |

## When a round goes wrong

A BLOCKED, a plan the user rejected, a validate that deviates, a round that took twice the budget:
that is a harness gap, not a bad agent. Find the **earliest** handoff that lacked what the job
needed, classify it — context missing · capability missing or hard to find · no owner for an
invariant · authority · proof was an internal proxy · feedback lost — and put the smallest fix
**at the owner**: a type, a test, a `wf` check, a doc the lenses read, a seed fixture. A prompt
paragraph only when the gap is genuinely context, and then one line. Rerun the same round
fresh; keep the fix only if the rerun is better. Tell the user in one line what changed and why.

## Two rules that override everything

- **Two rounds live at once, max.** The box cannot run three stacks; every flake is repaid in
  agent turns.
- **Harness trouble is not round trouble.** A `wt` hook failing, a merge conflict on the base
  branch, a broken test there: fix it in its own worktree, in its own PR, with a `scout`, and tell
  the user in one line. It never enters a round's folder or a round agent's prompt.

## Dispatch in this harness

You are in pi if you have the `subagent` tool, in Claude Code if you have the `Agent` tool.

| | pi | Claude Code (Desktop, the wf plugin) |
|---|---|---|
| this session runs from | anywhere in the repo | the person's clone, until `wf new`; then `EnterWorktree` with `path:` its `Worktree:` line, and the rest of the round runs there. A worktree under `.claude/worktrees/` is entered without a prompt. "resume <id>" in a new session: `wf status --all` names its worktree; enter it the same way. |
| dispatch | `subagent({ name: "<id> <phase>", agent: "round-worker", model: "anthropic/claude-opus-5-5:medium", tools: "read,bash,write,edit,subagent", cwd: <worktree>, task: <the line> })` — plan and later phases without `subagent` unless the prompt asks. End your turn; the harness wakes you with the result. | Agent tool: `subagent_type: "wf:round-worker"`, `model: "opus"` (`"sonnet"` for as-built and validate), `description: "<id> <phase>"`, `prompt: <the line>`. It runs in the background; its result arrives as a message, then `wf next`. Never a fork: it would carry this whole conversation, and the plugin refuses it in a round. |
| the agent closes | `round-worker` has `auto-exit: true`: its pane closes when its turn ends. Without it the pane waits for `subagent_done` and stays open when the agent forgets. | when its turn ends. The plugin's `SubagentStop` hook sends it back once if its handoff is missing (`wf handoff check`). |
| research's `codebase-locator` / `codebase-analyzer` | pi agents, installed by `wf update` | the plugin's `wf:codebase-locator` / `wf:codebase-analyzer` |
| the question tool | `ask_user_question` | `AskUserQuestion` (a `header` of at most 12 characters: `q<n>`) |
| agent reports | a dispatched agent's result wakes you | every agent runs in the background (fork mode is on in Desktop, and it cannot be asked for the foreground); its report arrives as a message. A report from an agent you did not dispatch, or from a phase that has ended, needs nothing: no step, no question asked again. |
| design session (B/C) | `subagent` with `interactive: true`, cwd the worktree: its own pane, which the user talks to. | this session runs it: read `DESIGN-SESSION.md` and hold the conversation with the person here. T1 happens here too: show them `## For T1` (in plain words if they ask, written from it alone), then `wf design <branch>`, and write into `SPEC-REVIEW.md` what you showed them, verbatim, as a `note —` line, then their comments and verdict (DESIGN-SESSION.md § 5). |
| T2: see the fix | `wf show` (ROUND.md's *T2*): a headed browser, logged in, on the plan's page | `wf show` makes the page's data (the plan's `setup:` lines, once) and opens no window here: it prints what to open. Do that: `mcp__Claude_Browser__preview_start` with the `name` it prints (`<slug> <app>`: `wf new` puts it in the clone's `.claude/launch.json`, where Desktop reads it), `navigate` to the page, and log in only when it asks, with the pane's form tools (the one-time code is on the page's DEV banner). Tell the person it is in the Browser pane; after a login, once: the pane's server menu has *Persist sessions*, which keeps it. |
| T2: the verdict | `wf review` opens plannotator on the diff and waits; the before/after page it prints (`before/after: …`, when research and validate took screenshots) opens in the browser | `wf review` writes `REVIEW.md`, prints its path and returns; no editor opens. When it prints `before/after: <file>`, tell the person that page's path: the screenshots before the fix and after it, side by side. Tell the person: comment on lines in the diff view (the `+N −M` badge, *All changes* against the base branch: when it counts far more than the round's commits, its *Compare against* menu picks the base; Ctrl+Enter sends the comments to you), then say the verdict: approved or changes-requested. Write each comment into `REVIEW.md` as `path:line — text` and the `verdict:` line they said, then `wf review --done`. |
| reap | the line as printed | `ExitWorktree` with `action: "keep"` first: the session inside the worktree holds its folder, and the reap fails to remove it (EPERM, bench, 2026-09-28). Then the reap line, from the clone. |
| Bash commands | as you like | literal paths and values: a worktree session refuses a command whose `sed` or git arguments come from a shell variable, or that sets `GIT_CONFIG_*` (TJEW-670: four refused, each a retry). |

