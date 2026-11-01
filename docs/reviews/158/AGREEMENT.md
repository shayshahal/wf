# AGREEMENT — #158 · Open existing checkouts in Herdr

## Observed

- The machine records opener pane/session references; it does not open Herdr workspaces. Source: `env/adapters/herdr.ts:1–11`, `env/wf.ts:33`.
- The core already accepts machine commands and existing-checkout handoffs. Source: `src/seams.ts:61–64`, `src/worktrees/new.ts:201`.
- Installed Herdr lists this linked checkout without an open workspace. Source: `evidence/worktree-list-before.json`.
- Installed Herdr offers no-focus existing-checkout open and workspace-targeted worktree removal. Source: `evidence/herdr-worktree-help.json`.
- Worktrunk owns machine allocation/removal; wf owns setup and guarded release. Source: `env/worktrees.ts`, `process/LIFECYCLE.md`.

## Agreed

- **Behavior.** Add machine-only `wfk herdr list` and `wfk herdr open <existing-checkout-path>` through the existing command seam.
- **Discovery.** List existing Git checkouts and their Herdr workspace references. Resolve paths against actual Git registration; never allocate missing checkouts.
- **Open.** Explicit open uses the existing checkout, preserves its branch, and requests no focus. Repeat open must not duplicate checkout, workspace or setup.
- **Handoff.** After machine `wf new`, print an existing-checkout opening instruction inside Herdr. Do not execute open or replace the current session.
- **References.** Preserve existing opener/session provenance. A Herdr workspace reference is not proof that an agent session has rebound.
- **Failures.** Unavailable Herdr, outside-Herdr calls, trust refusal, malformed responses and partial effects must be explicit. Do not retry mutations or claim success without confirmation.
- **Recovery.** After an uncertain open, show the existing checkout and any confirmed workspace reference. Retrying must reconcile discovery before another open.
- **Ownership.** Worktrunk/Git remain the only checkout create/remove owners. Opening runs no project setup, teardown, dependency start, tracker transition or approval mutation.
- **Close.** Closing a Herdr workspace does not reap, release dependencies, complete delivery or grant cleanup permission. Existing wf protections remain authoritative.
- **Excluding.** No repository-layout migration, checkout moves, backend replacement, scheduler, new core harness API, session launch, trust grant or mandatory team Herdr dependency.
- **Choice.** Recommend explicit background open, not automatic opening after `wf new`. This keeps visible workspace creation under the caller's control.
- **Verification.** Prove native open/repeat/close on owned isolated fixtures, including hook counters, unchanged Git identities, stable caller focus and safe refusal/recovery.
- **Compatibility.** Prove ordinary operation without Herdr and existing native-handoff behavior. Any lifecycle change requires the real entry create→stack→reap cycle and hook restoration.
- **Not asked for.** none — the thin machine command implements requested discovery/open; no additional workspace manager or behavior is proposed.
- **T2 walk.** none — no app route; inspect command output and exercise the owned fixture's existing-checkout open without changing active workspaces.

```diff
  wf new → Worktrunk/Git allocation → project setup → saved opener references
+   machine workspaceHandoff(path) → printed explicit open instruction
  current agent/session remains in its existing workspace

+ wfk herdr list → installed discovery → existing path/branch/workspace references
+ wfk herdr open <registered-path> → discover current mapping
+   existing mapping → report it; do not create another workspace
+   no mapping → herdr worktree open --cwd <repository> --path <path> --no-focus
+     confirmed existing checkout/workspace → report reference; do not claim session rebound
+     refusal/uncertain effect → report failure and recovery path; never fall back to create
  wf reap → existing approval/resource/teardown guards → Worktrunk/Git removal
  Herdr workspace close ≠ wf reap
```

## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | Existing checkout discovery and path authority | `env/adapters/herdr.selfcheck.ts` | List resolves registered path/branch, canonical Windows paths and workspace mapping; missing/foreign targets cannot create anything. |
| 2 | Open and repeat without duplicate setup or focus | `env/adapters/herdr.selfcheck.ts`, `evidence/` | Isolated native fixture: same path/branch and workspace reference after two opens; Git/setup counters unchanged; caller focus unchanged. |
| 3 | Refusal and uncertain effects | `env/adapters/herdr.selfcheck.ts` | Controlled unavailable CLI/server, non-Herdr environment, trust refusal, malformed result and effect-before-error; retry discovers effects; no create/remove/trust mutation. |
| 4 | Close is not reap; headless checkout survives | `env/adapters/herdr.selfcheck.ts`, `evidence/` | Close only the owned fixture workspace; checkout and ownership/approval facts remain. Existing safe cleanup still owns release/removal; no workspace required. |
| 5 | Entry wiring and compatible lifecycles | `env/wf.ts`, `env/adapters/herdr.selfcheck.ts`, `src/plugin/t3code.selfcheck.ts` | Focused runner includes tsc/ESLint; machine helper/handoff wired, kit remains independent, existing native handoff retained. Run actual entry lifecycle if lifecycle code changes. |
| 6 | Usable handoff and evidence limits | `env/HERDR.md`, `BUILD.md`, `ASSESSMENT.md` | Fresh independent assessment; manual: confirm explicit no-focus opening is the intended experience and references do not imply an agent/session switch. |

## Decisions

Pending actual human T1 on the current agreed-material SHA. Listing and source inspection are design evidence only. No implementation, live workspace opening, publication or backend switch is authorized by this draft. Final T2 authorizes PR publication only; leave the PR open for the person's merge.
