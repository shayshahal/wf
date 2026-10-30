# Independent assessment R2 — #194

**Verdict: BLOCKED on unresolved round/serve compatibility evidence.**

**Implementation findings F1–F4 and S1 are closed for the inspected source and reproduced cases. No additional concrete code defect was established in R2. This is not a clean acceptance ruling or authorization for final T2/publication.** The isolated legacy serve check remains red; baseline-control evidence was not yet available at this assessment's evidence cut. Do not translate that uncertainty into either a demonstrated regression or a waived safety failure.

Assessed independently on 2026-10-30 against base `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`, manual branch `feat/194-tool-only-workspaces`. I did not build or repair the change. `ASSESSMENT.md` and `ASSESSMENT-PRELIMINARY.md` remain unchanged. This report updates the complete-behavior assessment with the frozen F4 repair, new test and completed evidence. Exact updated source identity is below; it is **not** the prior manifest.

## 1. Behavior: F4 repair verified independently

`src/worktrees/disposable-workspace.ts` now imports `withGitHooksDisabled` and invokes the neutral branch's compare-and-delete `git update-ref -d` inside that helper, supplying its subprocess environment. The head/ref check and original expected-ref argument remain intact. Fresh recovery and failed-acquisition cleanup use the same release owner, so the change covers these routes without creating a second cleanup implementation. Ordinary round reap/native creation paths are unchanged by this repair.

I reran the original F4 public-interface reproduction against this source, extended to an interrupted release and reconstructed recovery. This was a bounded isolated temporary repository with an explicit inert/no-stack adapter and its own `reference-transaction` hook, not installed machine hooks or a real application.

Actual independent output:

```json
{"afterAcquire":false,"release":"complete","interrupted":"incomplete","recovery":"complete","afterReleaseAndRecovery":false}
{"ordinaryHookStillRuns":true}
```

The marker remains absent through neutral allocation, normal release and fresh recovery; an ordinary Git ref mutation afterward executes the hook. All temporary fixtures were removed. This directly closes the earlier F4 reproduction, rather than relying solely on the builder's green tests.

The new `disposable-hooks.selfcheck.ts` additionally exercises default and configured hook directories, apostrophes/spaces in paths, normal release, a failed teardown followed by fresh recovery, setup-failure cleanup and unchanged ordinary Git afterward. It enters through the real lifecycle and real Git hooks, not a module mock. Inherited command-scope hook configuration remains covered by the existing allocator/Worktrunk tests and unchanged suppression helper; the new test does not itself set an inherited command-scope override. The suppression remains transient and does not rewrite repository `core.hooksPath`.

## 2. Complete behavior and design disposition

The full prior review remains applicable to unchanged source; the updated cohort was checked against that source identity, not treated as a new unreviewed implementation.

| Concern | Current judgment |
|---|---|
| F1: exact checkout identity | Closed. The disposable owner checks branch/ref, registration, repository/common directory, top-level path and linked-worktree back-reference before dependency release and destructive effects. Switched/detached/foreign-bound work is retained. The shared executor checks target registration per step, including after provider effects. |
| F2/F4: behavioral hooks | Closed for neutral Git allocation and disposal mutations. Native and Worktrunk allocation plus neutral branch deletion use the transient empty hook-directory owner. Ordinary round hooks remain unchanged. The demonstrated project installs disable package lifecycle hooks and omit behavioral shim/link steps. Explicit project build commands still run; this is not a sandbox for arbitrary caller commands. |
| F3: surviving destination | Closed for the reproduced physical-alias case. Admission, retention and per-effect guards use physical containment with absent-leaf/dangling-link handling. Tests reject redirection into the checkout and retain valid external aliases. |
| S1: orphan reap guard | Closed; the extraction-created unused local was removed. |
| Allocation authority | Exclusive owner reservation precedes allocation. Native branch creation uses create-if-absent and compare/delete on failure. Existing/unknown branches and workspaces are not adopted. Lost/unconfirmed mutations retain uncertainty rather than authorizing removal. |
| Cleanup/recovery | One shared removal-progress journal, with plan identity, lock, directory identity and committed step progress. The separate disposable owner is acquisition/disposal authority, not another teardown journal. Release is memoized; explicit recovery is required after incomplete/refused cleanup. Absent-path recovery is supported without granting authority over replacements. |
| Diagnostic ownership | One command per lease, pending intent before execution, fallback output plus digest-confirmed authority, external retention before teardown. Release waits for execution. Unknown execution ownership blocks dependencies/teardown. Confirmed output can be recovered; pending output refuses rather than reruns. Append is explicitly at-least-once. |
| Dependencies | None/owned/borrowed remain separate. Unknown is not absent. JewelryX persists the acquisition-returned token, retains borrowed resources and refuses replacement/unknown ownership. Lint-kit binds no server dependency. |
| Project/policy separation | Explicit project binding reaches the selected subprocess environment. Neutral imports do not select static JewelryX or env. Round agreement/delivery/tracker/session/retention policy stays outside shared mechanics. Both actual callers use shared owners. |
| Existing round compatibility | Source inspection finds no F4 change to the ordinary round path. Real round-cycle evidence is green. **Acceptance remains blocked by the separate red serve-preservation compatibility check discussed below.** |

### Ownership/deletion test

The existing allocator, serve lease, check supervisor and reap executor remain the effect owners; examples do not reconstruct their ordering or teardown. Removing the new disposable owner would spread allocation intent, checkout identity, output retention, process reconciliation and recovery coordination into callers. Removing the explicit project adapters would either reintroduce static JewelryX setup into lint-kit or force provider behavior into the neutral service. The extraction therefore has substantive ownership, not forwarding-only abstractions or a speculative project registry.

### Standards

The earlier standards assessment is retained: subject-named modules, explicit public result unions and useful ownership comments, real-interface tests, read-time parsing of durable authority, no runtime dependencies, no newly introduced kit-to-env edge. Internal throwing setup/removal providers are translated by the outer lifecycle owner in the established repository convention. No new unrelated cleanup, type assertion or speculative API was introduced by the two-line production F4 repair. The new test is colocated and checks externally visible hook/resource behavior.

The standards/readability rules do not justify calling a red safety compatibility test green. No standards-only required code repair was newly identified in R2.

## 3. Evidence: revision boundaries and actual outcomes

All named evidence is under `docs/reviews/194/evidence/`. These recorded real runs were inspected, not rerun by this assessor. No full suite is claimed.

| Evidence | What it establishes |
|---|---|
| `release-git-hook-red.json` | Parent's separate pre-repair F4 reproduction. This corroborates the original independent failure; it does not itself establish repair. |
| `disposal-hook-repair-focused.log` | **Post-F4** seven selected files plus tsc/eslint: **9/9 pass in 295.8s**, concurrency 2. Includes disposable hooks/lifecycle/recovery, baseline diagnostic, allocation, identity/path and actual temporary Worktrunk integration. |
| `jewelryx-tool-f4-result.json`, `.stdout`, `.stderr`, `.log` | **Post-F4** actual tool consumer at app ref `929c219e660aee89d8387a2a17d3591af3f3694b`: status **0**, API **HTTP 200 / 331 paths**, retention **retained**, dependency **owned**, cleanup **complete**. DEP0190 warning remains visible; it is not silently classified as a lifecycle failure or an observed exploit. |
| `portable-export-f4-location.json`, `lint-kit-portable-f4-result.json` | Newly generated **post-F4** export relocated to a path with spaces; old export source removed; no env/runtime node_modules in kit. Actual lint-kit example at `be07c4980371743a981379cf34b1f2aa08120d39`: **43/43 tests**, status **0**, retention **retained**, dependency **none**, cleanup **complete**. Target-project dependency installation still applies. |
| `f4-cleanup-postconditions.json` | Both actual post-F4 checkouts, owners and cleanup journals reported absent after release. |
| `real-round-frozen-cycle.json`, `real-round-frozen-readback.log` | Last shared-guard real round proof: six lifecycle steps **0**, **204.33s**, all three app responses **200**, recorded running server ownership, app ref `ac4e0d1310352946bbcdcd17ab14e0d7f1a06e3f`; installed hooks restored. This cycle **predates the F4 neutral-only change**. It exercises the unchanged ordinary round path, not the identical post-F4 neutral source. |
| `final-focused-matrix.log` | Completed **pre-F4** matrix: 25 selected files plus tsc/eslint, **27/27 pass in 419.0s**. This is a completed focused result, but not a post-F4 whole-matrix result or a full suite. Post-F4 focused coverage is the separate 9/9 cohort above. |
| `final-serve-isolated.log`, `final-verification-notes.md` | **RED**, with two distinct failed runs. Neither is erased by the matrix, actual cycles or later diagnostic behavior. Details below. |

Earlier baseline allocation/recovery, real lifecycle and retention failure records remain as judged in `ASSESSMENT.md`. The boundary failure at `bin/wfk.selfcheck.ts → ../env/shim.ts` is independently recorded at the declared base as well as the current tree; it remains a known baseline failure, not a #194-added edge and not a green boundary result.

## 4. Acceptance blocker: unresolved serve compatibility failure

The failed assertions concern ownership refusal and preserving active listeners, which are part of the existing-round compatibility promised by the agreement. They cannot be waived solely because the native CLI printed the expected refusal or a different real lifecycle passed.

### Original isolated run

`final-serve-isolated.log` records the selfcheck runner's isolated `serve.selfcheck.ts` result: tsc/eslint pass, serve fails in 87.5s. The failed assertion is **“a copied/recycled PID cannot stop another worktree or erase its authority.”** The CLI correctly says that PID 102612 is not a verified foreground server and ownership is retained.

That assertion also requires both independent listeners to answer and PID authority bytes to remain unchanged. The original run did not log its individual conjunction values. Therefore its failed conjunct and underlying cause are **not established**. The correct refusal message alone is not proof that every safety condition passed.

### Observation-only diagnostic replay

The replay is also **red**, at a different assertion: **“real CI waiting metadata preserves the stack through step and next.”** At that observation, the descendant listener reports **ECONNRESET after 1ms**; the root answers **HTTP 200 after 2ms**. The fixture timeout is **2,000ms**. This is an observed reset, not an observed timeout. Native process liveness was not separately traced there, so the reset does not establish that the listener process died or was killed.

The copied-PID case passes in the replay, with unchanged forged PID bytes and both listeners answering. This does **not** explain or erase the original failure. Earlier HTTP instability is likewise retained with no invented common cause.

### Required closure

At this report's evidence cut, `serve-baseline-control.md` was not present; its bounded baseline/current investigation is **pending**, not assumed to reproduce at base or to pass current. I find no concrete source-based serve regression from the F4 neutral-only delta, but source inspection cannot replace the missing diagnostic evidence.

**This is an acceptance blocker, not a demand for speculative timeout tuning or blind reruns.** Review the bounded control evidence when available:

- If it identifies a changed-behavior safety regression, repair it and add focused regression evidence.
- If it establishes the same observation failure under the unchanged baseline paths, report exactly what is equivalent and what remains unknown; an independent evidence ruling must explicitly determine whether it is a known baseline/test-observation limitation rather than a #194 regression.
- A later pass alone does not explain either failed run. No timeout/cause claim is permitted without measurements, and neither test should be relabeled green.

No code repair is prescribed without that diagnosis. The implementation findings are closed, but **clean acceptance remains withheld** pending this compatibility disposition.

## 5. Exact updated source identity

The sorted manifest of every changed/new non-documentation file now contains **40 files** and has SHA-256:

```text
5ae4571fc3e7f14d531353101177efeab3367fa753d6aaed254e9c5f14204824
```

This differs from the prior report's `1bcdce7a…` manifest. Hashes use exact working-tree bytes, including line endings. Key updated and unchanged identities:

```text
c42512aa168c5ac5ab3e886935e5cf4a5a6f4d33227c32e70e418eec139bb39f  src/worktrees/disposable-workspace.ts
86f4a93f2fae954b43b9e2dd86f6c15fd7b65564e7ede7b9a447cbeee830b9af  src/worktrees/disposable-hooks.selfcheck.ts
d9a0c3a08c5364ee3afa931083bf6a1ce45a154fe021ed70f03f0ff97b44fcac  src/worktrees/git-hooks.ts
76083be64a98d5d58c7414284ae59427d05dce4d51275e308c8e96254e8aa943  src/worktrees/workspace-cleanup.ts
897585987166a05bde39d513216748709380f722ec48fba43b5db5a5c84a872f  src/worktrees/serve.ts
```

The previous report's listed key source/test hashes all still match except `disposable-workspace.ts`; the new hook test is additional. The complete manifest is reproducible read-only from the root:

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

Unchanged compatibility source is identified by the declared base; documentation/evidence are deliberately outside the runtime manifest and judged by named receipts above. Subsequent source changes require a new identity/review, not reuse of the old hash.

## 6. Limits and next step

This is bounded two-project composability evidence on the recorded Windows environment/refs. It does not establish arbitrary-project rounds, power-loss durability, deployed eviction, scenario correctness or product certification. Setup remains broader than API-only admission; shared infrastructure is not per-workspace owned. Unknown mutations/processes and pending output may require inspection rather than automatic adoption/deletion.

Only `ASSESSMENT-R2.md` was written by this assessor. No source/test edits, actual apps/global hooks, full suite, commit or publication were performed. Independent execution was the bounded temporary-repository F4 repair/recovery reproduction above.

**Next: supply and independently assess the bounded serve baseline/control evidence. No remaining implementation repair is currently established; no clean acceptance is yet issued. Human final T2 remains required after compatibility closure and a clean independent ruling.**
