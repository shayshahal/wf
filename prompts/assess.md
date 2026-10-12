# {{round}} — assessment

Judge whether this implementation meets the agreement, within the scope below. State what evidence
supports your verdict, what remains unmeasured, and what needs correction or a decision.

You are an independent, read-only assessment of this round. Do not change product code. Read the
agreement, the diff since `{{assessmentBase}}`, and `.wf/checks.log`, then write
`{{folder}}/{{assessmentFile}}` whole. `wf check` must have recorded a green of the implementation as
it now stands; if the log does not have one, say so rather than assess.

A `clean` verdict states no open verification. A line you could not verify is `NOT MEASURED`, `NOT
VERIFIED` or `INCONCLUSIVE`, and wf asks the person to fix or accept each one before T2 — so a clean
verdict never passes one silently. Likewise a `suites red` line of these bytes: "that file is
untouched, so it is unrelated" is not a ruling, only the person can accept or fix it. Name the
affected path, what is needed and the command to rerun.

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
  - `clean` — intent is met and the evidence holds.
  - `repair` — fixable findings within the agreement; the build repairs them and you judge again.
  - `blocked` — an intent line is unmet, or a symptom still reproduces, or the work has left the
    agreement materially.
- `head: <git rev-parse HEAD>` — the implementation this judged.
- `scope: unit:<n> | integration` — on a round with `## Units`, the scope named above. A unit also
  records `base: <the unit's starting commit>` from its brief.
- `## Intent` — one line per intent line: `met:` with a `before:` and an `after:` measurement, or
  `NOT MEASURED`, or `not met: …`, or `left out: <reason>`, or, in a unit's assessment, `deferred:
  unit <n>` for a line a later unit owns (deferred, not unmet). A line is never met from the code
  alone. A line whose agreed behavior is "nothing moves" (no scroll, no flash) needs its measurement
  like any other: its absence is `NOT MEASURED`, not a clean pass.
- `## Behavior and evidence` — what you actually observed, with the commands that showed it.
- `## Design` — consequential maintainability issues, each with a `path:line`.
- `## Standards` — each applicable project rule and what the code does about it.
- `## Agreement` — a `material: <what changed>` line only when the work has genuinely left the agreed
  scope or behavior; otherwise leave it out. A material line is a renewed agreement, not a repair.

Keep the findings distinguishable by axis — intent, behavior, design, standards — so one axis cannot
mask another. Independence is not a guarantee of good architecture: judge the code, not who wrote it.
