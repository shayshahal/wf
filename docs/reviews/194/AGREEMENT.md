# AGREEMENT — #194 · Tool-only workspace/resource proof

Class: B

## Observed

```diff
  existing round consumer
    new.ts → createWorktree → machine allocation → project setup
    serve.ts → requested dependency lease → actual readiness
    reap.ts → guarded, journaled teardown

  baseline-run.ts
    scratch reservation → createWorktree → copy explicit probes
    remove() → removalPlan → runRemovalStep
    · existing handle owns teardown; no production tool-only caller
    ✗ incomplete cleanup → caller receives failures; retained resources need recovery
```

- Scratch coordination already reserves ownership and copies probes: `src/gates/baseline-run.ts`. Its external consumer is not implemented.
- Worktree setup and server acquisition import static JewelryX exports: `src/project.ts`, `src/worktrees/git-worktree.ts`, `src/worktrees/serve.ts`.
- Round creation separately changes behavioral skills: `projects/jewelryx/index.ts:newRound`. Neutral allocation must omit this behavior.
- Scratch/worktree and interrupted-reap focused checks pass. Logs: `evidence/baseline-focused.log`, `evidence/baseline-recovery-focused.log`. Real lifecycle remains unmeasured.
- Lint-kit declares Node/pnpm checks, not an app stack: `lint-kit/package.json`, README. Source revision and prerequisites: `TICKET.md`.



## Agreed

```text
Caller supplies                 Shared implementation owns             Caller receives
────────────────────────────  ─────────────────────────────────────  ───────────────────────────
repository + immutable ref     exclusive allocation and identity      exact workspace identity
explicit probe inputs         project setup and diagnostic retention actual setup outcome
explicit project binding      required dependency leases/readback    readiness or unavailability
required dependencies         guarded resumable release              release/recovery receipt

Round policy stays outside: classification, T1/T2, correction disposition and delivery authority.
Diagnostic policy stays outside: selected comparison, check argv and interpretation of results.
```

- **Behavior.** Support one non-round baseline diagnostic consumer through the existing workspace/resource implementation.
- **Caller.** Supply repository/ref, explicit probe inputs, surviving diagnostics destination and required dependencies; interpret check results outside the operation module.
- **Ownership.** Return inspectable workspace/readiness/release outcomes and durable recovery references. Keep coordination inside the module, not in caller scripts.
- **Recovery.** Reuse existing reservation, identity, leases and interrupted-cleanup guards. Do not add a parallel teardown journal.
- **Projects.** Demonstrate JewelryX and lint-kit. Resolve only the project facts required by these examples through project-owned adapters.
- **Choice.** wf owns the complete disposable baseline lifecycle and durable recovery. Reject caller-owned orchestration of separate allocation, server and removal handles.
- **Reason.** Callers must not reconstruct safe ordering, diagnostic retention or interrupted cleanup. They retain control of diagnostic inputs and interpretation.
- **Project binding.** Bind a narrow project adapter explicitly, including subprocesses. Lint-kit must not inherit JewelryX setup, databases or app readiness.
- **Round compatibility.** Keep the round consumer on the shared implementation. Preserve approval, correction, delivery, tracker and session ownership guards.
- **Isolation.** Tool-only use requires no class, ticket, next dispatch, round documents or installation/removal of behavioral skills.
- **Setup isolation.** Neutral setup must not install machine shims or change behavioral skill links, including through setup helpers or subprocess hooks.
- **Disposal authority.** Delete only branches and workspaces created as disposable baselines by this operation. Never adopt existing rounds or pre-existing workspaces.
- **Readiness.** Acquire only declared execution dependencies. Report setup breadth separately. Preserve owned/borrowed/none and unknown/absent distinctions; readiness is not product verification.
- **Release.** Preserve stale-handle, replacement-resource and repeated-release safety. Recover interruptions explicitly; do not silently rerun a memoized incomplete release.
- **Excluding.** No arbitrary-project round support, command-wide rewrite, registry, scheduler, mandatory harness, layout migration or live-round migration.
- **Excluding.** Scenario preparation/reset and verification meaning remain #131/#139. Host continuation remains #159. Existing-worktree discovery remains #158.
- **Verification.** Exercise existing round and non-round consumers, both projects, controlled failures, actual isolated lifecycles and applicable relocated kit export.
- **Not asked for.** None. The diagnostic consumer and narrow adapter serve the requested composability proof; no broader toolkit is promised.
- **T2 walk.** none — this changes tooling interfaces and ownership, not an application view; review receipts, call paths and lifecycle logs.



## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | Shared consumers, isolated inputs and no ceremony | `src/worktrees/`, `src/gates/baseline-run.ts`, example consumer | Focused public-interface checks; inspect tool-only checkout for absent round state/documents and unchanged behavioral skills. |
| 2 | Ownership and interruption safety | resource, scratch and reap selfchecks | Acquisition failure, borrowed resource retention, repeated release, dead caller, changed plan, replacement directory/resource and stale handle refusal. |
| 3 | Genuine narrower project | `projects/lint-kit/`, diagnostic consumer | Fresh isolated lint-kit checkout; project-owned dependency install and explicit Node check; no app listener/database; inspect logs and release. |
| 4 | JewelryX and existing round consumer | project adapter, machine worktree seam | From JewelryX root through this editing entry: hook install → isolated `new bench/194-…` → required stack readiness → forced bench reap; restore installed hooks in finally. Also exercise tool-only diagnostic path. |
| 5 | Portable kit and source discipline | affected selfchecks, boundary/export checks | Focused checks + tsc/eslint; applicable export relocated away from checkout/env/plugins/runtime npm dependencies. Record baseline failures separately. |
| 6 | Caller contract and claim limits | README, `BUILD.md`, `ASSESSMENT.md` | Independent assessment plus manual: inspect supplied inputs, actual outcomes, recovery obligations and measured versus unmeasured guarantees before final T2. |

## Decisions

T1 approved by actual human Inbox reply msg_01M6495Z4V123MEQ80JYBT3R6P on material SHA 21348f8e7cf73ae9b01b739281acec6229f4e198437e74ce93ac8d374cc224b5. Exact function/file names remain implementation choices inside this scope. Final T2 is required before publication.
