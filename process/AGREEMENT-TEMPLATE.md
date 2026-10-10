# The working agreement

The skeleton of `<round folder>/AGREEMENT.md`, the one document class B/C work is agreed on and
built from (#110, #111). Class A needs none of it: `TICKET.md` is the agreement, and a `## Repro`
(for a check round) or a `## Verification` table may sit in it. This file is also what the T1
agreement session (`skills/agreement-session/SKILL.md`) follows.

The section order is fixed. The `## Verification` cases are the only machine-read part; everything
above them is agreed material, and T1 binds its sha (`src/round/agreement.ts`).

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
- **T2 walk.** <the `open:` line `wf show` follows: `open: <b2b|admin> </path> as <role> [mobile]>`>

## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | fix(x): <what the case proves> | `path/one.ts` | `path/one.spec.ts::<test id>@<line>` |
| 2 | <…> | `path/two.ts` | `repro` |

## Units

<only when the work is large: the inspectable units the build lands in order, each green on its own>

## Repro

command: <the command that reproduces the ticket, for a check round or a repro case>
```

## Why each part

- **`## Observed`** is the facts a build needs, each traceable. A fact with no source is what a
  design session would have had to establish; leaving it out and asserting it is the failure mode
  T1 exists to catch (BJEW-454 rev 1: 312 lines, "information overload, i cannot follow this").
- **`## Agreed`** is what T1 approves: behavior, exclusions, the one consequential choice with its
  rejected alternative, and the verification promise. A different user-visible surface, contract
  path, persistence choice, or a dropped agreed item changes this section and so renews T1; a new
  helper, file, case row or wording does not.
- **`## Verification`** is working detail, never part of the T1 sha: adding an ordinary helper to a
  case's `files` cell, or a case, is the build's own. `wf check` runs the matching case and refuses
  a changed product/test file outside them (scopeprot), a protected-test edit, or a test that does
  not really run the named assertion (#109).
- **`## Units`** gives a large change a sequence a reviewer can follow without reading one huge
  diff; it is not a per-commit dispatch contract, and a commit is not a workflow transition.
- **`## Repro`** is the command `wf check --repro` runs, for a check round or for a `repro` case.

## T1

`wf agree <round>` renders `## Observed` + `## Agreed` as a page, annotates it, and folds the
comments and the verdict into `<round folder>/AGREEMENT-REVIEW.md` (the REVIEW-FORMAT.md shape: one
`path:line — text` line per comment, then `verdict:`), binding the agreed-material sha. A T1 given in
chat records what the user was shown, verbatim, as a `note —` line, then their comments and verdict.
