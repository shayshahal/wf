# {{round}} — build

Implement the agreement at `{{folder}}/{{file}}`.

{{agreement}}

{{review}}

{{assessment}}

{{answers}}

## How to work

- Choose implementation steps, helpers, delegation and tests proportionate to the task. Keep changes
  inspectable and honor the human checkpoints agreed for this work. A commit or worker session is
  not a workflow milestone.
- Run the project's normal commands through your harness. Choose repetitions, regression coverage
  and baseline comparisons for the behavior being changed. `wf check` is an optional affected-check
  convenience, not a required certificate.
- Record the commands, observed results, limitations and useful evidence references in the working
  document. Read previous findings and recorded decisions; repair them through the work and its
  evidence, rather than a prescribed response form.
- Use project setup/reset and diagnostic tools to reach the actual scenario. If a capability is
  unavailable, name what is missing and who owns it; ordinary work does not authorize fixing every
  external dependency.
- Ordinary helpers, tests and local corrections are yours. A genuinely new behavior, consequential
  contract/persistence choice or dropped agreed item needs a recorded decision and renewed agreement.
  Record newly discovered contract paths under `paths:` in the ticket's `## Scope` and run `wf next`.
- For a real decision or missing authority, write `{{folder}}/BLOCKED.md` with a contextual
  `Question:` and stop. Keep changes inside this worktree and respect protected project files.
- Record the review's live demonstration in the working document's `**T2 walk.**` bullet:
  the project's `open:` and any `setup:` lines, or `none — <why>`. Keep useful captures under
  `{{folder}}/proof/` with descriptive `before-<label>` / `after-<label>` names.

When the agreed work and your verification are ready for independent review, commit and run
`wf step assess`.
