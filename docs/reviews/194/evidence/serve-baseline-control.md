# #194 bounded serve baseline control

## Verdict

**Baseline failure NOT established. Original current-tree failures unresolved.** The unchanged fixture at exact base `8622ce7de2a1243f0dc34c806f5bc7682bc508fe` passed twice. This is two direct fixture runs, not a complete suite, not validation of the current dirty implementation, and not evidence that the earlier current-tree failures were timeouts or harmless. Per the bounded investigation's stop condition, no further test or current-tree diagnostic run was made.

## Controlled execution

- Windows x64, Node **v26.12.1**, same Node version/platform as the earlier recorded diagnostic. No runtime dependencies installed or required.
- Dedicated owned detached worktree: `C:\Users\Shay\AppData\Local\Temp\wf-194-serve-base-control-0aeuUR\base`.
- Exact revision independently read back; `git status --porcelain` empty before and after both runs.
- Entry command from editing clone: `node docs/reviews/194/evidence/serve-baseline-control-run.mjs`. This evidence-only controller is preserved. It executes each unchanged fixture directly with Node, sequentially, no selfcheck runner, no tracing/preloads, source transforms, timeout edits, app stacks, or wf commands.
- Each Node subprocess had a 180-second outer controller guard; neither guard fired. Existing fixture HTTP timeout remained **2,000ms**, CLI subprocess timeout **45,000ms**, startup wait **15,000ms**. No timeouts increased.
- `git config --show-origin --get core.hooksPath` in the editing clone yielded no configured hooks path. Own worktree add/remove additionally used command-scoped `-c core.hooksPath=<owned empty-hooks directory>`. No persistent hook/config installation or changes. The fixture itself remains unchanged, including its private Git repo creation commands and stripping of inherited `GIT_*` environment variables.

Exact worktree commands (from `C:\Users\Shay\work\wf-194`):

```text
git -c core.hooksPath=C:\Users\Shay\AppData\Local\Temp\wf-194-serve-base-control-0aeuUR\empty-hooks worktree add --detach C:\Users\Shay\AppData\Local\Temp\wf-194-serve-base-control-0aeuUR\base 8622ce7de2a1243f0dc34c806f5bc7682bc508fe
git -c core.hooksPath=C:\Users\Shay\AppData\Local\Temp\wf-194-serve-base-control-0aeuUR\empty-hooks worktree remove C:\Users\Shay\AppData\Local\Temp\wf-194-serve-base-control-0aeuUR\base
```

Both exact test invocations, cwd the temporary `base` above:

```text
C:\Users\Shay\AppData\Local\mise\installs\node\26.12.1\node.exe src/worktrees/serve.selfcheck.ts
```

| Run | Started UTC (2026-10-30) | Elapsed | Exit | Result |
|---|---|---:|---:|---|
| Base 1 | 08:37:27.139 | 84.0867197s | 0 | All 15 Windows assertion arms passed |
| Base 2 | 08:38:51.226 | 87.8030113s | 0 | All 15 Windows assertion arms passed |

Raw stdout/stderr, exact command arrays, cwd, timings and status are in `serve-baseline-run-1.log`, `serve-baseline-run-2.log`, and `serve-baseline-control-results.json`. Worktree creation, HEAD readback, empty statuses and successful removal have separate `serve-baseline-*.log` files. Cleanup succeeded at 08:40:19 UTC; the entire owned temporary parent including its empty hook directory was removed. `serve-baseline-source-comparison.json` records that it no longer exists. No branch was created, no source branch moved, no commits or pushes.

### Why a Git worktree, not an archive?

The fixture creates its own disposable Git repositories under `wf-stack-lifetime-*`: it explicitly requires real fixture Git metadata (`init`, empty commit, branch, CLI `rev-parse`, state operations), and checks that `.git` survives stop. That metadata is created by the fixture, not borrowed from the source checkout. Its generated server entry imports `src/run.ts` relative to the source `WF_ROOT`; Node loads source from that root while CLI cwd is the fixture repo. A plain source archive likely suffices for this fixture's source root, but was not tested. A detached worktree was chosen for verifiable exact HEAD and clean source evidence, not because linked source-worktree metadata was proven necessary. No installed wf entry or hook was used.

## Actual conjunct evidence and limits

### Earlier current-tree observations (not rerun)

Source: existing `final-serve-isolated.log` and `final-verification-notes.md`.

1. Requested command was `node src/selfcheck.ts src/worktrees/serve.selfcheck.ts`; fixture red at **87.5s**, tsc/eslint passed. Failure: **copied/recycled PID cannot stop another worktree or erase its authority**. Logged native refusal: `wf serve: PID 102612 is not a verified foreground server in this worktree; ownership retained`.
   - Compound expression: `forged.code !== 0 && (await Promise.all(independent.map(listener => answers(listener.port)))).every(Boolean) && readFileSync(pidFile(idle), 'utf8') === bytes`.
   - The expected refusal text alone does not independently log the exit status. Individual HTTP results and byte-equality result were not captured. Because of short-circuit evaluation, the final byte comparison may not have executed. **Exact failed conjunct remains unknown.**
2. Existing one-shot in-memory fetch/PID-read tracing replay failed instead at **CI waiting metadata preserves the stack through step and next**; descendant `:58358` failed with **ECONNRESET in 1ms**, root `:58357` answered HTTP 200 in 2ms. The two CLI outputs preserved `waiting_on: "ci"`, `step: "held"`.
   - Compound expression reaches HTTP only after `ciHeld.code === 0`, `ciNext.code === 0`, and state `waiting_on === 'ci'`; the reached HTTP failure establishes that HTTP `.every(Boolean)` conjunct false in that replay. The trailing ownership-exists conjunct then short-circuits and was not independently logged.
   - This is a reset, **not an observed timeout**. PID liveness at that moment was not traced; process death is not established by the reset.
   - The copied-PID assertion passed in that replay with ownership reads unchanged at `66780` and both independent HTTP listeners returning 200. That later pass does not explain the original red.
   - Prior replay was described as `node --input-type=module -e` wrapping `globalThis.fetch` and `fs.readFileSync`, calling `syncBuiltinESMExports()`, then dynamically importing unchanged fixture. Its exact `-e` payload was not preserved in those artifacts; this report does not invent a byte-exact historical command.

### New base observations

Both targeted assertions passed in both unchanged base runs. For the copied-PID check, that means all three conjuncts evaluated truthy in each run: nonzero refusal exit, both listeners' fetch `.ok` true, and copied PID bytes unchanged. For CI-wait, both CLI exits were zero, state retained `waiting_on === 'ci'`, both HTTP `.ok` results true, and ownership file existed. These runs have no per-request tracing, status-code/timing or PID liveness instrumentation. There is **no failing base conjunct** to report.

## Compared source paths, not just shared HEAD

Current editing-tree HEAD is also `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`, but source is dirty. `serve-baseline-source-comparison.json` preserves SHA-256 of base/current files and `serve-baseline-source-comparison.diff` preserves the exact relevant dirty diff observed after the control runs. This is a source snapshot, not a current-tree test run.

- **Identical:** `src/worktrees/serve.selfcheck.ts`; `src/run.ts`; `src/round/next.ts`, `step.ts`, `round-servers.ts`; `src/process-tree.ts`, `process-cwd.ts`, `process-lock.ts`; `src/paths.ts`, `src/project.ts`, `src/worktrees/ports.ts`.
- Actual fixture path: direct `startServers` in `serve.ts` launches the generated fixture entry; that entry implements root/descendant HTTP itself and delegates non-foreground CLI commands to `run.ts`. `next`/`step` use `shouldStopRoundServers` and `stopWorktreeServers`; CI waiting is explicitly exempt from stop. Copied ownership is refused by `serverProcessOwner`/`stopWorktreeServers` before a kill. Those stop/ownership and round-lifetime functions have no dirty diff in the inspected source.
- **Changed `serve.ts`:** optional `launchEnv` threaded to `startOwnedServers`/`spawn`, and verification acquisition disposition/token fields. Fixture calls `startServers(worktree)` without launch environment/profile; `env: undefined` preserves Node's inherited environment behavior. Fixture does not call `acquireVerificationServers`. This local code inspection does not by itself prove runtime equivalence or explain the failures.
- **Changed `seams.ts`:** `createWorktree` type gains repository/setup options; erased at runtime.
- **Changed `worktree.ts`:** port/slug and registry functions extracted/re-exported from new `worktree-registry.ts`. Inspected aliases still use the same unchanged `hashPort`/`sanitizeBranch`; `urlLines` and `excludeWfFolder` remain. Thus a real dependency path differs even though the fixture itself is identical.
- **Changed project index:** imported through unchanged `src/project.ts`. Workspace setup/logging/resource APIs and stack env keys changed; `prepareServe`, direct server URL computation remain unchanged in the diff. Generated fixture foreground entry bypasses actual project serving/setup.
- **Changed `git-worktree.ts` and new allocation helpers:** worktree creation/removal paths are not invoked by this fixture. Parent's F4 repair concerns neutral branch deletion, not the fixture round stack; no attribution to that repair is supported.

## Assessment risk / stop boundary

The two base passes do not establish a historical flaky baseline and do not prove a current regression either. Current serve remains unresolved/red on the existing evidence. The prior reset and original copied-PID failure must not be relabeled a timeout, a known baseline defect, or cleared by these later passes. No speculative fix, extra retry, broad matrix, full suite, or current-tree traced run was attempted. Investigation finished well within the 15-minute scope cap; only this evidence report/controller/logs were written.
