# #158 — Build checkpoint (not ready for assessment)

## Approval and next action

Initial T1 approved SHA d14e7f0a. Native testing found an implicit repository-parent workspace. A proposed parent-required revision is pending at SHA 43cdcedb in Inbox question q-a661ad3a / msg_01M6B3NM9CHV0ZJXVK8GAB3DJF. Record the actual ruling and recheck full agreement SHA before dependent implementation. Do not publish, assess this as complete, or open an unrelated live checkout to test it.

## Provisional implementation

`env/adapters/herdr-workspaces.ts`: existing Git/Herdr discovery, explicit no-focus open, readback confirmation, uncertain-outcome reconciliation and inert handoff. `env/wf.ts`: machine-only registration and handoff composition; authenticated T3 instructions are retained. Existing opener metadata and core/project lifecycle code remain unchanged.

**Known gap:** provisional open still uses the caller cwd and can create an implicit parent or refuse a linked-checkout source. It must be corrected under the actual parent-policy ruling. Do not treat the current command as the final agreed behavior.

## Measurements

| Scope | Result | Evidence |
|---|---|---|
| Focused runner, first invocation | Outer tool killed at 180 seconds; tsc and ESLint passed; peer test incomplete in this run | evidence/focused-initial.log |
| Isolated controlled peer suite | 11 groups pass through real machine entry, real Git and external CLI peer | evidence/peer-isolated.log |
| One isolated peer command | 2.563 seconds; exit 0 | evidence/peer-one-command-diagnostic.json |
| Native worktree open from repository | Adds parent + target; no-focus target acknowledgement | evidence/native-initial.json, evidence/native-leftover-root-workspace.json |
| Native open sourced at linked checkout | Refuses linked_worktree_source | evidence/probe-target-source.log |
| Native standalone directory workspace | One target, discoverable, no native repository metadata; cleanup controller initially expected a nonexistent metadata field | evidence/native-direct-workspace.json, evidence/probe-direct-workspace.log |
| Exploratory cleanup | All three created workspace IDs absent; initial/standalone/peer fixture directories absent | evidence/exploratory-cleanup-postconditions.json |

No full suite, final native integration pass, real stack compatibility cycle, final independent assessment or T2. No source was published.

## Diagnostic limits

The initial runner tool deadline does not establish a product failure or a timing cause. The isolated pass does not explain that variance. Native cleanup controllers initially failed on Windows read-only Git objects, an extra parent workspace and transient directory handles. Original failed logs remain. No kill-by-path or main Herdr restart was used. Corrected native verification must capture *all* created workspace IDs and clean only those; close acknowledgement is not proof of filesystem release or reap authority.

## Remaining verification

After the ruling: implement safe explicit parent identity and missing-parent refusal, or revise to the chosen alternative; update faithful peer cases including parent/malformed/uncertain state, normal/bare and detached path semantics; run native normal/bare fixtures with whole-workspace delta/focus/hook counters; perform real entry create→stack→reap compatibility and hook restoration as appropriate; focused runner with sufficient outer budget, T3 regression and boundary comparison; fresh independent assessment; actual final T2; PR stays open for human merge.
