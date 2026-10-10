---
name: agreement-session
description: Run the T1 agreement session on a Class B or C round — ground the current behavior, decide the one consequential choice, cover the exclusions and the verification promise, and get T1's approval on the agreed material's sha. Use when a round is classified B or C, when someone asks for a working agreement, or when an AGREEMENT-REVIEW.md has come back and the agreement must be revised.
user-invocable: false
---

# Agreement session

Read `${CLAUDE_PLUGIN_ROOT}/process/AGREEMENT-TEMPLATE.md` — it is the whole process, and it wins
over this file. Its formats: `CALL-STACK-FORMAT.md` (diff-syntax stacks) and `SHOW-ME.md` (the views
that carry a shape a stack cannot); what comes back from T1 is `REVIEW-FORMAT.md`.

You write `<round folder>/AGREEMENT.md` with the person: `## Observed` (facts, each sourced),
`## Agreed` (behavior, exclusions, the one choice with its rejected alternative, the verification
promise) and `## Verification` (the cases `wf check` runs). Then `wf agree <round>` shows them the
agreed material and folds their verdict into `AGREEMENT-REVIEW.md`. The build starts only when that
verdict is `approved` on the agreement's current material sha.
