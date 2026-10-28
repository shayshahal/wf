# #149 — independent runtime follow-up on R1

## Verdict

**R1 is resolved in the reviewed runtime revision. No new actionable correctness or standards blocker found in this follow-up.** This is not final implementation/T2 signoff: the broader focused recovery suite has not been established green, and the developing dedicated conflict test remains separately owned.

Reviewed `src/gates/deliver.ts` blob `4f21133919eb4bee1fca761ec6a873bdf20aab2b`, against the earlier review's `9761d8556aece72a4cd6c9cb3380345fd458d56e`. README, corrections.ts and next.ts retain the exact reviewed blob identities listed in `INDEPENDENT-RUNTIME-REVIEW.md`.

## Correctness axis

The revised guard at `src/gates/deliver.ts:710–719` distinguishes readiness for an unchanged current published subject from repair/replacement of an exact, proven OPEN candidate:

- Unchanged current head with no outstanding instructions still refuses UNKNOWN and requests retry.
- Outstanding scoped instructions can obtain the existing repair route on the exact OPEN candidate without claiming its mergeability.
- A newer local HEAD can proceed past old-head UNKNOWN to the ordinary approval/publication gates.
- The diagnostic explicitly states that this continuation is not a human-merge-ready claim.

The relaxation occurs only **after** `publishedDeliveryVerdict` and snapshot/subject revalidation. MERGED handling remains earlier. CLOSED, missing/mismatched candidate identity, ambiguous rows, third heads, malformed head OIDs and unavailable remote outcomes are not relaxed. Superseded remote-head adoption still requires its independent T2 content comparison. New correction capture still requires confirmed CONFLICTING plus valid observed base OID; UNKNOWN cannot synthesize a conflict instruction.

An old unknown head with local replacement does not automatically receive publication authority: `runLockedDelivery` still evaluates unresolved corrections/open questions, step, review binding, assessment and the existing mutation-boundary content fences. After replacement publication, fresh UNKNOWN at the now-current head again refuses merge readiness. Pending/blocked work remains ordinary correction routing, not implicit disposition.

Read the two added owner-level regressions in `src/gates/deliver-recovery.selfcheck.ts:380–392`; they cover the right distinction. Source inspection is not an executed pass claim.

## Standards axis

No new actionable finding. The fix is local application policy in the existing reconciliation owner; it introduces no parallel owner, new persistent representation or caller configuration. Existing expected-result and guarded-updater conventions are preserved. The diagnostic's `wf deliver` prefix also appears when `next` invokes this owner; that is attribution to the owner, not a correctness blocker.

## Independently executed evidence

### 1. Original counterprobe rerun — completed, exit 0

```text
node ../wf-149-evidence/independent-runtime-probe.mjs C:/Users/Shay/work/wf-149
```

Log: `independent-runtime-followup-probe.log`.

Key actual results:

```text
Old conflicting published head / repaired local HEAD: {"kind":"none"}
wf deliver: published PR mergeability is unknown (GitHub is still computing PR mergeability); continuing only scoped repair/replacement, not reporting this PR ready for human merge
Old UNKNOWN published head / repaired local HEAD: {"kind":"none"}
Local HEAD advanced: true
Candidate still original: true
UNKNOWN preserves remaining state: true
```

The earlier counterexample no longer reproduces. Repeated conflict capture still preserved the instruction bytes, and an addressed persistent current-head conflict still refused.

Disposable fixture retained: `C:/Users/Shay/AppData/Local/Temp/wf-149-conflict-repro-ep5eZO`.

### 2. Expanded independent matrix — bounded run timed out at 120 seconds

```text
node ../wf-149-evidence/independent-runtime-followup-matrix.mjs C:/Users/Shay/work/wf-149
```

Log: `independent-runtime-followup-matrix.log`; sibling diagnostic script retained. The command hit the tool's 120-second timeout, **so this is not a completed matrix/pass**. Captured output before timeout directly establishes:

```text
Unchanged published head UNKNOWN with no instructions: {"kind":"refused", ... explicit retry ...}
Reconciliation result: {"kind":"open"}
Duplicate preserves correction bytes: true
Pending instruction UNKNOWN: {"kind":"open"}
Pending UNKNOWN keeps instruction bytes: true
Addressed persistent conflict: {"kind":"refused", ... still conflicts ...}
```

No assertion failure appeared before timeout. The matrix had not emitted its later repaired-head section when the bounded command ended. That later section is independently covered by completed run 1, not inferred from the timed-out run. The slowdown is retained as diagnostic evidence; this review does not explain it away as green or claim to have isolated its cause.

## Limits / next verification

No production/test edits, commits, live gh calls, project resources or hooks were used. Both probes use real disposable local Git/state and the current public reconciliation owner with a controlled read-only gh response.

I did not independently run the repository selfcheck runner, tsc or eslint in this follow-up. Parent reports delivery/corrections/next plus tsc/eslint green, and broader recovery/post-lifecycle 300-second timeouts with separate diagnosis underway; those are **parent-reported**, not independent run claims. No full repair-to-publication CLI lifecycle, live provider freshness, actual project regeneration or final implementation assessment is asserted by these probes.

Follow-up summary: **original correctness finding resolved; zero new actionable runtime findings; zero new actionable standards findings; final verification/signoff remains separate.**
