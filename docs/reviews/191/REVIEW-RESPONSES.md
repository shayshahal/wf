# #191 — builder responses to independent assessment R1

Original independent report preserved unchanged in ASSESSMENT.md; assessed head a1fc529. Repair round 1, within the approved two-round budget.

## R1 — exact remote notification identity: accepted, repaired

The old number-only substring check mistook another repository or a number prefix for this PR, and could also treat a human's quoted URL as notification. Reuse one complete-URL reader/matcher and the own-notification predicate (first notification line plus exact URL) for both change exemption and duplicate suppression. Existing legacy posted flags remain notification evidence; no blanket repost.

New continuous lifecycle variants seed OLD remote comments for `/o/r/pull/1910`, `/other/repo/pull/191`, and a human quote of the actual PR. Each must publish the actual notification and exact selected upload before acknowledging completion. Existing process-exit-after-comment retry still proves exact-own-comment deduplication. Pure ticket-change tests reject prefix/foreign-repository comments as own posts.

## R2 — unbound legacy guidance: accepted, repaired

Preserve established unbound implementation guidance after notification, before tracker routing. A retained published candidate routes through the existing delivery owner; without recoverable candidate/receipt, explicitly restore original delivery evidence or intentionally discard. Do not loop post/deliver against a merged round that has no authority to reconcile; do not infer receipt from local HEAD or T2 alone. Unposted legacy notes remain postable as before; status completion still requires confirmed delivery.

Pure next regressions distinguish usable receipt with unfinished status, recoverable handoff, and missing/unbound historical evidence. Original actual-CLI legacy restore/discard assertion is retained.

## R3 — delivered-round fixture and final-head coverage: accepted, repaired

Two old assertions assumed `(posted)` alone permitted cleanup, now intentionally false. The fixture now calls actual post through the dispatcher with controlled already-delivered tracker readback and a note identifying the receipt's exact PR. It verifies the bound completion, then continues the original paperwork-only, questions, changed/staged/untracked product, direct-reap, forced-discard and legacy authority assertions. No identity assertion removed or weakened.

First repair run exposed an unterminated test literal and a no-op scripted fixture replacement (fixture still had the old note): `evidence/r1-repairs-focused.log`. Fixed by targeted exact edits, then isolated next/delivered-round + project completion/ticket-changes + tsc/eslint all PASS, 47.6 s (`evidence/r1-repairs-focused2.log`). These are focused repair diagnostics, not full final-head evidence.

## R4 — shipped older-copy safety: resolved by T1 ruling (updated-runtime guarantee)

Accepted the limitation. An old runtime may check caller version but omit the target check when reaping from a surviving checkout; no new state version can retrofit that shipped path. Corrected the source comment's excessive implication. Updated-runtime routing/direct cleanup enforce pending completion; the state version still fences older caller-bound consumers that actually run their version predicate.

Shay ruled on the actual question (Inbox `msg_01M5QB505GS0HQ7D8YB3RHT8G7`, `q-9de1a887`): "Updated-runtime guarantee; require using it for cleanup (your recommendation)". #191 therefore guarantees cleanup safety on the runtime that wrote state 6, requires that runtime for cleanup, and documents the shipped-older-copy limit instead of claiming a fence it cannot provide. Applied in `src/round/state.ts` (version comment states exactly what 6 fences and what it cannot) and `skills/round/SKILL.md` (`done:` requires cleanup with the wf that wrote the round's state). No migration, cleanup interlock or reap redesign was added, and no destructive old-runtime experiment was run; that work is not authorized here.

## S1 — contained legacy command error convention: rationale recorded

Expected tracker/revalidation failures follow the existing jira/ticketRefusal rejection convention only inside the project command shell. The owning runPost boundary translates them to explicit incomplete CLI outcome and preserves work. Added local rationale instead of a second generic error envelope around existing clients. Pure routing/receipt policy remains nonthrowing. This is a scoped legacy-edge exception, not a general relaxation of expected-failure standards.

## Completed original focused run (a1fc529)

`evidence/focused-final.log`: 13 selected files/85 plus tsc/eslint, 691.9 s. Lifecycle and #190 delivery-recovery PASS; delivered-round has exactly three red assertions diagnosed in R2/R3. Full suite NOT RUN. Selection typo was refused before executing checks (`focused-selection-error.log`); corrected selection used the actual `src/skill/skill-export.selfcheck.ts`. Later repaired code/tests require fresh final-head checks and independent R2 assessment; this earlier green selection is not sufficient.
