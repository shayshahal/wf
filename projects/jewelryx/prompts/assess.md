
## This project (JewelryX): check the Intent live

Only when this worktree has `docs/agents/verify-jewelryx/SKILL.md`; without it, skip this section.
The diff says what the code should do; this checks that the running app does it, in the requester's
words. You still change nothing.

**Budget: up to 15 more tool calls**, for this section only.

1. Read `docs/agents/verify-jewelryx/SKILL.md` and `features/README.md`, then the feature file for each
   Intent line. Run `control-jewelryx doctor`: a red line there makes every verdict below `INCONCLUSIVE`.
2. For each Intent line, drive the user path on this round's stack (B2B `{{b2b}}`, Admin `{{admin}}`)
   and give it one verdict: `VERIFIED`, `NOT VERIFIED` or `INCONCLUSIVE`. A screen that looks right over
   a failed request or a console error is not `VERIFIED`.
3. Evidence goes to `{{folder}}/proof/`: `control-jewelryx screenshot --name <n>`, then move the file
   there. For each `## Observed` before-picture, take the same view as `after-<n>`. Undo anything you
   changed in the app, then run `control-jewelryx cleanup`.

Add this section to `ASSESSMENT.md` under `## Behavior and evidence`:

```
## Live
<for each Intent line: `VERIFIED | NOT VERIFIED | INCONCLUSIVE — <what you did and saw> — proof/<file>`>
```

A `NOT VERIFIED` makes the verdict `blocked`; an `INCONCLUSIVE` does not, but name it.
