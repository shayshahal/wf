# #191 — Reconcile merged tracker completion independently of PR notification

Source: https://github.com/shayshahal/wf/issues/191
Author: @shayshahal
Fetched: 2026-10-24; updatedAt: 2026-10-24T08:55:28Z

## Intent

Verbatim issue body:

## Current failure path

Source audit at [`08f43f5`](https://github.com/shayshahal/wf/tree/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00), after delivery was split into approved PR publication and human merge:

1. Publish a PR while it is OPEN.
2. `wf post` posts the selected evidence/note. It correctly does not mark the tracker delivered yet, but marks the note section `(posted)`.
3. A human merges; wf later records the confirmed delivery.
4. `wf post` selects only unposted sections. Its merged-status transition lives inside that loop, so the normal already-notified section is skipped.
5. `wf next` likewise sees no unposted section and can route toward reap without completing the tracker status transition. Explicitly invoking post again still skips it.

Sources: [`post.ts:191–253`](https://github.com/shayshahal/wf/blob/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00/projects/jewelryx/post.ts#L191-L253), [`next.ts:120–126`](https://github.com/shayshahal/wf/blob/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00/src/round/next.ts#L120-L126). Existing post selfchecks use separate open/merged fixtures rather than this continuous lifecycle.

**Evidence limit:** source-confirmed lifecycle gap; no live tracker mutation, end-to-end reproduction or fresh selfcheck run was performed by the audit.

## Outcome

PR notification and confirmed-merge tracker completion are distinct facts. Publishing the former must not suppress recovery of the latter.

## Acceptance

- Keep open-PR notification truthful: it is awaiting human merge, not yet delivered to the shared branch.
- Track/reconcile merged-status completion independently of comment/attachment publication. Reuse existing records where possible; do not add a general job engine.
- Previously notified sections still receive required tracker reconciliation after a confirmed merge. `next` must not treat their notification flag alone as completion of all required post-merge actions.
- Retain comment/upload deduplication and #148's exact evidence selection. A retry must not repost comments or reattach images merely to transition status.
- Read back actual tracker status; if already at the desired state after an interrupted successful transition, recognize completion instead of requiring another unavailable transition. Unknown tracker state remains incomplete, not success.
- Preserve compatibility with existing `(posted)` notes, including already-notified rounds that have not completed merged tracker reconciliation.
- Test one continuous publish → notify while OPEN → human merge → delivery reconciliation → tracker completion path. Include failure after comment, after remote tracker transition but before local acknowledgement, repeated post/reconcile, already-delivered tracker, and a multi-ticket partial failure. Assert no early delivered status, duplicate notification or premature cleanup of necessary recovery evidence.
- Run focused checks using the current documented development runner. Report controlled tracker seams separately from any real integration evidence.

## Ownership / boundaries

JewelryX tracker integration owns tracker-specific status/transition facts; core owns truthful routing/recovery facts via the existing project boundary. #149 owns whole delivery recovery, #148 evidence selection, #154 owned cleanup. No automatic merge, new tracker platform, blanket re-posting, production tracker mutation for testing, or deletion of incomplete recovery state.

Tracker follow-up authorized by Shay on 2026-10-24. No implementation or live-round changes were made by the audit.


## Complete intake

GitHub comments: none (`evidence/comments.json` is `[]`; also issue JSON comments empty). No attached images/files or attachment URLs in body/comments. Source permalinks are historical code references, not additional assigned scope. Current implementation is grounded at 0740a69. Exact thread request and relayed prior authorization are preserved in USER-REQUEST.md. No unseen agreement or implementation approved.

## Scope

Class: B — durable post-merge completion/recovery contract.
paths: projects/jewelryx/post.ts, projects/jewelryx/post.selfcheck.ts, projects/jewelryx/index.ts, src/round/state.ts, src/round/state.selfcheck.ts, src/round/next.ts, src/round/next.selfcheck.ts, src/worktrees/reap.ts, src/worktrees/reap.selfcheck.ts
Additional focused lifecycle coverage may live beside its owning command. No live tracker mutation.

## Repro

`node docs/reviews/191/repro.ts` at 0740a69: exit 1, two symptom assertions fail. OPEN notification once with zero transitions; after controlled human merge, actual `deliver` writes a confirmed receipt, actual `next` offers reap, repeated actual `post` leaves tracker In Progress. `evidence/repro-before.log`. Disposable repo/local bare origin, controlled GitHub and fetch seams; not live integration.
