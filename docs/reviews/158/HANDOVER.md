# #158 — Final T2: existing-checkout opening in Herdr

**Result: independently assessed clean. Your next action: approve PR publication or request changes.** No PR or runtime update has been published. Approval permits publication only; leave merge to the person.

## Identity

| Item | Bound value |
|---|---|
| Worktree | `C:/Users/Shay/work/wf-158` |
| Branch | `feat/158-existing-worktree-herdr` |
| Implementation | `e24330b4822eb3f8dd49e9dba9c7f6ff39c000d3` |
| Base | `67ca46c86c60f05dae0ed12cbfd528e358eb975c` |
| Four-file source manifest | `8cd5f2c75b01cb0d3417cb773d8277677742a4d3708da1bd15c8031ac6a756d9` — `SOURCE-MANIFEST.json` |
| Actual renewed T1 | `msg_01M6B3P5872RR235GDAJYHMHNN`, “Approve required parent (your recommendation)” |
| T1 agreed material | `43cdcedbc8cf50c1900a737791e8ce1c04e0e80e38a225261db673b89e61ee2a` |
| Assessment | `ASSESSMENT.md`: clean on intent/behavior/evidence and design/standards; no findings |

The assessor checked these exact four source/test/document blobs. Later review-record commits do not change them. The acknowledgement of the progress message is not treated as final T2.

## Change and unchanged owners

| Before | After |
|---|---|
| wf records Herdr opener references | Same references; no silent session move |
| Native Herdr commands needed to find/open a checkout | `wfk herdr list` and explicit `wfk herdr open <existing-path>` |
| A native cwd-based open can create an implicit repository parent | Require an already-open parent; pass its explicit ID; no fallback |
| wf new allocates and sets up a checkout | Same allocation/setup, plus an inert opening instruction inside Herdr |
| Worktrunk/Git own create/remove | Unchanged; opening performs neither operation |
| wf owns approvals, release and guarded reap | Unchanged; workspace close completes none of them |

```text
list → compare native inventory against actual Git registration
open → parent absent? refuse with its path; no workspace effect
     → target already mapped? reuse it
     → otherwise: open existing checkout with parent ID + --no-focus
          acknowledgement + readback agree → confirmed reference
          either uncertain → nonzero; retain checkout; explicit retry reconciles first

new → existing setup → print opening instruction; do not execute it
close workspace ≠ session rebind ≠ release proof ≠ reap ≠ delivery
```

This is a CLI/machine-adapter change. There is no app view or UI-component change and no app route to walk. The agreed T2 inspection is command output plus owned-fixture execution, not a mutation of an active user checkout.

## Proof to inspect

### Actual native overlapping opens

Two simultaneous cold calls to the editing entry returned:

```json
{"kind":"opened","checkout":{"branch":"fixture-existing","workspace":"w1A"},"disposition":"opened"}
{"kind":"opened","checkout":{"branch":"fixture-existing","workspace":"w1A"},"disposition":"opened"}
```

Only one target workspace appeared. A later call returned `reused`. The parent already existed. The focused workspace and active tab in this probe stayed `wE` / `wE:t3H`. The new target and prepared parent stayed unfocused. Both owned workspaces were then closed; the checkout and fixture obligation remained until fixture cleanup. Full receipts: `evidence/native-parallel-commands.json`, `evidence/native-parallel-result.json`.

| Check | Observed result |
|---|---|
| Native normal, current bare layout, detached target | All three pass: missing-parent refusal has no effect; open creates only target; repeat reuses; registration/HEAD unchanged; checkout/setup hooks not run |
| Native close versus cleanup | Close leaves checkout/obligation; discovery then shows no target workspace |
| Real entry lifecycle | Hook install → new → serve → three HTTP 200s with ownership → force reap → installed-hook restore; all six steps exit 0 |
| Final owned-resource postconditions | All 14 later native fixture IDs absent; earlier exploratory fixtures absent; benchmark ports refuse connections; own unchanged benchmark branch removed |
| Builder focused compatibility | 7/8 green, including helper, T3 presentation/entry, binding, Worktrunk, tsc/ESLint |
| Fresh independent run | Helper + tsc + ESLint: **3/3 green**, 75.8s; source and whitespace checks pass |
| Independent assessment | Clean on both axes; actual report retained unchanged |

## Limits you approve with this implementation

- **Full suite NOT RUN.** The focused cohort is not wholly green.
- Three delivered-round tracker assertions fail because the fixture does not establish Jira account identity. The untouched-base run has the same three failures. Existing delivered-round safety assertions remain green.
- Boundary check has the same base/current violation: `bin/wfk.selfcheck.ts` imports `env/shim.ts`. No new core dependency is introduced.
- The successful real lifecycle logs also contain `fatal: this operation must be run in a work tree` diagnostics. Exit status, HTTP readback and removal receipts do not erase those diagnostics.
- Native proof is Windows with Herdr 0.9.3. Other versions/platforms and bare layouts without the current `.git` pointer are not certified. The helper does not repair layouts.
- Trust refusal, malformed replies and lost-response recovery use the controlled peer. No native trust setting was changed.
- Earlier strict active-tab snapshots failed while an unrelated workspace stayed focused. Those records remain. Final tests prove background parent/target and unchanged focused workspace, not frozen unrelated tabs.
- A workspace reference does not prove session rebinding. No agent session is started or replaced.
- Development dependency installation reported five moderate npm audit findings. No dependency files or audit fixes are included.

## Your action

Approve publication of this checked implementation with these limits, or request changes. Approval does not authorize an agent merge. Nothing in the progress-message acknowledgement was used as final T2.

Complete material: `AGREEMENT.md`, `AGREEMENT-REVIEW.md`, `BUILD.md`, `ASSESSMENT.md`, `SOURCE-MANIFEST.json`, and `env/HERDR.md`. The full source diff is against the base named above. Historical pending text in the agreement is superseded by the recorded renewed T1 ruling; it is not another unanswered decision.
