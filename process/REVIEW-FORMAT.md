# Review format — the contract for SPEC-REVIEW.md (T1) and REVIEW.md (T2)

Both files share one shape: a header block, one line per comment, a final verdict line.
`review-format.mjs` implements it (`foldFeedbackLine`, `renderHeader`/`renderSkeleton`,
`readVerdict`); `design.mjs` and `review.mjs` only call those.

```
# Review — <round>

round: <branch or round name>
class: <A | B | C | —>
base: <git ref the diff is against | n/a (SPEC review)>
spec-sha: <sha256:<hex> of SPEC.md | n/a>
date: <YYYY-MM-DD>
urls: <one `<app>: <url>` line per app, worktree.mjs urlLines
      | n/a — a detached worktree has no stack>
```

The names come from the worktree's branch (`worktree.mjs`, `wt`'s `sanitize`); a
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
`a/b.ts:10-14 — rename this`; a single line to `c.ts:3 — nit`. Annotate comments
with no file are SPEC comments: `SPEC.md:<blockId or line> — text`, e.g.
`SPEC.md:usage-table — add a row`. A non-empty overall feedback becomes a leading
`note — <feedback>` line. Verdict mapping: `approved → approved`,
`annotated → changes-requested`, anything dismissed stays `dismissed`.

Rules: the verdict line is always last; the **last** `verdict: <v>` line in the file
wins (runs append dated `## YYYY-MM-DD` sections, never overwrite). A skeleton's
`verdict: pending …` line is not a verdict — `wf review --done` exits 2 until a real
one is set. Dismissed at `--done` also exits 2: re-run the review.
