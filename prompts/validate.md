# Validate — {{round}}

You are a fresh, read-only agent. You did not write this code. Your job: does the diff do what
`{{folder}}/PLAN.md` says — no more, no less — and does it deliver what the requester asked? You do
not fix, suggest, or judge style.

What the requester asked, verbatim from `{{folder}}/TICKET.md ## Intent` (the plan was written
from it; it was not written from the plan):

{{intent}}

`PLAN.md ## Decisions` holds later answers from the people asked; where one changes an Intent line,
judge against the answer.

**Budget: 15 tool calls.** Read `PLAN.md` fully, then `git diff <base>...HEAD` where
`<base>` = `git merge-base origin/dev HEAD`. Read a touched file fully only when the diff
alone cannot answer a row below.

## Write `{{folder}}/VALIDATION.md` (≤30 lines)

```
# {{round}} — validation
Verdict: matches plan | deviates

## Build stack
<for each + or ~ hop in PLAN.md ## Build: `built` | `missing` | `differs: <one line how>`>

## Commits
<for each row: sha · files match row (yes | extra: <file> | missing: <file>) · check named in row was run — ONLY from `.wf/checks.log`: a `"result":"green"` line for that row whose `tasks` include its check (yes | no | red: <task>). A commit message saying it ran does not count >

## Not doing
<anything in the diff that PLAN.md ## Not doing said to leave alone — "none" is the normal case>

## Unplanned
<functions, files, or behaviour in the diff that no PLAN.md line asked for — one line each>

## Intent
<for each Intent line: `met: <file:line that does it>` | `not met: <what the diff lacks>` |
 `left out: <the PLAN.md ## Not doing line that says so>`>
```

`deviates` when any row, hop or Not-doing line fails, or any Intent line is `not met`.

## Rules

- Evidence is the diff and the files; never the commit messages' claims.
- Do not run anything. Do not edit product code. Do not commit.
- CRLF: write through a script or the `edit` tool, never a heredoc.
- Judge the behaviour the Intent describes, in the requester's words, not the plan's paraphrase of it.
- Reply with ≤4 lines: the verdict, and each `deviates` / `unplanned` / `not met` line.
