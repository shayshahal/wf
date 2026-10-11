# wf adversarial review and future-direction grilling

Reviewed: `5710c6e` (2026-10-09, plugin 0.1.54). Working tree was clean before review.
Scope: wf's purpose and architecture, recent changes (especially October 5–9), current command behavior, and locally available round/evaluation records. One reviewer; no subagents. No implementation changes, real rounds, network merges, or package changes.

## Verdict

**wf works as an operational workflow. It has not demonstrated that its full ceremony is the best way to obtain reliable changes with less human attention. Process complexity is becoming too high relative to the evidence that each additional mechanism earns its keep.**

The distinction matters: delivered PRs demonstrate capability, not comparative advantage. Green selfchecks demonstrate the covered behavior, not all advertised safeguards. Neither means the project is a failure.

The strongest direction is a small, trustworthy round runner over the project's own verification capabilities. The current tendency is a policy interpreter, review pipeline, environment manager, and terminal integration project sharing one release stream. Those ambitions need an explicit choice, not another incident-driven patch.

## What it sets out to do, and whether it does it

Sources: README.md; docs/research/papers-and-first-principles.md; skills/round/SKILL.md.

| Promise | Assessment |
|---|---|
| Turn tickets into merged PRs through isolated phases | Demonstrated by real delivered rounds. |
| Preserve memory so a new session can resume | Substantial implementation, but state corruption, stale writes, and post-merge interruption recovery remain weak. |
| Replace probabilistic instruction with deterministic verification | Partially achieved: real commands, fences, reproducibility runs, and HEAD-keyed suites are valuable. Evidence freshness and red-base failure semantics leave important holes. |
| Keep the human responsible for the design and diff | Meaningful T1/T2 surfaces, live walks, and intent records. T2 does not bind approval to the reviewed implementation. |
| Treat human attention as scarce | Not demonstrated comparatively. Routine rounds still accumulate many plan agents and questions; there is no complete-workflow attention baseline in the reviewed evidence. |
| Keep project knowledge in the project, machine knowledge in env | A strong separation with real kit/env implementations and a boundary selfcheck. Some project test policy is still duplicated in wf. |
| Serve the team without Shay's machine | A credible implementation, but the reviewed performance evidence is mainly Shay's rounds. No conclusion about team adoption or independence follows from that. |

## Concrete findings

### F1 — High: T2 approval is not bound to the reviewed implementation

Locations: src/gates/review.ts:190–212; src/gates/deliver.ts:194–196, 240–256; src/gates/review-format.ts:ReviewHeader.

`review --done` checks base labels and the verdict, not a reviewed HEAD or product-tree identity. `t2Gap` accepts `step: pr` and an approved verdict. Validation's handoff token is likewise not a check that the current tree is the validated tree. Delivery runs the last row's checks after approval; project pre-commit checks can rewrite/stage files, but approval is not invalidated.

**Reproduced through the real CLI in a temporary repository:** write approval, commit a product change afterwards, run `wf review review/freshness --done`. Exit 0; state becomes `pr` despite the changed HEAD. No push or merge was attempted.

Consequence: ordinary post-review changes can retain an approval that belongs to different code. This undermines the claim that the user owns what merges; it does not require a malicious agent or hand-editing state.

Required invariant: approval and validation identify the implementation they judged. New product changes invalidate them; explicitly permitted paperwork-only commits do not needlessly repeat human review.

### F2 — High: a row's historical green is treated as current evidence

Locations: src/round/handoff.ts:107–110; src/gates/check.ts:checkRunLine/runCheck; src/round/next.ts:snapshotOf.

`rowDone` requires a matching commit subject and **any** green check for that row number. It does not bind the green to a commit, checked content, plan revision, or implement brief. The row-check log carries no content identity. Plan revisions void implement briefs but leave old checks available.

**Reproduced directly through the public function:** matching subject, row 1 green, then row 1 red => `rowDone` returns true.

Consequence: the orchestrator can skip a revised or subsequently failing row. Later suites and validation may catch it, but that is not deterministic enforcement of the advertised per-row gate.

Required invariant: a completed row refers to the particular implementation and evidence that completed it, not a reusable row number and commit subject.

### F3 — High: red-base accepts failures that are not behavioral proof

Locations: src/gates/check.ts:350–396; projects/jewelryx/checks.ts:rowTasks.

The reverted run is rejected only for `status === 0`. A nonzero import/collection/setup failure counts as the expected red; even a null spawn status falls through to the green log. In some backend rows the marked pytest task includes several changed test files, so an unrelated failure can also supply the red.

**Reproduced with the actual `withFixReverted` helper in a temporary git repository:** a test imports a newly created implementation. With the implementation present it exits 0; reverting removes the implementation, and the test exits 1 with `ERR_MODULE_NOT_FOUND` before its assertion runs. The current acceptance branch accepts this as red-base proof. A nonexistent executable separately demonstrated null spawn status; acceptance of null is established by the branch condition, not a full production-project run.

Consequence: the October 8 addition improves the intent of verification, but does not yet establish the causal claim it advertises. It also imposes unnecessary friction on behavior-preserving refactors, whose valid tests should pass on both sides.

Required invariant: a runner actually ran and reached the intended behavioral assertion. Use red-base where a behavior changes; do not demand artificial failures from every test-bearing refactor.

### F4 — Medium: state tracing diagnoses lost updates but does not prevent them

Locations: src/round/state.ts:68–91; src/round/brief.ts:runBrief; src/round/state-trace.ts.

State is read/merged/written without locking or an atomic replacement. Nested maps still come from earlier caller reads. Malformed existing JSON reads as no state, permitting a subsequent patch to replace the round with a partial object.

**Reproduced in temporary storage:** an old briefs map overwrote a newer validate brief; a truncated state followed by `writeState({step: 'implement'})` left only that step. The state-trace comments already document a real count rewind on JX-252; the reproduction verifies the remaining mechanism, not a new observed production occurrence.

Consequence: fresh contexts cannot compensate for a nondurable source of truth. Adding a log and another counter helps explain failures, but is not a persistence guarantee.

Required invariant: serialize updates, preserve current nested state, write atomically, and distinguish absent state from corrupt state. This does not require an event-sourcing framework.

### F5 — Medium: `wf classify` silently does nothing

Locations: src/run.ts:116–118; src/gates/classify.ts:entry guard.

The dispatcher imports classify.ts, but its entry guard only runs classification when the process entry is classify.ts itself. Under wf.mjs that condition is false.

**Reproduced:** `node wf.mjs classify` and a temporary-project `wf.mjs classify --json` both exit 0 with empty output. `wf step classify` invokes the script directly and is not affected by this finding.

Consequence: a documented command gives success without the promised result, and the current selfchecks do not catch the command wiring.

### F6 — Medium, inspected rather than externally reproduced: delivery is not safely resumable across the merge

Locations: src/gates/deliver.ts:297–320.

The remote merge happens before the tracker note and local `merged` state are written. Termination or a filesystem error in between leaves the local round at `pr`. Retry treats an existing PR as something to edit and merge; it does not reconcile whether that PR has already merged and finish the remaining local work.

Consequence: the workflow's most consequential side effect has an interruption window its advertised resume path does not explicitly handle.

Required invariant: inspect remote PR state during recovery and finish the local note/state after an already-completed merge. Do not infer success from a local step alone.

## Complexity: the problem is not just size

Tracked `.ts`/`.mts`/`.mjs` source lines, including tests, rose from 2,729 at the September 23 import (`ddc408d`) to 9,863 at the reviewed HEAD. Total tracked files rose from 66 to 170. There are 65 non-merge commits dated October 5–9. These are warning indicators, not a proof of overengineering.

The stronger evidence is the interface the system makes agents and humans learn:

- Markdown is simultaneously a human document and a machine protocol: exact headings, verdict words, check-cell grammar, special commit subjects, and embedded tokens.
- Decisions and completion are reconstructed from question text, revision timestamps, history order, commit subjects/times, row numbers, and brief times. The recent fix-ruling and T2-revision patches illustrate how fragile that reconstruction is.
- A plan must predict exact file edits before implementation; forgetting one sends work back through the plan owner. Useful for scope control, expensive for harmless discovery.
- Every matching repository rule adds a sequential review agent. This has no demonstrated cost/benefit curve in the reviewed records.
- A bad next-action line requires stopping product work and fixing wf in another PR. Agents must understand the harness well enough to distinguish harness trouble from product trouble.
- The skill says a BLOCKED, rejected plan, deviating validation, or over-budget round is a harness gap, not a bad agent. That is a useful diagnostic prompt, but a poor universal law: ambiguous requirements, ordinary product iteration, and stochastic agent errors do not all deserve permanent infrastructure.

This is the failure mode first-principles.md warns about: agents learning the harness before the application, harness debugging as a new workload, and one fact living in several places.

**Important counterargument:** many additions answer documented incidents, not imagined future requirements. The problem is not lack of a reason for each patch. It is lack of a deletion/simplification test for the accumulated process.

## Evidence of benefit — and its limits

Local reap ledger: `~/.cache/wf-reaped/ROUNDS.md`.

| Delivered round | Recorded friction |
|---|---|
| BJEW-562, class A | 7 plan briefs; 7 questions; 1 T2 |
| BJEW-617, class A | 2 plan briefs; 4 questions; 6 red checks |
| BJEW-669, class B | 2 plan briefs; 0 questions; 1 T2 |
| JX-1221, class B | 16 plan briefs; 16 questions; 7 T2s, 5 changes-requested |

Recorded elapsed times include idle time and waiting; they are not active engineering time. Historical implement-agent counts are known to undercount because revisions erased brief keys before the latest counter fix. Do not use those counts to calculate total agent cost. Several JX-1221 revisions are genuine user/product changes, not necessarily wf defects. Still, the record shows substantial human interaction, not a consistently lightweight two-checkpoint experience.

Existing measurement work is worth keeping:

- `env/projects/jewelryx/plan-eval.ts` supports paired wf revisions, generated plans, costs, and code grading. The grader mostly checks file recall against what shipped, valid handoff, and final repro. It is useful for plan-file omissions, not a measurement of design quality, overbroad plans, escaped bugs, or full-workflow human attention. The local saved runs inspected were small and did not establish a full-workflow comparison with a simple single-agent baseline.
- `~/.cache/wf-rework/2026-10-05.json` reports 9 wf PRs old enough for the 7-day window, 1,139 added code lines, and 0.2% reworked by fixes/reverts. This is encouraging. Shay's other ticket PRs show the same rounded 0.2%. There are no mature wf observations at 14 days in that sample. Selection, task size, and the line-based metric prevent a causal conclusion.

The honest statement is: **some evidence of clean shipped work, insufficient evidence that the whole process is necessary to obtain it.**

## Latest updates: which direction they represent

### Strengthening the actual product

- Plan-file class measurement: moves a real authority decision from the agent's declared class into deterministic code.
- Suite runs keyed to HEAD: directly checks what changed and catches regressions outside the row's test.
- Delaying stacks until needed: removes resource burden and makes ordinary rounds cheaper.
- Separating kit/env and reading project guidance from the project: improves locality and portability.
- Smaller reviewer-ordered PR bodies: improves an actual human touchpoint, although large plans should be prevented rather than merely truncated.

### Useful idea, insufficiently earned implementation

- Red-base: the right desire for discriminating tests, the wrong acceptance rule and overly broad application.
- State traces and surviving brief counts: good diagnostic/accounting work, but not a substitute for safe state writes.
- Per-rule agents and validate/critique exchanges: reasonable experiments, not established defaults without incremental-yield measurements.

### Newest commit: terminal status is not yet delivered round visibility

`5710c6e` adds 448 lines and removes two around OSC 7501, tests, and reap integration. Its commit message explicitly says there is no implementing terminal on this machine yet and the receiver candidates are unmerged.

There is also a producer-side transport gap: `env/adapters/osc7501.ts:23–34` refuses non-TTY stdout, even with the force switch. Running its decision from this session's bash tool yielded `isTTY: undefined` and `write: false`. Thus this session's ordinary command route emits no reports; a bare interactive terminal may behave differently. No end-to-end screen test was done. The distinction is not a protocol-format defect; the byte-level tests are useful. It is an integration that is not yet delivering its user benefit along the reviewed agent-tool route.

If terminal integration is an explicit product goal, this is a defensible prototype. If wf is meant to save attention on tickets, receiver-less status support should not outrank approval freshness, state integrity, and comparative measurement.

### Update and release discipline

Shay's entry follows main between commands, hence potentially between phases of an active round. This is explicitly documented in the round skill, not an undisclosed bug. It also means an active round can change prompts and enforcement as wf evolves. State records the entry mode but no pinned wf revision/schema; model patterns select the newest matching model. Reproducing a process result therefore requires more than the product base SHA.

A local pre-push hook and 41 green selfchecks are meaningful safeguards. They are not centralized release verification, compatibility testing, or a complete interruption/concurrency/CLI test suite. Consider pinning the runner per round, explicit upgrade/migration, and actual command-contract tests before adding more ceremony.

The supplied `pi update --all` output is a separate layer: it reports npm/git package updates, two high-severity dependency advisories, and a node-pty install-script approval warning. wf has no npm runtime dependencies, and the log does not identify the vulnerable packages or prove node-pty is broken. Do not blame wf for those advisories or run `npm audit fix --force` from this review. Auditing that package graph and testing the live harness would be a separate task. This review ran with Node v26.10.0 and PI 1.1.0; it did not certify all integrations after the package update.

## Recommendation: consolidate before expanding

1. **Repair the trust substrate:** current-evidence row completion, implementation-bound approval, behavior-specific red-base, safe state writes, and post-merge recovery.
2. **Prove command contracts:** exercise real CLI entrypoints and interruption/staleness scenarios, not only helpers. Keep the existing fast selfchecks.
3. **Freeze new process machinery for a short experiment:** compare the current flow with the cheapest credible alternative on comparable tasks. Measure active human minutes, questions, agent cost, escaped defects, and harness interventions separately from elapsed time.
4. **Give each expensive stage a renewal test:** what did it catch that existing tests and human review did not? What overhead did it add? Remove or make optional stages with no incremental benefit.
5. **Choose the product before choosing another architecture:** personal leverage tool, team workflow kit, or broader agent/terminal platform. Avoid adding a generic plugin framework, event graph, or new policy registry to answer this review.

Keep: worktree isolation, project-owned verification, explicit intent, resumable artifacts, meaningful human approval, and the kit/env split. Do not rewrite wf from scratch. Do not confuse removing assurance with removing redundant ceremony.

## Grilling session

### Ground rules

- One question at a time; require an example from actual work.
- Separate a desired outcome from a favorite mechanism.
- Every answer changes scope, a default, a measurable target, or an explicit non-goal.
- Do not solve each objection by adding a new stage.
- End with a short direction decision, not a grand architecture plan.

### Round 1 — What is the product?

1. **Finish this sentence without naming phases or tools: "wf exists so that ___ can ___ with less ___."** Who is the primary user: you, the JewelryX team, or outside teams?
2. Is the scarce resource your attention, delivery time, money, escaped defects, or confidence/ownership? Rank them. Where will you accept a worse result to improve the first?
3. Is working on workflow and terminal machinery part of the value you want, or overhead you tolerate to ship product work? Either is legitimate; they imply different roadmaps.
4. If Claude/PI's built-in capabilities improved tomorrow, which parts of wf would still deserve to exist?

### Round 2 — Does the process earn its cost?

5. Which three real defects did fresh phases, the critic, or per-rule agents prevent that an ordinary tested PR and your review likely would not?
6. What is your acceptable attention budget for a class-A ticket? What should happen when it is exceeded: simplify, pause, hand over, or continue?
7. Which JX-1221 changes were product exploration, which were late requirement changes, and which were harness churn? Would earlier collaborative design have avoided more work than another validator?
8. Will you accept an experiment in which one agent does research, plan, and implementation, while machine checks and your approval stay independent? What outcome would make you abandon fresh contexts as the default?
9. If an additional review stage detects nothing unique across ten representative rounds, will you remove it? If not, what evidence could ever disprove its value?

### Round 3 — What must be guaranteed?

10. Does T2 approve an exact implementation, a general intention, or permission to keep modifying until tests pass? Who can authorize changes afterwards?
11. Which rules require hard enforcement, and which are recommendations? Is an honest NOT MEASURED acceptable? When does it block merge?
12. Should a round automatically adopt a new wf version/model halfway through, or retain the version it started with? What emergency-update exception is allowed?
13. When the harness breaks, must product work stop for another wf PR, or is there a documented manual recovery path that preserves your required guarantees?

### Round 4 — Choose the future and the deletions

14. Who besides you has completed rounds independently? What support burden and compatibility guarantees are you willing to own for them?
15. What is explicitly out of wf: application drivers, persistent architecture maps, project policy, terminal UI, model orchestration, tracker integrations? Which existing pieces cross that line?
16. Name one stage, one artifact, and one integration you would remove or make optional before adding anything new.
17. Pick a 30-day outcome that does not count wf commits or features. What result would justify continuing, and what result would justify cutting the system down?

### End-of-session decisions

Record only:

- Primary user and one-sentence purpose.
- Ranked outcomes and a measurable attention/reliability budget.
- Hard guarantees versus optional assistance.
- Default workflow and the allowed exceptions/recovery path.
- Three keep / remove-or-optional / postpone lists.
- One baseline experiment and a date to reconsider.

**Opening question:** If wf shipped fewer safeguards but saved you half the active supervision time with the same observed defect rate, would you consider that a better wf—or would it stop being the system you want?

## Verification record

- `node src/selfcheck.ts`: **41 selfchecks green**, including tsc and eslint, 4.3 seconds.
- Temporary repos/storage removed after tests.
- No subagents used.
- Implementations unchanged; this review is the only added repository file.
- No real delivery, merge, worktree lifecycle cycle, package audit/fix, or live terminal receiver was exercised.
