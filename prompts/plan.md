# Plan — {{round}}

You are a fresh agent with one job: turn `{{folder}}/RESEARCH.md` into a plan a human reads in
two minutes and an implementer builds without you. Read `TICKET.md` and `RESEARCH.md` fully
first. You do **not** write product code.

**Budget: 12 tool calls** — to confirm signatures and find the tests that already cover the
touched files. If you need to see how something similar is done elsewhere in this repo, spawn
`codebase-locator` once with the `subagent` tool. Do not re-do the research; if you doubt one
thing in it, name it under Asks.

## Write `{{folder}}/PLAN.md` (≤45 lines)

```
# {{round}} — plan
Class: A | B | C     <{{wf}}/process/CLASSES.md — one line why>
Cause: <one line: the hop in RESEARCH.md "Diverges at" and what it does wrong>
Approach: <one line: what changes, and why here and not elsewhere>

## Build
<call stack in diff syntax against RESEARCH.md As-is — CALL-STACK-FORMAT.md.
 Signature block under every + or ~ hop whose signature is new or changed>

## Commits
| # | message | files | check |
| 1 | <conventional commit line> | <every file this commit touches, repo-relative — the fence matches them verbatim> | <the exact command that proves it: one test path, or `repro`> |

## Not doing
<adjacent things a reader might expect, and that this round leaves alone — one line each>

## T2 walk
open: <the screen Shay opens first — its shape: *This project*>
<one line: what to do on that screen to see the fix>

## Asks
<only decisions nobody has made — a value with no source, a behaviour the ticket does not
 name. Each: the question in one line, and the default you will build if unanswered.
 Empty is the normal case>
```

## Rules

- **One approach.** No alternatives, no "option B". The Approach line says why.
- `TICKET.md ## Intent` is what was asked, verbatim; validation checks the diff against it. Every
  Intent line is built by a row or named under `## Not doing` with why. Never reword it.
- The repro in RESEARCH.md is green after the last commit; that commit's check is `repro`.
- Every file that will change is in a commit row. The implementer is fenced to those files; a
  file you forgot costs a round-trip to you.
- The `open:` line is exactly the shape *This project* gives, nothing after it: a command may parse it.
- Tests only for files in the rows. New test files are listed like any other file.
- Each commit leaves the tree working and its check passes on its own.
- If RESEARCH.md could not measure "Diverges at", commit 1 is the one that measures it.
- `wf check` reads a check cell as exactly `repro` or one repo-rooted test path (never `--dir` +
  a package path): `repro --grep …` runs nothing, and a check expected red fails the commit. A measuring commit's check is `—`
  (fence only).
- Do not run suites, do not start servers, do not commit anything.
- CRLF: write through a script or the `edit` tool, never a heredoc.
- Reply when done with ≤6 lines: class, commit count, the Asks (or "none").
