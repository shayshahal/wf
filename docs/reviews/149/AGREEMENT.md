# AGREEMENT — #149 · Detect published PR conflicts and route scoped repair

Class: B

**Decision: approve this conflict-recovery scope before runtime implementation. T1 is pending.**

## Observed
- Main `9992d54` waits for human merge after publication; automatic merge remains excluded. Source: `src/round/next.ts:147–150`.
- Controlled conflicting OPEN lookup records zero corrections and still waits for merge. Source: `evidence/repro-before.log`; command: `node docs/reviews/149/repro-published-conflict.mjs`.
- Published reconciliation omits mergeability and base commit fields. Source: `src/gates/deliver.ts:667`.
- Existing reconciliation validates candidate identity; correction intake retains instructions and deduplicates sources. Sources: `src/gates/deliver.ts:642–706`, `src/round/corrections.ts:140–181`.
- #190/#191/#192 shipped; #173 closed NOT_PLANNED, not fixed. Sources: `evidence/dependency-status.json`, PRs #195/#196/#197.

## Agreed
- **Behavior.** A confirmed conflict on this round's published PR records an actionable system correction, not an impossible human-merge wait.
- **Choice.** Refresh on `wf next` and `wf deliver`; reject deliver-only discovery because a published round otherwise waits without checking conflicts.
- **Trigger.** Observe conflicts during these command invocations only. No background polling, subscription or ended-worker wake is added.
- **Identity.** Bind conflict evidence to the exact repository, PR, head, base branch and observed base commit. Reject malformed or mismatched identity.
- **Instruction.** Retain observed conflict identity and direct scoped base integration, project-owned regeneration, current checks, independent assessment and renewed approval.
- **Ownership.** Reuse delivery reconciliation, stable correction intake and existing routing. Project guidance owns repair commands; core does not guess conflicting paths.
- **Serialization.** Share delivery process exclusion. Query outside the state lock; revalidate candidate, instructions and local subject before recording an observation.
- **Holds.** Preserve explicit holds, open questions and pending instructions. A conflict observation never releases a hold or authorizes publication.
- **Retry.** Repeated observations of the same PR/head/base conflict do not duplicate corrections or reopen addressed work. A persisting conflict still blocks merge-ready reporting.
- **Unknown.** Unknown mergeability produces explicit retry guidance, not a conflict or mergeable claim. Preserve candidate and instructions; do not guess from absence.
- **Remote outcome.** Confirmed MERGED completes existing delivery recovery before repair. CLOSED, ambiguous, unavailable or mismatched outcomes retain identity and refuse unsafe action.
- **Races.** OPEN is an observation, not a lease. Reconcile again before publishing; a later human merge requires fresh-identity follow-up, never old-round republishing.
- **Approval.** Preserve human verdict history. Changed reviewed subject or upstream integration requires current evidence, independent assessment and fresh T2; generated files receive no exemption.
- **Excluding.** No automatic merge, scheduler, new delivery engine, tracker/reap redesign, host integration, global configuration changes or unrelated issue work.
- **Verification.** Exercise generated and product conflicts through real Git/CLI composition with controlled remote answers; verify retry, uncertainty, races and unchanged approval fences.
- **Not asked for.** None — invocation-time observation supports the requested conflict recovery; existing owners supply correction, repair, approval and delivery semantics.
- **T2 walk.** none — no app UI changes. Review CLI proof, diff, retained correction identity and fresh independent assessment before publication.

## Proposed flow — review aid

This view restates the scope above. `+` means added behavior; `~` means changed behavior. It is not executed evidence.

```diff
  wf next / wf deliver
+   observe the retained published candidate through the delivery owner
      validate repository, PR and head
+     read mergeability and base commit
+     CONFLICTING + exact identity
+       retain/deduplicate system correction
        existing correction route
          hold/question → wait; otherwise scoped repair
          changed subject → checks → independent assessment → fresh human T2
~     OPEN + MERGEABLE → normal wait for human merge
+     OPEN + UNKNOWN → explicit retry; no merge-ready claim
      MERGED → existing receipt recovery; fresh follow-up for later work
      unavailable/mismatch/CLOSED → retain candidate and instructions; refuse
```

| Now — measured controlled seam | Proposed outcome |
|---|---|
| Matching conflicting OPEN PR → zero corrections → wait for human merge | Confirm conflict → retained correction → existing repair route |
| `wf next` trusts its saved open handoff | `wf next` refreshes the published candidate before reporting merge readiness |
| Existing subject-bound T2 and human merge | Unchanged authority: repaired subject needs fresh T2; merge stays human-owned |

## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | Generated and product conflicts | `src/gates/deliver-recovery.selfcheck.ts`, affected conflict tests | Real disposable Git/local bare origin: publish → conflicting upstream movement → controlled confirmed conflict → correction → repair → fresh approval → same-PR retry. Assert no automatic merge. |
| 2 | Repeat, changed base and uncertainty | delivery/conflict selfchecks | Same identity deduplicates; changed identity remains distinct; addressed work is not silently reopened; persistent conflict cannot report merge-ready. UNKNOWN/malformed/missing metadata gives explicit retry/refusal. |
| 3 | Concurrent lookup, holds and delivery exclusion | delivery/correction/routing selfchecks | Change candidate, instructions, branch/index/worktree or hold during lookup; stale observation cannot route repair. Concurrent delivery cannot be mistaken for an idle OPEN PR. |
| 4 | Human merge race and interrupted writes | delivery-recovery selfcheck | Merge before observation or before republish; retry after correction/receipt checkpoint interruption. Preserve candidate, exact instruction and follow-up identity; no duplicate publication. |
| 5 | Approval fences and focused regression | affected `*.selfcheck.ts` | Changed implementation/base integration refuses old approval. Run `node src/selfcheck.ts <affected relative.selfcheck.ts paths>` for focused tests plus TypeScript/ESLint; retain failures/timeouts. Obtain fresh independent assessment. |
| 6 | Scope and final approval | agreement, implementation diff, assessment and proof logs | manual: Shay approves this agreement at T1, then judges the exact implementation and evidence at T2. T1 does not authorize publication; neither gate authorizes agent merge. |

## Decisions

Pending actual human T1. Starting the task, silence, or approval of a prior issue does not approve this agreement.

## Measurements and limits

- **RED:** `node docs/reviews/149/repro-published-conflict.mjs`, exit 1 at the expected conflict-routing assertion. See `evidence/repro-before.log`.
- The probe creates real disposable Git/state and calls the existing reconciliation owner with a controlled GitHub response. It does not start with real CLI publication or create an actual upstream conflict; case 1 extends this during build.
- **NOT MEASURED:** live GitHub conflict freshness, actual project regeneration, current whole-suite health, host continuation, complete delivery lifecycle.
- Read-only `gh pr view 236 --repo shayshahal/wf --json mergeable,baseRefOid,headRefOid,baseRefName` confirms the installed CLI supports those fields. A merged PR answered UNKNOWN; that is not a conflict witness.
- First probe setup used an invalid receipt hash. State validation refused it. The repaired fixture reaches the intended behavior; both diagnostics are retained separately.
- At T1 preparation, no production implementation, tracker edits, live PR mutations, hook changes or app resource operations had been performed. Build results follow below.

## Development workspace

- Worktree: `C:/Users/Shay/work/wf-149`
- Branch: `fix/149-published-conflict`
- Base: `9992d542ae4a41f0aed887756c1e06922ccb8ce5`
- Intake and source snapshots: `TICKET.md`, `issue-149.json`.
- This is wf development, not a JewelryX round. Use local agreement/review records as in #190/#191. Do not run product allocation through wf's JewelryX selector.
- Next action: record the actual human verdict for the material SHA in `AGREEMENT-REVIEW.md`. Implement only after approval; material revisions require renewed T1.

## Build

See [BUILD.md](BUILD.md) for the implemented shape, red/green proof, review repairs, completed focused checks and retained limits. See [ASSESSMENT.md](ASSESSMENT.md) for the fresh independent design/standards assessment and exact reviewed file identities.

T1 material is unchanged. Final human T2/publication approval is pending; no merge authority is inferred.
