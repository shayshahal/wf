# Direction: consolidate wf

## Approved ownership reduction — 2026-10-18

Shay approved a sharper cut than the original consolidation: wf owns isolated workspaces and
resources, durable decisions, approval identity and safe resumable delivery. Agents own verification
choices and ordinary repairs; an independent final reviewer judges whether the evidence is sufficient.
Remove assessment-prose routing, repair-proof bureaucracy, mandatory per-case baseline replay and
executable unit bookkeeping. This deliberately gives up automated engineering-policy enforcement,
not mechanical safety. The [reduction plan](docs/plans/2026-10-18-smaller-ownership.md) records the
trade, concrete deletions, sequence and verification. It supersedes conflicting target details below;
implementation and deployment are tracked separately there.

## Original consolidation direction

Recorded 2026-10-09; reconciled with HumanLayer's August 2026–present resources the same day. The consolidation goal is agreed; session, reviewer, and artifact counts below are proposed defaults to evaluate, not research-established rules. This is not the implemented workflow or a migration plan. README.md and the round skill still describe current behavior.

## Purpose

**Help Shay agree on consequential choices, see and steer the work cheaply, verify the actual result, and deliver only what Shay approved.**

Make wf smaller: fewer mandatory stages, artifacts, and bookkeeping rules, with more inspectable work and less costly correction. Keep the operational guarantees that make it trustworthy. The target is a small, opinionated coordination layer over existing tools, not a general workflow platform or an interpreter of every engineering decision.

Reliability takes priority over reducing supervision. Spend attention where mistakes are expensive: product intent, user experience, consequential architecture, and maintainability. Cheap mistakes can be cheaper to correct than to prevent through exhaustive planning.

Modularity is one consideration, not a universal requirement. Agents should weigh locality, interface complexity, scope, and correction cost rather than defaulting to either another patch or another abstraction. wf should support proportionate engineering judgment, not turn every preference or observed failure into a mandatory gate.

## Target workflow

```text
Understand + agree → Build ↔ Verify + review → Deliver
       T1                         T2
   when needed                  always
```

Checks and steering happen during building; T2 is the final approval boundary, not the first opportunity to inspect code. Internal stages are not human approval gates. The agent does not invent additional checkpoints during implementation; a genuine blocker or a material change to the agreement can still require a decision.

### Understand + agree

Combine research, design, and planning into one working session. A straightforward ticket can already be the agreement. Complex work gets a concrete T1 discussion before expensive implementation.

Record intended behavior, exclusions, consequential choices, and verification. Use mockups, contracts, or code-shape views where they enable an informed decision. Their presence alone does not establish understanding; complex T1s currently too often get approved without a clear picture of the result.

Detailed implementation steps are working notes, not another approval contract. Remove the current plan → design → mandatory replan sequence.

### Build

Use a lightweight implementation path for ordinary work; one session is a starting default, not a rule for large tasks. Larger changes use bounded, inspectable units, with context boundaries where useful rather than because a commit happened. Keep commits without treating each as a workflow-state transition.

An exploratory prototype can resolve expensive product uncertainty, but is not automatically delivery-ready. Shape large work into digestible changes before asking for approval; fewer stages must not produce an oversized final diff.

The agent owns ordinary implementation choices and proportionate internal restructuring within the agreement. A new file or changed helper is not, by itself, a reason for a user interruption. Material scope, behavior, or architectural changes still require agreement.

Remove mandatory per-commit dispatch, handoff tokens, commit-subject matching, and row-completion bookkeeping. Preserve protections against unrelated changes, verification bypass, and mutations outside the round.

### Verify + review

Keep project-owned tests, relevant suites, behavioral reproduction, and live demonstrations where applicable. Verification must distinguish a behavioral failure from a runner or environment failure; red-base is for discriminating behavior changes, not a blanket requirement for refactors.

Consolidate validate, critique, as-built, and per-rule standards bureaucracy into one independent final review by default. It checks agreement, behavior, consequential design/maintainability issues, and applicable standards. Findings remain distinguishable without mandatory separate workflows or validator–critic exchanges.

Keep useful feedback close to implementation: project checks, local examples, and targeted automated review where warranted. Bound unattended repair attempts; unresolved blockers escalate rather than loop indefinitely. The latest sources use automated review but do not prove an optimal reviewer count.

Make current code, previews, and evidence easy for Shay to inspect and comment on during work, without requiring repeated reports or approval requests. Ordinary fixable findings return to implementation without asking Shay to arbitrate them. Independent review assists human judgment; it does not certify good architecture.

T2 shows the actual change, behavior, evidence, and consequential deviations together. Review the implementation, not just compliance with a predicted plan.

### Deliver

Approval identifies the implementation reviewed. Subsequent product changes invalidate it; any allowance for paperwork-only changes must be explicit. Verification likewise identifies what it checked.

Delivery must safely resume across an interrupted push, PR creation, merge, or tracker update. A local step alone is not evidence that a remote side effect completed.

## Composition and records

wf owns round coordination, consequential decisions, evidence/approval identity, and recovery. Compose existing agent harnesses and project/environment capabilities instead of rebuilding their agent loops, session systems, or execution infrastructure. Preserve the kit/env and core/project boundaries. Add an adapter for a demonstrated difference, not a speculative universal interface or a pass-through wrapper.

Target one human-facing working document and one final review, with machine evidence in logs. Preserve the relationships among the agreement, code, checks, and relevant sessions/artifacts so another session can pick up the work without manual context reconstruction. Prefer references to existing records over copies or a new trace platform. Source material, research, and prototypes may exist without becoming mandatory handoffs. Exact counts, storage, filenames, and migration are not decided here.

Corrections should repair the current work cheaply. Reusable guidance should remain reviewable and live with its authoritative project/workflow source; ticket-specific feedback does not silently become global policy.

State records explicit workflow facts: current activity, pending decision, checked implementation, and approval. Resume should not reconstruct obligations from prose, revision timestamps, row numbers, or special commit subjects. State writes must preserve concurrent updates and distinguish corruption from absence.

Keep worktree/environment lifecycle, project-local guidance and verification, the kit/env separation, usable PI and Claude Code integrations, durable decisions, safe delivery, and cleanup.

Remove the unproven terminal-status prototype on the local review's evidence, not because HumanLayer argues against visibility. Keep useful progress visibility and integrations that deliver an actual benefit; postpone platform expansion. Consolidation means deleting obsolete machinery, not merging files or moving the same complexity into a new generic framework.

## Execution and success criteria

The implementation backlog is linked from [#115](https://github.com/shayshahal/wf/issues/115). Start with [implementation-bound approval and verification (#106)](https://github.com/shayshahal/wf/issues/106); the focused workflow decision is [#110](https://github.com/shayshahal/wf/issues/110).

1. Repair approval freshness, state integrity, verification semantics, and interrupted-delivery recovery.
2. Replace the old pipeline with the smaller path and delete its obsolete prompts, documents, and bookkeeping. Plan an explicit migration; avoid a permanent old/new dual pipeline or a rewrite from scratch.
3. Compare representative ordinary and large rounds for active supervision, costly rework, defects, harness interventions, and whether the changes remain understandable to review. Use actual command and recovery tests alongside the existing selfchecks. If automatic dispatch expands later, bound outstanding work to review capacity rather than generating a backlog.

Success requires fewer mandatory stages/artifacts and less harness intervention without sacrificing the required reliability and ownership guarantees. Speed, agent count, and code volume alone are not success measures. The proposed workflow is a hypothesis to verify, not a proven optimal recipe.

**Deliberate trade: less mandatory ceremony and enforcement of a predicted implementation; more inspectability, inexpensive steering, and verification/approval of the actual result.**

## Basis

- [Adversarial review](docs/reviews/2026-10-09-adversarial-review.md): concrete enforcement gaps and accumulated process complexity.
- [HumanLayer research](docs/reviews/2026-10-09-humanlayer-research.md), especially the August+ reconciliation: composable tools, incremental readable changes, connected work records, inexpensive steering, expected correction cost, and limits of the evidence. Earlier RPI/QRSPI material explains the evolution, not a mandatory target pipeline.
- The direction discussion: lower supervision is valuable, avoiding expensive mistakes matters more, agent-selected stopping points create friction, and engineering choices require tradeoffs rather than blanket rules.
