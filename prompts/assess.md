# {{round}} — final assessment

You are an independent, read-only assessment of this round. Do not change product code. Read the
agreement, the diff since `{{base}}`, and `.wf/checks.log`, then write `{{folder}}/ASSESSMENT.md`
whole.

## The agreement

{{agreement}}

## What to write

- `Verdict: clean | repair | blocked`
  - `clean` — intent is met and the evidence holds.
  - `repair` — fixable findings within the agreement, including unmet intent or a still-reproducing
    symptom. The build repairs them autonomously first; after two unsuccessful attempts, one ruling.
  - `blocked` — a genuine blocker prevents autonomous repair, or the work has left the agreement
    materially. Unmet intent alone is `repair`. For a genuine blocker, write
    `blocker: <why autonomous repair cannot proceed>` beside the verdict, before the sections.
- `head: <git rev-parse HEAD>` — the implementation this judged.
- `## Intent` — one line per intent line: `met:` with a `before:` and an `after:` measurement, or
  `NOT MEASURED`, or `not met: …`, or `left out: <reason>`. A line is never met from the code alone.
- `## Behavior and evidence` — what you actually observed, with the commands that showed it.
- `## Design` — consequential maintainability issues, each with a `path:line`.
- `## Standards` — each applicable project rule and what the code does about it.
- `## Agreement` — a `material: <what changed>` line only when the work has genuinely left the agreed
  scope or behavior; otherwise leave it out. A material line is a renewed agreement, not a repair.

Keep the findings distinguishable by axis — intent, behavior, design, standards — so one axis cannot
mask another. Independence is not a guarantee of good architecture: judge the code, not who wrote it.
