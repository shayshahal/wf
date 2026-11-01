# Preliminary independent implementation assessment — #194

**Disposition: repair; not final approval.** Independent first pass against base `8622ce7de2a1243f0dc34c806f5bc7682bc508fe`, branch `feat/194-tool-only-workspaces`, working-tree sources on 2026-10-29. Runtime/tests were not edited. Only this report was written. No application-round ceremony, real stacks, hook installation, broad selfcheck suite or publication was performed.

Diagnostic-retention source/selfchecks are concurrently changing. This report does not approve that cohort; full frozen-source/evidence assessment is still required. Line references describe this first-pass snapshot.

## Intent / behavior / evidence

### F1 — High: switched checkout is deleted as disposable, including replacement work

**Locations:** `src/worktrees/disposable-workspace.ts:160–177`, especially `confirmAuthority` at 164–170; `src/worktrees/workspace-cleanup.ts` registration guard inside the removal loop.

The guard checks the original branch's ref and the directory identity, but never establishes that the directory is still the checkout of that branch. The shared guard filters registrations by the original branch, so a switch to another branch in the same directory makes the relevant registration disappear from its view. Unchanged original ref plus unchanged directory inode is insufficient authority to delete the replacement checkout.

**Independently reproduced through the public interface:** initialize an isolated temporary Git repository; acquire `bench/switch` with an inert explicit no-stack project; run `git -C <checkout> switch -qc replacement-work`; write untracked `new-user-work.txt`; call the acquired handle's `release()`.

Observed output:

```json
{"case":"switched-checkout","release":"complete","replacementCheckoutExists":false,"replacementBranch":"replacement-work","originalBranch":""}
```

Release removes the replacement checkout and its uncommitted file, deletes the original baseline branch, and reports complete. This violates the approved exact-identity/replacement-work/no-adoption contract. Existing replacement-directory and advanced-original-ref checks do not cover this case.

**Required repair:** establish the target checkout's actual Git registration/branch/ref identity before project teardown and deletion, not merely the original branch's head; refuse switched/detached/rebound targets while preserving their checkout and authority. Preserve recovery after a genuinely completed directory-removal step. Add public lifecycle regressions for switched and detached checkouts, including fresh explicit recovery.

### F2 — High: neutral native-Git allocation executes repository hooks

**Locations:** `src/worktrees/workspace-allocation.ts:24–26,54–58`; also `src/worktrees/git-worktree.ts:33–35` (`setup: 'none'` returns only after `addWorktree`).

The neutral path suppresses project setup/Worktrunk hooks but invokes ordinary `git worktree add` without disabling Git hooks. Git runs `post-checkout` for worktree creation. Such a hook can install shims/link behavioral tools before the explicit adapter ever gets control. This breaks T1's neutral-setup exclusion, including subprocess hooks; package `--ignore-scripts` does not cover Git hooks.

**Independently reproduced through the public allocator:** an isolated temporary repo's `.git/hooks/post-checkout` contains `printf hook-ran > "$PWD/neutral-hook-marker"`. With the kit's default native Git backend, `allocateWorkspace(...)` returns:

```json
{"case":"native-hook","allocation":"allocated","hookMarker":true}
```

The marker is in the newly allocated checkout. No real machine hooks were installed or changed; the temporary repository was removed afterward.

**Required repair:** neutral allocation must disable repository Git hooks for its Git mutations, including a configured `core.hooksPath`, without changing the round caller's established hook semantics or persisting a changed repository hook configuration. Verify both default hooks and configured hook-directory cases; inspect the machine backend's underlying Git invocation too rather than equating Worktrunk `--no-hooks` with Git-hook suppression.

### F3 — High: aliased diagnostics path can be inside the checkout and is destroyed

**Location:** `src/worktrees/disposable-workspace.ts:212–218` (lexical `relative(path, log)` confinement); release at 177 and 188. This concerns the surviving-destination boundary and should be coordinated with the current retention builder.

The outside-checkout test compares path spellings, not physical paths. A parent junction can make an apparently outside log reside inside the disposable checkout. This is particularly relevant because the real machine evidence already requires parent-alias support.

**Independently reproduced on this Windows machine:** create a temporary repo and a second parent junction pointing to that repo; supply the log as `<alias>/.claude/worktrees/bench-log-alias/output.log` while allocation uses the original repository spelling. An inert no-stack adapter acquires successfully; execute a native Node command that prints `123`, then release.

Observed:

```json
{"case":"aliased-inside-log","acquisition":"ready"}
{"diagnostic":"retained","logExistsBefore":true}
{"cleanup":{"kind":"incomplete","reason":"ENOENT opening the aliased output.log after removal"},"logExistsAfter":false,"checkoutExists":false}
```

The actual full cleanup result included its retained journal path. Incomplete cleanup does **not** rescue diagnostics: the output and fallback were both inside the removed checkout. This is not the retention append failure already being repaired; admission allowed a non-surviving destination.

**Required repair:** reject physical containment using canonical existing ancestors (including not-yet-created leaf paths), and retain that destination invariant at the destructive boundary. Cover parent junction/symlink aliases and a log symlink into the checkout through the public lifecycle. Do not erase the failed result by claiming that `incomplete` implies output survived.

## Design / ownership

The overall extraction is directionally consistent with the approved agreement:

- `workspace-cleanup.ts` owns the extracted existing reap journal executor; the disposable owner receipt is acquisition/disposal authority, not another teardown progress journal.
- `reap.ts` retains native-session, merged-implementation, tracker-completion, force/retention and round archival policy. The core journal preserves plan identity and progress, locks cleanup, and refuses replacement directory identities and changed journal bytes.
- Project setup/dependency/teardown are explicitly bound through `WorkspaceProject`; lint-kit does not inherit JewelryX setup or app dependencies. The JewelryX adapter rejects persistent leases, persists the acquisition-returned server token, and does not reconstruct ownership by adopting a later server record.
- Setup breadth is documented separately from API-only execution; explicit Node/project builds still run, and neutral setup omits the round's tools/shim steps and package lifecycle scripts.
- The existing owners/deletion-test reasoning in `BUILD.md` is useful: raw allocator, process supervisor, serve lease and reap executor have actual shared callers rather than an example script coordinating its own cleanup.

These boundaries do not substitute for the missing identity and physical-path invariants in F1–F3. Final review must also cover the current diagnostic-retention changes, full release/failure ordering and the frozen checked cohort.

## Standards

### S1 — Low: cleanup extraction leaves an orphaned local guard

`src/worktrees/reap.ts:186` declares `withinTarget`, but its call sites moved into `workspace-cleanup.ts` and the local is now unused. Remove this change-created orphan rather than leaving two apparent homes for the safety rule. This follows AGENTS.md's surgical-change/orphan guidance and the discoverability skill's one-definition-site principle. No unrelated old cleanup is requested.

New subject-named modules and colocated checks are generally searchable; public contracts distinguish refused/ready, none/borrowed/owned, and complete/incomplete/refused. This preliminary pass is **not** a complete standards clean bill: final diagnostic API/parser/error and recovery changes still need review after freezing. The standards were read with their applicable error, parsing, state, module, persistence, workflow, resource/configuration, testing, TypeScript, import/export and JSDoc references. Repository package/lint policy and AGENTS.md were also inspected.

## Evidence and limits

I read `TICKET.md`, human-approved `AGREEMENT.md`, `BUILD.md`, README's tool-only contract, the tracked diff, and the new allocation/cleanup/project/probe/registry runtime and relevant colocated checks. I inspected the disposable lifecycle for identity/release authority but did not judge the concurrently changing retention implementation final. Independent execution was limited to the three controlled, isolated temporary-repository public-interface probes above; all temporary resources were removed. These are not a focused selfcheck-suite, tsc or ESLint result.

Parent-provided evidence inspected/recognized:

- Both real round cycles are recorded; `real-round-final-cycle.json` reports all six steps exit 0, including editing-hook install and installed-hook restoration. These support the measured Windows lifecycle, not arbitrary-platform or arbitrary-project behavior.
- `lint-kit-real-result.json`: 43 Node tests pass, dependency disposition none, complete release.
- JewelryX real tool evidence records API HTTP 200 / 331 paths; the initial alias-related release refusal and subsequent public recovery are retained rather than rewritten as an initially clean release. `jewelryx-tool-recovery-result.json` reports complete recovery.
- Relocated export checks are recorded; final frozen export/source coverage remains for the final pass.
- `boundary-base-isolated.*` and `boundary-final-isolated.log` both identify `bin/wfk.selfcheck.ts` importing `../env/shim.ts`. This is reproduced at the declared base, not a newly introduced boundary regression.
- `project-resources-check-notes.md` retains the earlier unstable active HTTP observations and explains the limits of later isolated replays. Their underlying cause is not established. Those failed runs are **not** green compatibility runs.

**Next:** builder repairs F1–F3 and S1; parent freezes sources and completes final measured evidence; resume independent assessment over that exact final cohort. No final approval or publication is authorized by this report.
