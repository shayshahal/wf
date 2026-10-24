# #190 — Reconcile a published PR before routing corrections back to repair

## Intent

Source: https://github.com/shayshahal/wf/issues/190; author: shayshahal; fetched current issue and all comment pages via gh API. Comments: 0; attachments: none in body/comments.

Issue author, verbatim:

## Current failure path

Source audit at main / installed revision [`08f43f593dbb589c9b3d84ed61c68e4ec78d2c00`](https://github.com/shayshahal/wf/tree/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00), after `e2594a2` deliberately left approved PRs open for human merge:

1. Publish an approved PR and retain `pr_handoff`.
2. A human merges the PR, but local `delivery` reconciliation has not run.
3. A supported correction arrives. [`captureCorrection`](https://github.com/shayshahal/wf/blob/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00/src/round/corrections.ts#L152-L158) tests `delivery` and `merge_attempt`, not the published handoff, and routes the round to build.
4. [`runDeliver`](https://github.com/shayshahal/wf/blob/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00/src/gates/deliver.ts#L658-L704) can refuse the changed stage / unresolved correction before looking up the PR that would establish the completed merge.
5. Repair can therefore begin under an already-merged round. If it adds a commit, normal expected-head reconciliation can then reject the changed HEAD.

This is a source-confirmed control-flow gap, **not a live remote reproduction**. Existing delivery recovery cases cover human merge without a racing correction, and corrections after a receipt, not this interval. No tests or remote mutations were performed by the audit.

## Outcome

Retain an instruction immediately, but reconcile an already-published candidate before treating that instruction as permission to repair its old round. A completed human merge cannot be undone by a local route change.

## Acceptance

- Durably admit/deduplicate the authored instruction using the existing correction identity; do not lose it while the remote is unavailable.
- For a known published PR, reconcile its repository, PR/head and actual remote result before permitting correction-driven repair. Do not perform an unbounded network operation inside the state lock.
- Confirmed MERGED at the expected published head: record/recover that delivery, preserve the correction for explicit follow-up under #129's fresh identity, and do not rebuild or republish the old round.
- Confirmed OPEN: retain the correction and permit ordinary repair under existing approval rules. A changed reviewed subject still requires current evidence and fresh approval.
- Unknown, malformed, mismatched or ambiguous remote state: preserve the obligation and existing candidate identity, refuse ambiguous mutations, and expose actionable reconciliation failure. Unknown is not OPEN or absent.
- Exercise the continuous real command path with controlled remote seams: publish → human merge → correction before receipt → reconcile; OPEN variant; unavailable/mismatched remote; duplicate intake; crash after merge recognition but before local receipt; existing post-receipt correction behavior. Assert no old-round repair, duplicate publication or lost instruction.
- Run focused selfchecks/typecheck/lint through the documented development runner. Report which paths were actually exercised; fake remote responses are not live GitHub verification.

## Ownership and limits

#149 owns the broader current delivery/recovery outcome; #108's reconciliation and #150's correction identities are already implemented and must be reused. #159 owns waking a worker, not determining whether the old candidate already merged.

A useful extraction is an independently callable **reconcile published delivery** operation used before mutation/repair decisions. Keep authorization, remote ambiguity handling and receipts inside it; keep workflow routing outside. No second delivery engine, scheduler, automatic merge, approval bypass or new mandatory artifact.

Tracker work authorized by Shay on 2026-10-24 following the wf source/backlog audit. This issue does not authorize changes to active rounds or implementation/deployment by itself.


## Scope (interpretation)

Class B: published-delivery recovery contract. Only #190; this worktree is the approved isolation. Do not use the JewelryX selector to create a round. Local agreement, approval, evidence and assessment substitute for commands that cannot represent wf development, not for their guarantees.
