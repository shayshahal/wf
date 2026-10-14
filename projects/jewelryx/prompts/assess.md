
## This project (JewelryX): check the Intent live

Only when this worktree has `docs/agents/verify-jewelryx/SKILL.md`; without it, skip this section.
The diff says what the code should do; this checks that the running app does it, in the requester's
words. You still change nothing.

This section is done when every Intent line in this assessment's scope has its verdict and its
proof; a `deferred:` line waits for its own unit.

1. Read `docs/agents/verify-jewelryx/SKILL.md` and `features/README.md`, then the feature file for each
   Intent line in scope. Run `control-jewelryx doctor`: a red line there makes every verdict below
   `INCONCLUSIVE`.
2. For each Intent line in scope, drive the user path on this round's stack (B2B `{{b2b}}`, Admin
   `{{admin}}`) and give it one verdict: `VERIFIED`, `NOT VERIFIED` or `INCONCLUSIVE`. A screen that looks right over
   a failed request or a console error is not `VERIFIED`.
3. Read the relevant assertions and inspect the captures against each claimed state. An
   `aria-invalid` assertion proves that attribute, not valid-input or empty-input reset behavior.
   Focus/error-ring promises need rendered evidence of clipping at the container edge, not only
   a CSS-class pass. Certificate proof must show the relevant certificate row; range-filter proof
   must show the configured filter bounds and outcome. Use the feature recipe and
   `docs/agents/testing.md` for driving and measurement. When the required state is missing from an
   otherwise available capture, record `NOT MEASURED` and `Verdict: repair` so the build retakes it;
   a genuine capability/environment/authority blocker remains `INCONCLUSIVE`.
4. Keep captures in `{{folder}}/proof/` as `after-<label>.png`, matching the baseline's
   `before-<label>.png` when there is one, or a fresh label for a new view. Rename the timestamped
   capture when you keep it: both handoffs refuse unnamed pictures, and posting/T2 use these same
   names. For each `## Observed` before-picture in scope, take the same view as its after-picture.
   Undo anything you changed in the app, then run `control-jewelryx cleanup`.

Add this section to the assessment file under `## Behavior and evidence`:

```
## Live
<for each Intent line in scope: `VERIFIED | NOT VERIFIED | INCONCLUSIVE — <what you did and saw> — proof/<file>`>
```

A `NOT VERIFIED` makes the verdict `blocked`. Name every `INCONCLUSIVE` and the missing check;
wf requires it to be fixed or explicitly accepted before T2.
For a verification gap, distinguish a product regression, broken harness, stale recipe or missing
scenario setup; if the cause is unknown, say so. Under `## Behavior and evidence`, name the affected
path or missing capability, the needed change and the command to rerun. Protected-test updates go
through bugs-to-tests / cr-to-tests on a `verification/*` branch. Keep this assessment read-only;
a product regression needs a product fix, not a weaker assertion.
