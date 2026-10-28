# #149 — Independent adversarial runtime review

Scope: current uncommitted production diff in `src/gates/deliver.ts`, `src/round/corrections.ts`, `src/round/next.ts`, and `README.md`, against `docs/reviews/149/AGREEMENT.md`. This is a runtime review while tests develop, **not final implementation signoff**. No production or test file was edited; no commits, live remote calls, hooks, or app resources were used.

## Reviewed identity

- Checkout: `C:/Users/Shay/work/wf-149`; HEAD/base `9992d542ae4a41f0aed887756c1e06922ccb8ce5`.
- Agreement approval: `AGREEMENT-REVIEW.md` records actual human T1 at agreement material SHA `654ad52059c72772189c69b53a1d0fb7964aebc26f88efe9e3175c75aa7126cc`; T2 remains separate.
- Reviewed diff retained as `independent-runtime-reviewed.diff` beside this report.
- Git blob identities at review completion:
  - README.md: `4983035d5e77b0551ff539739cf31221d2011173`
  - src/gates/deliver.ts: `9761d8556aece72a4cd6c9cb3380345fd458d56e`
  - src/round/corrections.ts: `f8413a8a471853a90751baa91e6ab88c940fc604`
  - src/round/next.ts: `325690748453a18ce17b33c7267ec54bf3f9b1a0`

## Correctness / agreement axis

### R1 — P2: Unknown mergeability of the old published head prevents sending an already repaired local head

**Location:** `src/gates/deliver.ts:710–715`, especially the unconditional refusal at **712**. `runLockedDelivery` consumes that refusal before any ordinary publication/approval gates at `src/gates/deliver.ts:792–794`; `runNext` also stops on it at `src/round/next.ts:420–425`.

The new special case deliberately allows a remote `CONFLICTING` result for the old handoff head when local HEAD has advanced: lines 713–715 correctly recognize that the old head's conflict must not prohibit publishing its locally repaired replacement. But the immediately preceding UNKNOWN guard has no corresponding subject distinction.

Counterexample through the current public reconciliation owner, with real disposable Git/state and a controlled read-only gh response:

1. Publish/retain H1, observe an exact OPEN/CONFLICTING PR and capture the correction.
2. Address the correction and commit local repair H2, leaving the PR at H1.
3. The same exact OPEN identity at H1 returns `CONFLICTING`: reconciliation returns `{ "kind": "none" }`, allowing delivery to continue to its existing approval gates.
4. Change only that remote mergeability field to `UNKNOWN`: reconciliation returns `refused`, although the PR identity/outcome is known OPEN, H2 is distinct, and UNKNOWN describes **H1**, not the implementation that would be published.

The old remote subject's metadata thereby becomes an unrelated prerequisite for republishing its reviewed repair. GitHub may report UNKNOWN while computing the old head, even though a locally repaired head is ready. This also blocks a pending scoped correction route when OPEN identity is established but mergeability is unknown. No unsafe merge-ready report should be made for H1, but that is different from refusing all required repair/publication progress.

Agreement connections: **Ownership** reuses existing repair routing; **Unknown** says to provide explicit retry guidance without guessing a conflict/mergeable claim; **Approval** requires current checks/assessment/fresh T2 for changed work. Preserve all those fences, but scope mergeability uncertainty to the subject it describes. The task brief explicitly requires that unknown mergeability not block required repair.

**Suggested fix direction:** distinguish observing merge readiness of the current published subject from reconciling a proven OPEN old candidate before scoped repair or replacement. Do not bypass any exact repository/PR/head/base identity checks, MERGED/CLOSED handling, superseded-head approval checks, correction blockers or final content-bound T2 gates. Add a regression with H1 still OPEN/UNKNOWN and H2 repaired/approved, plus a pending-instruction case, proving progress without claiming H1 mergeable.

**Executed evidence:** `independent-runtime-probe.log` and `independent-runtime-probe.mjs`. The latter is a sibling diagnostic, not a checked-in test. This demonstrates the reconciliation/publication precondition failure; it does **not** claim a full end-to-end reviewed repair was run.

## Standards axis

**No additional actionable standards finding in the reviewed production diff.** This does not convert the correctness finding into a standards pass/signoff for the whole feature or tests.

Sources read: checkout `AGENTS.md`, provided global guidelines, `package.json`, `eslint.config.js`, coding-standards skill and applicable errors/parsing/persistence/workflows/modules/testing/TypeScript references. Existing no-runtime-dependency and state-lock conventions govern the small parser and guarded updater; no class/service rewrite is warranted merely to conform to a general architecture example.

The implementation extends the delivery owner rather than introducing a parallel delivery engine; uses a parsed mergeability union; captures a stable source identity; and keeps network lookup outside the state lock. Its `revalidate` callback uses the existing throwing-updater persistence convention and translates the expected refusal back into a public result. No cosmetic cleanup is requested.

## Coverage and adversarial trace

### Executed, bounded disposable probe

Command (Node `v26.12.1`):

```text
node ../wf-149-evidence/independent-runtime-probe.mjs C:/Users/Shay/work/wf-149
```

Result: **exit 0** (the diagnostic intentionally reports the counterexample instead of treating its presence as a test-run failure).

Observed:

- Actual query requests `url,state,headRefOid,headRefName,baseRefName,isCrossRepository,mergeable,baseRefOid`.
- Matching OPEN/CONFLICTING records one system correction and a next action of `work build`.
- Re-observation preserves the exact correction bytes and does not duplicate it.
- Addressed persistent identity refuses without reopening the addressed correction.
- Old conflicting published head + advanced local repair HEAD returns `none`.
- Old UNKNOWN published head + the same advanced local HEAD returns `refused`; retained candidate/instructions remain unchanged.

Fixture retained: `C:/Users/Shay/AppData/Local/Temp/wf-149-conflict-repro-TJVwzg`. The probe performs local Git operations and controls only gh list responses; it makes no live network call. An initial diagnostic script had a newline-escaping syntax error, before any fixture execution; retained in `independent-runtime-probe-setup-failure.log`. Fixing only the sibling diagnostic script produced the executed result above.

### Inspected, not independently executed here

- Exact identity: `originTarget` proves consistent configured/effective GitHub destination; `prLookup` checks branch/base/cross-repository/PR repository and full OIDs; `publishedDeliveryVerdict` requires retained PR URL and either handoff or local head.
- Atomic capture: `captureCorrection` revalidates **inside** `writeState`; capture's expected-state reconstruction accounts for precisely the correction append and version fence. A later unrelated state/local-subject change is rejected again before granting `pr_repair`.
- Snapshot subject covers HEAD, branch, index, approval worktree bytes and remote configuration. No stale-capture counterexample found by inspection.
- Duplicate pending/blocked entries are not rewritten. Addressed/superseded persistent conflicts refuse merge readiness. A changed observed base commit yields a distinct source.
- Held states and questions are not released by `unmergedAttemptPatch`; next skips idle refresh for held/open-question states. Next-action routing retains blocked corrections as owner waits.
- `refreshPublishedDelivery` and `runDeliver` take the same git-path process lock; no remote call should occur on lock refusal.
- New initial publication path records the handoff, then reconciles uncertain/conflicting metadata. A subsequent MERGED response precedes mergeability interpretation and uses existing receipt recovery.
- Superseded remote-head adoption still checks approval content before changing the retained candidate. Conflict intake can precede that refusal, but does not itself grant repair/publication authority.
- Reconciliation runs before publication gates; the ordinary path also queries again before push. Existing content checks remain before/after round-folder commit, push hook and PR handoff. No new stale-approval publication bypass found by inspection.
- Human MERGED is handled before mergeability, including a local HEAD newer than the retained handoff. Repair/follow-up instructions remain durable.

Read relevant existing `deliver-recovery.selfcheck.ts`, delivery/correction/routing code, and the developing `published-conflict.selfcheck.ts`. Its current cases do not cover R1: the repaired continuation resets the remote row to MERGEABLE, while UNKNOWN cases use an unchanged published local head. The developing test file may change after this snapshot.

**Not run here:** focused selfcheck runner, tsc, eslint, complete suite, live GitHub freshness, actual project regeneration, or final delivery lifecycle. Test source inspection is not a pass claim. No final implementation approval is given.

## Summary

- Correctness/agreement: **1 actionable finding**, P2, old-head UNKNOWN metadata blocks required repair/republication progress.
- Standards: **0 additional actionable findings** in the specified production diff.
- Parent should resolve R1 and obtain focused runtime evidence plus fresh final independent assessment before T2/publication.
