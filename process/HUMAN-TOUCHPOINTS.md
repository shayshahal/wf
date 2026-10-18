# Human touchpoints

T1 agrees consequential direction; optional agreed checkpoints steer work; final T2 approves
delivery. Run these commands from the coordinating session. The review UI records the person's
comments and verdict; without an adapter, use the generated review file and the harness's UI.

## T1 — direction

`wf agree <round>` renders `## Observed` + `## Agreed` and records the decision in
`AGREEMENT-REVIEW.md`, bound to the agreed-material sha. New behavior or a changed consequential
choice requires renewed agreement. Verification details and ordinary helper changes do not.

## Checkpoint — continue building

Honor checkpoints agreed with the person before proceeding past them:
`wf review <round> --checkpoint [--base <ref>]`, then `wf review <round> --checkpoint --done`.
This writes append-only `CHECKPOINT-REVIEW.md` with `scope: checkpoint`.
Use `--base` for the intended chunk; otherwise it shows the round's base.

Both approval and requested changes return to build. A checkpoint requires no separate assessment
and never permits delivery. The agent owns reaching the agreed stopping point; wf does not execute a
plan table or keep completion receipts.

## Independent final assessment

One independent reviewer reads the whole agreement, diff, prior findings, decisions and evidence,
then writes `ASSESSMENT.md` with `Verdict: clean | repair | blocked` and the measured `head:`.
The reviewer owns judging evidence and explains gaps. Ordinary fixable findings use repair; a real
decision or missing authority uses blocked. wf routes the explicit outcome and bounds unattended
repairs. It does not parse intent-line statuses, require a repair-response grammar or demand
question-specific proof files.

Answers are durable decisions. A scope change uses `wf decide --revise` and renewed T1, rather than
silently treating an exception as unchanged behavior.

## T2 — deliver

See the actual behavior when applicable (`wf show` and the project's setup recipe), then
`wf review <round>`. It shows the whole-round diff, agreement, final assessment and available
before/after captures. Final approval is recorded in `REVIEW.md`, not the checkpoint file.
Then run `wf review <round> --done`.

The review refuses uncommitted product changes. Approval binds both the reviewed worktree and HEAD
identities and the intended diff base; changed implementation requires a new approval.
An assessment of an earlier HEAD needs fresh independent review. Checkpoint approval cannot
substitute for final T2.

Approved final T2 permits `wf deliver`: push, PR, confirmed merge and delivery receipt.
Delivery does not choose or rerun engineering tests after approval. It preserves project hooks,
protected-file guards, approval freshness and interrupted-delivery recovery.

A dismissed review grants no approval. Review files append dated runs; latest bound verdict wins.
See [Review format](REVIEW-FORMAT.md) for the mechanical record.
