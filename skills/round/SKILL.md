---
name: round
description: Run a project task from agreement through verified implementation, independent review and approved delivery. Use for starting or resuming tickets, checking whether they reproduce, and inspecting what is waiting.
---

# Round

Own the task. Use the capabilities of this harness. Build here, or delegate bounded work when it
helps. wf specifies the result and its evidence. wf does not specify an agent name, a model, a pane
or a scheduler. wf owns these: isolated workspaces, durable decisions, review identity and safe
resumable delivery.

## Entry and memory

By default, `wf` below means `node "<absolute path to this skill folder>/scripts/wf.mjs"`.
- If the person gave a machine launcher, run its `--help` first. Use it with this skill only when
  `--help` shows `Portable skill`.
- An older `wf` on PATH is not this folder's runtime.
- Use literal paths. Put quotes around a path that has spaces.
- The bundled tools need Node >=22.18, git and the prerequisites of the project. Delivery also
  needs an authenticated `gh`. No harness plugin is needed. No runtime npm install is needed.

Use the worktree of the round as the command cwd and as the session workspace. `wf notes` links the
binding rules for start, resume and cleanup.
- Keep the entry that created the worktree. `wf status --inspect` and the entry refusals name it.
- A different harness can use the same entry.
- A different machine configuration is not automatically interchangeable.
- An existing task with an older entry needs its matching skill or a compatible update. Do not
  switch to the bundled kit to bypass the older entry.

Read `wf notes` once in each session. It names the tools, the tracker, the branches and the
workflow references of the project.
- The project repository owns the app knowledge and the verification recipes.
- The working document of the task, the `.wf/` records, the code and the evidence own the progress.
- Chat and session transcripts are optional links. Never keep a decision or an open instruction
  only there.

## Start, check or resume

| Request | Action | Done when |
|---|---|---|
| Start `<id>` | Follow [starting a task](references/start.md). | The complete request, the scope and the class are recorded. `wf new` has prepared the isolated worktree. |
| Check `<id>` / does it reproduce | Use the same request intake. Run `wf new <branch> --id <id> --check`. Run the repro action below. | You have stopped with the measured result. The tracker is untouched. |
| Resume / what is waiting | Run `wf status --all`. Bind the session to the named worktree. Get the pending question replies. Run `wf next`. | Work resumes from the files. Do not rebuild the old chat. |
| Show current work | Run `wf status --inspect`. | This is inspection. It is not another approval gate. |

## Do the next useful work

`wf next` names the current work or the condition that is not met. It keeps the durable gate facts.
It does not start an agent. After each action, run it again.
- Judge the implementation choices inside the agreement yourself.
- Let the commands check the evidence, the scope and the freshness of approvals.
- The worktree, the stack and the database of the round belong to the round. They are disposable.
  Preparing the scenario is ordinary authorized work. Use the tools of the project for seed data,
  fixtures, task-scoped setup and reset.
- A check that could not run because that state was absent is work that remains. It is not a
  finding about the product.

| Action | Completion criterion |
|---|---|
| `work agree:` | Run the named `wf brief agree`. Record the observed facts, the agreed behavior, the exclusions and the verification. For a consequential choice, work with the person. [T1](references/review.md) approves the agreed material before the build. |
| `work build:` | Run the named `wf brief build`. Implement in steps that are easy to inspect. Drive the tools of the project. Complete its checked handoff. Continue in this context, or delegate. Record commands, observations and limits in the working document. Commit when ready. Then run `wf step assess`. |
| `work assess:` | Give the named brief to a **fresh independent reviewer context** that did not build the change. A separate session or harness is valid. A subagent is optional. Follow [independent review](references/review.md). Self-review is not a substitute. |
| `classify:` / `advance:` | The recorded scope advanced. Read the result. Run `wf next`. It does not prescribe a new agent. |
| check round: `wait user: the repro result …` | `wf next` asks for `## Repro` in the working document. Then it gives the result to the person: build or stop. Run the repro with the commands of the project ([reproduction-only work](references/start.md)). Record the command, the observed result, the setup and reset, and the limits. Report the measurement, or report that you could not measure. Do not report a conclusion from code alone. |
| `wait … q<n>` / blocked work | Follow [questions and blockers](references/questions.md). While the question is open, continue only the independent authorized work. |
| `wait user: T1 …` / `review:` | Follow [human review](references/review.md). Record the actual verdict of the person on the material that you showed. An agent cannot supply approval. |
| `wait user: harness …` | Record the exact missing capability and the command to run again. Use [capability fallbacks](references/capabilities.md). Keep the work. Do not rebuild it again and again. Do not repair unrelated infrastructure. |
| `deliver:` | Run `wf deliver`. It reconciles interrupted remote effects. It refuses stale approval. T2 authorizes the publication of the PR. Leave the PR open for the human merge. |
| `wait user: PR …` | Leave the PR, the branch and the worktree intact for the human merge. After the person merges, run `wf deliver` to reconcile. Then run `wf next`. |
| `post:` | Follow `wf notes`. Run the post command of the project. Before the merge, notify that the linked PR awaits the human merge. `(posted)` records that notification. After confirmed delivery, use the same command to reconcile the remaining tracker obligations, also the sections that were already notified. Done when the project confirms completion and `wf next` advances. A notification mark alone is not tracker completion. |
| `done:` | Leave the bound session of the round. Run the named `wf reap` from a surviving checkout or session. Then report the delivered PR and the cleanup result. Clean up with the wf that wrote the state of this round. An older copy does not check the version of the target round when it reaps from another checkout. It can delete unfinished tracker work. |

**Corrections.** A person can give a clear instruction that is linked to the round. It can come in
chat, review, Inbox, ticket or PR feedback. Follow [authored corrections](references/corrections.md).
Record the source and the words one time. Reading, dispatching or acknowledging an instruction does
not address it.

**Repair and change.**
- A finding that you can fix inside the agreement returns to build. Stay inside the recorded repair
  budget.
- A material change of scope or behavior goes back to agreement.
- Keep each open correction visible until the implementation and the verification answer it. A
  delivered notification does not complete its instruction.
- A changed behavior, a consequential choice or a dropped agreed item uses
  `wf decide --revise [--q <n>] "<renewed behavior>"`. Then renew the agreement and T1.
- Ordinary helpers, files, test selection, setup refinements and review corrections are
  implementation choices.
- The reviewer chooses the outcome explicitly. There is no per-line assessment status. There is no
  repair-proof grammar.

## Agreed checkpoints

Before you go past a checkpoint that a human agreed, follow
[human review](references/review.md#agreed-checkpoints). Approval resumes the build. It never
resumes delivery. The final T2 still reviews the whole round.

## Adapt execution, not the completion standard

Read [capability fallbacks](references/capabilities.md) when a required tool, background worker,
reviewer or UI is not available.
- Prefer the existing commands of the project to tool names that belong to one harness.
- When a required capability is absent, save the task and hand it off.
- A plain interactive harness can make progress and resume later. Unattended execution after exit
  needs a host that offers it.

Keep these guarantees on every harness:

- Work in the workspace of the task and inside the agreed scope. Shared configuration, protected
  tests and unrelated work need their own authorization. A verification bypass is not a fallback.
- Bind each measurement and each approval to the implementation that it concerns. When the product
  or test bytes change, get fresh evidence and approval, as the commands direct.
- Keep the report of the independent assessor. Answer findings in the working document. Do not
  rewrite the verdict of the assessor.
- Keep `NOT MEASURED`, environment failures and product failures separate. A substitute check
  counts only for the behavior that it proves.
- Show, don't narrate. Every handoff to the person uses call stacks, types and interfaces,
  diagrams, screenshots, proof output or option questions, written in ASD-STE100. Prose alone is
  not a handoff. Length does not matter. Rules: `process/SHOW-ME.md` (`Read less`).
- A UI change requires before and after images in the PR description. Follow
  `process/SHOW-ME.md#ui-changes-required-pr-images` from the wf root during build and review.
- `wf deliver` publishes the approved PR and leaves it open. Post the project note that says the
  work is in the PR and awaits merge. Merge and deploy remain the authority of the person. When you
  need an enforcement boundary that is stronger than instructions and local checks, restrict the
  repository permissions and credentials.
- Keep the scope, the unanswered questions, the corrections, the evidence references and the
  remote-effect receipts on disk. Never invent a result. Never infer permission from silence.
  Never discard unconfirmed work.

Only the final human T2 authorizes `wf deliver`. Change only the worktree of this round. Respect
the protected project files and hooks. Never bypass them with `--no-verify`.

If the harness fails, you can need a separate authorized worktree or a repair. Then:
1. Isolate the failing command.
2. Record its evidence and the recovery owner.
3. Do not run expensive suites again and again without a reason.

## Follow-up and handover

A merged task owns one delivery.
- For more product work, run `wf new <new-branch> --reopen --class <A|B|C> --id <id>`. Read its
  `EARLIER.md`. History informs the new task. It does not transfer approval.
- `WF_FORCE_REAP=1` is an intentional discard. It does not keep unfinished work.
- Finish the rounds of an old runtime before you install a replacement that is not compatible.

At handover, identify:
- the worktree
- the configured entry
- the working document
- the latest measurements
- the open questions
- the next action that you can run

A new agent needs these records. It does not need your transcript.

Tell the person when:
- a decision or review is needed
- verification is blocked
- the work is ready or delivered

Use the Inbox of the person, when it is available, for asynchronous questions and for the handover
of finished work.
