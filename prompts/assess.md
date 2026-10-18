# {{round}} — assessment

Judge whether this implementation meets the agreement, within the scope below. State what evidence
supports your verdict, what remains unmeasured, and what needs correction or a decision.

You are an independent, read-only assessment of this round. Do not change product code. Read the
agreement, the diff since `{{assessmentBase}}`, and `.wf/checks.log`, then write
`{{folder}}/{{assessmentFile}}` whole. `wf check` must have recorded a green of the implementation as
it now stands; if the log does not have one, say so rather than assess.

A `clean` verdict means the agreed behavior is met and the evidence supports it. Report missing
verification, contradictions and mismatches plainly, with what you observed and what remains
uncertain. Judge the builder's chosen verification and repair approach on its evidence, not on a
prescribed record or response format. A line whose evidence does not hold stays open with a
concrete finding. Ask the person only for an actual decision or missing authority; fixable work
within the agreement returns to the builder.

`wf check` records each red-base ("before") run in `.wf/checks.log`: the `baseline` object names the
baseline commit, command, named assertion, test/fixture inputs, run environment and implementation
bytes it measured, and `evidence` is the runner's own report. When a referenced before measurement is
already recorded there with the current implementation `content` and the verdict the case needs
(`behavioral-failure`, or `passed` for a `refactor:` case), cite that run: a fresh assessment does not
make an already-measured before side unmeasured, and a recorded `reused: true` line is the same
measurement re-emitted, not a new one. Report a missing before measurement only when no recorded
run covers it.

Before counting a case as proof, inspect its selected test and named assertion against the case's
behavioral claim. Defect proof must fail at that behavioral assertion on baseline and pass with the
change; preservation (`refactor:`) must be green on both sides. A failure caused by a newly introduced
representation alone does not prove unchanged behavior was broken. For a fixable mismatch, use
`Verdict: repair`, name the assertion and the claim it actually measures, and explain what evidence
is still needed.

## Scope

{{scope}}

A unit's assessment judges the cases named in its scope, plus the integration its change affects.
Normally these are one unit's cases; checkpoint repairs include the earlier unreviewed units in
that chunk too. Its `clean` covers only this scope; the whole task is judged clean only by the
integration assessment, which judges the whole round against the whole agreement.

## The agreement

{{agreement}}

{{answers}}

{{assessment}}

## Verification cases in scope

{{cases}}

## What to write

- `Verdict: clean | repair | blocked`
  - `clean` — intent is met and the evidence holds, and no agreed removal or exclusion still takes
    effect.
  - `repair` — fixable findings within the agreement; the build repairs them and you judge again. A
    surviving effect the agreement removes is repairable here while the agreed behavior is clear.
  - `blocked` — proceeding needs an actual decision or authority only the person can supply.
    Explain that decision in context. Ordinary unmet intent, missing verification, or a still-
    reproducing symptom is `repair` when the builder can address it within the agreement.
- `head: <git rev-parse HEAD>` — the implementation this judged.
- For `repair`, list every finding in `## Repairs` with its scoped obligation and enough context
  to act: the behavior or evidence that needs correction and, where you know it, the test, tool or
  setup that can drive the state. Do not prescribe a response grammar; the builder chooses how to
  repair and verify, and reassessment judges the actual result. Discover available tools before
  declaring a capability missing. Use `blocked` and a question only for a real intent or authority
  decision, naming the owner and the concrete recovery.
- `assessed-at: <current ISO timestamp>` — when this independent assessment finished. Write a new
  report even when HEAD and the findings are unchanged: the handoff records the previous report's
  content identity, so merely touching or rewriting that old report does not answer this assessment.
- `scope: unit:<n> | integration` — on a round with `## Units`, the scope named above. A unit also
  records `base: <the unit's starting commit>` from its brief.
- `## Intent` — explain which intended outcomes the evidence supports and which remain open.
  Cite the relevant measurements and limitations; reading code alone is not observed behavior.
  In a unit review, distinguish this scope from work a later unit owns. No per-line status grammar
  is required: your explicit verdict, not words in these explanations, determines the next step.
- `## Behavior and evidence` — what you actually observed, with the commands that showed it.
- `## Design` — consequential maintainability notes that do not contradict `## Agreed`, each with a
  `path:line`. A finding that an agreed behavior or exclusion still takes effect is not a design
  note, however minor it looks: record it in `## Agreement`.
- `## Standards` — each applicable project rule and what the code does about it.
- `## Agreement` — explain any remaining mismatch or material departure from the agreed scope,
  whether it is fixable work or a decision only the person can make. Name the affected agreed
  behavior and what still contradicts it. If the person accepts an exception, that is renewed
  agreed behavior — `wf decide --revise` and a fresh T1 — never a silent pass to T2.

Keep the findings distinguishable by axis — intent, behavior, design, standards — so one axis cannot
mask another. Independence is not a guarantee of good architecture: judge the code, not who wrote it.
