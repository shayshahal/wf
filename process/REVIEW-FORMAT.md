# Review format — the contract for AGREEMENT-REVIEW.md (T1) and REVIEW.md (T2)

Both files have one shape: a header block, one line for each comment, and a final verdict line.
`review-format.ts` implements it (`foldFeedbackLine`, `renderHeader`/`renderSkeleton`,
`readVerdict`). `agree.ts` and `review.ts` only call those.

```
# Review — <round>

round: <branch or round name>
class: <A | B | C | —>
base: <git ref the diff is against | n/a (agreement review)>
agreement-sha: <sha256:<hex> of the agreement's agreed material (## Observed + ## Agreed) | absent on T2>
content-sha: <the worktree identity the verdict binds to (#106) | absent on T1>
head-sha: <the HEAD identity the verdict binds to | absent on T1>
scope: <checkpoint | absent on T1 and final T2>
date: <YYYY-MM-DD>
urls: <one `<app>: <url>` line per app, worktree.ts urlLines
      | n/a — a detached worktree has no stack>
```

## Scope

- `scope: checkpoint` marks an optional review of a diff in the build. It is in
  `CHECKPOINT-REVIEW.md`.
- It binds the verdict and the intended base under the same header. Approval resumes the build.
- The final T2 uses `REVIEW.md` without a scope line.
- A checkpoint approval never authorizes delivery.

## URLs

The names come from the branch of the worktree (`worktree.ts`, and the slug and port rules in
`ports.ts`). A detached worktree has no stack. Omit the URLs and say so. Never invent one.

## Body

```
files changed (<n>):
- <path>
...

comments:
<path>:<lineStart>[-<lineEnd>] — <text>
...
verdict: <approved | changes-requested | dismissed>
```

## Comment lines

A comment line is `path:lineStart[-lineEnd] — text`. The dash is an em-dash.

| Comment on | Folded line |
|---|---|
| A range | `a/b.ts:10-14 — rename this` |
| A single line | `c.ts:3 — nit` |
| A block of the T1 page | `AGREEMENT.md:22 — one call, not two` |
| A `blockId` (markdown annotated directly) | `AGREEMENT.md:usage-table — add a row` |
| No known place | `AGREEMENT.md:? — text` |

- **T1 page comments.** A comment made on the page that T1 shows (`agree.ts`) is an agreement
  comment. It folds onto the line of the block where it was made. The page tags each block with its
  agreement line (`agreementBody`'s `wf-src-<line>`). `pageLine` reads that tag out of what the
  review UI reports.
- **Context.** Each comment line also carries what it was made on, cut to one line:
  `AGREEMENT.md:22 — one call, not two (on: invalidate('listings', 'stats')     one call, both keys)`.
- **Overall words.** The overall words of a person are an annotation like any other. The review UI
  reports them against no block. They fold as `AGREEMENT.md:? — text`.
- **Notes.** The review UI can give its own `message`. It becomes a leading `note — <message>` line.
  The same applies to what the agent writes by hand when T1 is given in chat (round skill).
- **Not folded.** The `feedback` field of the review UI is not folded. The tool generates it as a
  digest. It has one section for each annotation, with the HTML of the element and its box
  coordinates. When it was folded, it put a 20-line restatement of each comment into a review file
  (measured 2026-10-06).

Verdict mapping:

| Review UI | Verdict |
|---|---|
| `approved` | `approved` |
| `annotated` | `changes-requested` |
| dismissed | `dismissed` |

## Rules

- The verdict line is always last.
- The **last** `verdict: <v>` line in the file wins. Runs append dated `## YYYY-MM-DD` sections.
  They never overwrite.
- The `verdict: pending …` line of a skeleton is not a verdict. `wf review --done` exits 2 until a
  real verdict is set.
- A dismissed verdict at `--done` also exits 2. Run the review again.
