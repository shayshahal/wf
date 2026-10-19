# The working agreement

Class A uses `TICKET.md`; consequential class B/C work uses `AGREEMENT.md`.
The requester's words remain verbatim in the ticket's `## Intent`.
T1 binds `## Observed` + `## Agreed`; verification details and implementation notes can evolve
without renewing unchanged direction.

Use the decision-sheet style in `SHOW-ME.md`: short sourced facts, one claim per bullet, and a
before/after, diagram or generated view where it replaces explanation. Keep the whole agreed scope
visible; put logs and routine implementation detail behind references. The labels below are prompts
for concise content, not an invitation to write a paragraph under each.

```markdown
# AGREEMENT — <ID> · <ticket title>

## Observed
- <relevant fact — source path:line or measured command>

## Agreed
- **Behavior.** <what changes>
- **Excluding.** <what stays outside this round>
- **Choice.** <consequential choice, rejected alternative and why>
- **Verification.** <what evidence will demonstrate success>
- **Not asked for.** <additions no source requested and why, or none — reason>
- **T2 walk.** <project open:/setup: recipe, or none — reason>
- **Checkpoints.** <only when agreed: what the person sees and before which work continues>

## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | <what the case proves> | `<path>` | `<command or assertion>` |
| 2 | <a proof only a person can make> | `<path>` | `manual: <what they look at>` |

## Decisions
<recorded rulings>
```

The `## Verification` rows are the round's verification plan: what will be checked, the command or
assertion that shows it, and the files it touches. They are working guidance, not executable
workflow state: a builder may refine a command or add affected checks, and no row is a completion
gate. A proof only a person can make says `manual: <what they look at>` and reaches T2 as a check the
person makes. The `files` cell still matters where the project refuses a `fix/` case that names a
protected verification file.

The builder may change helpers, files, test selections and setup within the agreement. A new
user-visible behavior, consequential contract/persistence choice or dropped agreed item renews
`## Agreed` through `wf decide --revise` and T1. List unrequested additions separately so the
person can judge them rather than finding them buried inside another bullet.

`wf agree <round>` renders the agreed material and records the person's comments and verdict in
`AGREEMENT-REVIEW.md`. What T1 binds is `## Observed` + `## Agreed`; refining a `## Verification`
row does not renew it.

A check-only round records the reproduction the agent actually ran — command, observed result,
setup/reset and limitations — under `## Repro`; there is no fixed run count and wf does not
interpret assertion output seen there. See [Human touchpoints](HUMAN-TOUCHPOINTS.md) for T1,
optional checkpoints and T2.
