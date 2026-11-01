# #158 — Build and verification

Builder handoff: ready for independent assessment, **not** approved for publication.

## Agreement and authority

- Class C. Current agreed-material SHA: `43cdcedbc8cf50c1900a737791e8ce1c04e0e80e38a225261db673b89e61ee2a`.
- Actual renewed T1: Inbox reply `msg_01M6B3P5872RR235GDAJYHMHNN`, “Approve required parent (your recommendation)”. Full history remains in `AGREEMENT-REVIEW.md`.
- Initial T1 approved explicit background open. Native testing found an implicit repository-parent workspace. The person approved a prerequisite instead: the parent must already be open.
- Final T2 is still required. It permits PR publication, not an agent merge. Leave the PR open for the person.

## Built shape

```diff
  machine wf new → existing allocation/setup → saved opener/session provenance
+   print inert Herdr handoff, retaining authenticated T3 binding guidance

+ wfk herdr list
+   real Git registration → native discovery from repository parent
+   validate complete path/branch/bare/mapping evidence → JSON with parent reference

+ wfk herdr open <registered existing path>
+   discover → missing parent: explicit refusal, no workspace effect
+   existing target mapping: reuse, no mutation
+   otherwise: native worktree open --workspace <parent-id> --path <registered-path> --no-focus
+   readback → matching acknowledgement + mapping: confirmed opened
+            → error, malformed acknowledgement or unknown readback: uncertain; retain checkout
  close workspace ≠ release resources, complete delivery or authorize wf reap
  wf reap → unchanged ownership/delivery gates → unchanged Worktrunk/Git backend
```

| Owner | Change |
|---|---|
| `env/adapters/herdr-workspaces.ts` | Private native protocol parsing, Git authority comparison, parent-required open, uncertain-effect reconciliation and inert handoff |
| `env/wf.ts` | Register the machine command through the existing seam; supply handoff only inside Herdr |
| `env/adapters/herdr.ts` | Unchanged opener provenance; peer checks assert existing behavior |
| `env/HERDR.md` | Commands, outcomes, missing-parent recovery, native binding and cleanup limits |
| Core/projects/round state | No implementation changes |

### Ownership and standards

The existing `seams.commands` and `workspaceHandoff` are sufficient. No new harness API, service layer, scheduler, runtime dependency or second checkout manager. The opener adapter remains separate because it records provenance, not external CLI effects. The new adapter owns protocol failures and effect ordering; moving those into the entry would spread the native boundary through composition code. Paths/branches come from Git, not Herdr. Workspace IDs are private native protocol tokens, not new application identifiers. Expected integration failures remain tagged values until the CLI prints a safe outcome and exits nonzero. Raw provider stderr and native session credentials are not relayed.

Normal and current `.git`→`.bare` layouts, detached targets, relative paths, Windows case aliases and shell metacharacters are covered. No repository layout is repaired or migrated. An unpointed bare fixture failed native discovery; it is not silently claimed supported. Generated-input testing was considered: the protocol has a small finite branch matrix, exercised through the actual machine entry and an external stateful peer rather than module mocks. Native overlapping opens provide an additional idempotency probe. No production-only test flag or injectable module mock was added.

## Verification — actual runs

Focused runner rows include TypeScript and ESLint. None is a complete-suite result.

| Command / scope | Result | Evidence |
|---|---|---|
| Initial focused peer check | Outer tool killed at 180s; tsc/ESLint green; no complete peer result in this run | `evidence/focused-initial.log` |
| Initial isolated peer test, before parent policy | 11 groups pass | `evidence/peer-isolated.log` |
| One isolated peer command diagnostic | 2.563s, exit 0; no timing-cause conclusion | `evidence/peer-one-command-diagnostic.json` |
| `node src/selfcheck.ts env/adapters/herdr-workspaces.selfcheck.ts` after parent handling | **3/3**, 133.3s; peer file 127.9s, 12 groups | `evidence/focused-parent.log` |
| Final compatibility cohort: helper, T3 presentation, actual T3 entry, session-workspace binding, delivered-round guards, machine Worktrunk checks | **7/8 pass**, 297.0s. Helper 89.1s; both T3 files, binding, Worktrunk, tsc/ESLint green. Delivered-round file has three tracker-dependent red assertions. | `evidence/focused-compatibility.log` |
| Same delivered-round file on untouched base `67ca46c` | Same three red assertions; tracker fixture does not establish Jira account identity. tsc/ESLint pass. | `evidence/delivered-base.log` |
| Boundary current and base `67ca46c` | Same single violation: `bin/wfk.selfcheck.ts` imports `env/shim.ts` | `evidence/boundary-current.log`, `evidence/boundary-base.log` |
| Native normal, current bare layout and detached target, actual machine entry | **All three pass**: missing parent no effect; open creates only target; repeat reuses; branch/HEAD/registration unchanged; Git checkout and Worktrunk setup markers absent; close keeps checkout/obligation | `evidence/native-parent-result.json`, `evidence/native-parent-receipts.json` |
| Native two overlapping cold opens, actual machine entry | Both exit 0 and report the **same workspace**; only one target created. Sequential follow-up reuses it. | `evidence/native-parallel-commands.json`, `evidence/native-parallel-result.json` |
| Real editing-entry hook install → new → serve → HTTP readback → force reap → installed hook restoration | **All six steps pass**, 344.17s. All three apps HTTP 200 with recorded server ownership; new prints inert handoff. | `evidence/real-round-158-cycle.json`, `evidence/real-round-158-*.log` |
| Postconditions | All 14 later fixture workspace IDs absent. Benchmark direct endpoints refuse connections; own unchanged synthetic branch removed by exact-ref compare. Earlier three exploratory IDs/directories already absent. | `evidence/final-resource-postconditions.json`, `evidence/exploratory-cleanup-postconditions.json` |
| Source whitespace | `git diff --check -- env/` passes | Command recorded before assessment |

The real lifecycle uses the actual JewelryX `dev` base `fcf102706a654ba8f4129c1da93bd6e701a049e3`. That is not the wf implementation revision. The source entry is this wf checkout. The force reap intentionally discarded the synthetic benchmark; its cached round paperwork remains as the ordinary runtime receipt. No real task delivery was claimed. The installed hooks point back to `C:/Users/Shay/.local/share/wf/env/wf.mjs`.

## Focus proof and preserved failures

The first strict native snapshot compared the unrelated focused workspace's active tab before/after. The workspace remained `wE`, but its active tab changed; that run is preserved in `native-parent-ambient-tab-red.*`. No cause is attributed. The final native probe tests the relevant invariant: focused **workspace** unchanged, explicitly prepared parent and target remain unfocused, exactly one new target workspace, no focus command in the helper. Active tabs in the unrelated workspace are recorded, not required to remain frozen. The overlapping-open probe also happened to retain the same active tab; it is not a general no-user-activity guarantee.

Other initial failures remain visible:
- Native repository-sourced open created an implicit parent and target; linked-source open refused. This drove the actual renewed T1, not a silent implementation choice.
- The exploratory cleanup controller initially missed that parent and encountered Windows read-only Git objects/transient directory handles.
- The standalone-workspace probe succeeded, but its cleanup controller expected repository metadata that its result did not contain. It was closed using its returned ID and root-pane cwd receipt.
- A bare fixture without the machine's `.git` pointer failed native listing. The corrected fixture mirrors the existing layout; no real repository was changed.

All exploratory workspace effects were identified and closed. No main Herdr restart/kill, kill-by-path, trust grant, unrelated active checkout mutation, production retry or longer production timeout was used.

## Limits and next action

- **Full suite not run.** Do not describe the compatibility cohort as wholly green.
- The delivered-round tracker assertions and boundary violation reproduce on the untouched base. They remain red; no unrelated fixture or infrastructure repair is included.
- Installed Herdr **0.9.3** and this Windows environment are the native proof. Other platforms/CLI versions are not independently certified.
- Native trust refusal, malformed protocol, unavailable server and lost-response handling use the controlled peer; actual native trust configuration was not changed.
- Parent/target workspace references are not proof of an agent-session rebind. No session is started, replaced or silently moved.
- Development dependency installation reported five moderate npm audit findings; no dependency files or audit fixes are included.
- Independent assessment and actual final T2 remain. No push, PR, merge or installed runtime replacement has occurred for #158.
