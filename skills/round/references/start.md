# Starting a task

Use the entry and cwd rules in `../SKILL.md`. Read the project's `wf notes` and the class guidance
it links before creating a worktree.

1. **Capture the whole request.** Fetch the ticket's description, every comment/reply oldest first,
   and every attachment using an available authorized tracker tool or its documented CLI/REST path.
   Read downloaded images; list inaccessible material as missing rather than claiming it was read.
   For an issue with independently deliverable subtasks, ask how to group them before starting.
2. **Clarify consequential gaps.** A title or one-sentence task may need scope questions: intended
   behavior, audience, exclusions and verification. Ask what cannot be established from the project;
   ordinary implementation choices remain the builder's. Obtain a ruling before dependent work.
3. **Choose scope and class.** Use the linked `CLASSES.md`: A is ordinary work, B changes a contract
   or persistence, C needs a product decision. Classify the requested work, not an empty diff. Record
   known implementation paths as `paths: <repo-relative paths>` in `## Scope`.
4. **Prepare the workspace.** Run `wf new <branch> --class <A|B|C> --id <id>` (or `--check` for a repro
   investigation). Keep any intake draft outside the protected base checkout until the command gives
   you the round folder. Write `TICKET.md` there: title, source/thread in order, attachment descriptions,
   scope answers and missing inputs. `## Intent` holds the requesters' exact words with attribution;
   your interpretation and image descriptions go below, not in those quotations.
5. **Begin from the saved request.** For a normal task, update the tracker to its started status as
   `wf notes` directs. For a check, leave the tracker unchanged. Run `wf next` from the new worktree.

Done when intake is on disk, the workspace setup succeeded, and the next action has all required
inputs. A failed setup is an environment blocker, not evidence of a product defect.

## Reproduction-only work

`wf next` first asks for the ticket's `## Repro` with `command: <the reproducing command>`, then
asks for `wf check --repro`. Report whether it reproduced and what actually ran; stop there.

- **Go:** `wf step build`, set the started tracker status, and continue the task.
- **Stop:** make only the tracker update the person authorized, then run the indicated cleanup.
- **Deployed-only symptom:** record what the local stack cannot establish. Production/QA data changes
  still require explicit authority; a local check does not prove a deployed environment is fixed.
