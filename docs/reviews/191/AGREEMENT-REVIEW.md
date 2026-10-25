# Review — #191

round: fix-191-post-merge-tracker-completion
class: B
base: n/a (agreement review)
agreement-sha: sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033
date: 2026-10-24
urls: n/a — isolated wf development, no product stack

comments:
note — Proposed AGREEMENT.md and controlled repro evidence submitted for actual human T1 approval. Exact human ruling will be appended, never inferred from starting authorization or silence.
verdict: pending human T1

## 2026-10-24 — actual Inbox T1 ruling
agreement-sha: sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033
note — Shay, Inbox reply msg_01M5Q946DN1TX3PERKD57VN8KC, answered Q1: "Approve the attached agreement (your recommendation)". This approves implementation of the attached agreement, not publication or merge.
verdict: approved

## 2026-10-24 — actual Inbox T1 ruling on older-copy cleanup safety (R4)

message: msg_01M5QB505GS0HQ7D8YB3RHT8G7 (reply to msg_01M5QB4PMYHZ0HAEM4N02P5FPZ)
question: q-9de1a887 — "May #191 guarantee cleanup safety on the updated runtime, with the older-copy limitation explicitly documented?"
answer, as written: "Updated-runtime guarantee; require using it for cleanup (your recommendation)"

Scope this ruling fixes: #191's contract is that the runtime which wrote state version 6 refuses normal cleanup while tracker completion is unproven. A wf shipped before #191 cannot be retrofitted: when it reaps a target from a surviving checkout it does not consult that target's version (R4, measured non-destructively; no deletion performed). Shay chose the updated-runtime guarantee over pausing for a stronger older-copy protection design, so this round documents the limit and requires the updated wf for cleanup; it does not add a migration, cleanup interlock or reap redesign, and that work is not authorized here.

Applied: `src/round/state.ts` version comment states exactly what 6 fences and what it cannot; `skills/round/SKILL.md` `done:` row requires cleanup with the wf that wrote the round's state.
