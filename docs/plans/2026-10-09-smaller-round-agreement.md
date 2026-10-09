# Smaller round: working agreement (#110)

**Status: proposal pending one approval.** Only migration/release is already decided; everything else is a recommendation. No runtime, prompt, state, hook or worktree change until you approve.

**Decided 2026-10-09 - finish before release.** Active rounds finish on current wf; PRs may publish while they finish; the new pipeline is released only after the active-round audit is clear; legacy state is refused, never silently reinterpreted. No migration command and no pinned-legacy pipeline ships beside the new code.

Direction: `DIRECTION.md` (2026-10-09) and `AGENTS.md`.

## Target route
`wf new -> understand+agree (T1 for B/C) -> build <-> verify+steer -> one final assessment -> T2 -> wf deliver`

Research/plan/design/replan stop being handoffs. T1 (complex work) and T2 (delivery) are the only human gates. Between them a correction resumes the same implementation.

## The agreement
- Ordinary (class A): `TICKET.md` is the sole human working document **and** the agreement. No additional `AGREEMENT.md`, and no extra artifact needed to record the repro.
- Consequential (class B/C): one `AGREEMENT.md` with `## Observed` (facts, each sourced `path:line`/command) and `## Agreed` (behavior, exclusions, the consequential choice with one rejected alternative, verification, open questions), plus `## Units` when large.
- Source research, specs and prototypes may exist as optional working notes - never gates or approval contracts - and observed facts never share a line with proposals.

## Example 1 - ordinary, ticket-as-agreement (illustrative, from round BJEW-461)
- Behavior: dismissing the cancel-confirm leaves the order modal at the same scroll position (today it jumps to the top); cancelling still cancels.
- Code shape: one modal component; the scroll container stays mounted across open/close; no API, schema or contract path touched.
- Verification: the existing cancel test plus one named assertion that fails on base and passes on the fix.
- Shay sees the diff once, at T2, with the ticket, checks and assessment beside it.

## Example 2 - consequential, class B (illustrative shape)
- Ticket: cancelling an order records a reason from a fixed list, and the order detail shows it.
- `## Observed`: where cancel is handled, the current request/response fields, the detail render path - each with a source. `## Agreed`: the cancel endpoint takes a reason from a fixed set, rejects others, stores it; the detail shows the label; excluding free text and reason editing.
- Consequential choice, two shapes: store a stable code and render its label (recommended) vs store the label itself - renaming a label must not rewrite history.
- Units: (1) API accepts/rejects/stores the code; (2) detail renders the label - each green independently.
- Verification: named tests execute the new cases (valid recorded, invalid rejected) and the pre-existing cancel tests still pass; the API test fails on base for the intended reason.
- T1 approves a frozen `AGREEMENT.md` sha; T2 reads the actual diff, evidence and any deviation.

## Material change vs ordinary freedom
Renewed agreement only for genuinely new scope or behavior: a new user-visible surface, a changed contract path, a different persistence choice, a changed verification promise, or dropping an agreed item. A new helper, file, local refactor, added test or naming stays ordinary - a changed path-classification hint alone does not renew the agreement. Detection is the existing checkpoints (contract-path measurement, agreement diff) plus judgement; no new NLP classifier.

## One final assessment, bounded repair, escalation (#113, #75)
- Default one independent, read-only final assessment: intent (met / NOT MEASURED / left out with reason), actual behavior and evidence, consequential design, applicable standards.
- A within-agreement fixable finding or symptom returns autonomously to build first; repairs are bounded (default 2 attempts, an evaluated default, not universal).
- ONE contextual escalation only when repairs are exhausted, a genuine blocker exists, or the change is material - never a question per finding.
- A still-unmet intent or still-reproducing symptom blocks T2 until fixed, accepted or the round is held - never silently passed through.

## Verification and approval identity (preserve #106-#109)
- A named test must actually execute and pass. For a behavioral defect the base failure is the declared intended assertion (red-base discriminates the change); a behavior-preserving refactor may pass on both sides. A green run is not proof that a specific assertion line executed.
- #109's executed-case/assertion proof, #107's serialized atomic state + corrupt-state refusal, and #108's remote delivery reconciliation are retained.
- #106 approval generalizes from row scope to the agreement's full protected scope: product and test files outside the round folder, the round's repro, and protected tests. A product/test/repro change after T2 makes approval stale and blocks delivery; any paperwork-only exception stays explicit.
- T2 shows what was built, not compliance with a predicted plan.

## Inspection and cheap steering (#114)
- Extend the existing `wf status` (or one `wf inspect`) to name the agreement, a short diff summary, latest checks, and references to relevant sessions/artifacts (`state.opened_by`, harness session id).
- References, not copies; no new store, trace format or dashboard. Feedback via comments and `wf ask`/`wf decide`; a local correction resumes the same implementation without replanning.
- Terminal status exists in `src/notify/osc7501.ts` and `env/adapters/osc7501.ts`; the obsolete receiver-less part is removed at #114 on the local review's evidence, keeping useful visibility. #116 stays excluded.

## Route options
- **A (recommended):** one thin route inside the current coordinator (`wf step`/`wf next`: agree, build, assess, review/pr). Deletes the nine steps, eight phase prompts, brief tokens, row bookkeeping and exchanges; keeps the deterministic gates and #106-#109.
- **B:** drop `wf next`/`brief`/`step`; boundary commands only, the harness owns the loop - fewer internals, but resume/"what's next" moves into the harness and the human's head, the intervention we are reducing.
- **C (rejected):** configurable stages - the same complexity behind config and a general engine.

## Delivery sequence (#111-#115) - engineering, not a permission request
#111/#112/#113 are coupled by `next.ts`/`prompt.ts`/`brief.ts`/`handoff.ts`, so half-deleted stages cannot work. Plan: docs (#110) -> ONE green runtime PR for #111-#113 (route + agreement + deletion of per-commit dispatch, the review pipeline and legacy prompts) -> inspection (#114) -> evaluation (#115). Each landing PR stays green and selfchecked. #74's decided skip is represented or explicitly retired; #75 is covered above.

## #115 evaluation
Real product rounds run on the installed copy, not this editing clone. Distinguish real harness/product runs from simulated CLI fixtures; fixtures prove command contracts, not human attention or defects. Baselines use existing round records (`friction.ts`), not invented attention measures; report limitations, with no causality from a small sample. Reviewer/session counts and the 2 repair attempts are defaults to evaluate.

## Approval question
**Do you approve this target route and agreement model - ticket-as-agreement for ordinary rounds, one `AGREEMENT.md` for consequential work, one final assessment with autonomous within-agreement repair, and T2 blocked on unmet intent - as the design basis for #111-#114?**
