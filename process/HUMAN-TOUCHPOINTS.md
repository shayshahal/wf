# Human touchpoints

Two commands need the user: **T1** (`wf agree`) for consequential work, and **T2**
(`wf review`) to deliver. Both run from the hub session — they resolve the round's worktree
themselves, so there is no folder switch. The Plannotator adapter is optional: with it the browser
opens and the result folds itself into the file; without it the command writes the skeleton and
opens `$VISUAL` / `$EDITOR` / `code`, and the user writes the `path:line — text` lines by hand.
Either way the same files land. Everything between them is the build, checked and steered
machine-first: no per-commit dispatch, and no mid-round gate but the unit checkpoints a large task's
agreement names (below).

**T1 — `wf agree <round>`** writes `<round folder>/AGREEMENT-REVIEW.md`. It requires
`AGREEMENT.md` (or, for a class A round, `TICKET.md`), marks `step agree --waiting-on user`, renders
the agreed material — `## Observed` + `## Agreed` for B/C, `## Intent` for A — as `.wf/AGREEMENT-T1.html`,
its SHOW-ME.md views drawn (diffs coloured, mermaid drawn, Asks copyable), the round folder's own HTML
artifacts embedded, and annotates that page (Plannotator `annotate --gate`), folding the result into
the REVIEW-FORMAT.md shape: one comment line each plus a final `verdict:` line, each addressed to the
agreement line of the block it was made on. Without a review UI it writes `.wf/AGREEMENT-T1.md` (the
same section as text), opens that in an editor and the page in a browser, printing `page: <file>`.

The sha T1 binds is over the **agreed material only** (`## Observed` + `## Agreed`), never the
`## Verification` cases or the `## Units` plan (the plan has its own sha, AGREEMENT-TEMPLATE.md §
*Why each part*): adding an ordinary helper or a case must not renew T1, while a genuinely new behavior
changes the material and does. `wf step build` on a B/C round refuses unless `AGREEMENT-REVIEW.md`
approves the current material sha; a T1 given in chat is one only once `AGREEMENT-REVIEW.md` records
it (`AGREEMENT-TEMPLATE.md` § T1).

**T2 — `wf review <round> [--base <ref>]`** writes `<round folder>/REVIEW.md` (uncommitted: `wf review`
does not commit it, `wf deliver` excludes it, and `wf reap` keeps it with the round's record). It marks
`step review --waiting-on user`, writes the skeleton first (server URLs, files changed
vs base, class, the content and HEAD shas the verdict binds to), opens the branch-vs-base diff
(Plannotator `review --diff-type branch`), then appends the folded comments and verdict.
When the round folder's `proof/` has `before-<n>.png` (the agreement, on the base) or
`after-<n>.png` (the assessment, the same view on the fix), it writes `.wf/before-after.html` with
each pair side by side, opens it (outside Claude Code) and lists it under `look at:`.
It also writes `.wf/AGREEMENT.html` — the agreement rendered, its views drawn — and opens it the
same way, printing `agreement: <file>`: the agreement is what the diff is judged against.
A case whose `check` cell is `manual: …` (a proof only a person can make) reaches the header
as `manual: case N — …`: T2 makes that check, since `wf check` cannot.
An `assessment:` line carries the final assessment's verdict (`ASSESSMENT.md`; with `## Units`, the
integration assessment's), beside the diff: intent, behavior/evidence, design and standards, each
distinguishable (#113).
`wf review <round> --done` reads the verdict line: approved → `step pr`,
changes-requested → `step build`; a missing or dismissed verdict exits 2.

At `review`, `wf next` applies the same assessment/check gates as `wf step review` before
recommending T2: changed implementation checks return to build, and a moved assessed HEAD returns
to assess. A dismissed review waits only while its assessment and evidence remain current (#127,
JX-275, 2026-10-12).

**Each checkpoint file is checked by the next step, so nobody can route around the user.**

- `wf step build` on a B/C round refuses unless `AGREEMENT-REVIEW.md` approves the current
  agreed-material sha. A re-agreement is a re-T1; a chat question is not a T1, and a chat verdict
  is one only once `AGREEMENT-REVIEW.md` records it.
- `wf deliver` refuses unless `ASSESSMENT.md` records an explicit reviewer verdict and assessed
  implementation, and the implementation still matches the final approval. With `## Units`
  it also refuses until every unit is done, each checkpoint approved, and both ASSESSMENT.md and
  REVIEW.md judge `scope: integration`.
- `wf review --done` refuses when the reviewed base (header, and what Plannotator
  actually showed) is not the round's base, and an approval whose content/HEAD shas no
  longer match the tree is stale and blocks delivery (#106).
- The verdict line is written by `wf`; with the adapter present it is never edited by hand.

**Why T1 and T2.** A wrong line in the observed facts or the agreed behavior costs
thousands of lines of code; a wrong line of code costs one. So T1 reads the agreement before
anything is built, and T2 reads the diff because nothing else catches design rot — models are
rewarded for passing tests, never penalised for a lazy cast or a try/catch around everything.
(HumanLayer, *Why Software Factories Fail*.)

**Assessments, inside the build.** After a single build there is one independent read-only
assessment (`ASSESSMENT.md`). With the currently retained `## Units` route, each unit gets one scoped
to it, followed by a whole-round integration assessment. Unit execution is scheduled for removal in
the [ownership reduction](../docs/plans/2026-10-18-smaller-ownership.md).

The reviewer explicitly chooses `clean`, `repair` or `blocked` and explains the evidence and gaps.
`repair` returns ordinary findings to the builder, bounded to avoid an unattended loop; `blocked`
raises one contextual decision. The reviewer owns deciding whether a gap requires more work or a
person's decision. wf reads the explicit outcome and implementation identity, not engineering
judgment inferred from phrases in the report. A material scope change still uses `wf decide --revise`
to renew the agreement and T1.

The builder and reviewer read previous findings, recorded decisions and actual evidence directly.
Repairs require neither a special response grammar nor question-specific proof documents. The
independent reviewer judges whether a correction and its evidence resolve the findings; a specially
formatted document is not proof of correctness.

**Unit checkpoints.** A round with `## Units` stops after each unit whose `review after` names a
label, before the next unit starts. `wf review` shows the chunk built since the last checkpoint and
writes `REVIEW-unit-<n>.md` (`scope: unit:<n>`). The header includes every unreviewed unit's cases,
manual checks and assessments; its picture page includes only that chunk's referenced proof.
Comments return to the active unit's builder, with scope widened to this reviewed chunk, not future
units. Every chunk case must pass again and the repair must be reassessed before reapproval.
`--done` checks this even if invoked directly. Approval starts the next unit and is never a merge.
Only the final review
(`REVIEW.md`, `scope: integration`) is T2. Checkpoints are the ones the agreement names; the build
adds none.

**Asking.** Every question an agent might put to the user or the product owner is sorted first:
INFER what the code or the ticket already reveals — never ask it; ASK only what
the human alone knows (a requirement, a business rule); RECOMMEND what expertise
settles — state the pick, one line why, and the runner-up. Never a neutral menu,
never a silent decision.

Agent duties: read `AGREEMENT-REVIEW.md` before revising an agreement, and read `REVIEW.md`
and `ASSESSMENT.md` before continuing after a review. Review files are append-only — a new run adds
a dated section, never silently replaces the old one.
