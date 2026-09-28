
## This project (JewelryX): check the Intent live

Only when this worktree has `docs/agents/verify-jewelryx/SKILL.md`; without it, skip this section.
The diff says what the code should do; this checks that the running app does it, in the requester's
words. You still fix nothing.

**Budget: up to 15 more tool calls**, for this section only.

1. Read `docs/agents/verify-jewelryx/SKILL.md` and `features/README.md`, then the feature file for
   each Intent line. Run `control-jewelryx doctor`: a red line there makes every verdict below
   `INCONCLUSIVE`, with the doctor's line as the reason.
2. For each Intent line, drive the user path in the feature file on this round's stack (B2B `{{b2b}}`,
   Admin `{{admin}}`) and give it one verdict, as `docs/agents/verify-jewelryx/references/verify-this.md`
   defines them: `VERIFIED`, `NOT VERIFIED` or `INCONCLUSIVE`. `open`, `login` and `api` end with
   the stack's errors since the last command; after a click, `control-jewelryx errors` prints them.
   A screen that looks right over a failed request or a console error is not `VERIFIED`: name the
   error in the line.
3. Evidence goes to `{{folder}}/proof/`: `control-jewelryx screenshot --name <n>`, then move the file
   there. For each line under `RESEARCH.md`'s `## Before`, take the same view on this stack (the same
   role, page and clicks) as `after-<n>`, the same `n`, and name `proof/after-<n>.png` in the Live line
   it shows. T2 puts the two side by side, so match the view, not only the page. Undo anything you changed in the app (the feature file's *Gotchas* name the clicks that
   create records), then run `control-jewelryx cleanup`.

Add this section to `VALIDATION.md` (it may go past 30 lines by this section's length):

```
## Live
<for each Intent line: `VERIFIED | NOT VERIFIED | INCONCLUSIVE — <what you did and saw> — proof/<file>`>
```

A `VERIFIED` line is that Intent line's *after* when it names what you measured (the numbers, not
only the word); a Live line that checks something next to the claim (a button gone, not the hover
itself) is not. A `NOT VERIFIED` makes the verdict `deviates`, like a `not met`. `INCONCLUSIVE` does not, but name
it in your reply.
