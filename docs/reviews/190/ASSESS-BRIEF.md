# Independent assessment — #190

You are a fresh reviewer context. You did not build this change. Judge it against the agreement and
the code, from the files and the commands, not from the builder's account.

## Where

- Worktree: `C:/Users/Shay/.t3/worktrees/wf/fix-190-correction-merge-reconciliation`
- Base commit: `08f43f593dbb589c9b3d84ed61c68e4ec78d2c00`
- Implementation commit: `f7cf401` — review `git diff 08f43f5..f7cf401`
- Agreement (T1 approved): `docs/reviews/190/AGREEMENT.md`, ruling in
  `docs/reviews/190/AGREEMENT-REVIEW.md`
- Issue and intake: `docs/reviews/190/TICKET.md`, `docs/reviews/190/USER-REQUEST.md`

This is development **of wf**, not a product round. The installed project selector targets another
project, so no `wf new`/`serve`/round commands were used; they cannot represent this work. Nothing in
this change touches hooks, global configuration, `env/`, or another project.

## What to judge

Four axes, and keep findings attributable to one:

1. **Intent** — does it do what #190 and the agreement asked, no more? Read the issue body in
   `TICKET.md`.
2. **Behavior and evidence** — are the claims proven by the checks that ran? Re-run what you need and
   say what you ran. The builder's evidence is in `docs/reviews/190/evidence/`.
3. **Design** — is the seam the smallest correct one? Reused #108's lookup and #150's correction
   identity rather than a second engine? Any state field or export that is not earned?
4. **Standards** — `AGENTS.md` (erased TypeScript, `.ts` imports, comments that say why, no runtime
   deps, `src/<area>/` placement, one module per command with a selfcheck beside it) and the
   correctness concerns this change touches: expected failures as values, state parsing, idempotency,
   uncertain remote outcomes, no network under a lock.

## Specific things worth attacking

- `captureCorrection` decides routing from `current`, which does **not** yet hold the instruction
  being captured. Is `publishedRepairGap(current)` the right input there?
- `publishedRepairGap` authorizes repair from a `pr_repair` record matching url+head, without a
  timestamp or generation. Can a stale OPEN observation outlive a real merge and authorize repair?
  If so, is that inside what the agreement allows ("OPEN is an observation, not a remote lease")?
- `reconcilePublishedDelivery` clears `pr_repair` before it asks, and revalidates the whole state
  plus the local subject after. Is any window left where a merge-adapted receipt, a republish or a
  branch delete lands on a stale claim?
- State version 5: is the bump justified, and does the reader accept old versions without
  misreading a fenced one?
- The fences in `next.ts`, `step.ts` and `delivered-round.ts`: is each reachable and necessary, or
  redundant?
- Tests: `src/gates/deliver-recovery.selfcheck.ts` now shares one publish across scenarios, drives
  the remote matrix through the exported seam, and keeps two real CLI scenarios. Does any scenario
  prove less than its name claims? Is the crash case a real crash?

## Run

```bash
cd C:/Users/Shay/.t3/worktrees/wf/fix-190-correction-merge-reconciliation
env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts src/gates/deliver-recovery.selfcheck.ts
```

`PI_SESSION_ID` leaks into disposable fixtures and makes a pre-existing next-selfcheck assertion
compare state bytes that the optional session record changed; stripping it is the established fixture
isolation (`src/selfcheck.ts` strips `T3_*` for the same reason). Node 26, `npm ci` already run.
The full suite is manual and was **not** run: this is focused evidence.

## Write

`docs/reviews/190/ASSESSMENT.md` with:

```
# #190 — final assessment
Verdict: clean | findings
head: f7cf401

## Intent
## Behavior and evidence
## Design
## Standards
```

Findings must be distinguishable by axis and say what you ran. Do not modify product code or the
agreement; you are read-only for those. Report unresolved objections rather than settling them
yourself.
