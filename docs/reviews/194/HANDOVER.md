# #194 — Tool-only workspace lifecycle

**READY FOR HUMAN T2. Review the implementation and evidence. Approve publication or request changes.**

The complete scope and T1 ruling remain in [AGREEMENT.md](AGREEMENT.md) and [AGREEMENT-REVIEW.md](AGREEMENT-REVIEW.md). This sheet does not replace them.

## What changes

```text
Round caller                           Non-round baseline caller
  classification / approval policy       repository + ref + explicit project
  newRound behavior                       explicit probes + log + native argv
           │                                       │
           └──── shared allocation ────────────────┘
                    │                     project-owned setup
                    │                     dependency none / borrowed / owned
                    │                     actual readiness and one diagnostic
                    │                     output retained before teardown
           ┌──── shared guarded cleanup ───────────┐
           │                                       │
       round reap                         memoized release / explicit recovery
```

| Caller supplies | Implementation owns | Caller receives |
|---|---|---|
| Repository, source ref, new disposable branch | Exclusive allocation; immutable allocation ref and directory identity | Exact allocation ref/path; acquisition result |
| Explicit project adapter and probes | Project setup; confined probe copy; only declared execution dependencies | Readiness or refusal; none/borrowed/owned disposition |
| Native executable/argv/env; surviving log | One diagnostic; process ownership; confirmed fallback output; external retention | Execution and retention are separate results |
| Same repository/branch/project for recovery | Existing cleanup journal; authority checks before destructive effects | Complete, incomplete or refused; receipt/journal for inspection |

**Kept:** round approval/correction/delivery guards; owned-versus-borrowed authority; unknown-versus-absent handling. Ordinary round hooks still run. Neutral allocation and neutral ref deletion suppress Git hooks only within their own subprocesses.

**Not added:** class/ticket/next ceremony for the tool caller; behavior-skill installation; arbitrary-project round support; a registry, scheduler, second cleanup journal or universal verifier. Scenario preparation and product interpretation remain outside this operation.

## Measured results

| Case | Observed | Receipt |
|---|---|---|
| Real round, final round-path code | New/serve/readback/reap/restore exit 0; all three apps HTTP 200; 204.33 s | `evidence/real-round-frozen-cycle.json`, `real-round-frozen-readback.log` |
| Real JewelryX, after F4 repair | API HTTP 200, 331 schema paths; exit 0; retained/owned; cleanup complete | `evidence/jewelryx-tool-f4-result.json` |
| Real lint-kit from a fresh relocated export | 43 tests pass; retained/none; cleanup complete; kit has no env/runtime node_modules | `evidence/lint-kit-portable-f4-result.json`, `portable-export-f4-location.json` |
| Broad focused checks before F4 | 25 selected files + tsc/lint: 27/27 green, 419.0 s | `evidence/final-focused-matrix.log` |
| Targeted checks after F4 | Seven selected files + tsc/lint: 9/9 green, 295.8 s | `evidence/disposal-hook-repair-focused.log` |
| Tool-only cleanup | Both final checkout directories, owner receipts and cleanup journals absent | `evidence/f4-cleanup-postconditions.json` |
| Identity/log/retention guards | Switched/detached/rebound checkout, path aliases, redirected output, uncertain execution and explicit recovery covered | `BUILD.md`, focused logs |

The last round proof predates the two-line F4 neutral ref-deletion repair. The round path did not change in that repair. Fresh tool-only and export proofs exercise the repaired neutral path.

## Limits and risks

| Item | Status |
|---|---|
| Serve compatibility | Old pooled fixture runs remain **RED**. Exact current reproduction found a reset while the recorded PID existed and a fresh request returned 200. Fixture now uses fresh connections: **3/3 checks green** (tsc/lint included) plus a second direct run with all 15 arms green. No production change, retries, deadline changes or dropped assertions. Two base passes did not establish a failing baseline. The low-level reset trigger remains unproven. See `evidence/serve-diagnosis.md`. |
| Boundary check | **RED at the base and current tree:** `bin/wfk.selfcheck.ts` imports `../env/shim.ts`. This is not a new #194 import. |
| Full selfcheck suite | **NOT RUN.** Focused results do not certify the complete suite. |
| API process shell warning | DEP0190 remains visible in the real JewelryX stderr. No injection was demonstrated. |
| Concurrent filesystem/Git mutation | Guards recheck before effects. They are not an OS-level atomic fence. |
| Diagnostic crash window | Pending/unconfirmed output stays uncertain. Recovery never reruns the command. A lost append acknowledgement can repeat a transcript block. |
| Native interrupted recovery | Controlled/native fixture coverage; not a killed real JewelryX API-stack experiment. |
| Product verification | Operation completion, HTTP readiness and check exit are observations. The caller must interpret the product claim. |

## Assessment and your action

- `ASSESSMENT-PRELIMINARY.md`: original REPAIR findings.
- `ASSESSMENT.md`: later REPAIR verdict, including F4 release-side hooks. Kept unchanged.
- F4 repair: reuse transient hook suppression at neutral branch deletion. Public regression checks default/configured hooks, normal release, fresh recovery, setup failure and ordinary Git still running hooks.
- `ASSESSMENT-R2.md`: all implementation findings closed; acceptance blocked on then-unresolved serve evidence. Kept unchanged.
- [ASSESSMENT-R3.md](ASSESSMENT-R3.md): **READY FOR HUMAN T2**. No required implementation repair or acceptance-evidence blocker remains for this bounded proof. The assessor independently ran the corrected public fixture: all 15 Windows arms green.
- Final 41-file source manifest SHA-256: `0b62b3266719ef19b893a630fbd08880e5651c6931beaa4de47600e223a6b961`.

**No commit has been published. No push, PR or merge is authorized by these measurements.** Final T2 must review the actual change, the independent verdict and the visible verification gaps.
