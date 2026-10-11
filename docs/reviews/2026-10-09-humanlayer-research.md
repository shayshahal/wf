# HumanLayer research: conclusions, evidence, and relevance to wf

Research date: 2026-10-09. Updated the same day with an explicit review of the hub's August 2026–present section after recording the initial direction. No subagents, implementation changes, package changes, or benchmark reruns.

## User priorities established in discussion

- Reducing active supervision would improve wf, but avoiding defects has higher priority.
- A small fix that misses the desired approach is often cheap to correct; a feature/redesign built on the wrong decision can be expensive.
- Letting an agent invent many stopping points risks excessive friction.
- T1 sometimes enables informed approval; as complexity increases, approval more often happens without a concrete understanding of the final result.

These are user statements, not a finalized architecture or workflow decision.

## Bottom line

The August+ sources emphasize **composable building blocks, human-readable incremental changes, low-friction steering during work, and linked code/artifact/session records**. They retain human ownership, concrete alignment, and real verification. This is stronger than merely shortening an RPI pipeline: wf should simplify coordination while keeping work inspectable and correctable throughout. See the latest-source reconciliation below before the older chronology.

Their most relevant framing is **expected pain = probability of needing correction × cost of correction**. It maps directly to the distinction between cheap wrong approaches and expensive wrong redesigns. But their suggested numerical curve is illustrative, not a measured optimal planning budget.

wf already borrows many of these ideas. process/DESIGN-SESSION.md explicitly credits Why Software Factories Fail and /show-me. The open question is whether those mechanisms produce understandable decisions with acceptable friction, not whether wf should import a new named methodology.

## Research scope and sources

I read the hub and selected primary essays, both HumanLayer benchmark reports, the main sections of the underlying SlopCodeBench v2 paper, and related context/backpressure writing. For the QRSPI talk I read a third-party timestamped transcript linked to the original recording. For the September podcast I read the host's written episode summary, not an audio transcript.

The August+ follow-up read transcript text extracted by Exa from the three previously missing original recordings: Software Factory Design Patterns, the State of the Software Factory keynote plus Dex's subsequent backstage interview, and the Collaboration Demo. The design-patterns episode was also read through its complete timestamped SozAI transcript and the host's episode notes/source README. The loop talk was rechecked through its complete timestamped transcript on ai.engineer. I did not watch the videos, verify their visuals, independently check transcription against audio, or reproduce their operational claims or benchmarks. Product capabilities below are described by the speakers, not independently tested.

1. [Resource chronology](https://www.humanlayer.dev/blog/humanlayer-resources).
2. [12-Factor Agents](https://github.com/humanlayer/12-factor-agents).
3. [Getting AI to Work in Complex Codebases, August 2025](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md).
4. [Everything We Got Wrong About RPI, March 2026](https://www.youtube.com/watch?v=YwZR6tc7qYg); [transcript used](https://github.com/shanraisshan/claude-code-best-practice/blob/main/videos/claude-dex-mlops-community-24-mar-26.md).
5. [Skill Issue: Harness Engineering](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents).
6. [Long-Context Isn't the Answer](https://www.hlyr.dev/blog/long-context-isnt-the-answer).
7. [Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md).
8. [Context-Efficient Backpressure](https://www.humanlayer.dev/blog/context-efficient-backpressure).
9. [Why Software Factories Fail, July 2026](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/wsff.md).
10. [Where Does the Time Go / expected pain](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/side-quests/where-does-the-time-go.md).
11. [HumanLayer's Opus subset report](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/benchmarking-opus-5-on-slop-code-bench.md).
12. [HumanLayer's expanded subset report](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/benchmarking-sol-fable-kimi-on-slop-code-bench.md).
13. [SlopCodeBench paper, v2](https://arxiv.org/html/2603.24755v2).
14. [Evaluating AGENTS.md, latest abstract v3](https://arxiv.org/abs/2602.11988v3).
15. [September 22 podcast: host's written account](https://tessl.io/podcast/124).
16. [Loop Engineering from First Principles, timestamped transcript](https://ai.engineer/talks/xIt_mTQp6mY-loop-engineering-from-first-principles), July 25 recording grouped in the hub's August+ section.
17. [Software Factory Design Patterns, original recording](https://www.youtube.com/watch?v=tGbjIvvYuHE); [host's notes](https://boundaryml.com/podcast/2026-08-25-software-factory-design-patterns); [source README](https://github.com/ai-that-works/ai-that-works/tree/main/2026-08-25-software-factory-design-patterns). The hub dates the video August 28; the host/source folder uses August 25. These refer to the same recording, not different conclusions.
18. [Design-patterns timestamped transcript used](https://sozai.app/transcript/build-software-factory-ai-coding-agents/). Its summary and speaker labels are unreliable; conclusions below use the transcript passages, cross-checked with the original-recording extraction and host notes.
19. [State of the Software Factory, keynote and backstage interview](https://www.youtube.com/watch?v=-w6RDNBAI0E&t=2393s). The hub dates publication September 21; the conference schedule places the talk on September 18.
20. [HumanLayer Collaboration Demo](https://www.youtube.com/watch?v=KpthJTIwnAo), September 21 according to the hub.

## Latest-source reconciliation: August 2026–present

The initial direction over-weighted March–July essays and dismissed the newest composability/shared-record emphasis as platform scope before closely reading it. This follow-up changes that interpretation. The conclusions below come first; earlier sources explain their evolution rather than dictate the target workflow.

### Software Factory Design Patterns: compose the parts, own the policy

At 22:07 onward, Dex and Vaibhav map compute, development environment, inner harness, outer harness, and orchestration/control plane. They argue for choosing which parts to build or buy independently, rather than accepting an entire vendor stack or building everything. At 56:42–58:45, the emphasis is explicitly composition over inheritance and keeping harnesses swappable.

The development environment is more than a checkout: toolchains, service access, identity, and inspectable previews matter (33:47–42:16). Yet both accept long-lived machines as a practical current setup; disposable infrastructure is not a prerequisite (42:27–45:25). At 51:30–55:48, they acknowledge incompatible harness hooks and caution against wrappers that merely relay an existing API. This supports real responsibility boundaries, not speculative universal interfaces.

For wf: own the round's agreement, bounded work, verification/approval identity, and recovery. Compose the existing agent harness and project/environment capabilities. Keep adapters specific to demonstrated differences; a smaller core can still have useful seams. This is relevant architecture, not just a reason to postpone multiplayer product features.

### Their current large-change practice is not a single blind implementation pass

At 11:09–15:31, Dex describes interactive product outlines and HTML mocks, overnight implementation with repeated model reviews, human polish, then splitting a large prototype into digestible PRs. He says roughly 90% of what they ship fits in one pass; the exceptional prototype helps discover the intended product, but is not handed to a reviewer as a 20,000-line finished change.

This is a meaningful qualification of the earlier factory critique, not proof that review agents now solve maintainability. The latest practice uses automated review, including multiple models. The engineering work and human judgment still happen before delivery. There is no measured comparison showing those fifteen queued prompts are necessary or superior.

For wf: lightweight defaults for ordinary work remain reasonable. Large work needs bounded, inspectable implementation units, and sometimes an exploratory prototype. Session count and commit count are different from reviewable scope. Neither a fresh agent per commit nor one agent for an entire large task is established as universally optimal.

At 15:44–20:53, Boundary describes a feedback-to-repro-to-issue pipeline whose individual stages are being evaluated, including imperfect deduplication and classification. At 24:58–26:22, it describes bounded repair attempts before human escalation, continued human merge ownership, and proposed merge-queue automation. These are examples of measured, task-specific loops—not a mandate to reproduce that entire factory in wf. Untrusted input and unavailable repros also constrain which work they automate.

### September keynote: read code, steer cheaply, retain the whole work record

The keynote retains the warning about unattended structural degradation and explicitly says to read the code. Its practical recommendations include planning to reduce expected correction cost without overplanning, visual alignment, tools for agents to test their work, deterministic checks for identifiable bad patterns, feedback-driven work, experimentation, and learning from past sessions.

A loop combines a trigger for work with useful feedback during execution. The talk does not equate more prompts, more agents, or more mandatory documents with better outcomes. It also continues to make broad benchmark claims; the evidence limitations in section 3 still apply.

The keynote and subsequent backstage interview treat **code, design/alignment artifacts, and session traces as first-class related records**. Dex explicitly argues for moving review from a single finished-PR moment into an inexpensive ongoing activity: a teammate can inspect an early implementation without a push/draft-PR handoff. This is about easier access and tighter correction cycles, not an instruction to interrupt the owner after every slice.

For wf: a final approval boundary remains useful, but code and evidence should be inspectable before it. Reducing mandatory documents must not discard the context that explains what was agreed, produced, and checked. A small local implementation can preserve links to existing records without building a new forge or streaming platform.

### Collaboration Demo: an alignment surface, not another gate pipeline

The narrated demo describes collaborative local/cloud sessions, picking up a teammate's task context with its artifacts, commenting on artifacts and current code, and choosing RPI, QRSPI, PRD, or free-form work. Artifacts stay associated with the sessions producing and using them. Review need not wait for a PR.

The important design principle is low-friction access to related work and feedback, not adoption of HumanLayer's cloud, multiplayer UI, or daemon architecture. The workflow choice also contradicts treating one maximal process as mandatory for every task. The demo describes product capabilities; it does not establish improved defect rates, lower attention cost, or portable session transfer across arbitrary harnesses.

### Loop Engineering: bound corrections and respect review capacity

Although published in July, the hub includes this talk in August+. At 6:59–8:23, Kyle allows sensing/selection/implementation responsibilities to share an agent context, while insisting on a policy that limits the next correction. At 12:41–13:00, repository-specific golden patterns guide implementation. At 13:36–16:17, an initial loop was turned off because correction was cumbersome; review comments and versioned feedback improved steering, and new work stopped while its previous PR awaited review.

For wf: keep useful deterministic feedback close to implementation, use authoritative local patterns, bound automatic retries, and avoid producing a review backlog. Generalize reusable guidance deliberately and reviewably rather than turning each ticket correction into global policy. The talk later proposes separate implementation contexts for batches, without a comparative measurement. It supports context choice by workload, not a universal session rule.

### What this changes in DIRECTION.md

| Initial proposal | August+ reconciliation |
| --- | --- |
| A small change runner; defer platform expansion | Keep the small product scope, but explicitly compose existing harness/environment capabilities and preserve connected work records. |
| One implementation session | A lightweight default for ordinary work; large work uses bounded, reviewable units and context boundaries where useful. |
| One independent final review | Consolidate mandatory review bureaucracy; keep targeted automated feedback and make human inspection/steering inexpensive during work. Final approval is not the only opportunity to read code. |
| One working document, one final review, logs | Minimize required prose, while preserving relationships among agreement, code, evidence, and relevant sessions/artifacts. Counts and storage are our proposals, not a HumanLayer result. |
| No additional automatic human checkpoints | Retain. Ongoing inspectability and owner-directed steering do not require periodic permission requests. |
| Remove the terminal-status prototype | Still grounded in the local adversarial review, not HumanLayer. Retain useful progress visibility; the latest sources argue against making work opaque. |

The direction becomes **less mandatory ceremony, more inspectability and inexpensive correction, over existing composable tools**. This is a consolidation target, not permission to add a workflow framework, memory pipeline, live-streaming forge, or new review stage. Exact session/reviewer/artifact counts remain wf hypotheses to evaluate.

## 1. Their advice evolved, and some of it was reversed

### April 2025: own ordinary software boundaries

12-Factor Agents argues that effective production agents are largely normal software with model calls at selected points. Own prompts, context, control flow, state, errors, and human contact. Prefer small modular concepts to adopting a framework wholesale.

Relevance: strong support for wf's thin shell/pure helper split and explicit runner decisions. Not a reason to turn wf into a generic agent framework.

### August 2025: focused contexts and high-leverage artifact review

The initial RPI essay reports successes in a 300k-line Rust repository and recommends research, plan, implementation, intentional compaction, and high-leverage human review. It also describes learning to let go of reading every code line and treating specs as the source of truth.

These examples are field reports, not controlled productivity experiments. The author explicitly reports failures, the importance of deep human engagement, and model spend of roughly $12k/month for a three-person team. Drafting large changes quickly is not equivalent to total time to safe delivery.

### March 2026: don't outsource thought; don't review the same implementation twice

The QRSPI talk retracts the earlier implication that plans can replace reading code. It says the team had to replace parts of the system after months of not reading it.

The revised approach separates questions, objective research, design discussion, structure outline, tactical plan, and execution. Its purpose is both smaller instruction sets and higher-leverage alignment.

Important nuances:

- Research should establish existing facts, not rationalize a proposed solution. They hide the feature ticket from the research context and supply questions instead.
- A huge plan can cost as much to review as code, then drift during implementation, requiring another deep review. Their answer is to review concise design/shape and treat the detailed plan mainly as an agent document.
- Internal prompt stages are not the same thing as mandatory human approval gates.
- At 19:57, Dex says he voluntarily sends design discussions to the code owner; it is not a required review step.
- At 21:43, he acknowledges increasing the number of stages makes adoption harder. At 21:57, he acknowledges productivity measurement is unresolved.
- Context thresholds are teaching heuristics, not physical laws. The talk's Q&A explicitly says the suitable percentage depends on task complexity and instruction/information mix.

### July–September 2026: retain human ownership and measure the cost of being wrong

Why Software Factories Fail argues that tests and one-shot benchmarks miss maintainability: a passing patch may make subsequent changes increasingly difficult. Their current practice front-loads product requirements, system architecture, program design, and executable slices, while still reading actual code.

The September podcast's written summary reinforces that position and the expected-pain framing. The August+ sources add practical composability, connected work records, and inexpensive review during implementation. These principles are relevant to wf even without adopting HumanLayer's platform scope; see the latest-source reconciliation above.

## 2. What their latest practical advice actually is

### Match ceremony to correction cost

The July essay estimates roughly 40% of their tasks are one-shot or one-shot with one or two light corrections. Medium tasks combine product/system design in one document and may skip phased implementation. Large tasks use more of the workflow; refactors can skip product review.

Those are their approximate operating choices, not universal defaults. The relevant principle is that cheap corrections can be cheaper than exhaustive planning, whereas expensive intent/architecture errors justify earlier alignment.

### Show decisions, don't bury them in implementation plans

Product: rough HTML mockups and concrete flows.
System architecture: sequence diagrams, endpoint shapes, data schemas.
Program design: call-stack diffs, file-tree diffs, key types and function signatures.
Execution: observable slices instead of building every database change, then every service, then the UI.

A vertical slice is a construction strategy and an opportunity to inspect behavior. It does not intrinsically require a human stop after every slice. Their own practice sometimes dispatches one to three slices at once.

### Keep steering inexpensive

Kyle's loop talk describes shutting off the first automation because correcting output and instructions was too cumbersome. PR comments can repair the current proposal and update a version-controlled feedback file for future runs.

Durable feedback should be reviewable. My caution: generalize stable lessons deliberately; a ticket-specific comment should not silently become permanent global policy.

### Apply backpressure without making the user a linter

Their writing recommends real tests, typechecks, builds, UI checks, and controlled hook behavior. Successful verification should be concise; failures should retain useful evidence. Their loop example also caps outstanding work when human review has not cleared the previous proposal.

This supports wf's deterministic checks and concise results. It does not prove that every additional review agent is beneficial or that all structural judgments can be automated.

### Keep context and instructions focused

Subagents are primarily context-isolation tools, not a cast of simulated job titles. Skills progressively disclose relevant knowledge. Keep always-loaded instructions short, use pointers to authoritative sources, and use deterministic linters for deterministically checkable rules.

These are useful mechanisms, not a proof that one new agent per commit is the optimal policy for every task. More contexts add handoff costs; summaries can lose facts. HumanLayer's long-context regression account is an experience report, not a controlled demonstration of the training mechanism they speculate about.

### Delete unsuccessful machinery

The harness article says they threw away more hooks than they retained, warns against spending more time on the setup than shipping, and recommends iteration speed rather than maximizing one-shot success.

This is a critical counterweight to "every observed failure deserves a permanent rule."

## 3. How strong is the evidence?

### Good empirical reason to worry about iterative degradation

SlopCodeBench v2 evaluates 15 agents on 36 problems and 196 sequential checkpoints. Only the workspace carries forward; tests are hidden, requirements arrive incrementally, and each checkpoint gets a new agent context. The study reports:

- No evaluated agent solved a problem correctly at every checkpoint end-to-end.
- Best strict checkpoint pass rate: 14.8%.
- Structural erosion rises in 77% of trajectories; verbosity in 75.5%.
- Quality prompts often improve starting structure but do not consistently prevent continued degradation; they also increase cost and can reduce correctness.

This is much closer to repeated software change than isolated bug tasks. It supports testing how a workflow handles evolving requirements rather than assuming initial correctness means future maintainability.

But it is not a measurement of wf or HumanLayer's full supervised process:

- Agents never receive the held-out evaluator's results, so it is not a realistic closed verification/repair loop.
- Python-only evaluation in the paper, bounded runtime, engineered problem selection, fresh conversation per checkpoint.
- The benchmark deliberately excludes problems frontier agents solved in one shot.
- Erosion and verbosity are proxies for maintainability, not comprehensive measures of architecture or future engineering effort.
- The human-repository comparison is calibration, not a matched randomized human/agent trial.

### HumanLayer's follow-up model reports are exploratory

The first report runs three problems, 17 checkpoints per model; its best strict result is 4/17. The expanded report runs six problems, 30 checkpoints per configuration; two best results tie at 10/30.

Important limits: small chosen subsets, single runs, differing harnesses in the second report, and changed test suites between runs. They acknowledge that lint-based "slop" detectors flag huge fractions of code and may be overaggressive. They have not established that every flagged line is bad or that raw metric growth proves architecture decay independently of added feature complexity.

Crucially, the reports describe richer deterministic guardrails and alternating-model review as future experiments. The later August design-patterns talk describes multi-model review in actual use, but supplies no comparative evaluation of its benefit. Neither establishes that those interventions solve the reported problem. The hub's wording that SCB "proves" models cannot produce maintainable code overstates the demonstrated scope.

### Configuration benefit is not automatic

The latest Evaluating AGENTS.md abstract says repository context files do not generally improve task success and increase inference cost by over 20% on average. It recognizes value for specifying nonstandard practices, but calls for evaluation before deployment.

HumanLayer's earlier discussion frames this study as confirming their own concise-file advice. That is plausible, but not a comparative validation of their particular CLAUDE.md design. A directory overview remains something their earlier article recommends and the study finds unhelpful in its evaluated tasks.

### Stronger theoretical claims remain unproven

The March harness post says failures are primarily configuration problems; the July essay says harnesses cannot solve the underlying maintainability limitation. Read together, these are an evolution/narrowing of the claim, not a single settled law.

I agree that tests do not fully measure maintainability and automated review does not replace ownership. I would not endorse an absolute claim that more inference/review cannot improve design because the model could have generated the better answer initially. Recognizing a flawed proposal and generating a correct one are different tasks. Review's incremental value must be measured rather than either assumed or ruled out.

Their planning graphs, 2–3x speed target, adoption counts, and incident stories are recommendations and field reports. They are not proof that a specific number of stages produces optimal attention or defect outcomes. The writers disclose a commercial interest in collaboration tooling.

## 4. What this changes in the wf discussion

### Keep

- Human ownership of consequential direction.
- Focused contexts and project-local authoritative knowledge.
- Concrete program/product representations.
- Real verification and implementation-bound approvals.
- Recoverable, reviewable records.

### Question, rather than extend automatically

- Requiring the same depth of input coverage and program-shape review for every design change.
- Treating every signature change as a user-level stop, rather than distinguishing internal edits from changes to approved behavior, contracts, and guarantees.
- Conflating an internal agent-stage boundary with a human checkpoint.
- Re-reviewing detailed tactical plans when the actual decisions are already approved.
- Permanently generalizing every correction or harness incident into process machinery.

These were questions for the initial grilling session. The subsequent direction discussion and August+ reconciliation inform DIRECTION.md; they are not instructions to bypass the currently implemented round workflow. Some strict rules protect important user expectations; consolidation must identify which ones earn their friction.

### Better working objective

**Minimize expected costly rework plus active supervision, subject to the required reliability and ownership guarantees.**

Expected rework includes requirement/experience mismatch, behavioral defects, and future change cost. They are not interchangeable and should be observed separately. Human attention is both a cost and a scarce source of judgment; adding checkpoints can reduce one risk while increasing the cost.

For the user's difficulty judging complex T1s, the first intervention to test is a more concrete existing T1, not more automatic stopping points. Which form matters depends on the unknown: UI mockup for experience, state-transition example for behavior, contract/type/call-stack diff for architecture, or a limited feasibility prototype when static artifacts cannot resolve it. A prototype is sometimes justified, not the new universal stage.

wf already contains many of these representations. Presence/completeness of artifacts is not the same as the user's ability to make an informed decision from them.

### Authority boundary carried into the direction

The subsequent discussion identified product/UX, consequential architecture, and maintainability as expensive error categories. It also rejected blanket modularity requirements: choices require tradeoffs. DIRECTION.md therefore keeps consequential direction with Shay and ordinary implementation/repair within the agreement with the agent.

The boundary should be made concrete for the task rather than expanded into permission requests for every internal choice. This remains a working delegation boundary to test, not a complete taxonomy of engineering decisions.
