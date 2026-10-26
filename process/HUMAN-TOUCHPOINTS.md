# Human touchpoints

| Touchpoint | Purpose |
|---|---|
| T1 | The person agrees the consequential direction. |
| Checkpoint (optional) | The person steers the work while it is built. |
| Final T2 | The person approves the delivery. |

Run these commands from the coordinating session. The review UI records the comments and the
verdict of the person. Without an adapter, use the generated review file and the UI of the harness.

## T1 — direction

`wf agree <round>` renders `## Observed` + `## Agreed`. It records the decision in
`AGREEMENT-REVIEW.md`, bound to the sha of the agreed material.
- New behavior, or a changed consequential choice, requires renewed agreement.
- Verification details and ordinary helper changes do not.

## Checkpoint — continue building

Respect each checkpoint that was agreed with the person. Do not go past it before the review.
1. Run `wf review <round> --checkpoint [--base <ref>]`.
2. Run `wf review <round> --checkpoint --done`.

This writes the append-only `CHECKPOINT-REVIEW.md` with `scope: checkpoint`. Use `--base` for the
chunk that you intend to show. Without it, the review shows the base of the round.

- Approval and requested changes both return to build.
- A checkpoint needs no separate assessment. It never permits delivery.
- The agent owns the work to reach the agreed stopping point. wf does not execute a plan table. wf
  does not keep completion receipts.

## Independent final assessment

One independent reviewer reads: the whole agreement, the diff, the earlier findings, the decisions
and the evidence. The reviewer writes `ASSESSMENT.md` with `Verdict: clean | repair | blocked` and
the measured `head:`.

| Verdict | Use |
|---|---|
| `clean` | The work and the evidence support the handoff. |
| `repair` | An ordinary finding that can be fixed. |
| `blocked` | A real decision or a missing authority. |

- The reviewer owns the judgment of the evidence, and explains the gaps.
- wf routes the explicit outcome. wf bounds the unattended repairs.
- wf does not parse intent-line statuses. wf does not require a repair-response grammar. wf does
  not demand proof files for a specific question.
- Answers are durable decisions. A change of scope uses `wf decide --revise` and a renewed T1.
  Do not treat an exception as unchanged behavior.

## T2 — deliver

1. See the actual behavior when it applies. Use `wf show` and the setup recipe of the project.
2. Run `wf review <round>`. It shows the diff of the whole round, the agreement, the final
   assessment and the before/after captures that are available.
3. The final approval is recorded in `REVIEW.md`. It is not recorded in the checkpoint file.
4. Run `wf review <round> --done`.

Rules:
- The review refuses uncommitted product changes.
- The approval binds the reviewed worktree identity, the HEAD identity and the intended diff base.
  If the implementation changes, a new approval is needed.
- An assessment of an earlier HEAD needs a fresh independent review.
- A checkpoint approval cannot replace the final T2.

An approved final T2 permits `wf deliver`:
1. Push, and open a PR.
2. Post the project tracker note. It says that the work awaits merge.

The person merges separately. A later `wf deliver` confirms the merge and records its receipt.
Delivery does not choose engineering tests. It does not run them again after approval. It keeps the
project hooks, the protected-file guards, the freshness of the approval and the recovery of an
interrupted delivery.

A dismissed review grants no approval. Review files append dated runs. The latest bound verdict
wins. See [Review format](REVIEW-FORMAT.md) for the mechanical record.
