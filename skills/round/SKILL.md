---
name: round
description: Run a project task from agreement through verified implementation, independent review and approved delivery. Use for starting or resuming tickets, checking whether they reproduce, and inspecting what is waiting.
---

# Round

Own the task using this harness's available capabilities. Build here or delegate bounded work when
useful; wf specifies the result and its evidence, not an agent name, model, pane or scheduler. wf
owns isolated workspaces, durable decisions, review identity and safe resumable delivery.

## Entry and memory

By default, `wf` below means `node "<absolute path to this skill folder>/scripts/wf.mjs"`.
If a machine launcher was explicitly supplied, check its `--help` first: use it with this skill only
when it advertises `Portable skill`. An older `wf` on PATH is not this folder's runtime. Use literal
paths, quoted when they contain spaces. The bundled tools need Node >=22.18, git, and the project's
own prerequisites; delivery also needs authenticated `gh`. No harness plugin or runtime npm install
is required.

Use the round's worktree as command cwd and session workspace; `wf notes` links the binding rules
for starting, resuming and cleanup. Keep the entry that created it:
`wf status --inspect` and entry refusals identify it. A different harness can use the same entry;
a different machine configuration is not automatically interchangeable. An existing task's older
entry needs its matching skill or a compatible update, not a switch to the bundled kit to bypass it.

Read `wf notes` once per session: it names the project's tools, tracker, branches and workflow
references. The project repository owns app knowledge and verification recipes. The task's working
document, `.wf/` records, code and evidence own progress; chat and session transcripts are optional
links, never the only copy of a decision or outstanding instruction.

## Start, check or resume

- **Start `<id>`:** follow [starting a task](references/start.md). Done when the complete request,
  scope and class are recorded and `wf new` has prepared the isolated worktree.
- **Check `<id>` / does it reproduce:** use the same request intake, then `wf new <branch> --id <id>
  --check`. Run the repro action below; stop with the measured result, leaving the tracker untouched.
- **Resume / what's waiting:** run `wf status --all`, bind the session to the named worktree, retrieve any pending
  question replies, then `wf next`. Resume from its files, not a reconstruction of the old chat.
- **Show current work:** run `wf status --inspect`. This is inspection, not another approval gate.

## Do the next useful work

`wf next` identifies the current work or the unmet condition. It maintains durable gate facts;
it does not start an agent. After completing an action, run it again. Judge implementation choices
within the agreement yourself; let the commands check evidence, scope and approval freshness.
The round's worktree, its stack and its database are disposable and are this round's: preparing the
scenario — seed data, fixtures, task-scoped setup and reset — is ordinary authorized work with the
project's own tools, and a check that could not run because that state was absent is work left to do,
not a finding about the product.

| Action | Completion criterion |
|---|---|
| `work agree:` | Run the named `wf brief agree`. Record observed facts, agreed behavior, exclusions and verification. Work with the person here for consequential choices; [T1](references/review.md) approves the agreed material before building. |
| `work build:` | Run the named `wf brief build`, implement in inspectable steps, drive the project's tools, and complete its checked handoff. Continue in this context or delegate. Record commands, observations and limitations in the working document; commit when ready, then `wf step assess`. |
| `work assess:` | Give the named brief to a **fresh independent reviewer context** that did not build the change. A separate session or harness is valid; a subagent is optional. Follow [independent review](references/review.md). Self-review is not a substitute. |
| `classify:` / `advance:` | The recorded scope has advanced. Read the result, then run `wf next`; it does not prescribe a new agent. |
| check round: `wait user: the repro result …` | `wf next` asks for `## Repro` in the working document, then hands the result to the person for build or stop. Run the repro with the project's own commands ([reproduction-only work](references/start.md)); record the command, observed result, setup/reset and limitations. Report the measurement or the inability to measure, not a conclusion from code alone. |
| `wait … q<n>` / blocked work | Follow [questions and blockers](references/questions.md). Continue only independent authorized work while the blocking question remains open. |
| `wait user: T1 …` / `review:` | Follow [human review](references/review.md). Record the person's actual verdict on the material shown; an agent cannot supply approval. |
| `wait user: harness …` | Record the exact missing capability and rerun command. Use [capability fallbacks](references/capabilities.md); preserve the work rather than repeatedly rebuilding or repairing unrelated infrastructure. |
| `deliver:` | Run `wf deliver`. It reconciles interrupted remote effects and refuses stale approval. T2 authorizes publishing the PR; leave it open for human merge. |
| `wait user: PR …` | Leave the PR, branch and worktree intact for human merge. After the person merges, run `wf deliver` to reconcile, then `wf next`. |
| `post:` | Follow `wf notes` to fill and post the note saying the work is in the linked PR awaiting merge using the project's command. Mark each section ` (posted)` at once so a resumed round does not post it twice. |
| `done:` | Leave the round's bound session; run the named `wf reap` from a surviving checkout/session, then report the delivered PR and cleanup result. |

**Corrections.** A clear round-linked instruction that arrives from the person in chat, review, Inbox,
ticket or PR feedback is recorded once with
`wf correct --source "<actual message/event reference>" --author "<original author>" --scope "<intended scope>" --reason "<why it applies>" "<instruction, verbatim>"`.
Preserve attribution; ordinary discussion, non-directive approval notes and third-party suggestions
are not new assignments. A clear instruction is still actionable when delivered beside an approval:
classify its meaning, not just the review's verdict. If intent is ambiguous, retain the words and ask
only what is missing. Reuse the exact source identity on retry; explicit replacement uses
`--supersedes <id,...>`, never timestamps or a rewritten review verdict. Run `wf next`: the build and
assessment context carries the instruction until it is addressed, blocked or explicitly replaced, and
an outstanding instruction blocks delivery even when file bytes have not changed. A builder records
disposition through the command in its brief. When a concrete blocker clears, record
`wf correct --unblock <id> --note "<what cleared it/source>"`; unblocking is not application. Transport
or dispatch acknowledgement is not application. After disposition, `wf next` may resume unchanged
approved delivery; a changed subject follows fresh assessment and T2. A recorded uncertain merge is
reconciled before repair or follow-up.

Fixable within-agreement findings return to build within the recorded repair budget. Material scope
or behavior changes go back to agreement. Keep outstanding corrections visible until implementation
and verification answer them; a delivered notification is not completion of its instruction.

A genuinely changed behavior, consequential choice or dropped agreed item uses
`wf decide --revise [--q <n>] "<renewed behavior>"` and renewed agreement/T1. Ordinary helpers,
files, test selection, setup refinements and review corrections remain implementation choices.
Reviewers choose outcomes explicitly; there is no per-line assessment status or repair-proof grammar.

## Agreed checkpoints

Before proceeding past a human-agreed checkpoint, show the intended diff with
`wf review <branch> --checkpoint [--base <ref>]`, then `wf review <branch> --checkpoint --done`.
`CHECKPOINT-REVIEW.md` records the outcome. Approval resumes build, never delivery. Final T2 still
reviews the whole round.

## Adapt execution, not the completion standard

Read [capability fallbacks](references/capabilities.md) when a required tool, background worker,
reviewer or UI is unavailable. Prefer existing project commands to harness-specific tool names.
Save the task and hand it off when a required capability is absent. A plain interactive harness can
make progress and resume later; unattended execution after exit needs a host that actually offers it.

Preserve these guarantees on every harness:

- Work in the task's own workspace and agreed scope. Shared configuration, protected tests and
  unrelated work need their own authorization; verification bypasses are not a fallback.
- Bind measurements and approvals to the implementation they concern. Changed product/test bytes
  require fresh evidence and approval as the commands direct. Preserve the independent assessor's
  report; answer findings in the working document rather than rewriting their verdict.
- Keep `NOT MEASURED`, environment failures and product failures distinguishable. A substitute check
  counts only for the behavior it actually proves.
- `wf deliver` publishes the approved PR and leaves it open. Post the project note stating the work is in the PR awaiting merge. Merge and deploy remain the person's authority.
  Restrict repository permissions/credentials when an enforcement boundary stronger than instructions
  and local checks is required.
- Keep scope, unanswered questions, corrections, evidence references and remote-effect receipts on
  disk. Never fabricate a result, infer permission from silence, or discard unconfirmed work.

Only final human T2 authorizes `wf deliver`. Change only this round's worktree and respect protected
project files and hooks; never bypass them with `--no-verify`. Harness trouble may need a separate
authorized worktree or repair: isolate the failing command first, record its evidence and recovery
owner, and do not repeatedly rerun expensive suites blindly.

## Follow-up and handover

A merged task owns one delivery. Further product work uses `wf new <new-branch> --reopen --class
<A|B|C> --id <id>` and its `EARLIER.md`; history informs the new task but does not transfer approval.
`WF_FORCE_REAP=1` is an intentional discard, not a way to preserve unfinished work. Finish
old-runtime rounds before installing an incompatible replacement.

When handing over, identify the worktree, configured entry, working document, latest measurements,
open questions and next executable action. A new agent needs those records, not your transcript.
Tell the person when a decision/review is needed, verification is blocked, or the work is ready or
delivered. Use their Inbox when available for asynchronous questions and finished-work handover.
