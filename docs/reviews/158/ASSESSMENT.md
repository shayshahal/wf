# Independent final assessment — wf #158

**Result: clean on both assessment axes. No new blocking or non-blocking defect found in the checked implementation.** The parent-required integration meets the renewed agreement within the evidence limits below. Final human T2 remains pending. This report does not approve publication or merge.

## Identity and scope

- Date: 2026-11-01.
- Worktree: `C:/Users/Shay/work/wf-158`.
- Branch: `feat/158-existing-worktree-herdr`.
- Base: `67ca46c86c60f05dae0ed12cbfd528e358eb975c`.
- Checked HEAD: `e24330b4822eb3f8dd49e9dba9c7f6ff39c000d3`.
- Product/test working tree matched HEAD before and after the review checks. Only this assessment was added by the reviewer.
- Independent context: I did not implement the change or read builder chat. I read the intake, agreement, actual recorded T1 rulings, build notes, changed source/test files, diff against the base, relevant unchanged callers/guards, and supplied evidence/controllers. Product code remained read-only.
- Governing material: `AGENTS.md`, applicable coding-standards references, codebase-design and write-discoverable-code skills, `process/REVIEW-FORMAT.md`, `process/SHOW-ME.md`, and `skills/round/references/review.md`. The T1/T2 verdict format is not used to manufacture a human ruling here.
- Renewed T1 identity: `43cdcedbc8cf50c1900a737791e8ce1c04e0e80e38a225261db673b89e61ee2a`; recorded actual reply `msg_01M6B3P5872RR235GDAJYHMHNN`, “Approve required parent (your recommendation)”. Historical pending text in the agreement/findings is superseded by that explicit ruling, not treated as missing approval.

Checked source identities (Git blob OIDs):

| File | Blob |
|---|---|
| `env/adapters/herdr-workspaces.ts` | `4ecb136ec99c6dc8450b99b5bdeebd6c8aa89222` |
| `env/adapters/herdr-workspaces.selfcheck.ts` | `5fecb5d951efff0da2b3d09fdca97fa96e56d2ca` |
| `env/wf.ts` | `ff8c44472bc64b20fc5db472d3dab9311a3aaa4d` |
| `env/HERDR.md` | `e3b1e62a88f76a64259750cb460c4a2981f8b893` |

## Axis 1 — Intent, behavior and evidence

```text
machine entry → existing round/entry/session guards → machine herdr command
  list → Git registration + native discovery → checked paths/branches/mappings
  open → checked registered target
       → missing parent: refuse before mutation
       → mapped target: reuse
       → otherwise: one native open with explicit parent ID and --no-focus
            → acknowledgement AND readback agree: confirmed opened
            → any uncertainty: nonzero, keep checkout, reconcile on explicit retry

wf new → unchanged create/setup → print inert handoff
workspace close ≠ wf reap ≠ release proof ≠ delivery/approval
```

| Requirement | Assessment and source |
|---|---|
| Existing checkout discovery; no layout migration | **Met.** `herdr-workspaces.ts:27–55` uses actual Git registration. It checks native source paths, row shapes, canonical path identity, branch/bare agreement, duplicates and completeness. Git supplies the returned branch/detached identity. No allocation or layout repair path exists. |
| Parent prerequisite | **Met.** `:32–43,53–55,75–80` derives the repository parent, checks its native source identity, checks normal-parent mapping consistency, and requires a workspace ID before opening. Mutation uses `--workspace`, not the cwd fallback that caused implicit-parent creation. A disappearing parent receives no fallback or second mutation. |
| Existing target and repeat open | **Met.** `:66–80` requires a physical registered non-bare checkout, canonicalizes aliases, reuses discovered mappings and otherwise makes one native open call. Native overlapping-open receipts support installed Herdr's same-checkout deduplication; the helper does not add an unproven second workspace manager or claim a cross-version concurrency guarantee. |
| No duplicate setup/worktree or stolen focus | **Met within native proof scope.** The only native mutation is `worktree open … --no-focus`. No Git checkout creation, Worktrunk setup, focus, trust or session-launch operation is called. Owned native fixtures retain registration/HEAD and absent hook/setup markers. Focused workspace stays the same; unrelated active-tab changes are not misrepresented as a pass for a stronger invariant. |
| Refusal and partial effects | **Met.** `:18–22,38–54,80–89,93–106` refuses unusable inventory before mutation. After any mutation attempt it rediscovers. Lost/error/malformed acknowledgement, conflicting acknowledgement, absent mapping or failed readback cannot yield confirmed success. A confirmed mapping after an unconfirmed reply is explicitly uncertain, with the workspace/path retained. An explicit retry discovers/reuses it; no automatic mutation retry or destructive compensation occurs. Provider stderr is not relayed. |
| Headless operation and kit independence | **Met for this slice.** `env/wf.ts` alone registers the command and supplies the optional handoff. Outside Herdr the helper refuses without invoking Herdr, while existing checkout creation/removal remain unchanged. No helper workspace is needed to exist or reap a checkout. The independent peer check also verifies kit help has no Herdr command. |
| Session provenance and T3 precedence | **Met by trace and supplied compatibility evidence.** `herdr-workspaces.ts:110–121` prepends authenticated T3 handoff guidance and explicitly disclaims session rebinding. `env/wf.ts:24–40` overrides only the handoff when Herdr is present. `src/run.ts` still installs T3 presentation/session binding and executes entry, state and session guards before machine dispatch. Existing opener provenance is unchanged. A workspace ID never becomes session authority. |
| Close versus reap/delivery | **Met.** The command exposes no close/remove/reap action and changes no approval/resource state. Native fixture close leaves checkout/obligation bytes intact and subsequent discovery has no target workspace mapping. Existing session cleanup containment and delivered-round implementation protections remain in their original owners. Fixture obligation files are not claimed as real human approvals. |

### Evidence inspected, not rerun by this reviewer

| Supplied evidence | Independent reading and limit |
|---|---|
| `evidence/native-parent-checkouts.py`, `native-parent-receipts.json`, `native-parent-result.json` | Controller and raw receipts agree for normal, current `.git`→`.bare`, and detached targets. The receipts contain 73 commands: 70 exit 0 and three intended missing-parent exit-1 refusals. Each fixture explicitly creates its own parent outside the helper, opens/reuses only its target, checks focus/Git/hooks/close separation, and records directory removal. This is installed Herdr 0.9.3 on Windows, not certification of arbitrary layouts. |
| `native-parallel-checkouts.py`, `native-parallel-commands.json`, `native-parallel-receipts.json` | Both overlapping entry commands exit 0 with workspace `w1A`; workspace inventory grows by one target. Sequential open reuses it. This is an actual overlap fixture, not proof from sequential reuse alone. |
| Preserved exploratory/native red records and `NATIVE-FINDINGS.md` | Implicit parent creation, linked-source refusal, initial cleanup failures, unpointed bare refusal and unrelated active-tab changes remain disclosed. The final policy avoids the implicit-parent path. The final probe checks workspace focus and explicitly prepared parent/target focus, not an untouched unrelated tab. No cause for ambient tab movement or timing variance is inferred. |
| `real-round-158-cycle.json`, `real-round-158-*.log`, lifecycle controller | Recorded editing-entry hook install → new → serve → HTTP readback → force reap → installed-hook restoration all exit 0. Readback records three HTTP 200s and running server ownership. Reap records owned teardown/removal and preserved benchmark paperwork; it is intentional synthetic discard, not delivered work. The `fcf102…` sourceRef is the JewelryX fixture base, not the wf implementation identity. The new/reap logs also contain `fatal: this operation must be run in a work tree`; the successful exit/readback/removal receipts do not make those diagnostics disappear. |
| `final-resource-postconditions.json`, `exploratory-cleanup-postconditions.json`, restored-hook log | Record all 14 later fixture workspace IDs absent, earlier exploratory fixtures absent, benchmark direct endpoints refusing connections, synthetic branch removal and hooks restored to `C:/Users/Shay/.local/share/wf/env/wf.mjs`. I did not touch live UI, hooks or these resources to reverify them. |
| `focused-compatibility.log`, `delivered-base.log` | Compatibility is **7/8 green**, not wholly green. The delivered-round file has three tracker-dependent failures. The untouched-base receipt shows the same three assertions and missing Jira account identity. Other delivered-round safety assertions remain green in both logs. No new delivered-round regression is established. |
| `boundary-current.log`, `boundary-base.log` | Both show the same pre-existing violation: `bin/wfk.selfcheck.ts` imports `env/shim.ts`. No new core/project dependency on env or Herdr is introduced by this diff. |

## Axis 2 — Design and standards

**Clean.** No consequential design or standards finding requires repair.

| Concern | Judgment |
|---|---|
| Ownership and seam placement | The existing `Seams.commands` and `workspaceHandoff` carry the feature. Core/projects remain unchanged. Worktrunk/Git retain create/remove ownership; wf retains setup, approval and resource-release policy. |
| Depth / deletion test | The new adapter earns its place: deleting it would put native protocol parsing, Git-authority comparison, parent policy and uncertain-effect recovery into the composition entry. `env/wf.ts` stays thin. The existing opener adapter is not a competing manager; it records provenance rather than performing CLI effects. No speculative universal harness interface or extra service layer is needed. |
| Failure model and external parsing | Native JSON stays unknown until checked. Expected failures are tagged values until the CLI sets a nonzero outcome. The operation distinguishes refusal before mutation from uncertainty after mutation. Missing/unavailable inventory is not empty-as-safe. Native IDs remain private protocol tokens; no unsafe casts, `any`, dependency additions or exported provider schema were added. |
| Locality, names and comments | Searchable subject-qualified module/export names, colocated selfcheck, direct owner imports and export JSDoc match the applicable rules. Comments explain the native-parent and lost-response constraints. Changes stay surgical: four env files, with no unrelated runtime refactor. |
| Tests | The peer drives the actual machine entry, actual Git and shell-free argv, including spaces/quotes/metacharacters and Windows aliases. Its filesystem-backed native protocol peer is not a module mock. It covers refusal, malformed/foreign discovery, disappearing parent and effect-before-error recovery. Finite-case protocol coverage plus native fixtures is reasonable here; no production-only test seam was introduced. Native focus/trust claims remain separated from controlled-peer checks. |

## Checks run independently

Environment: Node `v26.12.1` in the named editing checkout.

```text
node src/selfcheck.ts env/adapters/herdr-workspaces.selfcheck.ts
selfcheck: focused (1 of 108 files); full suite not run.
selfcheck: PASS tsc (1.4s)
selfcheck: PASS eslint (1.4s)
selfcheck: PASS env/adapters/herdr-workspaces.selfcheck.ts (74.7s)
3 selfchecks green (focused; tsc and eslint included) in 75.8s
```

- `git diff --check 67ca46c -- env/`: exit 0.
- `git diff --quiet HEAD -- env/`: exit 0 after the checks.
- HEAD and the four source/test/document blob identities above were read from Git.
- No full suite, native mutation, real round, hook install, runtime replacement, publication or merge was run by this reviewer.

## Limits and next action

- **Full suite NOT RUN.** Retain the baseline tracker reds and boundary violation as known reds, not waived passes.
- Native server/trust refusal, malformed protocol and lost-response handling are controlled-peer proof. Actual native trust configuration was not changed.
- Other Herdr versions/platforms, unpointed bare layouts and arbitrary concurrent external workspace changes are not independently certified.
- Workspace-focus proof is narrower than a guarantee that unrelated active tabs cannot change. The implementation requests no focus and does not switch or replace an agent/session.
- Native/lifecycle logs are supplied receipts inspected independently, not executions performed by this reviewer. Their controllers name this editing entry; they do not each embed a source hash. The source identity for this assessment is the checked Git state above.
- Next: the task owner presents this exact implementation, assessment and remaining limits for actual human T2. Keep publication pending until that ruling. Leave any subsequently authorized PR open for human merge.

**Assessment verdict: clean — intent/behavior/evidence and design/standards. No human approval conferred.**
