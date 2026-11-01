# Independent final acceptance assessment R3 — #194

**Verdict: READY FOR HUMAN T2.** No required implementation repair or acceptance-evidence blocker remains for the scoped proof in the exact source cohort below. This is an independent implementation/evidence ruling, **not human T2, release approval or permission to publish**.

Assessed on 2026-10-30 against base `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`, manual branch `feat/194-tool-only-workspaces`. I did not implement or repair the change. Earlier preliminary, original and R2 assessments remain unchanged. Their historical repair/blocked verdicts remain accurate for their respective cuts; this report supersedes the R2 compatibility blocker using the additional diagnosis and corrected observation fixture.

## 1. What changed since R2

The only new non-documentation cohort delta is `src/worktrees/serve.selfcheck.ts:58–60`: its private `answers()` health request sends `Connection: close`, with an incident comment stating the listener-lifetime purpose. No production code changed.

This is independently checked by source hashes: removing this newly changed fixture from the current manifest reproduces R2's exact manifest hash `5ae4571fc3e7f14d531353101177efeab3367fa753d6aaed254e9c5f14204824`. Thus the earlier post-F4 code review, bounded hook reproduction, actual JewelryX consumer and regenerated relocated lint-kit proof still apply to the same runtime, not an assumed equivalent revision.

## 2. Compatibility blocker disposition

**The fixture correction is acceptable and does not hide an established lifetime/ownership regression.** This ruling is based on the narrowed current-tree observation, preserved substantive assertions and independent corrected-fixture execution—not merely later green results.

### Preserved failure evidence

I read `serve-baseline-control.md`, `serve-diagnosis.md`, the preserved `serve-observe.mjs` controller, relevant raw `serve-observe-current.log` events, and the final corrected-run logs.

- The exact-base fixture passed twice. **A failing baseline was not established.** This is not a known-baseline-flake waiver.
- The original isolated current copied-PID compound assertion remains red with its exact failed conjunct unrecorded. Its first replay failed a different CI-wait HTTP observation with ECONNRESET after 1ms; native process identity/liveness was not traced there. Neither historical run is retroactively green or assigned an invented cause.
- The sharper **pre-correction current-tree** observer reproduces the **same copied/recycled-PID assertion** as red. It does not rewrite the source or turn the failed result into success: its wrapper records the failure, performs a separate fresh HTTP control, then rethrows the original fetch error.
- In that reproduction, the native stop CLI returns **status 1** with the expected ownership refusal. The pooled root request fails **ECONNRESET in approximately 1.34ms**; the other listener answers **200**. The separately issued fresh root request immediately answers **200**, body **`fixture stack`**. The fixture-recorded PID **73796** is present before/after the control and its running-token receipt/`serve.pid` remain available. This establishes an HTTP-observation failure while the listener remains reachable through a fresh connection, rather than establishing that refusal stopped the listener.
- `process.kill(pid, 0)` establishes PID presence, not native birth identity. The saved owner receipt contains birth evidence, but the observer did not collect a matching native birth snapshot at that instant. I do not claim that the reproduction independently proves native process identity across the interval.
- The smaller HTTP/blocking-child probes passed. The underlying reset trigger was **not minimized or proven**. No established Undici defect, timeout, idle-expiration mechanism or exact common cause for all historical failures is claimed.

### Why changing the observation is sound

This fixture owns a detached root HTTP process and its descendant, starts them once per case, and uses normal production CLI/round dispatch/stop paths. Its purpose is to determine whether those listeners and ownership survive or stop across synchronous CLI actions. HTTP pooled-connection continuity is not the feature under test, nor a promised wf resource invariant.

Using `Connection: close` consistently on these fixture health requests removes dependence on retaining a reusable socket across the blocking CLI interval. It still makes a real HTTP request to the actual listener, with the same 2,000ms deadline. A failed request still returns false. There is no added retry, extra grace period, fabricated success, skipped platform arm or production-code change. The separate diagnostic fresh request was a control measurement, **not** a retry inserted into the assertion.

I reread the complete corrected fixture. All substantive predicates remain:

- native CLI exit and expected dispatch/state behavior;
- root **and descendant** response preservation during build and CI waits;
- confirmed shutdown observations after stop/idle transitions;
- unchanged ownership bytes for copied/malformed PID cases;
- independent fixture PID liveness checks after stale-PID round transitions;
- refusal to kill an unrelated process, including an agent in the same checkout;
- refusal to restart over unresolved authority;
- retained worktree/Git metadata and unchanged legacy state.

The same helper also observes shutdown without depending on an old pooled connection. A stopped listener must still become unavailable; changing a client connection policy does not grant process-kill authority or weaken the existing production process/birth/cwd checks. The Windows run does not execute the existing POSIX-only ignores-TERM arm; that limitation is unchanged.

Complete low-level explanation of every earlier reset is not needed to test this actual lifetime invariant through a fresh connection. The new control identifies a concrete observation mismatch, and the correction measures the intended invariant directly without removing it. I therefore close R2's compatibility acceptance blocker while retaining the unresolved low-level reset history as a claim limit.

## 3. Verification of the corrected fixture

| Evidence | Actual result |
|---|---|
| `serve-fresh-connection-focused.log` | `node src/selfcheck.ts src/worktrees/serve.selfcheck.ts`: **3/3 green**, including tsc/eslint; fixture **99.0s**, total **101.4s**. Focused, not full suite. |
| `serve-fresh-connection-replay.log` | Separate direct corrected-fixture execution: **exit 0**, all **15 Windows arms green**. |
| Independent R3 execution | I ran **one** bounded `node src/worktrees/serve.selfcheck.ts` against this exact cohort, outer guard 180s. **Exit 0**, all **15 Windows arms green**, including both the copied/recycled-PID and CI-wait preservation cases. No tracing, rewritten source, real application or installed hook was used. This direct run does not itself claim tsc/lint or a full-suite result. |

These are results of the **corrected observation fixture**, not green reruns of the earlier pooled fixture. The old failures remain in their raw evidence.

## 4. Complete implementation ruling

R2's implementation findings were closed against the unchanged post-F4 runtime. I retain that judgment, with the following concrete scope:

| Area | Acceptance judgment |
|---|---|
| Exact acquisition/disposal identity | Repaired. Switched, detached, rebound Git metadata, replacement directory/resource, advanced branch and stale authority are guarded; public tests preserve replacement work and receipts. Guarded steps revalidate after provider effects, while genuine absent-directory recovery resumes the saved plan. |
| Hook isolation | Repaired. Native/Worktrunk neutral allocation and neutral branch deletion use transient subprocess hook suppression. Normal release, setup-failure cleanup and fresh recovery are tested. Ordinary round/Git hook behavior is unchanged. My R2 public reproduction independently verified release/recovery suppress hooks and ordinary Git still executes them afterward. |
| Surviving diagnostics | Repaired. Physical destination confinement covers parent aliases and dangling/redirected links. One lease owns one diagnostic; pending intent precedes execution, digest-confirmed fallback precedes external retention, and execution/process reconciliation precedes dependency teardown. Confirmed output is explicitly recoverable; pending output stays uncertain and is never rerun. |
| Shared allocation/cleanup ownership | Accepted. Raw allocation and the existing reap executor have real round/non-round callers. The owner receipt is acquisition/disposal authority, not a parallel removal-progress journal. Plan/lock/identity/progress guards stay in the shared executor; round approval/tracker/session/archive/retention policy stays in the round caller. |
| Project/resource binding | Accepted for the two demonstrated adapters. Lint-kit has frozen dependency setup and no application stack. JewelryX explicitly admits the requested dependency profile, retains borrowed resources, persists the acquisition-returned token and refuses unknown/replacement ownership. Child launch environment is explicit; setup breadth is disclosed separately from API-only admission. |
| Legacy round behavior | Source guards remain; final shared-guard real round cycle and corrected native lifetime/ownership fixture provide the required measured compatibility evidence. No arbitrary-project round support or live-round migration is implied. |
| Standards/design | No remaining required standards repair. Subject-named modules, ownership comments, parsed durable authority, explicit public outcomes and real-interface regressions align with the repository and reviewed standards. F4 and the observation correction are surgical. There is no new runtime package, project registry or kit-to-env dependency. |

The deletion-test rationale remains substantive: without the lifecycle owner, callers would reconstruct identity, intent, dependency/diagnostic order and recovery; without the extracted executor, teardown progress would be duplicated. The examples keep command selection/interpretation, not disposal coordination.

## 5. Combined evidence and revision limits

I retain R2's inspected receipts and revision distinctions:

- **Pre-F4** final matrix: **25 files + tsc/lint, 27/27 in 419.0s**. This is focused, not a full suite and not retroactively a post-F4 whole matrix.
- **Post-F4** hook/disposable/diagnostic/allocation/identity/Worktrunk cohort: **7 files + tsc/lint, 9/9 in 295.8s**. Together with the current corrected serve check above, this validates the changed cohort without claiming an unrun monolithic suite.
- **Post-F4 real JewelryX**: app ref `929c219e660aee89d8387a2a17d3591af3f3694b`, API **HTTP 200 / 331 paths**, execution **0**, retention **retained**, dependency **owned**, cleanup **complete**. DEP0190 remains visible and is neither concealed nor called a demonstrated exploit/failure.
- **Regenerated post-F4 relocated kit / actual lint-kit consumer**: ref `be07c4980371743a981379cf34b1f2aa08120d39`, **43/43 tests**, execution **0**, retention **retained**, dependency **none**, cleanup **complete**. The relocated kit has no env/runtime node_modules; the target project's own dependencies/prerequisites still apply.
- `f4-cleanup-postconditions.json` reports checkout, owner and journal absent for both actual post-F4 consumers.
- **Final shared-guard real round**: six lifecycle steps **0**, **204.33s**, all three HTTP readbacks **200**, app ref `ac4e0d1310352946bbcdcd17ab14e0d7f1a06e3f`, hooks restored. It predates the neutral-only F4 fix, which leaves this round path unchanged; it is not mislabeled as the identical neutral source revision.
- The known **boundary check remains red** at `bin/wfk.selfcheck.ts → ../env/shim.ts`, independently reproduced at the declared base. No #194 import introduced that edge. This is not a green boundary/full-suite claim.

Historical failed allocation, alias cleanup, compiler/fixture and HTTP runs remain recorded with their actual explanations or uncertainty. No full suite was run. Actual project evidence proves the recorded Windows environment and refs, not all operating systems or providers.

## 6. Exact final assessed source

The sorted exact-byte manifest now contains **41 changed/new non-documentation files**, including README, runtime, new files and changed tests. Its SHA-256 is:

```text
0b62b3266719ef19b893a630fbd08880e5651c6931beaa4de47600e223a6b961
```

Key identities:

```text
07d674c3f4569560316cd1585388a85ba12f1b59a6c6ad13e0ae563e6ce4a8b6  src/worktrees/serve.selfcheck.ts
897585987166a05bde39d513216748709380f722ec48fba43b5db5a5c84a872f  src/worktrees/serve.ts
c42512aa168c5ac5ab3e886935e5cf4a5a6f4d33227c32e70e418eec139bb39f  src/worktrees/disposable-workspace.ts
86f4a93f2fae954b43b9e2dd86f6c15fd7b65564e7ede7b9a447cbeee830b9af  src/worktrees/disposable-hooks.selfcheck.ts
76083be64a98d5d58c7414284ae59427d05dce4d51275e308c8e96254e8aa943  src/worktrees/workspace-cleanup.ts
```

Reproduce the full manifest read-only from the repository root:

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

Working-tree byte hashes count line endings. Unchanged source is selected by the stated base, not by an assumed future HEAD. Documentation/evidence are excluded from the source manifest and assessed by the named records above. Subsequent source changes require an updated identity/review.

## 7. Final limits and handoff

No remaining required repair or evidence blocker is asserted for #194's approved bounded proof. Known limits remain: no arbitrary-project rounds, no scenario/product certification, no deployed eviction or power-loss/fsync guarantee, potentially broad JewelryX setup, and explicit inspection/refusal for unknown mutations/processes or pending output. The low-level pooled-reset trigger remains unproven; correcting the lifetime observation does not claim to solve HTTP pooling generally.

Only this new report was written by the assessor; no source/test edits, real app stacks, installed hooks, full suite, commit or publication. One bounded public fixture run was performed as recorded above.

**Ready for the actual human's final T2 review of the current implementation and evidence, with the known baseline boundary failure, retained historical failures and these claim limits visible. Publication remains unauthorized until that human approval and the project's delivery requirements are satisfied.**
