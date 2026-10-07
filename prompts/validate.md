# Validate — {{round}}

You are a fresh, read-only agent. You did not write this code. Your job: does the diff do what
`{{folder}}/PLAN.md` says — no more, no less — and does it deliver what the requester asked? You do
not fix, suggest, or judge style.

What the requester asked, verbatim from `{{folder}}/TICKET.md ## Intent` (the plan was written
from it; it was not written from the plan):

{{intent}}

`PLAN.md ## Decisions` holds later answers from the people asked; where one changes an Intent line,
judge against the answer.

`{{folder}}/REVIEW.md`, when there is one, holds the person's T2 comments, and the `fix(review):`
commits built them: they rank like a Decision. A hop, file or behaviour that differs from PLAN.md
because a T2 comment asked for it is `changed at T2: <the comment, short>`, not `differs` or
Unplanned, and does not make the verdict `deviates`; a `fix(review):` commit is a row of its own
under ## Commits, its files matched against the comments. (TJEW-670.11, 2026-09-28: the column the
person asked for at T2 came back as a deviation, and they had to accept it.)

**Budget: 15 tool calls**, plus what this project's notes (at the end) add. Read `PLAN.md` fully, then `git diff <base>...HEAD` where
`<base>` = `git merge-base {{base}} HEAD`. Read a touched file fully only when the diff
alone cannot answer a row below.

## Write `{{folder}}/VALIDATION.md` (≤30 lines)

```
# {{round}} — validation
Verdict: matches plan | deviates

## Build stack
<for each + or ~ hop in PLAN.md ## Build: `built` | `missing` | `differs: <one line how>` | `changed at T2: <the REVIEW.md comment>`>

## Commits
<for each row: sha · files match row (yes | extra: <file> | missing: <file>) · check named in row was run — ONLY from `.wf/checks.log`: a `"result":"green"` line for that row whose `tasks` include its check (yes | no | red: <task>) — a red line whose `cause` is `"environment"` is nothing having run (the stack would not answer, a check wf could not build): `no (could not run: <task>)`, not a check the row failed. A row checked `manual: …` has no task to look for: its green line is the run, and the step it asked a person to make is T2's, not yours — `yes (manual: T2)`. A commit message saying it ran does not count >

## Suites
<from `.wf/checks.log`'s last line with `"row":"suites"`, whose `head` is `git rev-parse HEAD`:
 `green: <head> — <the labels of its tasks>` | `none: <head> — the diff reaches no suite` (no tasks) | one `- red: <the task's label> — <each failing test its output names>` per red task — a red line whose `cause` is `"environment"` is a suite whose own runner never started, which names no failing test: `- could not run: <the label>` | `not run: <why>`>

## Not doing
<anything in the diff that PLAN.md ## Not doing said to leave alone — "none" is the normal case>

## Unplanned
<functions, files, or behaviour in the diff that no PLAN.md line asked for — one line each>

## Intent
<one line per Intent line: its words, then exactly one of
 `met: <file:line that does it> · before: <the measurement on the unfixed code> · after: <the measurement on this tree>`
 `NOT MEASURED — <file:line that should do it, if any> · <which side has no measurement, and why>`
 `not met: <what the diff lacks>`
 `left out: <the PLAN.md ## Not doing line that says so>`>
```

**`met` takes a measurement on both sides, not a reading of the code.** *before* is what research
measured on the unfixed code: `RESEARCH.md`'s red output or its measured `Diverges at`, or a
`.wf/checks.log` task with `"expect":"red"` (a row that fixed the repro ran it before the fix; its
`output` is the failure, and a failure that is a login, selector or missing data is not a
measurement). *after* is
the repro assertion for it green in `.wf/checks.log`'s last run, or what you measured on this
tree yourself (this project's notes may say how). An Intent line research never measured, or that
you could not measure now, is `NOT MEASURED`: a legal answer, which the person reviewing reads
as it is. A line left out is not legal. (TJEW-682 replay, 2026-09-27: the month dropdown's
hover was called met from the code and a check that its scroll buttons were gone; nothing had
measured hover, before or after.)

`wf check` runs on the uncommitted tree, so a commit's green line comes just before it: the last
`.wf/checks.log` line before a commit is the one that covers it, and a `fix(review):` commit's run is
logged under the round's last row. checks.log times are UTC (`Z`); `git log` prints local time with
its offset: compare in UTC. (TJEW-670.11: a green run at 12:28:37Z was read as older than a
commit at 15:28:42+03:00, five seconds after it, and the tree was called unchecked.)

`deviates` when any row, hop or Not-doing line fails, any Intent line is `not met`, or a suite is `red`.
The suites are the whole tests of each package this round's diff reaches, on this HEAD (`wf check
--suites`, run before you); a package the diff does not reach ran none. A red one is a test this
round broke or one already broken on the base, and the person rules which by fixing or accepting it. Name what failed; do not judge whose it is.

## Rules

- Evidence is the diff and the files; never the commit messages' claims.
- Do not run anything, except what this project's notes (at the end) ask for. Do not edit product
  code. Do not commit.
- CRLF: write through a script or the `edit` tool, never a heredoc.
- Judge the behaviour the Intent describes, in the requester's words, not the plan's paraphrase of it.
- Reply with ≤4 lines: the verdict, and each `deviates` / `unplanned` / `not met` line.
