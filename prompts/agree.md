# {{round}} — the working agreement

Record what will change, what is excluded, the consequential choice, and how the result will be
checked. Keep it small enough that a fresh agent can implement and assess the work without
reconstructing the conversation.

Write `{{folder}}/{{file}}` — the one document the builds and the assessments work from.
There is no separate research file, plan file or spec, and nothing here is a completeness checklist.

## The requester's words (verbatim)

{{intent}}

## What to write

- `## Observed` — the facts a build needs, each with its source (`path:line`, or the command that
  measured it). A fact and a proposal never share a line.
- `## Agreed` — what will change and what will not: the behavior, the exclusions, the one
  consequential choice with a rejected alternative, and the verification promise.
- `## Verification` — one table row per case:

  | # | case | files | check |
  |---|---|---|---|
  | 1 | fix(x): what the case proves | path/one.ts | path/one.spec.ts::<test id>@<line> |

  `check` names what `wf check` runs: `path::<test id>@<line>` (the intended assertion), `repro`, or
  `—` for fence only. `files` is the area this case may touch.
- `## Units` — only when the work is too large for one build; a task one build can carry has none.
  One row per unit, numbered in build order:

  | # | unit | cases | depends on | review after |
  |---|---|---|---|---|
  | 1 | what this unit builds | 1, 2 | — | the label the person's checkpoint shows, or — |

  `cases` assigns every `## Verification` `#` to exactly one unit; `depends on` names earlier units
  or `—`. Size each unit for one fresh builder to make its cases green, and plan the person's
  review chunks separately, each ending at a `review after` label; name them under `## Agreed` as
  **Review chunks.** For visual work, put a representative chunk (one screen or component in the
  new pattern) early, with a checkpoint, before the units that propagate it. The rules and how the
  units run: `{{wf}}/process/AGREEMENT-TEMPLATE.md`.
- `## Repro` — for a class A check round (`wf new --check`): `command: <the command that reproduces
  the ticket>`.

For borrowed examples and external references, say what each contributes: required behavior, an
existing convention, or optional inspiration. Borrowing an example does not adopt its entire structure.

A mock, a contract sketch or a call-stack view is worth drawing only when it resolves this task's
expensive uncertainty; it is not a universal artifact. For a consequential controls/layout change,
show the proposed screen beside the current capture at the affected widths/directions before T1
(`{{wf}}/process/SHOW-ME.md`).

{{revisions}}
