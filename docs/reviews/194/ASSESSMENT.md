# Independent implementation assessment — #194

**Verdict: REPAIR. Not approved for final T2 or publication.**

Assessed on 2026-10-30, independently of implementation/repairs, against base `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`, manual branch `feat/194-tool-only-workspaces`. This assessment covers the full current tracked runtime/test diff and new untracked runtime/tests, including diagnostic retention. The exact changed cohort is bound below. `ASSESSMENT-PRELIMINARY.md` is unchanged.

The original checkout-identity and log-path defects are repaired in the inspected source. Neutral **allocation** now suppresses native Git hooks correctly. However neutral **release/recovery** still executes repository reference hooks. One independently reproduced behavior finding remains. Final aggregate validation and the last real round cycle were also incomplete at the evidence cut recorded below; their future results are not assumed.

## 1. Behavior / intent findings

### F4 — Medium, required repair: neutral branch cleanup re-enables repository behavioral hooks

**Location:** `src/worktrees/disposable-workspace.ts:228–232`, especially the `git update-ref -d` invocation at 232. `withGitHooksDisabled` is used in allocation (`workspace-allocation.ts`, native round adapter's neutral mode, and `env/worktrees.ts`) but not this cleanup mutation.

A repository `reference-transaction` hook runs during deletion of the disposable branch. This hook is ordinary Git behavior, independent of Worktrunk/package lifecycle hooks. It can run behavioral linking/shim installation, mutate the source repository or shared machine state, or reject/hang teardown. The explicit neutral adapter does not authorize these ambient hook effects. This is a remaining lifecycle hole in the approved isolation contract: tool-only use requires no installation/removal of behavioral skills, and its resource operations must not acquire behavioral policy through subprocess hooks. The earlier F2 allocation fix is real but does not cover release.

**Independent public-interface reproduction, performed during this final assessment:**

1. Create an isolated temporary Git repository and empty base commit.
2. Write an executable `.git/hooks/reference-transaction` that appends `ran` to a marker in that temporary repository. No machine-installed hook or real application is involved.
3. Acquire `bench/hook-release` through `acquireDisposableWorkspace` using an explicit inert project (`setup` no-op, `acquire` ready/none, `teardown` empty).
4. Confirm the marker does not exist after acquisition; call `workspace.release()`.

Actual output:

```json
{"afterAcquire":false,"release":"complete","afterRelease":true}
```

The hook ran only during release. The temporary repository was removed afterward. This is not inferred from a parent claim or from a mocked subprocess.

**Repair required:** use the existing transient hook-suppression owner for neutral cleanup's Git mutations, including reconstruction through explicit recovery. Keep ordinary round hooks unchanged; do not persist an altered `core.hooksPath`. Extend the public lifecycle test through release and interrupted recovery with default/configured `reference-transaction` hooks and inherited command-scope config. The allocation-only hook tests cannot certify a hook-free disposable lifecycle. Reassess the exact repaired source/test cohort.

No additional independently substantiated behavior defect is asserted by this report. The remaining sections explain the inspected guarantees and their limits, rather than treating green examples as universal safety proof.

## 2. Preliminary finding disposition

| Prior finding | Final source/evidence judgment |
|---|---|
| F1: switched checkout deletion | **Repaired for the reproduced case.** `confirmWorkspaceCheckout` checks target registration, branch/ref, common directory, top-level path and linked-worktree `gitdir` back-reference. Handle release checks before dependency release; explicit recovery checks before teardown. Guarded steps revalidate after awaited provider effects. The shared executor additionally checks the target registration on every step. |
| F2: native allocation hooks | **Allocation repair verified by source and inspected test evidence.** Native allocation and neutral Worktrunk creation use `withGitHooksDisabled`. Temporary empty hook directory and appended `GIT_CONFIG_PARAMETERS` preserve inherited config while making the override subprocess-local. Ordinary round mode remains unchanged. **Lifecycle isolation is not complete: F4 above.** |
| F3: aliased surviving log deleted | **Repaired for the reproduced case.** Admission, retention and teardown now check physical containment; existing-ancestor resolution and explicit dangling-link traversal cover absent leaf paths. Valid external aliases remain admitted. Tests cover parent alias, dangling parent/leaf, and log rebinding before release/during teardown. |
| S1: orphan reap guard | **Repaired.** The unused local `withinTarget` has been removed from `reap.ts`; shared cleanup owns the rule. |

`disposable-identity-path.selfcheck.ts` meaningfully tests switched, detached and foreign-Git rebinding through both handle release and reconstructed recovery, checks no dependency/project teardown occurs, preserves user sentinels and owner bytes, then restores the binding and recovers. It also tests genuine absent-directory recovery after a branch-delete lock failure. These are not just assertions against helper return values.

The shared cleanup regression runs a provider step that switches the checkout, then verifies refusal before removal, the surviving user file and committed progress `next: 1`. This extends the safety invariant to the existing round consumer, not only the new disposable wrapper.

## 3. Diagnostic retention / execution assessment

The formerly in-progress cohort has now been inspected in full:

- `baseline-diagnostic.ts` is a thin non-round consumer: explicit allocation inputs and native command/environment; one lease-owned execution; release; separate observed execution, retention, disposition and cleanup facts. A nonzero exit remains an observation rather than an unavailable acquisition or product verdict.
- `DisposableWorkspace.runDiagnostic` owns at most one command. It refuses a second command or one requested after release, persists a diagnostic ID with **pending** intent before launching the existing supervisor, and makes release await active execution.
- After a returned measurement, it writes a fallback output file through temporary-write/rename, computes its digest and persists **confirmed** authority before attempting external append. The externally retained transition is persisted afterward. No new teardown-progress journal was added.
- `retainWorkspaceDiagnostic` verifies fallback digest before replay. Confirmed output can be recovered to a repaired destination. Pending output remains uncertain and refuses cleanup rather than rerunning the command or fabricating an observation. A loss after append/before receipt update can repeat a diagnostic block; README explicitly says at-least-once, not exactly-once.
- A retention failure preserves the actual returned stdout/stderr in the observed result and keeps checkout/receipt for recovery. `baseline-diagnostic.selfcheck.ts` uses a real command that makes the external log a directory, verifies no dependency/project teardown begins, corrupts added authority variants and fallback bytes through storage, and then restores the destination and recovers the real output.
- `reconcileCheckProcesses` blocks release while an active/unresolved execution owns the checkout, before dependencies are released. Unknown inventory, unreadable process records and unresolved ownership are refusals, not absence. The new implementation extracts the existing runner reconciliation rather than replacing its descendant-supervision protocol.
- The native killed-owner test exercises process loss, a durable pending receipt, and fresh recovery refusal after execution ownership settles. It does not claim that missing in-flight output was retained or that production eviction was exercised.

This is a coherent repair of the diagnostic ownership/retention path. The claim is bounded to the tested process/filesystem model; write/rename plus durable receipts here are restart recovery, not a demonstrated power-loss/fsync guarantee. External output remains mutable by its owner; this operation is not an immutable evidence archive or product-certification service.

## 4. Design / ownership assessment

### Shared operations, not a second workflow

The extraction has real callers and passes the deletion test described in `BUILD.md`:

- `workspace-allocation.ts` centralizes native Git create-if-absent allocation; `worktree-registry.ts` centralizes explicit repository placement and canonical path comparison without importing round policy. `worktree.ts` keeps compatibility exports and the round wrapper.
- `workspace-cleanup.ts` is the former reap executor with the same recovery wire fields, plan labels/progress and lock semantics. Round policy still controls force/retention, approval/merged-implementation safeguards, tracker completion, archival/friction and launch bookkeeping. The disposable receipt grants acquisition/disposal authority; it does not duplicate removal-step progress.
- Cleanup reads saved authority before plan construction, compares journal bytes after lock acquisition, rejects missing/changed plan identity and out-of-range progress, commits progress only after a confirmed step, and retains incomplete authority. A null directory identity never authorizes a new target. Leaf links are identity changes; parent aliases are compared physically.
- Disposable release is memoized. Recovery is an explicit operation and checks receipt/repository/branch/project identity. It does not silently rerun a failed handle or adopt a stale registered directory. Lost allocation responses retain unknown authority rather than authorizing blind cleanup.
- `reapWorkspaceGap` remains in the existing round path before teardown construction. The neutral cleanup uses it too. Existing session/approval/tracker behavior is not relocated into a project example or weakened for non-round callers.

### Explicit project/resource binding

- Neutral imports do not select static JewelryX. The fresh-process import-resolution test checks the actual transitive runtime graph, including absence of `src/project.ts`, project implementations and `env/` from the neutral consumer.
- Lint-kit declares project-owned frozen pnpm setup, disabled lifecycle scripts, no server dependency and no project teardown. Its real example does not inherit JewelryX app/database readiness.
- JewelryX setup reuses environment/build/database owners but omits the shim/tools linking steps; pnpm install lifecycle hooks are disabled. It remains intentionally broader than API-only execution. README and BUILD disclose this rather than calling the setup narrow.
- JewelryX acquires only the selected requirements, rejects persistent requirements for a disposable caller, and passes an explicit curated environment into foreground subprocess startup. The existing round caller omits the new optional environment and retains inherited launch behavior.
- Dependency outcomes preserve none/owned/borrowed. Borrowed endpoints are not killed. Owned server recovery uses the acquisition-returned token persisted in `workspace-dependency.json`, not a later owner record readback. Replacement tokens and unknown surviving ownership refuse cleanup before database removal. The adapter's first teardown step retains server logs before subsequent removal.
- Shared Mongo infrastructure is not acquired as an owned per-workspace service. Neutral database teardown targets the workspace database rather than globally stranded test databases; this does not claim support for arbitrary machine database providers or legacy-host migration.

The retained legacy `startBaselineScratch` interface is not newly advertised as the neutral durable API. Its changed code shares probe confinement while preserving old callers. The new consumer uses the new guarded owner/executor, not that legacy helper's independent handle cleanup. Existing limitations of untouched legacy internals are not treated as newly solved guarantees.

## 5. Standards assessment

Read AGENTS.md, package/lint configuration, coding-standards and applicable error, parsing, domain-state, modules/adapters, persistence, workflow/idempotency, configuration/resources, testing, TypeScript safety, imports/exports and JSDoc references; also write-discoverable-code. Read TICKET, approved AGREEMENT, BUILD and README contract. No runtime/test edits were made by this assessor.

- New modules are subject-named, public result unions are explicit, and checks are colocated. Export comments state important ownership/ordering constraints. Compatibility re-exports are intentional rather than competing implementations.
- Persisted owner data is parsed on read, including diagnostic state/digest relationships; malformed current authority is not silently decoded as a weaker legacy shape. Recovery tests preserve rejected bytes. Shared journal parsing retains its established representation and guarded legacy-plan behavior.
- New outer lifecycle operations return unavailable/refused/incomplete facts instead of leaking ordinary setup/cleanup rejection. Project setup/RemovalStep still use the existing throw/reject convention internally, translated by their lifecycle owners; this is containment of existing provider effects, not a new claim of a granular error type for every project command.
- Explicit input records prevent the most dangerous positional repository/branch/ref mix-ups; precise branded IDs are not introduced. This follows the existing wf scalar conventions rather than promising compile-time proof of Git identity. Actual identity safety is enforced by the owning runtime guards and storage checks.
- Tests cross real Git, process, filesystem and provider interfaces. Controlled project adapters and build functions are explicit boundaries, not module-loader mocks. Generated reserved probe spelling combinations add useful invariant coverage without a runtime testing dependency.
- No runtime package dependency, project technology in core, or kit import of `env/` was added. The known boundary failure is separately accounted for below.

No additional standards-only required repair was found in this inspected diff. F4 is also a resource/side-effect ownership violation: subprocess hook policy must belong to the neutral lifecycle owner, not ambient Git configuration. Green tsc/lint cannot establish that behavioral property.

## 6. Evidence reviewed and claim limits

Evidence files below live under `docs/reviews/194/evidence/`. I inspected their recorded outcomes; I did not personally rerun the real application stacks or broad validation while the separate validators were active.

| Evidence | Actual observation / limit |
|---|---|
| `identity-path-repair-focused.log` | Final six selected files + tsc/lint: **8 checks green**. Earlier Windows `.git` overwrite fixture failures remain in the log; repaired fixture renames/restores the binding and actually exercises the case. |
| `checkout-step-guard-focused.log` | Shared cleanup + reap recovery/interruption + tsc/lint: **5 checks green**; per-provider-step switched checkout regression included. |
| `git-hook-repair-focused.log` | Final allocation/native Worktrunk selected files + tsc/lint: **4 checks green**. Includes real temp hooks, configured/inherited hooksPath and paths with apostrophes/spaces. Earlier test syntax/narrowing/parameter-escaping failures are retained and explained. Does **not** test neutral release; F4 demonstrates the missing case. |
| `diagnostic-retention-focused.log` | Final five-file cohort + tsc/lint: **7 checks green**; later execution-reconciliation follow-up also green. Fixture-hygiene native recovery follow-up green. Earlier compiler failures are not counted green. |
| `jewelryx-tool-final-result.stdout` | Real pinned app ref `929c219e660aee89d8387a2a17d3591af3f3694b`; execution **0**, API **HTTP 200 / 331 schema paths**, retention **retained**, disposition **owned**, cleanup **complete**. This stdout contains two informational setup lines before JSON; it is not a JSON-only file. |
| `portable-export-final-location.json`, `lint-kit-portable-final-result.json` | Relocated kit in a path with spaces, old export source removed, no env/runtime node_modules; actual lint-kit example at pinned `be07c4980371743a981379cf34b1f2aa08120d39`: **43 tests pass**, status **0**, retention **retained**, disposition **none**, cleanup **complete**. Target-project dependencies still apply. |
| `real-round-reviewed-cycle.json` | Post-hook-allocation-repair cycle: all six lifecycle steps **0**, **225.67s**, restored hooks. Readback identifies app ref `ac4e0d1310352946bbcdcd17ab14e0d7f1a06e3f`. This predates the last shared per-step guard; do not label it the frozen-source cycle. |
| Earlier real cycles / JewelryX recovery | Both earlier round cycles and successful API observation are retained, including the original destination-precreation failure and alias refusal followed by explicit public recovery. Later success does not rewrite those as initially clean releases. |
| `boundary-base-isolated.*`, `boundary-final-isolated.log` | Same `bin/wfk.selfcheck.ts → ../env/shim.ts` violation at the declared base and current tree. This is a known baseline failure, not a #194-added import. The whole boundary check is **not green**. |
| `project-resources-check-notes.md` and linked raw serve logs | Earlier active HTTP observation failures remain unexplained. Isolated later passes narrow observation but do not prove the original cause. Do not call the failed compatibility runs green. |

**Final evidence cut:** when read during this assessment, `final-focused-matrix.log` contained 14/27 completed checks (25 selected files plus tsc/lint), with those completed arms passing, but no final summary. `final-serve-isolated.log` and `real-round-frozen-cycle.json` were not yet present. The matrix, isolated serve and last frozen round cycle therefore remain **pending/unverified in this report**, irrespective of later completion. Their absence is not asserted to be a runtime failure. Parent must supply completed evidence and resume assessment after F4 repair; this report does not infer their outcome.

Independent execution in this final pass was only the bounded temporary-repository hook-release reproduction above. The first pass separately reproduced F1/F2/F3. No full suite was run by me; no installed hooks, machine state, real stacks, app workspaces, commit or publication were changed.

## 7. Exact assessed cohort / reproducible manifest

Base: `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`. The following deterministic manifest includes all changed/new non-documentation files (runtime, tests and README), including untracked sources. SHA-256 hashes are of exact working-tree bytes, so line-ending changes count. The sorted manifest itself has SHA-256:

```text
1bcdce7ac00bbb5f7493cf1d0f92d3bc9de1ba6bf35c7c65b345defdb5643a5c
```

Reproduce without writing files from the repository root:

```python
import hashlib, pathlib, subprocess
base = '8622ce7de2a1243f0dc34c806f5bc7682bc508fe'
tracked = subprocess.check_output(['git', 'diff', '--name-only', base], text=True).splitlines()
new = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).splitlines()
paths = sorted(p for p in set(tracked + new) if not p.startswith('docs/'))
manifest = ''.join(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() + '  ' + p + '\n'
                   for p in paths if pathlib.Path(p).is_file())
print(manifest, end='')
print('MANIFEST SHA256', hashlib.sha256(manifest.encode()).hexdigest())
```

Key inspected final byte identities:

```text
f354a436b356eb8b77573f2a6580faa0d44ab0497ef04f29f62700dd8ce7fb0f  src/worktrees/disposable-workspace.ts
76083be64a98d5d58c7414284ae59427d05dce4d51275e308c8e96254e8aa943  src/worktrees/workspace-cleanup.ts
d9a0c3a08c5364ee3afa931083bf6a1ce45a154fe021ed70f03f0ff97b44fcac  src/worktrees/git-hooks.ts
5d4849f599b66620b1a27e9f80af3b32fc4d9d6f789e0916c77d868405b7fbe2  src/worktrees/workspace-allocation.ts
98887e8993840935d6bb5ce7018511b7f7ad65f09a0b472e936c87e67ffcf8f2  env/worktrees.ts
ceb937b6d054003ab3cfecb996de8b3db3f0c43c1c8e001702aef8f890f97b0a  src/gates/baseline-diagnostic.ts
a4eda436fd0a7dc2f1d4a9c9534f9aa295a4fef4288812bf54f24b865c8c3675  src/gates/check-process.ts
de24c69c2ccca54c364b802be75ba533b754a16c9e2fc35163d42a37629f5e58  src/worktrees/disposable-identity-path.selfcheck.ts
99113c9f11e51c33b4197fb93c04ba4d7cc6d8f071aced28d9b5d29289a00f78  src/worktrees/workspace-cleanup.selfcheck.ts
20563a5e2150ac1d4751635ea13b628dc131dab2204afa106a7fe423389306ac  src/worktrees/workspace-allocation.selfcheck.ts
e0716d3be409fb56160412a529f85b6425dca85f0fc31b76ede23250aee5ad81  env/worktrees.selfcheck.ts
a0e77d35f4daa4a7c3a4b4e5f99956db6a5417966dd31df62fec31b92e7ba574  src/gates/baseline-diagnostic.selfcheck.ts
c36fd54bf8714168cc3415bc97aec025a163d54df2a9ef4c3e65a29a0b8e1805  src/worktrees/disposable-recovery.selfcheck.ts
```

Unchanged compatibility/dependency source is selected by the stated base commit, not by an assumed future HEAD. The aggregate binds the rest of the changed cohort, including both project adapters/examples, probe confinement, registry, serve/reap changes and their changed checks. Documentation/evidence are excluded from this source manifest because those were still being completed; their claims are assessed individually above.

## Required next step

Repair F4 without changing ordinary round hooks, add lifecycle/recovery hook regressions, and provide the completed final focused/isolated-serve/frozen-round evidence. Resume independent review of the repaired exact cohort. **Human final T2 remains required after a clean independent assessment; neither this report nor real HTTP/test success authorizes publication.**
