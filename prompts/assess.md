# {{round}} — assessment

Judge whether this implementation meets the agreement, within the scope below. State what evidence
supports your verdict, what remains unmeasured, and what needs correction or a decision.

You are an independent, read-only assessment of this round. Do not change product code. Read the
agreement, the diff since `{{assessmentBase}}`, and `.wf/checks.log`, then write
`{{folder}}/{{assessmentFile}}` whole. `wf check` must have recorded a green of the implementation as
it now stands; if the log does not have one, say so rather than assess.

A `clean` verdict states no open verification and no agreed removal or exclusion still in effect. A
known mismatch with the agreement is repaired or durably ruled on, never left as an advisory design
note. A line you could not verify is `NOT MEASURED`, `NOT
VERIFIED` or `INCONCLUSIVE`, and wf asks the person to fix or accept each one before T2 — so a clean
verdict never passes one silently. Likewise a `suites red` line of these bytes: "that file is
untouched, so it is unrelated" is not a ruling, only the person can accept or fix it. Name the
affected path, what is needed and the command to rerun.

Before counting a referenced proof record as measured, read its setup → run → reset in order. Match
each claimed result to the scenario state its preceding setup actually produced, including any
changes between runs. If setup contradicts the claimed state or omits a required transition, quote
both the setup and result in the finding; that claim cannot back `met:`. For a fixable recording or
setup gap within the agreement, use `Verdict: repair` and keep the affected Intent line `NOT MEASURED`
until the build records and drives the scenario consistently. A consistent setup → run → reset
record remains usable evidence; judge what it supports rather than merely paraphrasing its PASS.

`wf check` records each red-base ("before") run in `.wf/checks.log`: the `baseline` object names the
baseline commit, command, named assertion, test/fixture inputs, run environment and implementation
bytes it measured, and `evidence` is the runner's own report. When a referenced before measurement is
already recorded there with the current implementation `content` and the verdict the case needs
(`behavioral-failure`, or `passed` for a `refactor:` case), cite that run: a fresh assessment does not
make an already-measured before side unmeasured, and a recorded `reused: true` line is the same
measurement re-emitted, not a new one. Raise `NOT MEASURED` only for a before side no recorded run
covers.

Before counting a case as proof, inspect its selected test and named assertion against the case's
behavioral claim. Defect proof must fail at that behavioral assertion on baseline and pass with the
change; preservation (`refactor:`) must be green on both sides. A failure caused by a newly introduced
representation alone does not prove unchanged behavior was broken. For a fixable mismatch, use
`Verdict: repair`, name the assertion and the claim it actually measures, and keep the affected Intent
line `NOT MEASURED` until the build supplies the right evidence.

## Scope

{{scope}}

A unit's assessment judges the cases named in its scope, plus the integration its change affects.
Normally these are one unit's cases; checkpoint repairs include the earlier unreviewed units in
that chunk too. Its `clean` covers only this scope; the whole task is judged clean only by the
integration assessment, which judges the whole round against the whole agreement.

## The agreement

{{agreement}}

{{verificationRepairs}}

## Verification cases in scope

{{cases}}

## What to write

- `Verdict: clean | repair | blocked`
  - `clean` — intent is met and the evidence holds, and no agreed removal or exclusion still takes
    effect.
  - `repair` — fixable findings within the agreement; the build repairs them and you judge again. A
    surviving effect the agreement removes is repairable here while the agreed behavior is clear.
  - `blocked` — an intent line is unmet, or a symptom still reproduces, or the work has left the
    agreement materially, or the right behavior for a surviving agreed effect is a decision the
    person must make rather than a repair.
- `head: <git rev-parse HEAD>` — the implementation this judged.
- `assessed-at: <current ISO timestamp>` — when this independent assessment finished. Write a new
  report even when HEAD and the findings are unchanged: the handoff records the previous report's
  content identity, so merely touching or rewriting that old report does not answer this assessment.
- `scope: unit:<n> | integration` — on a round with `## Units`, the scope named above. A unit also
  records `base: <the unit's starting commit>` from its brief.
- `## Intent` — one line per intent line: `met:` with a `before:` and an `after:` measurement, or
  `NOT MEASURED`, or `not met: …`, or `left out: <reason>`, or, in a unit's assessment, `deferred:
  unit <n>` for a line a later unit owns (deferred, not unmet). A line is never met from the code
  alone. A line whose agreed behavior is "nothing moves" (no scroll, no flash) needs its measurement
  like any other: its absence is `NOT MEASURED`, not a clean pass.
- `## Behavior and evidence` — what you actually observed, with the commands that showed it.
- `## Design` — consequential maintainability notes that do not contradict `## Agreed`, each with a
  `path:line`. A finding that an agreed behavior or exclusion still takes effect is not a design
  note, however minor it looks: record it in `## Agreement` as `surviving:`.
- `## Standards` — each applicable project rule and what the code does about it.
- `## Agreement` — a `surviving: <the agreed removal or exclusion the implementation still
  contradicts>` line when the build has not reached the agreed behavior; a `material: <what changed>`
  line only when the work has genuinely left the agreed scope or behavior. Otherwise leave it out, or
  write `none`. A clean verdict never carries a `surviving:` line, and a `surviving:` item that needs
  a decision is a `blocked` one: name it on the `## Intent` line too, so the person's ruling carries
  it. If they accept the exception, that is renewed agreed behavior — `wf decide --revise` and a
  fresh T1 — never a silent pass to T2.

Keep the findings distinguishable by axis — intent, behavior, design, standards — so one axis cannot
mask another. Independence is not a guarantee of good architecture: judge the code, not who wrote it.
