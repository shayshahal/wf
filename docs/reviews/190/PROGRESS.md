# #190 progress

## Workspace / runtime limitation

Approved T3 isolation: `C:/Users/Shay/.t3/worktrees/wf/fix-190-correction-merge-reconciliation`, base `08f43f593dbb589c9b3d84ed61c68e4ec78d2c00`. This develops wf itself. The installed project selector targets JewelryX, so normal round commands cannot express this task without unrelated project preparation. No `wf new`, setup/serve, global hook install or configuration change was performed. Intake/T1/evidence/assessment/T2 will be local, with the same human and independent-context guarantees.

## Repro

`node docs/reviews/190/repro.ts` uses the existing delivery recovery fixture harness (copied before its scenario list), real CLI dispatcher, local bare Git origin redirected by per-fixture config, controlled persistent GitHub seam. Fixtures remove themselves in `finally`.

- First execution: harness/environment failure, not product evidence. `evidence/repro-before.log` retains native workspace refusal: live T3 credentials leaked into disposable child processes.
- Isolated diagnostic: adjusted only disposable child ENV to strip `T3_*` / `T3CODE_*`, matching `src/selfcheck.ts`'s established fixture isolation. Did not disable a production guard or change host configuration.
- Second execution: `evidence/repro-isolated-before.log`, exit 1. Publishing and durable correction assertions pass. Three exact symptom assertions fail: state routes to build, next offers build, delivery refuses pending correction before finding merge. No real GitHub PR was mutated.

## Hypotheses / inspection

1. Admission ignores `pr_handoff`: predicts step changes to build while candidate remains. Confirmed by repro state and corrections.ts:152.
2. Routing independently trusts correction-build state: predicts `wf next` authorizes build despite retained published candidate. Confirmed by repro and next.ts.
3. Delivery gates precede normal remote lookup and normal reconciliation compares current HEAD: predicts pending-correction refusal before merge recovery, and later HEAD changes compound recovery. First prediction measured; changed-HEAD consequence not yet exercised.

## Prerequisites

Node v26.10.0. Read package.json and eslint config. Initially no local node_modules. Ran `npm ci` in this isolated clone: exit 0, 83 packages, audit reports zero vulnerabilities (`evidence/npm-ci.log`). No package files changed. No full suite run.

## Current status

Class B agreement proposed in `AGREEMENT.md`. Production code unchanged. Await actual human T1 approval bound to material identity before implementation. While waiting, independent baseline verification/test-design work is authorized. After implementation: focused runner and fresh independent assessment; final human approval before publishing, never automatic merge.

## Baseline focused verification (before implementation)

Ran `node src/selfcheck.ts src/gates/deliver.selfcheck.ts src/gates/deliver-recovery.selfcheck.ts src/round/corrections.selfcheck.ts src/round/next.selfcheck.ts src/round/step.selfcheck.ts`.

`evidence/baseline-focused.log`: delivery, delivery-recovery, corrections, step, TypeScript and eslint PASS. next has three failing state-byte-equality assertions; complete suite NOT RUN. Aggregate took 483.1 seconds; do not rerun it blindly.

Isolated diagnostic before retry: copied next selfcheck to `next-baseline-diagnostic.ts`, kept assertions, made imports absolute and printed state before/after brief. `evidence/next-baseline-diagnostic.log` shows brief recorded inherited `PI_SESSION_ID` / `PI_SESSION_FILE` as optional session metadata; the three failing assertions compare against bytes captured before that session write. This is an existing fixture-environment interaction, not #190 behavior; source tests/runner remain unchanged.

Then ran only `env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts src/round/next.selfcheck.ts`: next, tsc and eslint PASS (30.7 seconds), `evidence/baseline-next-isolated.log`. This is a focused fixture-isolation result, not erasure of the initial failure or a complete-suite pass. Use that explicit environment isolation for subsequent relevant focused checks; do not change unrelated session behavior in #190.

T1 sent via Inbox `msg_01M5PJR37JXB7RD7NWS7X9P19S`, question `q-9cef3c60`, with agreement and measured log. Existing agreementSha identity: `sha256:d74a1e6988ef25330f43a4603c041de5a1cc68795b004ac064721f2e749d16b3`. Await actual human response. Production code remains unchanged.

## Implementation (2026-10-24, commit f7cf401)

T1 approved on `sha256:d74a1e69…` (Inbox msg_01M5PKH2EGDD07F8SKVCEAY600). Built the agreed shape:
`publishedRepairGap`/`publishedCorrectionGate` in `corrections.ts`; `publishedDeliveryVerdict` (pure)
and `reconcilePublishedDelivery` (exported seam) in `deliver.ts`; fences in `next.ts`, `step.ts`,
`delivered-round.ts`; `pr_repair` in state with version 5.

Red-capable check: with the six production files reverted (`git stash`), 25 of the #190 assertions fail
(`evidence/recovery-tests-without-fix.log`); with them, all pass.

## Test-architecture change (measured)

The first version ran every remote answer through a full publish. Restructured:

- one real publish, cloned per scenario (`cpSync`) instead of re-publishing;
- the nine remote answers become a pure verdict table (no fixture, no process);
- ten refusal variants share one fixture, since a refusal leaves the round untouched;
- the matrix and the five races call the exported seam in-process through wf's own `gh` seam.

`#190` section: 3 m 25 s → **1 m 45 s**. Whole file: 545 s → 466 s. The remaining cost is the
pre-existing publish-time scenarios (25+ real publishes at ~12 s each), not the new coverage.

Incident during development: the in-process seam resolves its round from the process cwd (`runStep`
does), so a first attempt wrote `step: merged` into THIS checkout's `.wf/state.json`. Detected by the
next assertion, `.wf/` (untracked, created at that minute) was removed, and the test now runs every
in-process call inside its fixture (`inFixture`). No repo file was affected.

## Focused verification

`evidence/focused-final.log`: deliver, deliver-recovery, corrections, correction-fences,
delivered-round, state, next, step, brief, agreement, tsc, eslint — **all green**, 466 s, focused
(10 of 82 files). Full suite NOT run.

Prior failures, isolated before retrying (kept in `evidence/`): the recovery file initially failed on
leaked T3 credentials (fixture isolation, same policy as `src/selfcheck.ts`); `next.selfcheck.ts`
failed on leaked PI session metadata changing fixture bytes (isolated rerun green).

## Independent assessment, round 1 (head f7cf401)

Fresh reviewer context (delegated, did not build). Verdict: **findings**. One high regression: a push
whose handoff write never lands leaves the PR at this round's own later head while `pr_handoff` names
the earlier one; the new verdict refused every answer at that head and only the publication path could
rewrite the handoff, so the round stranded. Base wf resumed it through `deliveryResume`, so the fence
introduced the regression. Also: two evidence gaps, four minor design/standards notes.

## Repair (head 93531fa)

Accepted and fixed: the verdict now accepts a head the round produced (published head or current HEAD);
OPEN at the later head is `superseded` — stale bookkeeping adopted into the handoff under revalidation
so a retry converges; a third head still settles nothing. Added `state.selfcheck` parsing cases,
the failed-refresh property test, a routing assertion that proves routing, the `crash-edit` fixture
mode that dies inside `gh pr edit` after the push, and comments for the two rules the reviewer called
duplicated or unowned.

Declined, on the agreement: `pr_repair` has no age and a later instruction rides a confirmed OPEN
observation. `## Agreed` → `Choice` says "OPEN is an observation, not a remote lease: a later human
merge must be caught at subsequent reconciliation/publication boundaries"; T1 approved that wording and
the per-instruction alternative was the rejected option. The window narrowed anyway: every
`wf deliver` clears `pr_repair` before it asks. This is surfaced to Shay at T2 for an explicit ruling.

Answers recorded in `REVIEW-RESPONSES.md`; round 2 assessment in flight.
