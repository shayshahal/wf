## Result: read-only interface investigation for #194

**Verified base:** `8622ce7de2a1243f0dc34c806f5bc7682bc508fe` in `C:/Users/Shay/work/wf-194`. Read #194 and #192 through `gh`, repository instructions, allocation/setup, server leases, scratch teardown, reap recovery, project exports, machine hooks, and lint-kit’s actual scripts/prerequisites.

**Evidence classification:** source inspection only. I ran no selfchecks, dependency installations, servers, removal callbacks, lifecycle cycles, or runtime experiments. I changed no files. A later status showed `?? docs/reviews/194/`, apparently another participant’s work; I did not create or inspect it.

### Main recommendation

Make **one shared workspace-ownership module**, extracted from existing allocation and reap recovery, with the baseline diagnostic as the first non-round consumer. Keep round policy outside it. Do **not** promote `startBaselineScratch()` unchanged: it reuses removal steps but does not currently share reap’s durable recovery guarantees.

The demonstrated coordination pattern is:

> reserve an isolated workspace → project setup → acquire declared execution dependencies → wait for actual readiness → run caller’s explicit diagnostic → retain diagnostics → release owned dependencies and workspace → report confirmed completion or recoverable incompletion.

Today the pieces exist, but a caller must know too many ordering and recovery details. Hiding that coordination earns depth; renaming subprocess commands does not.

### Existing implementation and gaps

| Evidence | What source establishes |
|---|---|
| `src/worktrees/worktree.ts:createWorktree` | Shared destination/naming and machine allocation seam already exist. **Repository selection currently relies on ambient cwd**, despite scratch accepting `toplevel`. |
| `src/worktrees/git-worktree.ts:runSetup/createWorktree` | Parallel project setup, actual step failures, and retained failed worktree. Setup currently imports static project exports. |
| `src/gates/baseline-run.ts:startBaselineScratch` | Exclusive scratch reservation; explicit ref and probe inputs; path/symlink protection; failed-acquisition cleanup; memoized removal protecting against repeated stale-handle execution. |
| `src/gates/baseline-run.ts:removeScratch` | Retains server logs before destruction; preserves checkout on failed retention; uses shared `removalPlan`/`runRemovalStep`. Its `{branch,path,token}` recovery record **has no progress, plan identity, directory identity, or supported recovery executor**. Crash leftovers currently demand manual removal. |
| `src/worktrees/reap.ts:runReap` | Durable ordered progress, plan identity, directory identity, branch re-registration checks, cleanup lock, survivor cwd, replacement refusal, and resumable outstanding steps. These are mixed with round paperwork, tracker/merged policy, friction, and launch configuration. |
| `src/worktrees/serve.ts:acquireVerificationServers` | Existing none/borrowed/temporary acquisition; readiness admission; temporary token-scoped release; memoized release; cancellation. `stopWorktreeServers` preserves uncertain ownership and confirms process release. |
| `src/worktrees/new.ts:runNew` | Round classification, duplicate-ticket checks, scaffold/state, launch configuration and handoff are already visibly separate from allocation. Keep them in the round consumer. |
| `src/project.ts` | Unconditional `export *` from JewelryX. Passing `requirements: {kind:'none'}` alone does **not** make allocation/setup/teardown project-neutral. |
| `projects/jewelryx/index.ts:setup/newRound` | Setup includes secrets, pnpm builds, verification installation, tools linking and Python/database preparation. `newRound` changes behavioral skills. A neutral consumer must not invoke `newRound`; **also audit/split setup’s tools-linking and shim work**, not merely skip the final round scaffold. |
| `env/worktrees.ts`, `env/hook.ts` | Machine worktrunk allocation invokes project hooks; cleanup composes project teardown plus worktrunk removal. An in-process adapter parameter that never reaches hook subprocesses would be incomplete. |

**#192:** closed in tracker. This base includes source repairs: stable browser-step construction (`projects/jewelryx/round.ts:closeBrowsers`), recovered merged cleanup goes through `branchStep`, and `runReap` rejects mismatched recovery plans. That is observed source, **not a new runtime certification**.

### Smallest coherent caller contract

Names below are illustrative, not a proposed three-command vocabulary.

**Allocation caller supplies**
- Explicit repository location, branch, resolved base/ref, surviving diagnostic log.
- Explicit selected project adapter, bound for the operation—not an arbitrary module path and not a registry.
- No class, ticket folder, workflow state, skill installation, or approval flags.

**Allocation returns**
- Workspace identity: repository, path, branch, creation/ownership identity.
- Structured setup outcome and surviving diagnostics.
- An ownership receipt/recovery location usable after interruption.
- A release operation with confirmed-complete versus incomplete/refused outcomes.

**Dependency acquisition supplies**
- Workspace identity and only the project-declared requirements.
- Reuse `acquireVerificationServers` and its identity/readiness implementation.
- Return readiness evidence and a distinguishable owned/borrowed/none disposition; existing `VerificationServers` currently hides that disposition behind `kind:'acquired'`.

**Release/recovery**
- Share reap’s existing recovery executor, including its directory and branch checks; do not invent a second scratch journal.
- Preserve the distinction between deleting an owned, expendable baseline branch and retaining an unmerged round branch.
- Memoize same-handle releases; support interrupted recovery separately. **Do not silently turn a cached incomplete release into a new destructive attempt.**
- A persisted receipt is evidence of identity, not blanket permission: replacement paths, branch ownership changes, unknown process inventories and protected-round actions still refuse.
- Failed acquisition must return or preserve cleanup/recovery information, not merely print it while rethrowing the setup error.
- Existing round guards execute before its destructive release. Lower-level receipt acquisition must not adopt an existing round as disposable scratch.

The non-round diagnostic owns **which ref, probe files, command, and product interpretation**. The shared module owns resource coordination and confirmed release. Command exit and readiness are observations, not proof of a product assertion.

### Project seam: narrow and explicit

Extract only the **resource slice** consumed by these two examples from project exports: setup, teardown, environment construction, and the existing serving/readiness hooks where needed.

- JewelryX exports that slice through `projects/jewelryx/index.ts`.
- lint-kit exports a genuinely narrower slice through `projects/lint-kit/index.ts`.
- Keep round-only exports/selection separate for now; **do not require lint-kit to fabricate tracker IDs, actors, app URLs, round documents or release branches** just to run a diagnostic.
- Core must not retain runtime static JewelryX imports along the neutral execution path, including transitive imports from serve/status. Merely adding a `project` argument to an outer wrapper leaves leakage intact.
- Bind the chosen adapter once. If a machine subprocess performs setup/startup, explicitly carry and validate that binding into the invoked entry, or use the shared in-process setup implementation after machine allocation. Do not depend on whichever global project a hook happens to import.

This is not a generic plugin system: two explicit adapters and only their exercised resource fields.

### Concrete first diagnostic

**Non-round baseline diagnostic:** copy one explicitly named diagnostic/test into a scratch at an explicit ref, run one explicit command there, retain output and readiness/resource outcomes, then release.

**lint-kit proof**
- Actual `../lint-kit/package.json`: Node `>=20`, pnpm `11.3.0`; `test` uses Node’s test runner; `typecheck` uses `tsc -p tsconfig.tools.json`.
- A focused diagnostic such as `node --test test/error-handling.test.js` exercises real ESLint helpers and requires installed project dependencies.
- Setup: frozen-lockfile project dependency installation. Requirements: **none**. No JewelryX env files, verification package, database, application stack or skill changes.
- Do not claim this certifies the entire lint-kit test suite: some tests exercise lefthook, other binaries and optional Python tooling. `test/init.test.js` conditionally skips real Python checks without `python/.venv`; `python/pyproject.toml` declares Python `>=3.11`, flake8/FastAPI/mccabe and pytest/ruff.
- Test injection must obey `scratchDestination`’s existing confinement rules.

**JewelryX proof**
- Explicit baseline diagnostic and explicit existing requirements, e.g. API profile rather than defaulting to the shared-auth stack.
- Use existing project baseline environment replacement so live URLs/database variables do not leak.
- Distinguish narrow **server** acquisition from setup: current JewelryX setup still prepares broader dependencies. Do not promise demand-directed setup until it is actually implemented and demonstrated.

**Existing round proof**
- Round creation still calls shared allocation, then its current classification/scaffold/state logic.
- Round checks still use the same server lease implementation.
- Round reap applies its existing guards/archive policy, then delegates actual release/recovery to the shared executor.

### Alternatives

1. **Expose existing helpers unchanged:** least code initially, but callers must compose safety, retain logs, reconcile two cleanup records and recover manually. Fails the coordinated supported-consumer objective.
2. **Add only `wf baseline ...` wrapping existing subprocesses:** convenient entry, but static project selection and caller-owned cleanup remain. Useful only as a thin transport **after** shared coordination exists.
3. **Recommended: extract ownership/recovery plus a narrow resource adapter:** more surgical extraction work, but one place fixes interrupted cleanup for round and non-round consumers.
4. **Generic sessions/resource graph/plugin catalog:** unnecessarily expands the first slice and its verification burden.

### One consequential T1 choice

**Who owns the baseline’s entire isolated workspace lifecycle?**

- **Recommended:** wf owns the disposable scratch lifecycle and its durable recovery receipt; caller owns diagnostic inputs and interpretation.
- Alternative: caller owns workspace orchestration and composes separate allocation/server/removal handles.

The first centralizes the hard coordination and satisfies the depth goal. The second gives callers more freedom but makes ordering, log retention, failed setup and recovery their interface obligations—the complexity #194 is trying to remove. Human T1 should explicitly agree to the first before implementation, including **baseline-only branch-disposal authority and no adoption of existing rounds**.

No Inbox decision was sent: this was a delegated investigation instructed to report to its parent only.
