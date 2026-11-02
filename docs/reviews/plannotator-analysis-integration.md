# Plannotator analysis: findings and proposed wf integration

Research snapshot before implementation. Issue: https://github.com/shayshahal/wf/issues/242.
The implemented boundary, independent-review findings and verification are recorded in
[242/BUILD.md](242/BUILD.md). In particular, that report supersedes the automatic archive-based
verdict import proposed below: unbound UI results remain pending.

## Evidence

Inspected the installed CLI (0.28.45), upstream source at tag `v0.28.45` (Git object `8af8544aca1b4378bb22b4b958c1da21d08f2772`), local analysis configuration and runtime files, and wf's current review path. This was source/config inspection, not a live UI or end-to-end approval test. No runtime was installed and no setting was changed.

### Features relevant to wf

- **Semantic changes**: enabled by default in Plannotator, backed by Ataraxy `sem`. Lists changed entities, including added/modified/deleted and moved/renamed/reordered entities, with source locations and navigation. The full panel and per-file badges supplement the ordinary text diff.
- **Call flow**: experimental, off by default. CallDiff infers changed entry paths and call/branch steps from syntax. Its Paths view is an interactive tree; Raw shows its ASCII output; per-file `flow N` lenses use the same snapshot result. Changed source-located steps support native review comments.
- **Call flow is not a runtime call stack**: no type/import resolution, dataflow, dynamic-dispatch proof or test coverage. Duplicate symbol names can be ambiguous. It cannot replace wf's measured error landings or verification.
- **Installation**: enabling Call flow is consent to download the managed core and needed language packs. Requires Node 22.18+. Let Plannotator own this installation and its pins; do not add CallDiff or sem as wf dependencies.
- **Snapshot handling**: Plannotator binds analysis to the displayed diff snapshot and rejects stale results. A repository-backed Git review preserves source navigation and call-flow materialization. A static patch is not an equivalent call-flow integration.
- **Guided Reviews**: a separate authored/AI-generated walkthrough of an exact patch. Inbox `get_guide_brief` and `submit_guide` can deliver these asynchronously. They are not the live Semantic changes / Call flow panels and do not themselves grant wf delivery approval.

### This machine

`plannotator data-dir` reports `C:\Users\Shay\.plannotator`.

- `config.json`: `reviewAnalysis.semanticDiff = true`, `reviewAnalysis.callFlow = false`.
- Managed `vendor/sem/v0.8.0/sem.exe` exists and reports `sem 0.8.0`.
- Managed `vendor/call-flow/calldiff-0.6.0` is absent. No claim was made about other versions or override runtimes.

Thus semantic analysis is configured and its managed engine is present; Call flow is disabled. Successful analysis of a real review remains unmeasured.

## Current wf gap

- `src/gates/review.ts` prepares REVIEW.md and evidence, then emits a native presentation handoff or asks for a chat verdict. It does not open Plannotator code review.
- `env/adapters/plannotator.ts` only implements gated document annotation for the current ReviewUI seam.
- `src/seams.ts` exposes `ReviewUI.annotate`, not a code-review operation.
- `src/gates/review-format.ts` retains structured feedback folding and base checks from the older review integration. Treat those as reusable code to revalidate, not proof that current 0.28.45 feedback matches the old contract.
- `process/CALL-STACK-FORMAT.md` specifies authored `+ / - / ~` behavioral views. These explain intent and measured failure paths; keep them alongside generated analysis.

## Recommended integration

### 1. Start with the session-native tool

After `wf review` prepares the evidence, the session opens the Plannotator review tool with the exact worktree, explicit round base and `gate: true`. Use the tool rather than shelling out when the tool is available; it returns immediately, preserves session questions and delivers the actual feedback later.

Use Semantic changes as the entity overview and Call flow as the path overview, then inspect the text diff and proof. Enable Call flow through Plannotator's own Settings → Analysis consent, not by silently editing user configuration.

A review's initial diff mode must match wf's committed `base...HEAD` scope. The CLI supports `--diff-type merge-base`; the current session tool exposes base but not diff-type. Therefore either add this supported option to the host integration, or explicitly select/verify the matching UI mode and reject feedback for a different scope. Passing only a base is not sufficient: the default since-base view can include uncommitted/untracked files, including round paperwork.

Do not weaken approval identity checks to accommodate the UI. Record the actual comments/verdict under the prepared content and HEAD identities; revalidate at `wf review --done`. Reject approval after content changes, a different compare selection or a mismatched checkpoint/final scope. Dismissal is never approval.

### 2. If automatic non-native launching is wanted

Extend the existing generic ReviewUI seam with the one code-review operation needed by T2. Implement the external CLI adapter only in `env/adapters/plannotator.ts`; keep core free of Plannotator/runtime details. A native presentation adapter still takes precedence. Do not introduce a second review state machine.

Launch a repository-backed review with explicit base and merge-base mode. Revalidate the 0.28.45 decision and annotation contract before reusing the old feedback-log reader. Structured stdout's `decision`, not rendered `message`, is authoritative; test approval with notes, requested changes, dismissal and startup failures separately. Verify the actual displayed comparison as well as its base label.

### 3. Keep the authority split

- Plannotator owns diff rendering, analysis, engine installation and inline comments.
- wf owns agreement, proof, independent assessment, implementation-bound human approval and delivery authorization.
- Inbox owns asynchronous discussion and optional guided walkthroughs, not a substitute approval gate.

## Verification before shipping

1. A small real TS review loads semantic entities and, after explicit consent, Call flow Paths/Raw and source navigation.
2. A changed Call flow step's comment reaches the exact file/line in recorded feedback.
3. Initial and switched diff modes are checked against wf's expected range, including checkpoint ranges.
4. Approval, approval-with-notes, requested changes and dismissal map correctly; startup failure cannot reuse old feedback.
5. Changed content or HEAD invalidates the pending approval; a checkpoint cannot authorize final delivery.
6. Disabled or missing analysis leaves ordinary review usable and reports unavailable evidence honestly.
7. Selected selfchecks plus tsc/eslint run through `node src/selfcheck.ts ...`; label the result focused, not full-suite. A live review submission is still required to validate the integration contract.

## Sources

- [Installed-version Call flow specification](https://github.com/backnotprop/plannotator/blob/v0.28.45/adr/specs/calldiff-call-flow-integration-20260811.md)
- [Installed-version review implementation guide](https://github.com/backnotprop/plannotator/blob/v0.28.45/docs/agent-guides/code-review.md)
- [Installed-version semantic engine adapter](https://github.com/backnotprop/plannotator/blob/v0.28.45/packages/shared/semantic-diff.ts)
- Local: `src/gates/review.ts`, `src/gates/review-format.ts`, `src/seams.ts`, `env/adapters/plannotator.ts`, `process/CALL-STACK-FORMAT.md`.
