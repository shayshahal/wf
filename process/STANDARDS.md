# Standards — the repository's own written rules

The standards axis of *Second-model review* (PRACTICES.md): does the diff follow this repository's
written rules? The final assessment asks the behavior question (does it do what was asked?), and
`ASSESSMENT.md` keeps the two distinguishable — `## Design` and `## Standards` are separate sections,
so one axis cannot mask the other (#113.1).

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
  Its id is `<dir>/<name>` (`api/errors`), or `<name>` at the root.
- `severity-default`: `low | medium | high | critical`; anything else, or none, is `medium`. A
  missing `name` is the id.
- One rule per file, said so a reader with only the diff can tell a line breaks it. A rule that
  needs the whole codebase to judge is a test or a `wf check`, not a standard.

## In a round

The final assessment (one independent, read-only agent by default, `prompts/assess.md`) reads the
rules that cover the round's diff and reports what the code does about each under `## Standards`,
each with a `path:line`. **One agent per rule is gone** (#113.8): the assessment is one pass, and a
project's rules are input to it, not a dispatch fan-out. A `Result: pass | issues` report per rule,
`wf standards`, and the `standards:` header lines T2 used to carry are removed with the per-rule
dispatch; the person still reads the standards findings beside the diff in `ASSESSMENT.md`.
