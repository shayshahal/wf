# Independent and human review

Use the entry and cwd rules in `../SKILL.md`. When you write the review records, read the
review-format guidance and the agreement guidance that `wf notes` links. Use `process/SHOW-ME.md`
from the wf root for the visual presentation (show, don't narrate; ASD-STE100).

- A configured native presentation adapter has priority over an external review UI. It prints a
  handoff. The session executes that handoff.
- For a UI-owning harness or a remote harness that is not configured, set `WF_NO_OPEN=1`.

## Independent assessment

The builder can agree and implement in the current context. The assessment needs a fresh reviewer
context that did not build the implementation.
- Use an available subagent, another session or another harness.
- These do not establish independence: an agent name, a different model, a rewritten report.
- If no independent context is available, save this handoff. Report that blocker.

Give the reviewer:
- the worktree
- the wf entry
- the current `wf brief assess` command

The brief supplies the agreement, the scope, the corrections and the evidence locations. The
reviewer reads the actual files and the diff. The reviewer does not read the conversation of the
builder.

The reviewer:
- is read-only for product code
- writes the assessment that the brief names
- judges intent, behavior and evidence, design, and project standards
- separates the findings by axis

Done when the fresh report covers the current checked implementation, and its findings or its
clean verdict are on disk. The commands enforce the freshness of the report and of the content.
They do not check the provenance of an LLM context. The task owner must choose an independent
reviewer.

After the assessment:
- An ordinary finding inside the agreement returns to implementation. Stay inside the repair budget.
- The builder answers it in the working document and supplies new evidence. The builder keeps the
  assessment unchanged.
- After a repair, a new assessment is needed. This is true also when only the evidence changed and
  HEAD stayed the same.

## T1: consequential agreement

For B/C work, run `wf agree <branch>` when the agreement is ready.
- Give the decision first. Then give short facts and a relevant view.
- Show all of these: the observed facts, the agreed behavior, the exclusions, the consequential
  choices and the verification. The supporting logs can stay linked.
- The verdict of the person is bound to the sha of the agreed material in `AGREEMENT-REVIEW.md`.

Record the response:
- With a configured review UI, the command folds the response.
- Without a review UI, show the files or the page with the available tools. Then record in the
  named review file what you showed and the comments and verdict of the person.
- Write only the actual ruling of the person. Editing the file is a transport. It does not give an
  agent permission to approve its own work.
- After you record the verdict, run `wf next`.

Done when the current agreed material has the approval of the person, or the requested changes
have returned to agreement. An edit of working detail does not renew unchanged material. A change
of behavior does.

## T2 and agreed checkpoints

### Agreed checkpoints

Before you cross a checkpoint that a human agreed, show its intended diff and the evidence for that
intermediate work.
The independent final assessment and final T2 walk are not checkpoint prerequisites.

1. Run `wf review <branch> --checkpoint [--base <ref>]`.
2. Show the prepared material. Keep its identity header.
3. Record only the actual comments and verdict of the person.
4. Run `wf review <branch> --checkpoint --done`. Then run `wf next`.

`CHECKPOINT-REVIEW.md` records the outcome. Approval resumes the build. It never resumes delivery.

### Final T2

1. **Inspect.** Inspect the current agreement, the implementation diff and the independent
   assessment.
   - Run the preview or walk command of the project from `wf notes`, with the setup recipe of the
     agreement.
   - Use the native browser tools of the session. If they are not available, use an external UI,
     or give the exact URL and setup.
   - Start the presentation with: result, change, evidence, limits, and the next action of the
     person.
   - Keep a missing live verification visible. A screenshot or a reading of the code is not an
     automatic substitute.
   - For a UI change, check the required before/after PR images against the actual diff. Use
     `process/SHOW-ME.md#ui-changes-required-pr-images`. Complete the missing pairs before the T2
     handoff. After delivery, verify that both images render in the PR description.
2. **Prepare the record.** Run `wf review <branch>`. It prepares the bound review record and the
   inspection artifacts.
   - Use the configured UI. Or show the person the named files and record their comments and
     actual verdict.
   - Keep the reviewed identity header. It does not approve later product or test changes.
3. **Record the verdict.** After the person submits the verdict, run `wf review <branch> --done`.
   Then run `wf next`. If the person requested changes, the round returns to build. Its corrections
   and screenshots stay as obligations.

Done when the verdict is recorded on the actual material that you showed, and the tool accepted it.
- An agreed checkpoint permits the next agreed part of the work. It never permits a merge.
- The final T2 approves the delivery through `wf deliver`. That command rechecks freshness and
  reconciles the remote effects.
