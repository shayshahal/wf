---
name: round
description: Run a project ticket from agreement through verified implementation, independent final review and approved delivery. Use for starting or resuming tickets, checking whether they reproduce, and inspecting what is waiting.
---

# Round

wf owns isolated workspaces, durable decisions, review identity and safe delivery. Agents own
engineering work: research, implementation, delegation, verification choices and ordinary repairs.
Use the harness for command execution and worker sessions; wf is not a task scheduler or proof engine.

## Entry and project

In pi, use `wf` on PATH (Shay's installed env). In the Claude Code plugin, use
`node "${CLAUDE_PLUGIN_ROOT}/wf.mjs"`. Lines printed by `wf next` name the correct entry.
An installed update printed as `wf: updated <old> → <new>` may change rules; tell the person once.
Run round commands inside the round's worktree. Read `wf notes` once for project tracker, people,
statuses, setup/testing guidance and T2 demonstration instructions.

## Start

1. Read the ticket's complete thread and attachments. Write `TICKET.md` with `## Intent` quoting the
   requester's words verbatim and attributed; observations and your notes go elsewhere. Resolve
   consequential ambiguity with the person, recommending an answer rather than inventing scope.
2. Classify the requested work, not just an empty diff: A ordinary, B contract/persistence, C a
   consequential product choice (`process/CLASSES.md`). Record anticipated `paths:` under `## Scope`.
3. `wf new <branch> --class <A|B|C> --id <id>` creates the worktree and project environment.
   Set the project's started status, then run `wf next` there.

Class A's ticket is the working agreement. B/C uses one `AGREEMENT.md` and T1 before building
(`design-session` skill). The agreement records behavior, exclusions, choice and verification;
large work may agree human checkpoints. Plans and worker-session boundaries are agent-owned.

## Check-only work

For “does it reproduce?”, read the ticket and create `wf new <branch> --id <id> --check`.
Do not change tracker status or begin a fix. The agree worker runs normal project repro commands,
using `wf serve --wait` and project fixture/reset tools as needed, and records setup, actual result
and limitations under `## Repro`. Choose repetitions for the hypothesis, not a universal count.
A setup failure is not the ticket's symptom. Bring the finding to the person for build or stop.
On go, `wf step build`, set started status and continue. On stop, use the explicit discard/reap path;
what the tracker hears is the person's decision. Deployed data changes always require authority.

## Coordinate

Run `wf next`, do the action it names, then run it again. Read file results and concise worker
handoffs rather than duplicating a running worker's work or consuming its transcript.

- **dispatch agree/build/assess:** use the printed brief and model. In pi, dispatch `round-worker`
  with cwd the worktree and the printed line as its task; in Claude Code, dispatch
  `subagent_type: "wf:round-worker"` the same way, from the round's worktree.
  Let the harness deliver its result. Use fresh independent context for final assessment; ordinary
  build delegation and context management are the builder's choice. `wf brief` serves a dispatched
  phase; `wf prompt` inspects a prompt without dispatching it.
- **T1:** run `wf agree <branch>` and read the recorded `AGREEMENT-REVIEW.md` verdict, then `wf next`.
  In pi, the design session may run interactively in its own pane. In Claude Code, hold it here.
- **build:** implement and choose relevant project verification. `wf check` is optional convenience,
  not required evidence. Record commands, observations and limitations in the working document or
  reference existing harness records. Commit when ready, then `wf step assess`.
- **assess:** one independent read-only final assessment judges intent, evidence, design and
  standards. It writes `ASSESSMENT.md` with explicit clean/repair/blocked outcome and measured HEAD.
  Ordinary repair returns to build, bounded; a real decision goes to the person.
- **review:** show the fix (`wf show`, per project notes), then run `wf review <branch>` yourself.
  Read `REVIEW.md`, then `wf review <branch> --done` and `wf next`. T2 is local; only its final
  approval permits delivery. A dismissed review grants nothing.
- **deliver:** `wf deliver` pushes, creates/reconciles the PR, confirms merge and writes the tracker
  note. Project hooks still apply. Then `wf next`.
- **post:** post each outstanding tracker-note section, marking its heading ` (posted)` immediately
  after success so resume does not duplicate it. Then `wf next`.
- **done:** run the named reap from a surviving checkout and report the merged PR and timing line.
  In Claude Code, exit the worktree with keep before reaping; its cwd otherwise holds the directory.

## Agreed checkpoints

Before proceeding past a human-agreed checkpoint, show the intended diff with
`wf review <branch> --checkpoint [--base <ref>]`, then `wf review <branch> --checkpoint --done`.
`CHECKPOINT-REVIEW.md` records the outcome. Approval resumes build, never delivery. No separate
assessment or integration phase is required. Final T2 still reviews the whole round.

## Decisions and blockers

Use project tools to resolve ordinary setup and engineering problems. A missing capability does
not authorize fixing every dependency: name the gap and owner. For a real decision or missing
authority, write `BLOCKED.md` with contextual `Question:`, then `wf ask --blocked`.
Run `wf inbox` to post recorded questions and save replies; on a reply run it again, then
`wf decide --q <n> "<their answer>"` and `wf next`. Transport alone is not a ruling or approval.
If Inbox is unavailable, ask directly and record the answer the same way.

A genuinely changed behavior, consequential choice or dropped agreed item uses
`wf decide --revise [--q <n>] "<renewed behavior>"` and renewed agreement/T1. Ordinary helpers,
files, test selection, setup refinements and review corrections remain implementation choices.
Reviewers choose outcomes explicitly; there is no per-line assessment status or repair-proof grammar.

Harness trouble may need a separate authorized worktree/repair. Isolate the failing command first;
record its evidence and recovery owner. Do not repeatedly rerun expensive suites blindly.

## Inspection, resume and authority

`wf status --all` lists waiting rounds. `wf status --inspect` shows the current change, evidence
references and session; inspection is not approval. Resume from state, decisions and files.
Keep communication to useful decisions, reviews, blockers and delivery rather than routine narration.

Only final human T2 authorizes `wf deliver`; deploy belongs to Shay. Change only this round's
worktree and respect protected project files and hooks. Never bypass them with `--no-verify`.
Choose helper models with `wf models` when using wf's model table; honor an explicitly printed model.

A merged round owns one delivery. Further product work starts a fresh
`wf new <branch> --reopen --class <A|B|C> --id <id>`; read `EARLIER.md` and refresh intent and scope.
Keep prior delivery records intact. `WF_FORCE_REAP=1` is an intentional discard, not a repair for
uncertain cleanup. Finish old-runtime rounds before installing an incompatible replacement.
