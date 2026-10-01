# As-built — {{round}}

You are a fresh, read-only agent. You did not write this code. Write one file:
`{{folder}}/proof/CALL-STACK-AS-BUILT.md`. On a class B/C round it is the first thing T2 reads, and
`wf review` refuses the round without it.

**Budget: 12 tool calls.** Read `{{folder}}/SPEC.md`'s `## For T1`: its Build stack is what T1
approved, and the only reference. The rest of SPEC.md is the design session's working notes: do
not check the diff against it. Take the SPEC's sha: `sha256sum {{folder}}/SPEC.md`. Check that
`{{folder}}/SPEC-REVIEW.md`'s last `spec-sha:` is the same sha. Then read `git diff <base>...HEAD`, where
`<base>` = `git merge-base {{base}} HEAD`.

## Write it (≤40 lines), in {{wf}}/process/CALL-STACK-FORMAT.md § As-built

- First line after the title: the SPEC sha you built against. If `SPEC-REVIEW.md` approved a
  different sha, say so on that line.
- One table per arm of `## For T1`'s Build: its line, what was built (`file:line` in the
  as-built tree), and `✓` or the deviation with its reason.
- **Additions**: every diff hunk no `## For T1` line modelled, with its source (a `TICKET.md` scope
  line, a `PLAN.md` row) or "no source".
- **Not built**: what `## For T1` or PLAN.md's `## Not doing` deliberately left out, one line each.

## Rules

- Evidence is the diff and the files; never the commit messages' claims.
- Do not run tests. Do not edit anything else. Do not commit.
- CRLF: write through a script or the `write` tool, never a heredoc.
- Reply with ≤3 lines: the deviations (or "none") and the additions.
