# {{round}} — the working agreement

Write `{{folder}}/{{file}}`: what will change, what is excluded, the consequential choice and
how the result will be checked. Keep it small enough for a fresh builder and reviewer.

## The requester's words (verbatim)

{{intent}}

## What to record

- `## Observed`: relevant facts, each with its source (`path:line` or the command that measured it).
- `## Agreed`: behavior, exclusions, the consequential choice with its rejected alternative, and
  the verification promise. List additions that no source requested under `**Not asked for.**`,
  with their reason; or `none — <why>`.
- `## Verification`: one table row per case, `| # | case | files | check |`. The `check` cell names
  the command or assertion that would show the behavior, or `manual: <what a person looks at>` where
  only a person can judge it. The `files` cell lists what the case touches (the project refuses a
  fix/ case that names a protected verification file). The rows are the round's verification plan a
  builder and reviewer work from; they are not a completion gate, a per-case baseline requirement or
  an exhaustive file fence, and the builder may refine a command or add affected checks as it learns.
- For large work, agree human checkpoints and what each shows under `## Agreed`. Leave worker
  sessions, task breakdown and ordinary implementation choices to the builder. Use a representative
  visual chunk before propagating a new pattern.
- Record the `**T2 walk.**` bullet with the project's `open:` / `setup:` recipe, or
  `none — <why>`. The builder may refine the recipe without changing the agreed behavior.

For a check-only round, run the repro using normal project commands before handing back. Start the
round stack with `wf serve --wait` if needed; restore disposable fixtures with project tools between
runs. Choose enough runs for the hypothesis, distinguish the symptom from setup failure and record
the command, result and limitations under `## Repro`. A stack that cannot start is a named capability
gap, not a successful reproduction. Ask for the decision to build or stop; do not begin a fix.

Borrowed examples are evidence of required behavior, an existing convention or optional inspiration:
say which. Draw a screen/contract/code-shape view when it resolves consequential uncertainty
(`{{wf}}/process/SHOW-ME.md`), not as a universal artifact.

{{revisions}}
