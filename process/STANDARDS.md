# Standards — the repository's own rules, one agent each

The standards axis of *Second-model review* (PRACTICES.md): does the diff follow this repository's
written rules? Validate asks the other question (does it do what was asked?), and T2 shows the two
side by side, never merged.

## A rule

A rule is a markdown file in an `.agents/checks/` folder of the **project's** repository, the
format Amp's code review reads too (ampcode.com/docs/review), so one set of rules serves both:

```
---
name: API errors
description: every 4xx carries an error_code
severity-default: high
---

Every 4xx response from a handler carries an `error_code` the client can switch on. A bare
`HTTPException(400)` is an issue; a 404 for a missing id is not.
```

- `<dir>/.agents/checks/<name>.md` covers the files under `<dir>/`; the root's covers everything.
  Its id is `<dir>/<name>` (`api/errors`), or `<name>` at the root. A path with a space in it is
  not read: the id names a brief, whose key is split on spaces.
- `severity-default`: `low | medium | high | critical`; anything else, or none, is `medium`. A
  missing `name` is the id.
- One rule per file, said so a reader with only the diff can tell a line breaks it. A rule that
  needs the whole codebase to judge is a test or a `wf check`, not a standard.

## In a round

Once validate is settled (`matches plan`, or its deviations ruled), `wf next` dispatches
`standards <id>` for each rule whose folder the diff touched, the round folder aside. They run one
at a time, because the Claude Code hook judges a stopping agent by the last brief, and all of
them run again after a `fix(review)` commit, as validate does. `wf standards` lists the rules
that cover the round's diff.

Each agent is fresh and read-only, sees one rule inline and only the changed files it covers, and
writes `<round folder>/standards/<id>.md`:

```
Result: pass | issues

## Issues
- high · api/orders.py:42 — a 400 without error_code · fix: raise OrderLocked
```

The issues go to T2 as they are: `wf review`'s header gives one `standards:` line per rule with its
counts, and the person keeps what matters as a T2 comment. Nothing is fixed without the person:
standards has no fix-or-accept question of its own (2026-10-03, first version: add one when a
high issue goes unread at T2).
