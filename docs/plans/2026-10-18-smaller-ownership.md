# wf reduction proposal

Ownership decision approved by Shay on 2026-10-18 (Inbox decision `dec_01M57DV3DZC25ZXMC7C1ZHTX0G`). Implementation is in progress, not deployed. The unfinished `wf-round-feedback-cost` patch is preserved and is not part of this reduction.

## Diagnosis

DIRECTION.md already asks for a small coordination layer. The remaining problem is responsibility, not file size: wf coordinates work AND interprets engineering evidence AND polices the agents' repair conversation.

Concrete examples in current code:
- `src/gates/check.ts` selects checks, interprets runner output, manages baseline runs and classifies repro verdicts.
- `src/round/next.ts`, `step.ts`, and `handoff-hook.ts` each apply parts of the handoff policy.
- `src/round/agreement.ts` and `assessment-rulings.ts` turn assessment language into workflow decisions.
- `repair-findings.ts` and the build prompt require findings and source/content-bound repair responses in addition to tests and an independent assessment.
- `build-units.ts` adds per-unit assessments, scope identities, checkpoint receipts and a separate integration route.

JX-437 shows the cost: the default check did not produce the per-case baseline evidence assessment expected. Useful implementation finished quickly; conflicting handoff obligations generated extra verification and repair work. JX-1399 shows a different responsibility that must remain explicit: disposable verification fixtures and cleanup have real ownership requirements. Deleting coordination logic does not itself repair those tools.

## Recommended ownership

| Owner | Responsibility |
|---|---|
| Person | Intended behavior, consequential choices, material scope changes, final approval |
| Agent + harness | Research, plan, delegation, implementation, verification choice, ordinary repairs, context management |
| Independent final reviewer | Whether intent is met, evidence is credible, design/standards findings; names real gaps |
| Project tools | Test commands, fixtures/reset, live demonstrations, optional baseline experiments |
| wf | Isolated workspace and owned resources; durable decisions/status; reviewed-change identity; safe, resumable delivery and cleanup |

The agent must have enough tools to verify the task. Missing capability is not an instruction to make the agent fix everything: name the missing capability and its owner, then stop or take an authorized separate repair.

## The ordinary path

```text
request / working agreement
        |
        +-- consequential choice? --> person agrees
        |
        v
build + verify <--> ordinary corrections
        |
        v
independent final review
        |
        +-- fixable finding ------> build + verify
        +-- actual decision ------> person
        |
        v
person reviews change + evidence and approves
        |
        v
safe delivery --> post result --> release owned resources
```

Large work can have human-agreed checkpoints and bounded worker sessions. A checkpoint is a review of a named diff, not another mandatory case/assessment/integration state machine. The harness manages worker sessions; wf need not prove that every session boundary completed a miniature round.

## Delete, rather than rename

1. **Assessment prose as a programming language.** Remove automated routing from `NOT MEASURED`, `surviving:`, `material:`, `deferred:`, and quoted intent lines. A reviewer explicitly reports ready / changes needed / decision needed; prose explains why. Do not replace this with a larger JSON schema of engineering obligations.
2. **Repair-response bureaucracy.** Remove obligatory R1/source/content-sha response documents and question-specific proof files. The next reviewer reads the previous findings, current diff and actual evidence. Ordinary findings do not become fix-or-accept votes automatically.
3. **Mandatory per-case baseline proof.** Remove the obligation for every verification row to run both sides, including preservation/test-only work. Retain an optional isolated baseline tool for bug discrimination when useful. Refactors need relevant regression checks, not universally a baseline replay.
4. **Case rows as executable workflow state.** Remove row/check-cell/scope completion gates. A verification plan is human/agent-readable working material, not a second build system.
5. **wf-owned unit execution.** Remove mandatory per-unit assessments, completion receipts, deferred-intent rules and integration reassessment. Keep agreed checkpoints and small reviewable diffs without executing a plan table.
6. **Duplicate handoff judges.** Remove semantic handoff checks from hooks and multiple command paths. The retained transitions have one mechanical authority. Hooks may record a session reference, not rejudge engineering work.
7. **Universal three-run repro rule and automatic full-suite rule.** The agent chooses repetitions and relevant checks for the hypothesis. A flaky test may need more than three runs; a deterministic unit test may need one. No hidden suite requirement at a later handoff.
8. **Per-incident global prompt rules.** Remove instructions whose only job is satisfying deleted machinery. Keep task-specific lessons in project tests/guidance when they actually generalize.

Targets for deletion or substantial shrinkage include `assessment-rulings.ts`, `repair-findings.ts`, `build-units.ts`, the semantic parts of `agreement.ts`, `next.ts`, `step.ts`, `handoff-hook.ts`, and their protocol-specific tests. This is a candidate deletion list, not a claim that every line in those modules is disposable.

## Keep — and why

- Worktree isolation, readiness checks, owned-process release, safe cleanup/retry: these prevent real damage or leaked resources.
- Fixture setup/run/reset tools: reusable capability, not a certificate that the behavior was tested correctly.
- Raw command output, exit status, duration and checked-change identity: a record of execution, not a claim that all intent is met. Never label unexecuted or crashed tests passed.
- One working document and one final independent review, with links to existing evidence instead of mandatory mirrored reports.
- Explicit unresolved decisions and answers across session restarts.
- Approval bound to the reviewed change; changed implementation requires reapproval.
- Interrupted-delivery recovery and remote confirmation; never infer merge from a local phase.
- Project/machine seams and both harness integrations where they provide demonstrated capability.

## Deliberate trade

We give up wf mechanically enforcing that every intent has a current row, every requested repair has a specially formatted answer, and every baseline failed at a named assertion. Those checks have caught real mistakes. Their replacement is NOT an equally strong automated certificate: it is usable verification tools, an independent reviewer and the person's final review.

wf cannot establish semantic correctness by parsing an assertion or a report. Keep strong mechanical guarantees where it can establish facts; let engineering judgment remain explicit judgment. If this trade is unacceptable, the scope of reduction must be smaller.

## Execution — replacement, not another layer

1. Agree on this ownership cut before coding. Freeze additions to semantic workflow enforcement during the reduction.
2. Trace retained safety guarantees to tests before deleting their callers. Inventory the command and state fields each deletion makes orphaned.
3. Replace repair/prose interpretation with one explicit review outcome; remove the obsolete producers, parsers, tests and prompt requirements in the same change. Do not introduce dual review protocols.
4. Stop using verification rows to gate progress. Use ordinary harness command records and retain optional isolated baseline capability; remove mandatory baseline and suite policies and their workflow readers together. Existing affected-check execution may remain an optional convenience if it still earns its maintenance; introduce no new generic command runner or mirrored evidence protocol.
5. Remove executable units and duplicate semantic handoff hooks. Preserve human-agreed checkpoints and inspection through a small review path, not a parallel unit runtime.
6. Trim state/status/skills to retained facts. Test ordinary work, consequential agreement, requested checkpoint, failed verification, real decision, changed approved code, interrupted delivery and cleanup.

Each cut must reduce the facts a caller must know and the number of places implementing a rule. Moving a parser into a generic workflow engine is not a reduction.

## Validation

- Compare against recorded JX-437/JX-1399 timing and failure categories; do not claim a replay improved until it actually did.
- Exercise a representative small bug and a larger change through the reduced path, including one correction. Measure active work, command time, waits, reruns and wf interventions separately.
- Require fewer mandatory artifacts/transitions and no semantic policy duplicated across prompts, hooks and runtime.
- Preserve adversarial checks for stale approval, failed/unexecuted commands presented as passed, unsafe deletion, unowned processes and interrupted delivery.
- Run focused tests per cut, not the known unreliable aggregate suite as the inner loop. A real lifecycle exercise remains necessary for resource/hook changes.
- Do not self-update active rounds across an incompatible protocol change. Finish existing rounds on their version before switching; avoid a permanent dual runtime.

## Approved decision

Remove wf's semantic proof/repair policing while retaining independent final review and mechanical approval/delivery/resource safety. Shay explicitly accepted that this gives up automated engineering-policy enforcement; it is not a promise of identical guarantees with fewer files.

## Implementation record

Baseline: `bbb1656` (`origin/main` when the reduction worktree was created). Tracked `src/` TypeScript has 51 runtime files / 9,027 lines and 60 selfcheck files / 7,749 lines (newline-split counts). These are a deletion baseline, not evidence of workflow speed or correctness.

Before-change safety check: `src/gates/content-identity.selfcheck.ts` passes from an isolated archive of `bbb1656`. It exercises stale/unbound approval refusal, uncommitted product at review, mutating checks and push hooks, sibling path identity and the existing checkpoint safety path. Re-run its retained invariants against the replacement; deleted unit scheduling assertions need replacement checkpoint coverage, not preservation of the scheduler.

First cut in progress: remove assessment-prose routing and obligatory repair-response/proof formats. Retain explicit reviewer outcomes and mechanical assessment freshness. Executable units and verification-row enforcement are later cuts; do not describe this first cut as the completed reduction.

Next-cut design: retain optional human-agreed checkpoints as explicit `wf review --checkpoint` diff reviews, separate from final `REVIEW.md`; checkpoint approvals resume building and never authorize delivery. Remove the plan-table scheduler and per-unit assessment/receipt state rather than replacing them with another registry. Ordinary command execution and records belong to the harness, not a new generic wf command language.

No publication or active-round cutover is authorized by the local implementation record. Validate the replacement and finish incompatible active rounds before deployment.
