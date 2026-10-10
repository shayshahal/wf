# Practices

Four habits every round follows. TDD's red-base is enforced by `wf check`; the rest are
enforced by the flows that cite them, not by tooling.

**Worktree per round.** One round, one worktree, one branch off the project's base branch,
created with `wf new`. No two agents share a checkout, no round reuses
another's branch, and nothing lands except through a PR. Isolation is what
makes every other practice measurable — a red run means this round's code,
not a sibling's.

**TDD.** Red before green, then red again when the build is taken away.
Bugs freeze a capture that shows the symptom, then the same capture clean;
CRs measure cells RED on the base tree, GREEN on the build, RED reverted.
A test that never failed is not proof — it is a test that cannot detect
the defect. `wf check` runs the case's own test with the change taken
back to HEAD and refuses a green: a test that passes with and without the
fix does not reach a commit (red-base, `src/gates/check.ts`).
`NOT MEASURED — <why>` is always acceptable; silence is not.

**Evidence before completion.** No round is COMPLETE on assertion. Paste
the command output — the suite counts, the shasums, the run logs — beside
every claim in `REPORT.md`. A statement about the product with no artifact
behind it is an opinion, and an inherited measurement is not evidence:
re-run it or mark it inherited.

**One subagent per task.** Dispatch one of wf's own agents (`agents/`) per task and let it own
its stack. While it runs, do not re-do its work or read its transcript —
wait for the return, then verify its artifacts exist on disk before
calling anything done. Parallel rounds run in parallel worktrees, never
in one.

**Second-model review.** Before a batch reaches the user, a reviewer that did
not write the code reads it — a different model where possible — along two
axes kept apart: standards (does it follow this repo's rules?) and spec
(does it do what was asked, no more?). The two reports are presented side by
side, never merged, so one axis cannot mask the other. In a round, validate is
the behavior axis, and the repository's rules are the other (STANDARDS.md). One independent,
read-only assessment covers both by default, its findings distinguishable by axis; a within-agreement
finding returns to the build, at most twice, and a genuine blocker is one contextual escalation
(`src/round/next.ts`; Adversarial Review, arXiv 2608.18167).

superpowers implements these if installed; the practices don't depend on it.
