# Practices

Four habits every round follows. TDD's red-base is enforced by `wf check`; the rest are
enforced by the flows that cite them, not by tooling.

**Worktree per round.** One round, one worktree, one branch off the project's base branch,
created with `wf new`. No two agents share a checkout, no round reuses
another's branch, and nothing lands except through a PR. Isolation is what
makes every other practice measurable — a red run means this round's code,
not a sibling's.

**TDD.** Defect proof is red before green, then red again when the change is taken away.
Bind the case to the behavioral assertion that detects the claimed defect, not an incidental
representation that is new with the change. `wf check` runs that test against the round's
merge-base (or the unit's starting commit) and requires the named assertion to fail there.
Preservation cases use `refactor:`: their unchanged outcomes must be green on both sides,
even in a round that also fixes a defect. A test green on both sides is preservation evidence,
not defect proof (red-base, `src/gates/check.ts`).
Bugs freeze a capture that shows the symptom, then the same capture clean.
`NOT MEASURED — <why>` is always acceptable; silence is not.

**Evidence before completion.** No round is COMPLETE on assertion. Paste
the command output — the suite counts, the shasums, the run logs — beside
every claim in `REPORT.md`. A statement about the product with no artifact
behind it is an opinion, and an inherited measurement is not evidence:
re-run it or mark it inherited.

**One subagent per bounded task.** Dispatch one of wf's own agents (`agents/`) per build unit
and let it own that scope. Each unit's assessment and the next unit get fresh agents. While it runs, do not re-do its work or read its transcript —
wait for the return, then verify its artifacts exist on disk before
calling anything done. Parallel rounds run in parallel worktrees, never
in one.

**Second-model review.** Before a batch reaches the user, a reviewer that did
not write the code reads it — a different model where possible — along two
axes kept apart: standards (does it follow this repo's rules?) and spec
(does it do what was asked, no more?). The two reports are presented side by
side, never merged, so one axis cannot mask the other. In a round, behavior/evidence is
one axis and the repository's rules are another (STANDARDS.md). One independent,
read-only assessment covers both (per unit on a large task, then one over the whole round), its
findings distinguishable by axis; a within-agreement finding returns to the build, at most twice,
and a genuine blocker is one contextual escalation (`src/round/next.ts`; Adversarial Review,
arXiv 2608.18167).

superpowers implements these if installed; the practices don't depend on it.
