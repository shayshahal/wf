# Build — #149 published PR conflict recovery

**Result: scoped implementation complete; independent assessment clean. Final human publication approval is pending.**

## Behavior shape

```diff
  wf next
~   runNext
+     refresh idle published candidate under the delivery process lock
        reconcilePublishedDelivery
~         prLookup → parsed mergeability + observed base OID
+         exact CONFLICTING current head → guarded captureCorrection
            existing correction route → scoped repair
            changed implementation → checks → independent assessment → fresh T2
+         unchanged head + UNKNOWN + no obligations → wait remote / retry
+         OPEN old head or pending obligations + UNKNOWN → repair/replacement gates, not merge readiness
          MERGED → existing receipt recovery; later instructions → fresh follow-up
  wf deliver
    existing publication/content fences and shared process exclusion
+   initial CONFLICTING / UNKNOWN handoff → same observation owner
    human merge · unchanged
```

| Boundary | Contract |
|---|---|
| `refreshPublishedDelivery(toplevel)` | Returns an explicit published-observation result under the same process lock as delivery. It never publishes new work. |
| `reconcilePublishedDelivery(toplevel)` | Existing owner. Query outside state lock; revalidate exact state and local subject before applying remote facts. |
| `PrLookup` | Existing identity/outcome result, extended with parsed mergeability/base metadata. Missing/bad metadata cannot manufacture conflict authority. Legacy manually constructed snapshots remain accepted by existing pure identity decisions. |
| `captureCorrection(toplevel, input, supersedes, revalidate?)` | Optional snapshot check runs inside the real state lock. A stale observation does not append a correction. Ordinary local intake is unchanged. |

## Before / after

| Case | Before | After |
|---|---|---|
| Matching current OPEN/CONFLICTING candidate | Zero corrections; wait for human merge | One identity-bound system correction; scoped repair |
| Same conflict observed twice | No detection | Same correction bytes; no duplicate |
| Addressed conflict still live | No detection | Refuse merge readiness; do not reopen history |
| Addressed conflict plus separate pending instruction | No detection | Preserve addressed history; permit the distinct scoped repair |
| UNKNOWN at unchanged published head | Ordinary merge wait | Explicit retry; no guessed conflict or readiness |
| Old published H1 UNKNOWN, repaired local H2 | No mergeability interpretation | Confirm OPEN identity; reach existing fresh-approval gates for replacement |
| Generated versus product conflict | Manual workaround | Same repair/evidence/approval fences; no generated allowlist |
| Human merge during repair | Existing recovery | Same original-head recovery and fresh follow-up identity |

## Review repairs

| Finding | Repair | Evidence |
|---|---|---|
| Independent R1: UNKNOWN for old published H1 blocked repaired H2 | Scope readiness uncertainty to its subject; retain ordinary OPEN repair/replacement authority and all publication fences | Reviewer completed counterprobe; dedicated product lifecycle rejects old approval, then replaces same PR under fresh binding while H1 is UNKNOWN |
| Builder counterexample: addressed old conflict fenced a separate pending authored instruction | Refuse persistent addressed conflict only without another outstanding obligation | Builder and independent probe; dedicated matrix preserves old outcome and routes new instruction |
| Old open-handoff test called `next` without its controlled gh adapter | Invoke the same existing controlled command harness for next | Five isolated assertions pass; no full recovery-file green is claimed |
| Initial post-create branch only inspected | Added real CLI publication cases with provider CONFLICTING and UNKNOWN | Final complete dedicated matrix passes |

## Verification — actual runs

All log links are retained in this folder. A focused runner result includes TypeScript and ESLint but is not a complete-suite result.

| Command / scope | Result | Evidence |
|---|---|---|
| `node docs/reviews/149/repro-published-conflict.mjs` | RED before: zero corrections / merge wait. GREEN after: one system correction / build repair | [Before](evidence/repro-before.log), [after](evidence/repro-after.log) |
| `node src/selfcheck.ts src/gates/deliver.selfcheck.ts src/round/corrections.selfcheck.ts src/round/next.selfcheck.ts` with jobs=2, cap=600 | **5/5 green**, including tsc/eslint. Parser finite matrix and guarded-capture refusal included | [Final core](evidence/focused-final-core.log) |
| `node src/selfcheck.ts src/gates/published-conflict.selfcheck.ts` with jobs=2, cap=900 | **3/3 green**; final integration file 305.6s, tsc 1.3s, eslint 2.2s | [Final complete matrix](evidence/published-conflict-final-complete.log) |
| Earlier focused delivery-id check | PASS at 191.1s; tsc/eslint green in that run. Other selected checks did not pass | [Mixed focused recovery](evidence/focused-recovery.log) |
| Complete delivery-recovery file, normal cap | TIMEOUT at 300s | [Original mixed run](evidence/focused-recovery.log) |
| Isolated complete delivery-recovery file, raised cap | TIMEOUT at 900s. Captured UNKNOWN/race/interruption assertions pass; observed open-handoff harness defect fixed separately | [900-second diagnostic](evidence/recovery-isolated-900.log) |
| Exact repaired open-handoff scenario, extracted with unchanged fixture/command composition | **5 assertions PASS**; not the whole recovery file | [Isolated scenario](evidence/isolate-open-handoff.log) |
| Boundary and post-lifecycle on untouched base `9992d54` | Reproduce boundary import violation and tracker `/myself` fixture refusals; post file hits 120s diagnostic cap | [Baseline](evidence/baseline-focused.log) |
| Distinct authored instruction after addressed conflict | Builder and independent probes PASS | [Builder](evidence/probe-persistent-new-instruction.log), [independent](evidence/independent-final-distinct-instruction.log) |
| `git diff --check`; agreement SHA/shape checks | PASS; approved material remains `654ad52059c72772189c69b53a1d0fb7964aebc26f88efe9e3175c75aa7126cc` | [Agreement validation](evidence/agreement-validation.json) |

## Limits and publication caveats

1. **No complete-suite result. No full delivery-recovery green.** The 900s diagnostic does not certify its unexecuted remainder. The specific observed open-handoff defect has a passing isolated regression.
2. **New dedicated integration test needs a raised cap on this host.** Default 300s was insufficient during development; final dedicated file took 305.6s with a 900s cap. Global runner defaults were not changed. Earlier loaded runs took longer; no claim of a diagnosed performance cause.
3. **Baseline failures remain.** `bin/wfk.selfcheck.ts` imports `env/shim.ts`; post-lifecycle's controlled tracker rejects `/myself`. Untouched main reproduces these. This change does not repair unrelated infrastructure or certify current post-lifecycle green.
4. GitHub answers are controlled. Real local Git conflicts/pushes and command composition are exercised, but **not live GitHub conflict freshness or project regeneration**. Fixture assessment/T2 bindings are not real human decisions.
5. One older test invocation made a read-only lookup of fictitious `o/r` through installed gh after next gained remote observation; it failed repository resolution. That test now uses the controlled gh harness. No live remote mutation was performed.
6. No application UI, stack, database, hooks, project setup/serve/teardown or installed runtime changes were needed. The AGENTS.md real stack lifecycle requirement is not triggered by this scope.

## Standards and ownership notes

- No runtime dependency, second delivery engine, scheduler or project-specific core policy was added.
- The new refresh export earns its place because next needs serialized observation without the publication operation. Removing it would duplicate delivery-lock mechanics in routing.
- Mergeability parsing remains private to the existing GitHub response owner. Existing commit-string representation is retained; full OID checks refine new authority without a broad ID migration.
- The atomic intake callback uses the existing guarded-updater/explicit-refusal convention, not a new transaction abstraction.
- Property coverage uses the small finite protocol/base-shape matrix plus identity/retry transition cases; no new testing library is needed.
- Fresh independent assessment: [ASSESSMENT.md](ASSESSMENT.md). Exact runtime/test blob identities are recorded there. It does not authorize publication or merge.
