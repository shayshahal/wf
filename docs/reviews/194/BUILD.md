# BUILD — #194

## Final status — READY FOR HUMAN T2

Independent `ASSESSMENT-R3.md` closes the scoped implementation/evidence work. It preserves all prior reports and original red logs. Final source manifest: `0b62b3266719ef19b893a630fbd08880e5651c6931beaa4de47600e223a6b961` (41 files). See `HANDOVER.md` for the result/evidence/limits view. No full suite, no green boundary claim, no proven low-level HTTP reset cause. Human T2/publication approval remains outstanding. Earlier progress snapshots below are retained as history, not current blockers.

Worktree: `C:/Users/Shay/work/wf-194` · branch: `feat/194-tool-only-workspaces` · base: `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`.

T1: human Inbox reply `msg_01M6495Z4V123MEQ80JYBT3R6P`, material SHA `21348f8e7cf73ae9b01b739281acec6229f4e198437e74ce93ac8d374cc224b5`. Final T2 is still required. This is a manual wf development worktree, not an application round.

## Changed ownership

```text
Existing round                           Non-round diagnostic
new → machine/Git allocator              runBaselineDiagnostic(explicit inputs)
serve → required dependency lease          → acquireDisposableWorkspace
reap → round retention/approval policy     → project setup → explicit probes → dependencies
       │                                  → existing owned check runner → retained diagnostics
       └──── shared cleanup executor ──────→ release / explicit recovery
             same durable journal

Project adapter: setup + declared dependencies + owned teardown
Caller: repo/ref + probes + command + output path + meaning of the result
```

- `workspace-allocation.ts` is the one raw Git allocator. Both the existing round and neutral path use it. The machine seam accepts an explicit destination/repository and `setup: 'none'` to suppress Worktrunk hooks only for neutral allocation.
- `worktree-registry.ts` owns shared placement/registry parsing without importing round policy. `worktree.ts` keeps its public compatibility exports and the round wrapper.
- `workspace-cleanup.ts` is the extracted guarded executor, not a second journal. Reap retains policy for merged branches, archives, tracker/approval and session ownership. Neutral ownership receipts authorize disposal of only a newly created baseline.
- `disposable-workspace.ts` owns acquisition intent, identity, setup, probes, dependency ordering, memoized release and explicit recovery. It refuses adoption, corrupt/mismatched authority, replacement roots, advanced/re-registered branches and unresolved process ownership.
- `baseline-diagnostic.ts` is the demonstrated non-round caller. It uses the existing owned check supervisor; it does not interpret a zero exit as product verification. Surviving logs receive setup, diagnostic stdout/stderr and server diagnostics before teardown.
- `projects/lint-kit/index.ts` installs frozen Node dependencies with lifecycle hooks disabled and declares no execution dependency. It does not import JewelryX.
- `projects/jewelryx/workspace-resources.ts` binds the existing setup/lease owners explicitly, accepts only requested verification profiles and records dependency identity for reconstruction. Neutral setup omits behavioral linking/shims and disables package lifecycle hooks. It still performs broad builds, verification-package installation and database seeding; API-only execution does not mean API-only setup.
- `env/workspace-baseline-example.mjs` is optional machine wiring, not a kit dependency. The kit JewelryX example accepts its concrete project adapter; the lint-kit example runs without env/plugins/runtime npm packages.

## Existing owners considered / deletion test

| Owner | Reuse / change | Why not leave coordination to the example? |
|---|---|---|
| `baseline-run.ts` scratch helper | Preserve old handle; share guarded probe destination | Its old memoized failure array lacks durable cleanup progress. Exposing it unchanged would not meet T1. |
| `git-worktree.ts`, machine create seam | Share allocation; retain round setup wrapper | Removing allocation reuse would duplicate branch create-if-absent and destination authority. |
| `reap.ts` journal | Extract executor; keep policy at caller | Removing the executor would duplicate progress, identity, plan, lock and retry guards. No journal migration was introduced. |
| `serve.ts` dependency lease | Reuse actual ownership, readiness and release | Project examples must not invent process cleanup or infer readiness from a PID alone. |
| `check-process.ts` supervisor | Reuse for diagnostic execution and recovery barrier | A killed caller must not authorize deletion while an unresolved diagnostic process may still use the checkout. |
| project adapters | One narrow explicit binding per demonstrated project | Removing the binding would reintroduce static JewelryX setup/readiness into lint-kit or put provider mechanics in callers. No registry was added. |

## Measured evidence so far

All selfcheck logs below are **focused**, with tsc and ESLint included. They are not a complete-suite result.

| Proof | Receipt / observation |
|---|---|
| Initial baseline / recovery | `evidence/baseline-focused.log`, `baseline-recovery-focused.log`; measured before implementation. |
| Shared ownership, allocation and cleanup | `allocation-focused.log`, `allocation-real-repair-focused.log`, `shared-cleanup-final-focused.log`, `alias-repair-focused.log`. |
| Public lifecycle, corruption/replacement and native recovery | `disposable-initial.log`, `native-recovery-focused.log`; controlled fixtures, not deployed eviction. |
| Owned diagnostic runner and import-inert boundary | `ownership-runner-focused.log`, `baseline-focused.log`, `consumer-focused.log`. |
| Lint-kit real consumer | `lint-kit-real-result.json`, `lint-kit-real.stderr`, surviving log path in that result. Fresh checkout, **43 Node tests**, dependency disposition **none**, complete release. |
| Actual round consumer | `real-round-cycle.json` and six `real-round-*.log` files: editing hook install → new bench → serve → B2B/admin/API HTTP **200** and recorded server ownership → forced reap → installed `wfk` hook restoration. All six steps exit 0; 220.97 s total. The post-alias-fix cycle also passed (`real-round-final-cycle.json`), 277.56 s. Reap deliberately retained unmerged bench branches according to round policy; the verifier then CAS-deleted only its own unchanged baseline refs after proving no registered worktree remained (`real-round-bench-refs-released.json`). All six app listener probes subsequently returned ECONNREFUSED (`real-round-postconditions.json`). |
| Actual JewelryX tool-only consumer | `jewelryx-tool-real-v2-result.json`: API schema HTTP **200**, **331 paths**, owned API dependency. Initial release retained ownership on an alias comparison refusal. `jewelryx-tool-recovery-result.json`: public recovery then completed using the same receipt/journal. |
| Export and reserved probe files | `export-focused.log`: two relocated/installed export checks, raw round Git allocation and reserved-ownership probe path checks. No complete-suite claim. |

## Failures retained and explained

1. `jewelryx-tool-real-result.json`: Worktrunk refused the empty destination that neutral acquisition precreated. No project setup ran. Removed precreation; intent now precedes allocation and directory authority is granted only after confirmed allocation. Lost allocation responses remain uncertain and cannot authorize deletion of an unconfirmed root.
2. `jewelryx-tool-real-v2-result.json`: API-only execution passed, but cleanup refused Git's physical registration path behind this machine's `.claude` parent junction. The journal remained intact. Compare canonical physical paths (also after leaf deletion); use `lstat` identity so a **leaf** link cannot hide a replaced root. The new public cleanup test covers both parent aliases and malicious leaf replacement. The retained real workspace was then recovered through the public API, not manual deletion or receipt editing.
3. Boundary check: both a read-only archive of base `8622ce7` and the current tree fail the same existing `bin/wfk.selfcheck.ts → ../env/shim.ts` rule. See `boundary-base-isolated.json`, `boundary-base-isolated.log` and `boundary-final-isolated.log`. No #194 file introduced this import. The machine-name and agent-text boundary arms pass. Do not call the whole boundary check green or repair unrelated code here.
4. Existing serve HTTP instability is retained and isolated in `project-resources-check-notes.md`, including raw failed logs and diagnostic replays. Original active HTTP timeouts remain unexplained; the actual round lifecycles pass. No timeout was extended to hide the old failure.
5. Earlier focused failures remain in their original evidence. Do not treat a later green as their explanation. Final verification summary will identify the relevant isolated diagnosis and current result.

## Assessment repairs and final evidence

The independent first report remains unchanged: `ASSESSMENT-PRELIMINARY.md`. Its verdict was repair, not approval.

| Finding | Repair | Current evidence |
|---|---|---|
| F1: switched/detached/rebound checkout could be deleted | Validate real Git registration, branch/ref, repository/common directory and linked-directory back-reference before dependency/project teardown and each later effect. Shared cleanup also checks target registration after every provider effect. | `identity-path-repair-focused.log`: 8 focused checks green including tsc/lint. `checkout-step-guard-focused.log`: 5 checks green; switched checkout during a provider step retains user files and journal. |
| F2: Git hooks ran during neutral allocation | Use an empty temporary hooks directory through subprocess-scoped Git config. Preserve inherited config, append after inherited command-scope parameters, and never write the override to repository config. Both native Git and Worktrunk use this owner only for neutral allocation. | `git-hook-repair-focused.log`: final 4 checks green, tsc/lint included. Real temporary repositories cover post-checkout/reference-transaction hooks, default/configured hook directories, inherited command-scope override, apostrophes/spaces and unchanged ordinary round hooks. |
| F3: alias could put the surviving log inside checkout | Validate physical containment at admission, retention and every destructive boundary, including dangling parent/destination links. | `identity-path-repair-focused.log`: native parent junction, valid external alias, dangling/redirected log link, pre-release and during-teardown redirection cases. |
| S1: orphan local guard in reap | Remove only the change-created unused `withinTarget`; shared cleanup remains its owner. | tsc/lint and focused reap recovery/interruption checks pass. |
| Builder: failed diagnostic retention could still delete checkout | Lease owns one native diagnostic, persists pending intent before execution, writes confirmed fallback output with digest, and retains externally before teardown. Release waits for execution and reconciles process ownership before dependency release. Fresh recovery retains confirmed output; unknown pending output never reruns. | `diagnostic-retention-focused.log`: final five-file cohort + tsc/lint green. Actual log-destination-as-directory regression preserves output/checkout/receipt; after repair public recovery completes. Native killed-owner/pending-output fixtures pass. |

Additional final measurements:

- `jewelryx-tool-final-result.stdout`: real clean acquisition on pinned app ref `929c219e660aee89d8387a2a17d3591af3f3694b`; **API HTTP 200 / 331 schema paths**, execution **0**, retention **retained**, dependency **owned**, cleanup **complete**. Surviving setup/server/output log: `jewelryx-tool-final.log`. The Node DEP0190 shell-argv deprecation warning remains visible in `.stderr`; it does not establish an observed injection or failed lifecycle.
- `portable-export-final-location.json` plus `lint-kit-portable-final-result.json`: newly exported kit moved to a path with spaces; no env or runtime node_modules in the kit; run its real example from the relocated folder. Pinned lint-kit ref `be07c4980371743a981379cf34b1f2aa08120d39`, **43 tests pass**, retention **retained**, dependency **none**, cleanup **complete**. The source checkout was not passed to the consumer. The target project's own frozen dependencies were installed as declared; this is not a claim that lint-kit itself has no dependencies.
- `real-round-reviewed-cycle.json`: post-hook-repair real round cycle, all six steps **0**, **225.67 s**; all three HTTP readbacks **200**. Source app ref `ac4e0d1310352946bbcdcd17ab14e0d7f1a06e3f` is in `real-round-reviewed-readback.log`. Installed hooks restored; only own unchanged bench ref CAS-deleted after reap (`real-round-reviewed-ref-released.json`). Final round receipt is now `real-round-frozen-cycle.json`: six lifecycle steps exit 0 in 204.33 s; B2B/admin/API HTTP 200, hooks restored, own unchanged bench ref CAS-deleted. This exercises the final round path; the later F4 change affects only neutral baseline-ref deletion.

Repair logs preserve intermediate fixture/compiler failures: multiline hook test strings were initially invalid TypeScript, an assertion narrowed the result to never, and a fixture incorrectly escaped an inherited Git parameter's apostrophe. Their causes were isolated in the retained log and fixed in the fixture, not hidden by timeout changes. Retention tests also record TS7022 resolved by an explicit test-local string annotation. Identity/path fixtures record Windows binding-file overwrite behavior; rename/restore exercised the intended rebinding case without skips.

## Current limits / work remaining

- Real lifecycle evidence proves this Windows machine, the selected refs and these project prerequisites. It does not prove arbitrary-project rounds, deployed host eviction or product correctness.
- A mutation interrupted before its new identity can be confirmed retains unknown authority. Recovery may refuse rather than adopt/delete an unconfirmed or replacement directory. The caller must inspect the retained receipt and failure; a refused recovery is not cleanup success.
- Setup is broader than the API-only dependency selection. The backend can perform its established boot-time external reads; this task does not redefine its application behavior.
- Package lifecycle hooks are disabled in neutral setup. Explicit project-owned build commands still run. Shared infrastructure is not disposed as an owned per-workspace resource.
- 25-file pre-F4 matrix: 27/27 green in 419.0 s (tsc/lint included), not a full suite. The isolated legacy serve check is RED and unresolved; see `evidence/final-verification-notes.md`. Real final round passed, but does not erase that failure. F4-focused post-repair cohort is 9/9 green. Renewed independent assessment and human final T2 remain. No publication. No publication is authorized yet.

## F4 — release-side Git hooks

`ASSESSMENT.md` remains the independent REPAIR verdict on the prior cohort; it is not rewritten as approval. Both assessor and builder independently observed neutral release triggering a `reference-transaction` hook. Builder reproduction: `evidence/release-git-hook-red.json` (before false, after true, cleanup complete).

Repair reuses `withGitHooksDisabled` for the neutral `update-ref -d` effect; no second hook mechanism, new journal, persistent config or round hook change. New `disposable-hooks.selfcheck.ts` exercises default and configured hook directories, paths with apostrophe/spaces, normal release, interrupted teardown followed by fresh recovery, setup-failure cleanup and ordinary Git still running its hook afterward. `evidence/disposal-hook-repair-focused.log`: seven selected files plus tsc/lint, **9/9 pass in 295.8 s**, focused only.

Fresh post-F4 real proofs (earlier output remains retained):
- `evidence/jewelryx-tool-f4-result.json` / raw `.stdout` / `.stderr` / `.log`: pinned app ref, API **HTTP 200 / 331 schema paths**, execution **0**, retention **retained**, dependency **owned**, cleanup **complete**. DEP0190 remains visible. This is an observation, not a certificate for product assertions.
- `evidence/portable-export-f4-location.json` / `lint-kit-portable-f4-result.json`: newly regenerated then relocated kit with spaces, no kit env/runtime node_modules, actual lint-kit consumer **43/43 pass**, retention **retained**, dependency **none**, cleanup **complete**. No edits to generated exports.

Compatibility risk remains explicit: legacy isolated serve failed copied-PID compound assertion despite correct CLI ownership refusal; instrumented replay failed a different CI-wait descendant HTTP check with ECONNRESET after 1 ms, not a timeout. PID liveness at that reset was not separately observed. A bounded base-commit control is being collected; no timeout changes, source edits or claims of explained flakiness. The full selfcheck suite has not been run.

## Serve compatibility evidence closure — pending independent acceptance

The baseline control passed twice; baseline failure was NOT established. The parent then reproduced the exact current copied-PID failure with a sharper in-memory observer. CLI refusal was correct, the pooled HTTP request reset in 1.34 ms, the recorded PID existed and a separate fresh request to that endpoint returned HTTP 200. See `evidence/serve-diagnosis.md` and the preserved controller/raw output. The low-level reset trigger remains unproven; two smaller probes passed and are recorded as passes, not red reproductions.

Only the private fixture health request now sends `Connection: close`. This checks listener lifetime without reusing a prior transport connection. No production code, assertion, retry or deadline changed. `serve-fresh-connection-focused.log`: tsc/lint + corrected serve, **3/3 green in 101.4 s**. `serve-fresh-connection-replay.log`: second direct run exit 0, all **15 Windows arms green**. Original red logs remain red. `ASSESSMENT-R2.md` closed F1–F4/S1 but blocked acceptance at its earlier evidence cut. A fresh independent acceptance report is required before final T2.
