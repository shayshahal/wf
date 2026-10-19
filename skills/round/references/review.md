# Independent and human review

Use the entry and cwd rules in `../SKILL.md`. Read the review-format and agreement guidance linked
by `wf notes` when writing those records. Set `WF_NO_OPEN=1` when this harness owns the UI or
runs remotely; the commands still print their artifacts without opening separate windows.

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

For B/C work, run `wf agree <branch>` after the agreement is ready. Use the rendered page or available
review UI to show observed facts, agreed behavior, exclusions, consequential choice and verification.
The person's verdict is bound to the agreed material's sha in `AGREEMENT-REVIEW.md`.

With a configured review UI, the command folds their response. Without one, show the files/page
using available tools, then record what you showed and the person's comments/verdict in the named
review file. Write only their actual ruling; file editing is a transport, not permission for an
agent to approve its own work. Run `wf next` after the verdict is recorded.

Done when the current agreed material has the person's approval, or their requested changes have
returned to agreement. Working-detail edits need not renew unchanged material; changed behavior does.

## T2 and agreed checkpoints

1. Inspect the current agreement, implementation diff and independent assessment. Run the project's
   preview/walk command from `wf notes` and the agreement's setup recipe. If the harness cannot open
   a browser, use an available external UI or give the person the exact URL and setup. Missing
   required live verification stays visible, not silently satisfied by a screenshot or code reading.
2. Run `wf review <branch>`. It prepares the bound review record and inspection artifacts. Use the
   configured UI, or show the person the named files and record their comments and actual verdict.
   Preserve the reviewed identity header. It is not approval of later product/test changes.
3. Once the person has submitted their verdict, run `wf review <branch> --done`, then `wf next`.
   Changes-requested returns to build; its corrections and screenshots remain obligations.

Done when the verdict is recorded on the actual material shown and the tool has accepted it. An
agreed checkpoint permits the next agreed part of the work, never merge. Final T2 approves delivery
through `wf deliver`; that command remains responsible for rechecking freshness and reconciling
remote effects.
