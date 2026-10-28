# TICKET � #149 � Published PR conflict recovery

Class: B

## Intent

Shay, chat (selection and start authority):
> choose which one to work on and start

Shay, chat (asynchronous handover):
> Plannotator Inbox is on: when you finish long work, or need a decision the person isn't here to give, send it with plannotator_inbox send_message and keep going. Their reply comes back here. Run `plannotator inbox --help` for how it works.

The issue author�s complete request follows verbatim below. The current scope precedes retained historical text; the historical automatic-merge request does not apply.

## Source

https://github.com/shayshahal/wf/issues/149

## Current delivery/recovery scope — 2026-10-24, main `08f43f5`

**Approved PR publication and human merge are now separate.** `e2594a2` deliberately stopped automatic merging. Earlier text below describing `gh pr merge` or approval automatically invoking merge is historical behavior/authority, not the current implementation target. Do not restore automatic merge to satisfy this issue.

### What already exists

- Subject-bound approval and repeated content-identity checks around publication.
- Remote PR reconciliation that refuses unknown/malformed/ambiguous answers, resumes an existing OPEN PR and recognizes a MERGED PR only at the expected head.
- Durable authored/system corrections and fences; interrupted push/PR creation/paperwork/confirmed-merge cases in existing selfchecks.

The audit inspected implementation/tests at `08f43f5`; it did not run them or reproduce a live remote interruption. Reuse these shipped slices (#108/#106/#150), not another delivery engine.

## Remaining outcome and acceptance

- A conflicting published PR gets a scoped actionable recovery route through existing corrections, without rewriting a human verdict or repeatedly attempting an impossible handoff. Cover generated and product conflicts; regeneration/merge behavior stays project-owned.
- Reconcile a known published PR before correction-driven repair. A completed human merge retains its delivery and requires follow-up under fresh identity; OPEN can be repaired under current authority; unknown stays explicit. **#190 owns the concrete merge/correction race.**
- A changed implementation/upstream integration needs current evidence/checks and fresh approval of the changed subject. Generated files are not automatically behavior-neutral; no allowlist-based exemption.
- Separate PR notification from required post-merge tracker completion. **#191 owns the posted-flag gap.** Exact evidence selection/deduplication remain #148's shipped contract.
- Recover interrupted authorized actions after push, PR creation, human merge recognition, note/evidence publication, tracker update and owned cleanup. Do not erase recovery facts merely because the PR merged. **#192 owns the identified reap retry defects; #173 owns uncertain-release diagnostics.**
- A restarted worker reconciles actual remote/local facts and may continue unchanged already-authorized actions without another permission question. This does not authorize a human-owned merge, changed reviewed subject, unrelated discard or hold bypass. #159 owns bounded host wake/continuation, not these recovery semantics.
- Test continuous lifecycle/interruption boundaries, including effect-success/before-local-receipt, duplicate retries, unknown remote/tracker state, and corrections before/after merge recognition. Preserve original conflict replay evidence; distinguish controlled seams from live integration.

## Ownership / limits

Keep core approval/receipt/correction guards, project-specific tracker/regeneration and machine execution behind existing seams. Prefer independently callable reconciliation over coupling outcome discovery to publication eligibility. No scheduler, job engine, restored phase/row machinery, automatic merge, extra human gate or generalized delivery platform.

Tracker reconciliation authorized by Shay on 2026-10-24. This is not implementation or permission to mutate active rounds.


---

<details>
<summary>Historical report and earlier scope (retained as evidence; current scope above takes precedence)</summary>

## Observed failure
JX-1392 (2026-10-14): twice, after T2 approved, `wf deliver` pushed and opened PR #386, then `gh pr merge` failed ("not mergeable: the merge commit cannot be cleanly created") because `dev` moved during the round. Both times the only conflicts were generated files (`shared/types/src/generated/index.ts`, `sdk.gen.ts`). `wf next` kept printing `deliver`; there is no route back to build. The orchestrator had to `wf step build` by hand and smuggle the instruction into REVIEW.md (see the companion issue on deliver-time corrections). Each pass cost build + assess + a re-T2 (~40 min), and `dev` moved again during the second.

## Outcome
A non-mergeable PR produces a scoped recoverable correction rather than repeated deliver attempts. Reduce avoidable loops without weakening approval identity: generated artifacts are not inherently behavior-neutral.

## Acceptance
- `wf deliver` detects a conflicting PR, records why, and `wf next` dispatches build with that reason (merge base, regenerate, checks).
- Use the project's declared regeneration/merge procedure for scoped conflicts, then fresh checks and assessment. A changed approved implementation requires fresh T2. A generated-path allowlist alone never authorizes skipping it.
- Any future approval-reuse exception needs an explicitly agreed and tested implementation-identity rule, including behavior-changing generated output and changed upstream base. Until then retain #106's current protection.
- Optionally merge the base before T2 opens so the reviewed tree is the mergeable one.


## Approved audit reconciliation — 14 October 2026

#150 owns the durable authored/system-origin correction route; do not smuggle a merge failure into a rewritten human verdict. Preserve #108 remote reconciliation and #129 delivered-round identity. Optional pre-T2 base reconciliation may reduce churn but must leave the reviewed and delivered implementation aligned. The audit approval is not approval of a generated-file T2 exemption.

## Resume / delivery / visibility decisions — 15 October 2026

### Whole-outcome authorization and automatic recovery

Shay explicitly chose final approval to authorize the whole reviewed delivery: push, merge, publish the selected relevant evidence/note, update the tracker and perform safe owned cleanup. Do not add a second shall-I-proceed gate for those actions. This clarifies authority, not a claim that all failure recovery is already implemented.

Acceptance additions:
- Reconcile actual remote/local results and continue unfinished authorized actions automatically; #159 owns continuation when the worker has ended. Preserve #108's shipped retry/reconciliation guarantees rather than reopening its completed slice or creating a general job engine.
- Cover interruption after push, PR creation, merge, partial evidence/note publication, tracker update and cleanup. Retrying must not duplicate PRs/merges, posted sections, attachments or tracker transitions; preserve enough references/receipts to establish what completed. #148 owns exact publication selection, #154 verified resource release/partial reap.
- Keep incomplete delivery visible and recoverable until required actions complete or a concrete unresolved failure is reported. Successful merge alone is not a claim that posting/tracker/cleanup completed; unknown remote state is not guessed into success or absence. Do not delete the only recovery evidence during cleanup.
- A transient interruption or restarted worker does not require renewed approval of unchanged content. Conflicts that change the reviewed subject still require current evidence and fresh T2; whole-outcome authority is not an approval-reuse exemption, including generated files or changed upstream base.
- Use the scoped conflict reason in whichever continuation contract is actually supported. If #156 eliminates the build/assess dispatch mechanism, preserve actionable correction and subject-bound approval instead of restoring obsolete phases just to satisfy the old command sequence.
- Quietly recover where possible. Interrupt only when a consequential decision or genuine human intervention is needed, and report the completed outcome once; routine retries/progress must not become new human reviews.

No additional deployment operation or destructive discard is inferred from this decision. Keep the original conflict replay and real command-path tests alongside controlled interruption/reconciliation tests.


</details>


## Issue comments, oldest first

### 2026-10-14T15:56:45Z � shayshahal

Source: https://github.com/shayshahal/wf/issues/149#issuecomment-6172509531

## Second occurrence: JX-810/1377 (2026-10-14), product-code conflicts

T2 was approved and `wf deliver` pushed and opened PR #389. Then `gh pr merge` failed with "not mergeable: the merge commit cannot be cleanly created". `wf next` kept printing `deliver`.

Unlike JX-1392, these conflicts were **not** in generated files. All six were product code:
- `packages/backend/app/services/{auction,marketplace,order}_service.py`
- b2b `OrderDetails.svelte`, `OrderDetailsDrawer.svelte`, `routes/(store)/orders/+page.svelte`

They came from JX-1240/1367, JX-1400/1334, JX-1392 and JX-688, all merged to `dev` while the round ran (about 30 hours, 3 units).

Workaround, same as JX-1392: the orchestrator appended a `changes-requested` section to REVIEW.md in the same shape as `refusedPushSection` (the files, plus "merge origin/dev keeping both sides' behavior, regenerate, wf check + suites"). It then ran `wf step build` by hand. The person had to rule on the route (merge dev in → rebuild → reassess → new T2).

This adds to the acceptance list:
- The deliver-time conflict path must handle product conflicts too, not only generated ones. Those need the full build → assess → re-T2 loop, because the merged tree is not the approved tree.
- A long multi-unit round is the likely case for this. Consider merging the base before the integration build (or before T2) so the integration assessment and T2 look at the mergeable tree, and a conflict at deliver time becomes rare.


## Scope

Selected bounded slice: observe a confirmed conflict on this round's published PR and retain an actionable system correction through existing delivery/correction ownership. Cover generated and product conflicts; require current evidence and fresh subject-bound approval after repair.

paths: src/gates/deliver.ts, src/gates/deliver.selfcheck.ts, src/gates/deliver-recovery.selfcheck.ts, src/round/next.ts, src/round/next.selfcheck.ts, src/round/corrections.ts, src/round/corrections.selfcheck.ts, README.md

Do not rebuild the completed #190/#191/#192 fixes. #173 was stopped NOT_PLANNED, not fixed. Host wake (#159), tracker/reap changes, automatic merge and a new delivery platform are excluded. Additional focused test/helper paths may be identified during build.

## Intake completeness

Read the entire current issue body, retained history and its one comment. No image or attachment was present in the fetched material. The original incident accounts are historical author reports, not fresh live GitHub reproductions.

## Workspace and entry

- Repository: wf itself; branch `fix/149-published-conflict`, isolated Git worktree from `origin/main` at `9992d542ae4a41f0aed887756c1e06922ccb8ce5`.
- wf's installed project selector runs JewelryX, not wf development. Do not run `wfk new`, synthesize product round state, or change the installed selector to manufacture a wf round.
- Use Git for this development worktree. Keep agreement, actual human verdict, measurements and independent assessment in this folder, following the existing #190/#191 development precedent.
- No real project setup, server, database, hooks or installed runtime are needed for this delivery-policy change.
- The initial chat authorizes selection/start, not T1 approval, publication or merge.

## Repro

Command from the isolated worktree:

```sh
node docs/reviews/149/repro-published-conflict.mjs
```

Disposable Git repository, real state reader and exported published reconciliation owner; controlled GitHub seam returns a matching OPEN candidate with `mergeable: CONFLICTING` and a base commit. No live remote or tracker mutation.

Expected result: retain an actionable system correction and stop offering an impossible human merge.
Observed baseline: `reconciliation.kind === 'none'`, zero corrections, `nextAction` still waits for human merge. The JSON query omits mergeability/base commit fields. Exit 1 is the desired red reproduction, not a passing check. See `evidence/repro-before.log`.

Setup/cleanup: the script creates its own temporary Git state/config and removes it in `finally`. It never calls project setup or servers. No shared state needs reset.

An earlier fixture construction used an invalid receipt content hash and was rejected by state validation. That is a probe defect, not #149; its diagnostic is retained separately as `evidence/repro-fixture-invalid.log`.

Limits: the baseline establishes the current owner's response to controlled conflict metadata. It does not replay a real upstream conflict, run publication end-to-end, certify GitHub's mergeability freshness or demonstrate product regeneration. Those are separate build verification cases.

## Current status

Actual T1 approved in Inbox reply msg_01M60NM8X04X10PP3XEWTJENDE at agreement SHA 654ad52059c72772189c69b53a1d0fb7964aebc26f88efe9e3175c75aa7126cc. Implementation and fresh independent assessment are complete; final human T2/publication approval is pending. See BUILD.md for focused greens, recovery timeouts, baseline failures and evidence limits. No issue edit, remote publication or merge has occurred.
