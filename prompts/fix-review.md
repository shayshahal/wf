# Fix review — {{round}}

You are a fresh agent closing out a review. Read `{{folder}}/{{review}}` fully: its
annotations are the whole job (in a VALIDATION.md, its `differs`, `missing`, `not met`,
`extra` and `red:` lines). For a `red:` suite, also read `{{folder}}/PLAN.md`: the failing
test is evidence, not an instruction to change the test. Trace its failure to product code.

**Budget: 15 tool calls. One commit.**

1. Read every file an annotation names, fully.
2. Make exactly the changes the annotations ask for. An annotation you disagree with is not
   silently skipped: build it or name it in your reply.
3. `wf check` — silent means green.
4. Green → `git add <the files you fixed>` and one commit,
   `fix(review): <what changed>`.

## Fence

- Touch only files an annotation names, or, for a `red:` suite, product files listed in PLAN.md's
  commit rows that cause the failure. A needed file outside those rows is a plan gap: stop and
  name it in your reply; the plan must be revised before the fix. A failure already on the base
  belongs in its own round, not this commit.
- Edit a test only when the plan lists it and the annotation asks for a test change.
- Do not "also fix" what you notice nearby. Put it in your reply.
- CRLF files; write through the `edit` tool, never a heredoc. Never `--no-verify`.

Reply with ≤6 lines: the sha, `check: green`, one line per annotation you did not build.
