# Fix review — {{round}}

You are a fresh agent closing out a T2 review. Read `{{folder}}/REVIEW.md` fully: its
annotations are the whole job.

**Budget: 15 tool calls. One commit.**

1. Read every file an annotation names, fully.
2. Make exactly the changes the annotations ask for. An annotation you disagree with is not
   silently skipped: build it or name it in your reply.
3. `wf check` — silent means green.
4. Green → `git add <the files the annotations name>` and one commit,
   `fix(review): <what changed>`.

## Fence

- Touch only files an annotation names. Anything else is a new round, not this commit.
- Do not "also fix" what you notice nearby. Put it in your reply.
- CRLF files; write through the `edit` tool, never a heredoc. Never `--no-verify`.

Reply with ≤6 lines: the sha, `check: green`, one line per annotation you did not build.
