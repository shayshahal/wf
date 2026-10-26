# Practices

**Isolate work.**
- One round has one worktree and one branch. `wf new` creates them.
- Change only that worktree.
- Do not touch other rounds, shared Git configuration or protected project files.

**Verify the behavior.**
- Choose the project commands and the scenario setup for the actual claim.
- Bug: a before/after comparison can show the defect.
- Preservation and refactors: relevant regression evidence is enough. A baseline replay is not
  mandatory.
- A passing proxy assertion is not the promised outcome.
- State plainly: missing evidence, setup failures and runner failures.

**Keep evidence accessible.**
- Cite commands, observed output and relevant captures. Use the harness records or the working
  document.
- Reuse evidence when its inputs still apply. Measure again what changed.
- A completion claim is a judgment with evidence. It is not a wf certificate in a special format.

**Keep work inspectable.**
- Choose bounded steps and delegation that fit the task.
- Respect the human checkpoints that were agreed.
- A commit or a worker-session boundary does not require an independent assessment.

**Review independently.**
- Before the final T2, a reviewer who did not write the code judges these: intent, behavior and
  evidence, consequential design, applicable standards.
- The reviewer chooses explicitly: clean, repair or blocked.
- Work that can be fixed returns to the builder. A real decision goes to the person.
- The final human approval names the reviewed implementation. It is the authority to deliver.
