# Smaller round: working agreement (#110)

**Status: APPROVED by Shay on 2026-10-09.** This is the agreed design basis for the runtime work in #111–#114. It is not implementation, and not the #115 evaluation.

## Decision record
- **Overall workflow.** Question: "Do you approve this smaller workflow as the agreement for implementing #111–#115?" Answer: "Approve this workflow (Recommended)". The approval covers the mechanism below; the examples are illustrative and authorize no product feature.
- **Migration/release.** Question: "Should existing rounds finish before the replacement is released, or should we implement an explicit one-time migration?" Answer: "Finish before release (Recommended)".

**Decided - finish before release.** Active rounds finish on current wf; PRs may publish while they finish; the new pipeline is released only after the active-round audit is clear; legacy state is refused, never silently reinterpreted. No migration command and no pinned-legacy pipeline ships beside the new code.

Governing: public issues [#110](https://github.com/shayshahal/wf/issues/110)–[#115](https://github.com/shayshahal/wf/issues/115), and the repo's `AGENTS.md`.

## Target route
`wf new -> understand+agree (T1 for B/C) -> build <-> verify+steer -> one final assessment -> T2 -> wf deliver`

Research/plan/design/replan stop being handoffs. T1 (complex work) and T2 (delivery) are the only human gates. Between them a correction resumes the same implementation.

## The agreement
- Ordinary (class A): `TICKET.md` is the sole human working document **and** the agreement. No additional `AGREEMENT.md`, and no extra artifact needed to record the repro.
- Consequential (class B/C): one `AGREEMENT.md` with `## Observed` (facts, each sourced `path:line`/command) and `## Agreed` (behavior, exclusions, the consequential choice with one rejected alternative, verification, open questions), plus `## Units` when large.
- Source research, specs and prototypes may exist as optional working notes - never gates or approval contracts - and observed facts never share a line with proposals.

## Example 1 - ordinary, ticket-as-agreement (illustrative, from round BJEW-461)
- Behavior: dismissing the cancel-confirm leaves the order modal at the same scroll position (today it jumps to the top); cancelling still cancels. The ticket is the sole agreement: reproduce, fix, `wf check`, then actual behavior and diff at T2. No planning doc and no per-commit worker.
- Code shape: one modal component; the scroll container stays mounted across open/close; no API, schema or contract path touched.
- Verification: the existing cancel test plus one named assertion that fails on base and passes on the fix.
- Shay sees the diff once, at T2, with the ticket, checks and assessment beside it.

## Example 2 - consequential, class B (illustrative shape)
- Ticket: reshape the order details page into a two-column layout with a persistent actions sidebar; behavior unchanged. T1 joins the build with concrete layout/code-shape choices.
- `## Observed`: the current details-page markup and where its header/actions render - each with a source. `## Agreed`: a page-level `DetailsLayout` with a content slot and a sidebar slot, existing routes rendering through it; excluding any change to the data shown or the actions' behavior.
- Consequential choice, two shapes: extract `DetailsLayout` with a sidebar slot (recommended) vs absolute-position the sidebar over the current single-column markup, which couples to current markup and breaks at narrow widths.
- Units: (1) extract the layout and render the existing header/actions through it; (2) move the sidebar into the slot and add responsive rules - each green independently.
- Verification: the existing details-page tests pass unchanged, plus one named assertion that sidebar and content render in the layout regions (it fails on base because those regions do not exist). T1 approves a frozen `AGREEMENT.md` sha; the diff and preview are inspectable at will, and T2 reads them with any deviation.

## Material change vs ordinary freedom
Helpers, files, local corrections, added tests and naming stay autonomous. Renewed agreement only for genuinely new scope or behavior: a new user-visible surface, a changed contract path, a different persistence choice, a changed verification promise, or dropping an agreed item. A changed path-classification hint alone does not renew the agreement. Detection is the existing checkpoints (contract-path measurement, agreement diff) plus judgement; no new NLP classifier.

## One final assessment, bounded repair, escalation (#113, #75)
- Default one independent, read-only final assessment: intent (met / NOT MEASURED / left out with reason), actual behavior and evidence, consequential design, applicable standards.
- A within-agreement fixable finding or symptom returns autonomously to build first; repairs are bounded (default 2 attempts, an evaluated default, not universal).
- After two unsuccessful autonomous repair attempts, or on a genuine blocker or a material change, ONE contextual escalation - never a question per finding.
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

## Scope of this approval
This document is the agreed design only. The examples are illustrative, not authorization for product features. Implementation (#111–#113), inspection (#114) and evaluation (#115) remain to be built, verified and reviewed under this agreement.
