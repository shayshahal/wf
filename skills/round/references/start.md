# Starting a task

Use the entry and cwd rules in `../SKILL.md`. Before you create a worktree, read the `wf notes` of
the project and the class guidance that it links.

1. **Capture the whole request.**
   - Get the description of the ticket, each comment and reply (oldest first), and each attachment.
     Use an available authorized tracker tool, or its documented CLI or REST path.
   - Read the images that you download. List the material that you cannot access as missing. Do not
     say that you read it.
   - If an issue has subtasks that can be delivered independently, ask how to group them before
     you start.
2. **Clarify the consequential gaps.**
   - A title or a one-sentence task can need scope questions: intended behavior, audience,
     exclusions and verification.
   - Ask only what you cannot find in the project. The builder owns the ordinary implementation
     choices.
   - Get a ruling before the dependent work.
3. **Choose the scope and the class.** Use the linked `CLASSES.md`.

   | Class | Meaning |
   |---|---|
   | A | Ordinary work. |
   | B | The work changes a contract or persistence. |
   | C | The work needs a product decision. |

   Classify the requested work. Do not classify an empty diff. Record the known implementation
   paths as `paths: <repo-relative paths>` in `## Scope`.
4. **Prepare the workspace.**
   - Run `wf new <branch> --class <A|B|C> --id <id>`. For a repro investigation, add `--check`.
   - Keep each intake draft outside the protected base checkout until the command gives you the
     round folder.
   - Before you work in that checkout, follow the workspace binding rules that `wf notes` links.
   - Write `TICKET.md` there: the title, the source or thread in order, the attachment
     descriptions, the scope answers and the missing inputs.
   - `## Intent` holds the exact words of the requesters, with attribution. Put your interpretation
     and the image descriptions below it. Never put them in those quotations.
5. **Begin from the saved request.**
   - Normal task: update the tracker to its started status, as `wf notes` directs.
   - Check: do not change the tracker.
   - Run `wf next` from the new worktree.

Done when all of these are true:
- The intake is on disk.
- The workspace setup and the session binding succeeded.
- The next action has all the inputs that it needs.

A failed setup is an environment blocker. It is not evidence of a product defect.

## Reproduction-only work

`wf next` asks for `## Repro` first.
1. Run the repro with the commands of the project. Use `wf serve --wait` when the app must answer.
   Use the fixture and reset tools of the project between runs.
2. Record the command, the observed result, the setup and reset, and the limits.
3. Choose enough runs for the hypothesis. There is no fixed count. wf does not interpret assertion
   output.
4. `wf next` then gives the result to the person.
5. Report if it reproduced and what ran. Stop there.

After the person decides:
- **Go:** run `wf step build`. Set the started tracker status. Continue the task.
- **Stop:** make only the tracker update that the person authorized. Then run the cleanup that
  `wf next` shows.
- **Symptom only in a deployed environment:** record what the local stack cannot establish. A change
  to production or QA data still needs explicit authority. A local check does not prove that a
  deployed environment is fixed.
