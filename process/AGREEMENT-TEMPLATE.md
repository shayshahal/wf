# The working agreement

The skeleton of `<round folder>/AGREEMENT.md`, the one document class B/C work is agreed on and
built from (#110, #111). Class A needs none of it: `TICKET.md` is the agreement, and a `## Repro`
(for a check round) or a `## Verification` table may sit in it. This file is also what the T1
agreement session (`skills/design-session/SKILL.md`) follows.

The section order is fixed. The `T2 walk` bullet, `## Verification` cases and `## Units` plan are the
machine-read parts; `## Observed` + `## Agreed` are the agreed material, and T1 binds its sha
(`src/round/agreement.ts`).

```markdown
# AGREEMENT — <ID> · «<the ticket title, verbatim>»

<board item · reporter + date> · Round `<branch>`, base `<ref>`. Class `<B|C>`.
`## Decisions` records the person's rulings (`wf decide` writes there).

## Observed

- <one fact per line, each with its source: `path:line`, or the command that measured it>
- <a fact and a proposal never share a line>

## Agreed

- **Behavior.** <what changes, visibly or in a contract>
- **Excluding.** <what this round does not touch, and where it lands instead>
- **Choice.** <the one consequential choice, and the alternative it beat, one line why>
- **Verification.** <the promise the cases below make>
- **T2 walk.** <the `open:` line `wf show` follows: `open: <b2b|admin> </path> as <role> [mobile]>`, or `none — <why no walk is needed>`>
- **Review chunks.** <only with `## Units`: each checkpoint in order, and what the person sees there>

## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | fix(x): <what the case proves> | `path/one.ts` | `path/one.spec.ts::<test id>@<line>` |
| 2 | <…> | `path/two.ts` | `repro` |

## Units

<only when the work is too large for one build; otherwise leave the section out>

| # | unit | cases | depends on | review after |
|---|---|---|---|---|
| 1 | <what this unit builds> | 1 | — | <checkpoint label, or —> |
| 2 | <…> | 2, 3 | 1 | — |

## Repro

command: <the command that reproduces the ticket, for a check round or a repro case>
```

## Why each part

- **`## Observed`** is the facts a build needs, each traceable. A fact with no source is what a
  design session would have had to establish; leaving it out and asserting it is the failure mode
  T1 exists to catch (BJEW-454 rev 1: 312 lines, "information overload, i cannot follow this").
- **`## Agreed`** is what T1 approves: behavior, exclusions, the one consequential choice with its
  rejected alternative, the verification promise and, with `## Units`, the review chunks. A
  different user-visible surface, contract path, persistence choice, or a dropped agreed item
  changes this section and so renews T1; a new helper, file, case row or wording does not.
- **`## Verification`** is working detail, never part of the T1 sha: adding an ordinary helper to a
  case's `files` cell or refreshing an assertion location is the build's own. With `## Units`,
  adding a case also requires assigning it to a unit. `wf check` runs the matching case and refuses a changed product/test file
  outside them (scopeprot), a protected-test edit, or a test that does not really run the named
  assertion (#109).
- **`## Units`** is the executable plan of a large task; a task one build can carry has none and
  takes the single-build route. Units are numbered from 1 and built in that order. `cases` lists
  `## Verification` `#` ids, and every case belongs to exactly one unit; `depends on` names earlier
  units, or `—`; `review after` is `—`, or the label a checkpoint shows the person.
  - Each unit is a fresh build of its cases, then an assessment scoped to it, then bounded repairs;
    the next unit starts with a fresh builder. A unit with a `review after` label stops the round
    for the person to review that chunk before the next unit starts (HUMAN-TOUCHPOINTS.md). After
    the last unit, one integration assessment judges the whole round, then T2.
  - Size a build unit for one fresh builder to make its cases green; size a review chunk for the
    person to read. Plan the two separately: a chunk is one unit or several, ending at a label.
  - Visual work: put one representative chunk early (one screen or component in the new pattern)
    with a checkpoint, before the units that propagate the pattern.
  - The execution plan holds once the build starts: its sha binds unit ownership, dependencies and
    review boundaries, not mutable verification file lists or assertion locations. wf refuses
    progress made against another plan. Renew changed agreed behavior with `wf decide --revise`
    and T1, then explicitly run `wf step build --restart-units` to restart a revised plan; this
    discards completion receipts and re-assesses the units. A commit is not a workflow transition.
- **`## Repro`** is the command `wf check --repro` runs, for a check round or for a `repro` case.

## T1

`wf agree <round>` renders `## Observed` + `## Agreed` as a page, annotates it, and folds the
comments and the verdict into `<round folder>/AGREEMENT-REVIEW.md` (the REVIEW-FORMAT.md shape: one
`path:line — text` line per comment, then `verdict:`), binding the agreed-material sha. A T1 given in
chat records what the user was shown, verbatim, as a `note —` line, then their comments and verdict.
