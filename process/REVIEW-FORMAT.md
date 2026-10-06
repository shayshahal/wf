# Review format — the contract for SPEC-REVIEW.md (T1) and REVIEW.md (T2)

Both files share one shape: a header block, one line per comment, a final verdict line.
`review-format.ts` implements it (`foldFeedbackLine`, `renderHeader`/`renderSkeleton`,
`readVerdict`); `design.ts` and `review.ts` only call those.

```
# Review — <round>

round: <branch or round name>
class: <A | B | C | —>
base: <git ref the diff is against | n/a (SPEC review)>
spec-sha: <sha256:<hex> of SPEC.md | n/a>
date: <YYYY-MM-DD>
urls: <one `<app>: <url>` line per app, worktree.ts urlLines
      | n/a — a detached worktree has no stack>
```

The names come from the worktree's branch (`worktree.ts`, `wt`'s `sanitize`); a
detached worktree has no stack — omit the URLs and say so, never invent one.

```
files changed (<n>):
- <path>
...

comments:
<path>:<lineStart>[-<lineEnd>] — <text>
...
verdict: <approved | changes-requested | dismissed>
```

Comment lines: `path:lineStart[-lineEnd] — text` (em-dash). A range folds to
`a/b.ts:10-14 — rename this`; a single line to `c.ts:3 — nit`. A comment made on the page T1
shows (design.ts) is a SPEC comment too, folded onto the line of the block it was made on —
`SPEC.md:22 — one invalidate call, not two` — because the page tags every block with its
SPEC.md line (`planBody`'s `wf-src-<line>`) and `pageLine` reads that tag back out of what the
review UI reports. A `blockId` (annotating markdown directly) folds the same way:
`SPEC.md:usage-table — add a row`; one that says nothing about where it was is
`SPEC.md:? — text`. Each comment line also carries what it was made on, clipped to one line:
`SPEC.md:22 — one call, not two (on: invalidate('listings', 'stats')     one call, both keys)`.
A person's overall words are an annotation like any other — the review UI reports them against no
block, so they fold as `SPEC.md:? — text` — and the review UI's own `message`, when it has one,
becomes a leading `note — <message>` line, as does what the agent writes by hand when T1 is given in
chat (round skill). What is **not** folded is the review UI's `feedback` field: it is a digest the
tool generates, one section per annotation quoting the element's HTML and its box coordinates, and
folding it put a 20-line restatement of every comment into a review file (measured 2026-10-06).
Verdict mapping: `approved → approved`, `annotated → changes-requested`, anything dismissed stays
`dismissed`.

Rules: the verdict line is always last; the **last** `verdict: <v>` line in the file
wins (runs append dated `## YYYY-MM-DD` sections, never overwrite). A skeleton's
`verdict: pending …` line is not a verdict — `wf review --done` exits 2 until a real
one is set. Dismissed at `--done` also exits 2: re-run the review.
