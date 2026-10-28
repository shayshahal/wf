# Independent assessment — #149 published PR conflict recovery

head: 9992d542ae4a41f0aed887756c1e06922ccb8ce5
Verdict: clean

This is an independent **code/design assessment of the working-tree implementation identified below**, not human approval, publication authority, a whole-suite pass, or a claim that final verification is complete. The reviewer did not build the implementation or edit runtime/tests. Earlier adversarial finding R1 was reported independently and repaired before this assessment.

## Reviewed identity

Agreement: `AGREEMENT.md`, approved material SHA `654ad52059c72772189c69b53a1d0fb7964aebc26f88efe9e3175c75aa7126cc`. `AGREEMENT-REVIEW.md` records the actual human T1 ruling; implementation approval/publication are separate.

Base/checkout HEAD: `9992d542ae4a41f0aed887756c1e06922ccb8ce5`. Reviewed the complete tracked working-tree diff and new dedicated selfcheck. Git blob IDs below identify working-tree file contents, **not commits containing these changes**:

| File | Reviewed Git blob ID |
|---|---|
| `README.md` | `4983035d5e77b0551ff539739cf31221d2011173` |
| `projects/jewelryx/post-lifecycle.selfcheck.ts` | `66c5e80dd3a1ea1745d96a642e7a2cce906368be` |
| `src/gates/deliver-recovery.selfcheck.ts` | `5138382a22dbb3c7e8f9e2fb0e2c2fd9d81fb8dd` |
| `src/gates/deliver.selfcheck.ts` | `3ee7249ce466140fde95d6f273f6c2ab3669f5a2` |
| `src/gates/deliver.ts` | `2322dc2330dcaff07523cb9748cb3ac6525dcccf` |
| `src/round/corrections.selfcheck.ts` | `9800efba068fae70af55057dde97036acfca7641` |
| `src/round/corrections.ts` | `f8413a8a471853a90751baa91e6ab88c940fc604` |
| `src/round/next.ts` | `325690748453a18ce17b33c7267ec54bf3f9b1a0` |
| `src/gates/published-conflict.selfcheck.ts` | `82f6dad1a2deed3be40491ca7b021aa9c79128fb` |

Agreement/intake, approval history, reproduction script and retained evidence under this review folder were read as context. Parent is separately updating build/evidence notes. Later runtime/test changes require reassessment rather than inheriting this identity.

## Design axis

**No outstanding actionable implementation finding in this reviewed revision.** Verification limitations remain below.

### Intent

- **Confirmed published conflict becomes scoped correction: met.** `deliver.ts:691` requests mergeability/base commit in the existing repository-pinned query. Parsing requires a full observed base OID before granting conflict authority. `deliver.ts:721–729` retains exact PR URL, branch, head, base branch and observed base commit in a stable system source, with project-owned integration/regeneration, checks, independent assessment and fresh T2 instructions. Core selects no conflict paths or project commands.
- **Discovery from next and deliver: met.** Next refreshes an idle retained PR before reporting merge wait (`next.ts:417–426`); delivery uses the same reconciliation owner. `refreshPublishedDelivery` takes the same process lock as `runDeliver`. This is invocation-time observation, with no scheduler, wake mechanism or automatic merge.
- **No stale observation authority: met by code trace and bounded evidence.** The remote call remains outside the state lock. Exact serialized round state plus HEAD/branch/index/worktree/remote subject are revalidated. New capture revalidates inside `writeState` through the optional guarded-intake callback; granting `pr_repair` revalidates again. Expected-state accounting adds precisely the admitted correction plus the state-version fence, rather than rereading and accidentally blessing unrelated changes.
- **Duplicate/disposition semantics: met.** Exact source redelivery does not duplicate/reopen work. A persisting addressed/superseded current-head conflict with no outstanding correction refuses readiness (`deliver.ts:736–737`). A distinct pending authored instruction is not fenced by that historical disposition: it gets ordinary repair while the old source stays addressed. Blocked obligations still route to owner wait; neither pending nor blocked instructions authorize publication.
- **Holds/questions/instructions preserved: met.** Next does not refresh held/open-question routes. Delivery reconciliation can retain observations, but the existing guarded routing does not release held states; next-action question and blocked-correction precedence remains intact. Original human verdict files are not rewritten.
- **UNKNOWN is not success and need not prohibit required repair: met.** Unchanged current head without outstanding instructions refuses UNKNOWN with retry. Proven OPEN identity with scoped obligations, or an older published head with a newer local replacement, may continue only to existing repair/approval gates; the diagnostic explicitly disclaims merge readiness (`deliver.ts:712–718`). This resolves independent R1. Malformed/absent mergeability does not manufacture a conflict correction.
- **Approval and human-merge boundaries preserved: met by trace and focused evidence.** MERGED reconciliation precedes mergeability and repairs. Superseded remote-head adoption still checks approved content (`deliver.ts:741–751`). Changed reviewed content/base integration still reaches existing assessment/T2 and repeated content fences; generated content gets no exemption. The ordinary publication path re-queries before publication, and human merge of the retained head recovers that identity rather than republishing old-round work. A retained receipt/follow-up is not erased by late instructions.
- **Initial publication uncertainty/conflict: implemented.** After a successful exact-head handoff, non-MERGEABLE metadata invokes the same reconciliation owner (`deliver.ts:1034–1038`). Confirmed MERGED still wins; unknown refuses readiness; confirmed conflict retains a correction. This additional post-create branch was traced, but is not a separately isolated executed scenario in the dedicated matrix, whose initial create response is MERGEABLE. Do not describe it as independently demonstrated end-to-end here.
- **Scope/exclusions: met.** No automatic merge, new delivery engine, generated allowlist, tracker/reap redesign, background work, project command guessing, installed hook or configuration change is introduced.

### Last guard change scrutinized

The `!outstandingCorrections(state).length` condition at `deliver.ts:736` is necessary, not an approval exception. The duplicate correction returned by capture is historical; if another instruction is outstanding, `waiting` remains true and the existing guarded patch grants only the OPEN repair route. `runLockedDelivery` then returns to ordinary scoped repair instead of publishing with unresolved instructions. Once those instructions are addressed, the same unchanged conflicting current head again refuses readiness. Changed content still needs fresh subject-bound approval. Superseded corrections retain their replacement chain; this guard does not mutate any outcome.

### Test design and honesty

The new dedicated selfcheck starts with actual CLI publication to a disposable bare origin, creates actual same-line upstream Git divergence, verifies a real conflict, discovers through next, repairs/commits, rejects old T2, and publishes a freshly bound replacement to the same PR. Generated/product paths both receive this treatment; product replacement explicitly covers old-H1 UNKNOWN. Its fake controls GitHub protocol answers, not Git pushes/commits. Fixture assessment/verdict records are correctly disclosed as stand-ins, not actual independent human gates or project regeneration.

The dedicated matrix also covers uncertain metadata, changed base identity, retained instructions/holds/questions, state/index/instruction races, process exclusion, addressed-conflict plus distinct instruction, and human merge during repair. Existing delivery-recovery tests supply candidate/worktree races, superseded approval and interrupted-publication/receipt coverage. Parser cases exhaust a useful finite set of protocol/base shapes; arbitrary generation would not materially improve these closed cases.

Changed older tests are targeted compatibility updates: realistic mergeability fields, expected next remote-refusal output, guarded-capture admission under the real state lock, and replacing the open-handoff test's newly live `next` call with the existing controlled gh harness. The latter fixes a real test-isolation defect rather than changing runtime expectations. Remaining uncontrolled next calls in that recovery file occur behind a confirmed delivery receipt and do not take the new refresh branch.

## Standards axis

**No actionable standards finding in the reviewed diff.**

Applied checkout/global instructions and relevant coding-standards references for boundary parsing, domain state, errors, persistence, transaction/idempotency, TypeScript and test composition. The existing delivery/correction/state owners are extended rather than replaced by pass-through services or speculative abstractions. The small mergeability parser keeps protocol handling at the existing gh edge. Stable correction sources and exact guarded writes reuse established durability/deduplication conventions. The callback's internal abort is compatible with the repository's throwing-updater mechanism and becomes an explicit public refusal value.

Network calls are outside state transactions, no runtime dependency is added, casts added at the existing parser have stated runtime evidence, and portable core names no project technology. Test-only project fixture metadata is in the project test. No cosmetic/refactoring churn is requested. `git diff --check` executed during this assessment and exited 0; Git emitted only the existing LF-to-CRLF advisory for deliver.ts.

## Executed evidence and verification limits

### Independently executed by this reviewer

1. Original adversarial probe demonstrated and retained R1; the completed follow-up counterprobe established the old-head UNKNOWN repair fix. Logs/scripts in `../wf-149-evidence/independent-runtime-*`; earlier reports distinguish each completed run from a 120-second expanded-probe timeout.
2. Final guard probe executed against current runtime:
   ```text
   node ../wf-149-evidence/probe-persistent-new-instruction.mjs C:/Users/Shay/work/wf-149
   ```
   **Exit 0.** Log: `../wf-149-evidence/independent-final-distinct-instruction.log`. It uses a real disposable local Git/state fixture and controlled read-only gh list responses. Actual final observation:
   ```text
   Addressed conflict plus fresh authored instruction:
   {"reconciliation":{"kind":"open"},"oldOutcome":"addressed","pending":1,"step":"build"}
   PASS: separate scoped instruction can repair without reopening addressed conflict
   ```
3. Reviewed-file blob capture, complete diff inspection and `git diff --check` completed. No runtime/tests were edited by this reviewer. No live resource/remote operation or commit was performed in these review probes.

### Builder-run logs inspected, not rerun or claimed as reviewer executions

| Evidence | Actual result and limit |
|---|---|
| `published-conflict-focused-4.log` | Dedicated generated/product selfcheck PASS at 546.1s, tsc and eslint PASS; focused, not whole suite. This predates the final distinct-instruction assertion/guard. |
| `published-conflict-final.log` | Completed dedicated file including addressed conflict plus distinct instruction: PASS 330.8s; tsc PASS 0.3s, eslint PASS 1.4s. Completion inspected in the additive follow-up below. |
| `published-conflict-final-complete.log` | Final dedicated file including initial-publication CONFLICTING/UNKNOWN cases: PASS 305.6s; tsc PASS 1.3s, eslint PASS 2.2s; total 306.9s. Focused only, builder execution, log independently inspected. |
| `focused-final-core.log` | deliver, next and corrections selfchecks plus tsc/eslint PASS; focused only. |
| `probe-persistent-new-instruction.log` | Builder's final guard probe PASS; independently rerun above. |
| `recovery-isolated-900.log` | Recovery test TIMEOUT after 900s. Prior output includes passing UNKNOWN, snapshot races and interrupted-push assertions, but also the uncontrolled next/open-handoff failure. This is **not** a green recovery run. |
| `isolate-open-handoff.log` | Exact repaired open-handoff scenario's five assertions PASS. It resolves that observed fixture defect, not the entire recovery file's unexecuted remainder. |
| `baseline-focused.log` | Untouched base reproduces boundary import violation (`bin/wfk.selfcheck.ts` imports `env/shim.ts`) and post-lifecycle `/myself` fixture refusals, with 120s timeout. These are pre-existing failures, not proof that current post-lifecycle is green. |

At the initial assessment checkpoint, `published-conflict-final.log` had tsc/eslint PASS and no dedicated-check completion. That historical pending status is retained here for provenance; the additive follow-up below inspects its actual completion and the later final-complete run. The earlier 546.1s pass is not substituted for either later completion.

### Explicit remaining acceptance/evidence gaps

- **Historical gap, now closed by the addendum below:** final dedicated current-revision completion was pending at the initial assessment checkpoint. The final test blob now has a completed focused PASS plus tsc/eslint.
- **No complete current-revision delivery-recovery green run.** The isolated fixed scenario is useful, but does not establish every recovery arm ran after the fix. This is a verification limitation, not an identified runtime defect or a justified whole-suite pass.
- **Historical gap, now closed by the addendum below:** initial-publication conflict/UNKNOWN post-create branch originally had code inspection only. Final test-only additions exercise both through real CLI publication with controlled provider answers; the completed builder-run log is independently inspected, not represented as a reviewer-executed suite.
- No live GitHub freshness guarantee, actual application regeneration, full project checks, actual human T2 interaction or complete-suite result is claimed. Those are not secretly supplied by fixture verdicts.

## Assessment conclusion

Design: **0 outstanding actionable implementation findings**; scoped conflict recovery and unchanged authority fences are consistent with the approved agreement. Earlier R1 and the distinct-instruction trap are resolved in the identified runtime.

Standards: **0 actionable findings** in the identified diff.

Current verification: **final dedicated matrix plus tsc/eslint completed green (focused)**, including initial-publication CONFLICTING/UNKNOWN and the final distinct-instruction regression. Broader recovery verification remains incomplete: retain the 300s/900s timeouts, isolated repair evidence and baseline failures. No complete-suite or live-provider result is inferred. This assessment confers no approval, publication, merge or cleanup authority.

## Additive completion review — final test-only revision

This addendum preserves the earlier evidence/checkpoint above and updates the **current** assessment to the completed final dedicated verification. No runtime or tests were edited by this reviewer, and no suite was rerun for this addendum.

### Exact reviewed identity update

The final working-tree `src/gates/published-conflict.selfcheck.ts` blob is:

```text
b4aa5c234b5425618ad13ac50294da0706802e40
```

It supersedes only that file's earlier reviewed blob `82f6dad1a2deed3be40491ca7b021aa9c79128fb`. All other eight file blobs in the original identity table were re-read with `git hash-object` and are **unchanged**, including runtime `deliver.ts` at `2322dc2330dcaff07523cb9748cb3ac6525dcccf`, `corrections.ts` at `f8413a8a471853a90751baa91e6ab88c940fc604` and `next.ts` at `325690748453a18ce17b33c7267ec54bf3f9b1a0`.

### Design axis — final test delta

No new actionable finding. The controlled provider now accepts `createMergeability` through fixture state and returns that field at `pr create`; the existing default remains MERGEABLE. `makeRound` expects exit 2 for initial UNKNOWN, while successful CONFLICTING publication still expects exit 0 with a retained correction route. Separate cases at `published-conflict.selfcheck.ts:169–178` establish:

- Initial CONFLICTING: one real CLI-created PR, retained handoff, no delivery/automatic merge, build route and one system correction.
- Initial UNKNOWN: one real CLI-created PR, retained handoff, no delivery/automatic merge, step remains pr, no fabricated conflict correction, and refusal exit 2.

Both use the same real local Git publication and controlled gh composition as the rest of the file. They exercise the post-create reconciliation branch that previously had inspection-only coverage. Initial CONFLICTING is an intentionally controlled provider report, **not** an independently created upstream Git conflict in that case; the separate generated/product scenarios still provide actual Git divergence. No assertion has been weakened to manufacture a whole-suite or live-provider claim.

### Standards axis — final test delta

No new actionable finding. Configuration is local to the faithful test provider, the two finite protocol values are explicit, and normal MERGEABLE fixtures retain their previous behavior. The expected nonzero exit for UNKNOWN correctly models the CLI refusal contract rather than treating successful PR creation as merge readiness. No production switch or new runtime interface was added for testing.

### Completed evidence inspected

- `../wf-149-evidence/published-conflict-final.log`: dedicated file **PASS 330.8s**, tsc **PASS 0.3s**, eslint **PASS 1.4s**; total 331.1s. This closes the originally pending final distinct-instruction run.
- `../wf-149-evidence/published-conflict-final-complete.log`: final dedicated file **PASS 305.6s**, tsc **PASS 1.3s**, eslint **PASS 2.2s**; total 306.9s. This closes the initial-publication branch verification gap for the final test blob above.

These are builder-executed commands whose actual completed logs this reviewer inspected; they are not reviewer suite executions. No additional tests were needed for this test-only addendum.

### Current conclusion

Design: **0 outstanding actionable implementation findings**. Standards: **0 actionable findings**. Final dedicated controlled real-Git/CLI matrix and tsc/eslint are now completed green for the final test revision. The 300s and 900s broader recovery timeouts, subsequently isolated/fixed open-handoff case, and untouched-base boundary/post-lifecycle failures remain disclosed; no whole recovery-file or complete-suite green is claimed. No human approval, publication or merge authority is granted.
