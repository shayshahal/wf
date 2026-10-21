# Independent and human review

Use the entry and cwd rules in `../SKILL.md`. Read the review-format and agreement guidance linked
by `wf notes` when writing those records. Use `process/SHOW-ME.md` from the wf root for compact
reading and visual presentation. A configured native presentation adapter takes precedence over
external review UI and prints a handoff for the session to execute. Set `WF_NO_OPEN=1` for an
unconfigured UI-owning or remote harness.

## Independent assessment

The builder may agree and implement in the current context. Assessment needs a fresh reviewer
context that did not build the implementation. Use an available subagent, another session, or
another harness; an agent name, a different model, or a rewritten report alone does not establish
independence. If no independent context is available, save this handoff and report that blocker.

Give the reviewer the worktree, wf entry and current `wf brief assess` command. The brief supplies
the agreement, scope, corrections and evidence locations; the reviewer reads actual files and the
diff rather than the builder's conversation. The reviewer is read-only for product code and writes
the assessment named in the brief. It judges intent, behavior/evidence, design and project standards
with findings distinguishable by axis.

Done when the fresh report covers the current checked implementation and its findings or clean
verdict are on disk. The commands enforce report/content freshness, not the provenance of an LLM
context; the task owner remains responsible for choosing an independent reviewer.

Ordinary within-agreement findings return to implementation within the repair budget. The builder
answers them in the working document and supplies new evidence, preserving the assessment. A new
assessment is needed after repair even if only the evidence changed and HEAD stayed the same.

## T1: consequential agreement

For B/C work, run `wf agree <branch>` after the agreement is ready. Lead with the decision and use
short facts plus a relevant view. Show all observed facts, agreed behavior, exclusions, consequential
choices and verification; supporting logs can remain linked.
The person's verdict is bound to the agreed material's sha in `AGREEMENT-REVIEW.md`.

With a configured review UI, the command folds their response. Without one, show the files/page
using available tools, then record what you showed and the person's comments/verdict in the named
review file. Write only their actual ruling; file editing is a transport, not permission for an
agent to approve its own work. Run `wf next` after the verdict is recorded.

Done when the current agreed material has the person's approval, or their requested changes have
returned to agreement. Working-detail edits need not renew unchanged material; changed behavior does.

## T2 and agreed checkpoints

1. Inspect the current agreement, implementation diff and independent assessment. Run the project's
   preview/walk command from `wf notes` and the agreement's setup recipe. Use the session's native
   browser tools, or an external UI/exact URL and setup if unavailable. Start the presentation with
   result, change, evidence, limits and the person's next action. Missing live verification stays
   visible; a screenshot or code reading is not an automatic substitute.
   For UI changes, check the required before/after PR images against the actual diff using
   `process/SHOW-ME.md#ui-changes-required-pr-images`. Complete missing pairs before T2 handoff;
   after delivery, verify both images render in the PR description.
2. Run `wf review <branch>`. It prepares the bound review record and inspection artifacts. Use the
   configured UI, or show the person the named files and record their comments and actual verdict.
   Preserve the reviewed identity header. It is not approval of later product/test changes.
3. Once the person has submitted their verdict, run `wf review <branch> --done`, then `wf next`.
   Changes-requested returns to build; its corrections and screenshots remain obligations.

Done when the verdict is recorded on the actual material shown and the tool has accepted it. An
agreed checkpoint permits the next agreed part of the work, never merge. Final T2 approves delivery
through `wf deliver`; that command remains responsible for rechecking freshness and reconciling
remote effects.
