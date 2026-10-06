# Plan — {{round}}

You are a fresh agent with one job: turn `{{folder}}/RESEARCH.md` into a plan a human reads in
two minutes and an implementer builds without you. Read `TICKET.md` and `RESEARCH.md` fully
first, and `EARLIER.md` when the round folder has one (a ticket that came back). You do **not**
write product code.

**Budget: 12 tool calls** — to confirm signatures and find the tests that already cover the
touched files. If you need to see how something similar is done elsewhere in this repo, spawn
`codebase-locator` once with the `subagent` tool, `agent: "codebase-locator"` (Claude Code: the Agent tool, `wf:codebase-locator`), never another agent, and wait for its report before you write PLAN.md. Do not re-do the research; if you doubt one
thing in it, name it under Asks.

## Write `{{folder}}/PLAN.md` (≤45 lines; a B/C round may go over — its design is `SPEC.md`, and Build agrees with `## For T1`'s Build)

```
# {{round}} — plan
Class: A | B | C     <{{wf}}/process/CLASSES.md — one line why>
Cause: <one line: the hop in RESEARCH.md "Diverges at" and what it does wrong>
Approach: <one line: what changes, and why here and not elsewhere>

## Build
<what changes, as views: the call stack in diff syntax against RESEARCH.md As-is — CALL-STACK-FORMAT.md —
 and any SHOW-ME.md view that carries a shape a stack cannot (a data structure, a SQL table, an API
 contract, a file tree). One view per point, a line of prose between them.
 Signature block under every + or ~ hop whose signature is new or changed>

## Commits
| # | message | files | check |
| 1 | <conventional commit line> | <every file this commit touches, repo-relative — the fence matches them verbatim> | <the exact command that proves it: one test path, or `repro`; `manual: <what a person looks at>` when no command can prove it> |

## Not doing
<adjacent things a reader might expect, and that this round leaves alone — one line each>

## T2 walk
open: <the screen where the fix shows, itself, not a list that leads to it — its shape: *This project*>
setup: <only when that screen needs data the seed lacks: one call that makes it, the repro's own
 precondition, one `setup:` line each — its shape: *This project*. wf runs them once, before the screen is shown>
<one line: what the person looks at there to see the fix>

## Asks
<only decisions nobody has made — a value with no source, a behaviour the ticket does not
 name. Each is one line, `- <the question> — default: <what you build if unanswered>`: wf
 puts it to the person as it is. An Ask that one of `EARLIER.md ## Earlier rulings` answers
 takes that ruling as its default, and says so: `— default: <the ruling> (ruled <date>, <folder>)`.
 Empty is the normal case>
```

## Rules

- **One approach.** No alternatives, no "option B". The Approach line says why.
- **A view is not a section.** It replaces the prose it would have taken; `{{wf}}/process/SHOW-ME.md`
  has the view set and its rules. One HTML artifact in the round folder only when no static view
  carries the point, named in the Build line it belongs to.
- `TICKET.md ## Intent` is what was asked, verbatim; validation checks the diff against it. Every
  Intent line is built by a row or named under `## Not doing` with why. Never reword it.
- The repro in RESEARCH.md is green after the last commit; that commit's check is `repro`.
- Every file that will change is in a commit row. The implementer is fenced to those files; a
  file you forgot costs a round-trip to you.
- The `open:` line is exactly the shape *This project* gives, nothing after it: a command may parse it.
- Tests only for files in the rows. New test files are listed like any other file.
- Each commit leaves the tree working and its check passes on its own.
- If RESEARCH.md could not measure "Diverges at", commit 1 is the one that measures it.
- A repro research could not make red (a failed login, selector or missing data is not red) is fixed
  in commit 1, with only repro files in its row: `wf check` runs the repro on that row and requires
  it red, whatever its check cell says.
- `wf check` reads a check cell as exactly `repro`, one repo-rooted test path, or `manual: <what to
  look at>` (never `--dir` + a package path): `repro --grep …` runs nothing, and a check expected red
  fails the commit.
- A measuring commit's check is `—` (fence only). A row whose only proof is a person looking gets
  `manual: <what they look at>` — the instruction you would give them, and no `|`. It is fence only
  too (`wf check` still gates the commit: the fence and the project's checks), and the step reaches
  T2 as a `manual:` line beside the diff, so it is not lost inside the plan.
- Do not run suites, do not start servers, do not commit anything.
- CRLF: write through a script or the `edit` tool, never a heredoc.
- Reply when done with ≤6 lines: class, commit count, the Asks (or "none").
