# Practices

**Isolate work.** One round, one worktree and branch created by `wf new`. Change only that
worktree; leave other rounds, shared Git configuration and protected project files alone.

**Verify the behavior.** Choose project commands and scenario setup for the actual claim. For a
bug, a before/after comparison can distinguish the defect; preservation and refactors need relevant
regression evidence, not a mandatory baseline replay. A passing proxy assertion is not the promised
outcome. State missing evidence and setup/runner failures plainly.

**Keep evidence accessible.** Cite commands, observed output and relevant captures from harness
records or the working document. Reuse evidence whose inputs still apply; remeasure what changed.
A completion claim is judgment backed by evidence, not a specially formatted wf certificate.

**Keep work inspectable.** Choose bounded steps and delegation to fit the task. Honor agreed human
checkpoints; commits and worker-session boundaries do not require independent assessments.

**Review independently.** Before final T2, a reviewer who did not write the code judges intent,
behavior/evidence, consequential design and applicable standards. The reviewer explicitly chooses
clean, repair or blocked. Fixable work returns to the builder; a real decision goes to the person.
Final human approval identifies the reviewed implementation and is the authority to deliver.
