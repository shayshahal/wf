---
name: round
description: Run a round from a ticket to a merged PR — "start 662", "start BJEW-586", "check BJEW-461", "does it reproduce", "resume", "what's waiting". One working agreement, a build that checks and steers, one final assessment, and the user at two gates (T1 for complex work, T2 to deliver). Use for any bug or feature ticket on the project's tracker.
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

## The route

`wf new → agree (T1 for B/C) → build ↔ verify+steer → one assessment → T2 → wf deliver`

`TICKET.md` is the sole human working document for an ordinary (class A) round — it *is* the
agreement. For consequential work (class B/C) one `AGREEMENT.md` records the observed facts and the
agreed behavior, exclusions, choice and verification; T1 approves it before the build. A commit is
not a workflow transition and there is no per-commit worker: the build is one phase that resumes in
place. After the build, one independent read-only assessment writes `ASSESSMENT.md`; its fixable
findings return to the build autonomously, bounded; an unmet intent or a still-reproducing symptom
blocks T2 until the user rules. T1 and T2 are the only human gates.

## Start: "start <id>"

1. Fetch the ticket from the tracker (how: ROUND.md).
   Read the **whole** thread first: every update and every reply, oldest first, and every
   attachment, downloaded into the round folder and read.
   An attachment you did not open is a fact withheld from the agreement (BJEW-461: the 08-12
   screenshot showed the admin as the order's seller; TICKET.md said "no screenshot").
   Write `TICKET.md` — title, the thread in order, each image described by what it shows,
   reporter, and "the user said" only if their message said something. Never write a fact you did
   not check (a branch is not a deployment). Only you call the tracker; an agent never does.
   `TICKET.md` opens with `## Intent`: what was asked, in the askers' own words (the reporter's
   lines, the product owner's rules, the user's scope answers), quoted exactly, each with who and when, in thread
   order. Never paraphrase, summarise, widen or add to it: the assessment judges the round against
   it, and `wf brief` refuses a `TICKET.md` without it. Image descriptions and your notes go below.
   A ticket that is a sentence is not a ticket: ask the user ≤5 scope questions first (what it
   must do, for whom, what it must *not* touch) and write the answers into `TICKET.md` under `## Scope`.
2. `wf new <branch> --id <id>` → worktree, seeded database, `{{folder}}` (the stack starts when a
   phase needs it). It refuses a third
   live round; if it does, say which two are running and stop. Set the ticket's started status.
3. The loop below, from the round's worktree.

## Check: "check <id>", "does <id> reproduce"

Whether the ticket reproduces, before anyone commits to fixing it.
1. As *Start* 1: the ticket, the whole thread, `TICKET.md` with its `## Intent`.
2. `wf new <branch> --id <id> --check`. No tracker status: the tracker hears nothing from a check.
3. The loop. `wf next` dispatches `agree` to write `## Repro` (`command: <the command that
   reproduces it>`) into `TICKET.md`; then it prints `check: run wf check --repro`. Run it, then
   `wf next`: tell the user whether it reproduced, from that output and `TICKET.md`, verbatim. Stop.
   - "go": `wf step build`, set the ticket's started status, and the loop goes on as a round's.
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
| `dispatch <agree\|build\|assess> (model: <m>): <line>` | a fresh `round-worker` (*Dispatch in this harness*), named `<id> <phase>`, on model `<m>` exactly as printed (wf picks it from the phase's effort level; `wf models` shows the table), with `<line>` as its whole task: it runs `wf brief` itself, so its brief is wf's own text. When it returns, `wf next`. |
| `wait <person>: q<n> …` | The user: ask with the question tool (*Dispatch in this harness*), all the round's `q<n>` lines in one call, each line verbatim as its question; its options: the line's `(default: …)` first, then the other answers the question names (`fix` / `accept` for a `fix or accept` one); a typed answer is always open. Someone else: tell them each line verbatim, with the round id. Stop. Their answer → `wf decide --q <n> "<their words>"` (the default option: `default`), then `wf next`. An answer that says the agreement must change, whatever its step or question, is recorded with `wf decide --revise [--q <n>] "<what the agreement must now do>"` (no question open: the answer alone): the round goes back to `agree`, `wf next` dispatches it, and a new T1 follows. A `fix or accept` question is answered with a line that starts `fix` or `accept`; `accept` is an explicit reconciliation and lets T2 open with the finding recorded beside it. |
| `wait user: T1 on AGREEMENT.md …` | run `wf agree <branch>` yourself from the worktree — with plannotator (pi) it blocks until they submit (bash timeout 3600 s), so they annotate instead of being handed a command; read the `verdict:` line it wrote to `AGREEMENT-REVIEW.md`, then `wf next`. A T1 that asks for changes dispatches `agree` again; an approved agreement whose agreed material has not changed stands after a `wf decide --revise` too (a progress edit to `## Verification` does not renew T1). |
| `wait user: …` (no q) | tell the user the line with the round id (a round held, a blocked build), and when they say it is done `wf next`. Stop. `blocked`: the build wrote `BLOCKED.md` with a `Question:` line; record it with `wf ask --blocked`, then ask the user (*Dispatch in this harness*), then `wf decide` with their answer. |
| `check: run wf check --repro` | run it, then `wf next` (see *Check*). |
| `deliver: …` | T2 approved; the approval is the merge. Run `wf deliver`: it pushes, opens the PR, merges it and deletes the branch, then prints the PR url and the tracker note it wrote. A push the project's pre-push hook refused becomes a T2 fix (`wf deliver` says so). Either way, `wf next`. |
| `post: <ids> — …` | The tracker hears last. For each id in turn: fill its section of the note and post it with the delivered status, as ROUND.md says (which also says how to tell a section already posted by a session that died), then at once add ` (posted)` to the end of its `## <id>` line in the note. Then `wf next`. |
| `review: …` | See the fix first (ROUND.md's *T2*, done as *Dispatch in this harness* says), then `wf review <branch>` yourself from the worktree. With plannotator (pi) it blocks until they submit: bash timeout 3600 s. Without it, it returns: under Claude Code with `REVIEW.md`'s path and `agreement:`'s (the agreement rendered) for the person to open, elsewhere with `REVIEW.md` open in an editor. Tell the user, stop, and go on when they say the verdict is in. Read the `verdict:` line it wrote to `REVIEW.md`, then `wf review <branch> --done` and `wf next`. T2 is local: no PR exists yet, and nothing is pushed until it approves. |
| `done: …` | the note is posted. Run the `wf reap <branch>` it names, and tell the user `<id> merged, reaped` with the `round …` line it printed (where the round spent its time and where it was stopped; every round adds it to `~/.cache/wf-reaped/ROUNDS.md`). |

Within the agreement, helpers, files, local corrections, added tests and naming are the build
agent's own. A genuinely new scope or behavior — a new user-visible surface, a changed contract
path, a different persistence choice, or dropping an agreed item — is a renewed agreement: the
build writes `BLOCKED.md` with a `Question:` line, or the assessment records a `material:` line, and
the round goes back to `agree` for a new T1. The assessment's own fixable findings return to the
build autonomously, at most twice; after that, or on a genuine blocker, `wf next` raises one
contextual question rather than one per finding. Every dispatch is a **fresh** agent: never resume
or message a finished round agent, and never read its session file to "see what happened". If a
line `wf next` printed is wrong for the round, the fix is in wf (`next.ts`), not a step you take
around it: stop and tell the user. `wf brief` is the dispatched agent's (it refuses a brief `wf
next` is not dispatching); to read a phase's prompt, `wf prompt`. The agreement and
`.wf/state.json` are wf's and the agents': you edit neither.

## Talking to the user

Only these, only when they happen:
- a T1 is waiting (class B/C): one line with the command
- a BLOCKED question or an assessment escalation: verbatim, recorded with `wf ask` first, then
  asked with the question tool, not written into the chat. A question that is only in this chat dies
  with the session; `wf brief` and `wf deliver` refuse while a recorded one is open, so an answer is
  never skipped. Someone else (ROUND.md, *People*): `--to <name>`.
- T2 is waiting: one line with where to look (*Dispatch in this harness*)
- a round finished: `<id> merged, reaped`, and reap's `round …` line

No progress narration. No summaries of what the agent did. "What's waiting?" → `wf status
--all` and paste it. Anything else the user asks about a round: answer from `AGREEMENT.md` /
`ASSESSMENT.md` / `git log`, not from memory of the transcript. When the user asks to *see* the
round's work — the agreement, the current (uncommitted) diff, the last check, the recorded facts and
the session it is running in — run `wf status --inspect` in the round's worktree and show it; it is
anytime, not a checkpoint, and adds no approval.

## Resume: "resume <id>" or a new session

`wf status --all` says which rounds exist, who each waits on, and the open questions word for
word. In the round's worktree, *The loop*. Nothing lives in your context that the files do not have.

## Authority — who may do what

| mutation | who |
|---|---|
| merge to the base branch | `wf deliver`, only after the person's T2 approved (it refuses otherwise) |
| deploy | Shay |
| tracker status and comments | you, from the tracker note; never an agent |
| edit `repro/` or a test a case did not list | nobody inside a round — that is an agreement change, through `agree` and T1 |
| touch the base branch's checkout, another round's worktree, the harness's own config | never from a round |
| `--no-verify`, widening a fence, lowering a threshold | never |

## When a round goes wrong

A BLOCKED, an agreement the user rejected, an assessment that deviates, a round that took twice the
budget: that is a harness gap, not a bad agent. Find the **earliest** handoff that lacked what the
job needed, classify it — context missing · capability missing or hard to find · no owner for an
invariant · authority · proof was an internal proxy · feedback lost — and put the smallest fix
**at the owner**: a type, a test, a `wf` check, a doc the lenses read, a seed fixture. A prompt
paragraph only when the gap is genuinely context, and then one line. Rerun the same round
fresh; keep the fix only if the rerun is better. Tell the user in one line what changed and why.

## Two rules that override everything

- **Two rounds live at once, max.** The box cannot run three stacks; every flake is repaid in
  agent turns.
- **Harness trouble is not round trouble.** A worktree hook failing, a merge conflict on the base
  branch, a broken test there: fix it in its own worktree, in its own PR, with wf's `harness-fixer`
  (*Dispatch in this harness*), and tell the user in one line. You know which suite the trouble
  came from; name the one case or step that fails, not the suite. It never enters a round's folder
  or a round agent's prompt.

## Dispatch in this harness

You are in pi if you have the `subagent` tool, in Claude Code if you have the `Agent` tool.

Every agent you start is one of wf's: `round-worker`, `codebase-locator`, `codebase-analyzer`,
`harness-fixer`, as the rows below start them (the T1 agreement session, below, is the one started
without one). Never another agent the harness lists, and never one bent to fit with other tools:
those carry that machine's model and role, not wf's. Work none of wf's fits goes to the user.

| | pi | Claude Code (Desktop, the wf plugin) |
|---|---|---|
| this session runs from | anywhere in the repo | the person's clone, until `wf new`; then `EnterWorktree` with `path:` its `Worktree:` line, and the rest of the round runs there. A worktree under `.claude/worktrees/` is entered without a prompt. "resume <id>" in a new session: `wf status --all` names its worktree; enter it the same way. |
| dispatch | `subagent({ name: "<id> <phase>", agent: "round-worker", model: <m>, tools: "read,bash,write,edit,subagent", cwd: <worktree>, task: <the line> })` — the agreement and assessment phases without `subagent` unless the prompt asks. End your turn; the harness wakes you with the result. | Agent tool: `subagent_type: "wf:round-worker"`, `model: <m>`, `description: "<id> <phase>"`, `prompt: <the line>`. It runs in the background; its result arrives as a message, then `wf next`. Never a fork: it would carry this whole conversation, and the plugin refuses it in a round. |
| the agent closes | `round-worker` has `auto-exit: true`: its pane closes when its turn ends. Without it the pane waits for `subagent_done` and stays open when the agent forgets. | when its turn ends. The plugin's `SubagentStop` hook sends it back once if its handoff is missing (`wf handoff check`). |
| the agreement's `codebase-locator` / `codebase-analyzer` | pi agents, installed by `wf update` | the plugin's `wf:codebase-locator` / `wf:codebase-analyzer` |
| harness trouble | `subagent({ name: "<what>", agent: "harness-fixer", cwd: <its worktree>, task: <the trouble, its evidence, the narrowest command that shows it, the worktree and branch> })`, no `model` or `tools`: the agent's own (its model is `wf models`' low). | Agent tool: `subagent_type: "wf:harness-fixer"`, `description: "<what>"`, `prompt: <the same task>` |
| the question tool | `ask_user_question` | `AskUserQuestion` (a `header` of at most 12 characters: `q<n>`) |
| agent reports | a dispatched agent's result wakes you | every agent runs in the background; its report arrives as a message. A report from an agent you did not dispatch, or from a phase that has ended, needs nothing: no step, no question asked again. |
| T1 agreement session (B/C) | `subagent` with `interactive: true`, cwd the worktree: its own pane, which the user talks to. | this session runs it: read `AGREEMENT-TEMPLATE.md` and hold the conversation with the person here. T1 happens here too: show them the agreed material (in plain words if they ask, written from it alone), then `wf agree <branch>`, and write into `AGREEMENT-REVIEW.md` what you showed them, verbatim, as a `note —` line, then their comments and verdict. |
| T2: see the fix | `wf show` (ROUND.md's *T2*): a headed browser, logged in, on the agreement's page | `wf show` makes the page's data (the agreement's `setup:` lines, once) and opens no window here: it prints what to open. Do that: `mcp__Claude_Browser__preview_start` with the `name` it prints, `navigate` to the page, and log in only when it asks. Tell the person it is in the Browser pane. |
| T2: the verdict | `wf review` opens plannotator on the diff and waits; the before/after page it prints opens in the browser | `wf review` writes `REVIEW.md`, prints its path and returns; no editor opens. When it prints `before/after: <file>`, tell the person that page's path. Tell the person: comment on lines in the diff view, then say the verdict: approved or changes-requested. Write each comment into `REVIEW.md` as `path:line — text` and the `verdict:` line they said, then `wf review --done`. |
| reap | the line as printed | `ExitWorktree` with `action: "keep"` first: the session inside the worktree holds its folder, and the reap fails to remove it (EPERM). Then the reap line, from the clone. |
| Bash commands | as you like | literal paths and values: a worktree session refuses a command whose `sed` or git arguments come from a shell variable, or that sets `GIT_CONFIG_*`. |
