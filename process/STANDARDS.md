# Standards — the repository's own written rules

This is the standards axis of *Second-model review* (PRACTICES.md). The question: does the diff
follow the written rules of this repository?

The final assessment also asks the behavior question: does it do what was asked? `ASSESSMENT.md`
keeps the two apart. `## Design` and `## Standards` are separate sections. One axis cannot hide
the other (#113.1).

## A rule

A rule is a markdown file in an `.agents/checks/` folder of the **project's** repository. Amp's
code review reads the same format (ampcode.com/docs/review). One set of rules serves both.

```
---
name: API errors
description: every 4xx carries an error_code
severity-default: high
---

Every 4xx response from a handler carries an `error_code` the client can switch on. A bare
`HTTPException(400)` is an issue; a 404 for a missing id is not.
```

- `<dir>/.agents/checks/<name>.md` covers the files under `<dir>/`. The rule at the root covers
  everything.
- The id of a rule is `<dir>/<name>` (`api/errors`). At the root, the id is `<name>`.
- `severity-default` is one of `low | medium | high | critical`. Any other value, or no value, is
  `medium`.
- If `name` is missing, the id is the name.
- Write one rule in each file. Write it so that a reader who has only the diff can tell that a line
  breaks it.
- A rule that needs the whole codebase to judge is a test or a `wf check`. It is not a standard.

## In a round

The final assessment reads the rules that cover the diff of the round. By default it is one
independent, read-only agent (`prompts/assess.md.in`). It reports what the code does about each
rule under `## Standards`. Each report has a `path:line`.

- **One agent for each rule is gone** (#113.8). The assessment is one pass. The rules of a project
  are input to it. They are not a dispatch fan-out.
- These are removed with the per-rule dispatch: a `Result: pass | issues` report for each rule,
  `wf standards`, and the `standards:` header lines that T2 carried.
- The person still reads the standards findings beside the diff in `ASSESSMENT.md`.
