# The working agreement

- Class A uses `TICKET.md`. Consequential class B/C work uses `AGREEMENT.md`.
- The words of the requester stay verbatim in `## Intent` of the ticket.
- T1 binds `## Observed` + `## Agreed`.
- Verification details and implementation notes can change. Unchanged direction needs no renewal.

Use the decision-sheet style in `SHOW-ME.md`:
- short facts with a source
- one claim in each bullet
- a before/after, a diagram or a generated view, where it replaces an explanation
- the whole agreed scope is visible
- logs and routine implementation detail are behind references

The labels below tell you what content to write. Do not write a paragraph under each label.

The agreement is short enough to read at T1, and `wf agree` refuses one that is not:
- `## Observed`: at most 5 bullets, each at most 20 words.
- `## Agreed`: each bullet (and each sub-bullet) at most 25 words. The T2 walk's recipe lines are exempt.
- `## Verification`: at most 6 rows.
- A longer fact goes behind a path or a command, not in the bullet.

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
- **T2 walk.** <project open: target, then one setup: line per state the seed lacks, or none — reason>
- **Checkpoints.** <only when agreed: what the person sees and before which work continues>

## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | <what the case proves> | `<path>` | `<command or assertion>` |
| 2 | <a proof only a person can make> | `<path>` | `manual: <what they look at>` |

## Decisions
<recorded rulings>
```

## The T2 walk

The `**T2 walk.**` bullet is the recipe that `wf show` replays at T2. It has:
1. The `open:` target of the project.
2. One line for each state that the seed lacks.
3. Or `none — <why>`.

A setup line has one of two forms. The `wf show` of the project runs both. Never write a shell line.
- an SDK call
- an argv script

```markdown
- **T2 walk.** open: b2b /catalog/rings as buyer
  ready: api listProducts {} as buyer
  setup: api updateProduct {"path":{"id":"SG-0001"},"body":{"status":"active"}} as seller
```
```markdown
- **T2 walk.** open: b2b /catalog/rings as buyer
  ready: script ["node","<round>/scenario.mjs","ready"]
  setup: script ["node","<round>/scenario.mjs","prepare"]
```

- A `setup:` or `reset:` line needs a `ready:` readback. The readback proves the scenario before
  and after the line.
- Any other form is refused, for example `setup: cd packages/backend && uv run …`. The refusal
  comes at the build/assess handoff (`wf step assess`, `wf next`). The builder can then rewrite
  the line. It does not come first at T2.

## The verification rows

The `## Verification` rows are the verification plan of the round. Each row has: what is checked,
the command or assertion that shows it, and the files that it touches.
- The rows are working guidance. They are not executable workflow state.
- A builder may refine a command or add affected checks.
- No row is a completion gate.
- A proof that only a person can make says `manual: <what they look at>`. It reaches T2 as a check
  that the person makes.
- The `files` cell still matters where the project refuses a `fix/` case that names a protected
  verification file.

## Changes

The builder may change helpers, files, test selections and setup inside the agreement. These renew
`## Agreed` through `wf decide --revise` and T1:
- a new user-visible behavior
- a consequential contract or persistence choice
- a dropped agreed item

List each unrequested addition on its own. Then the person can judge it. Do not bury it in another
bullet.

## T1 record

`wf agree <round>` renders the agreed material. It records the comments and the verdict of the
person in `AGREEMENT-REVIEW.md`. T1 binds `## Observed` + `## Agreed`. To refine a `## Verification`
row does not renew it.

## Check-only round

A check-only round records the reproduction that the agent actually ran under `## Repro`:
- the command
- the observed result
- the setup and reset
- the limits

There is no fixed run count. wf does not interpret the assertion output. See
[Human touchpoints](HUMAN-TOUCHPOINTS.md) for T1, optional checkpoints and T2.
