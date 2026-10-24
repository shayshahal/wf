Closes #190.

## The bug

After an approved PR was published and a human merged it, but before the local delivery receipt was
recorded, a correction arrived. `captureCorrection` fenced on `delivery` and `merge_attempt` but not on
the **published handoff**, so it routed the round back to `build`. `wf deliver` then refused the
unresolved correction before it looked up the PR that would have shown the merge. Repair could start
under an already-merged round, move HEAD, and normal expected-head reconciliation then rejected it.

Reproduced through the real commands in a disposable repository (local bare origin, controlled `gh`
seam, no live GitHub):

```
publish → pr_handoff recorded → human merge → wf correct → state.step = build
wf next  → "work build"                      (old round offered repair)
wf deliver → "unresolved corrections: …"     (never looked at the PR)
```

## The fix

Intake stays local and durable; only reconciliation releases repair.

| remote answer | what happens |
|---|---|
| **MERGED** at a head this round produced | receipt recovered at the merged head, instruction kept for a fresh follow-up under #129's fresh identity, no rebuild or republish |
| **OPEN** at the published head | ordinary scoped repair, existing approval/evidence freshness unchanged |
| **OPEN** at this round's own later head | stale bookkeeping from an interrupted push: adopted only when T2 approved those bytes, otherwise refused with the review it needs |
| unknown, absent, closed, another URL, a third head | candidate and instruction retained, repair refused, actionable message; unknown is never read as OPEN |

- `publishedDeliveryVerdict` is the pure decision; `reconcilePublishedDelivery` is the independently
  callable seam. Both reuse #108's repository/PR lookup and #150's correction identity rather than
  adding a second delivery engine.
- The lookup runs **outside** the state lock. Its answer is revalidated against the round, the
  instructions and the local subject (HEAD, branch, index, worktree, remote urls), so a stale lookup
  cannot authorize repair. A failed refresh cannot leave an earlier OPEN answer standing.
- State version 5: a version-4 runtime reads a fenced state as routable, so the fenced state must be
  unreadable to it.
- No automatic merge, no new approval checkpoint, no scheduler, no change to hooks, `env/` or any
  project.

## Verification

Focused only — the full suite was **not** run.

| check | result |
|---|---|
| `deliver-recovery.selfcheck.ts` (149 checks, incl. every pre-existing scenario) | green |
| `deliver.selfcheck.ts`, tsc, eslint | green |
| the other eight affected selfchecks at `c2a52cb` (only `deliver.ts` and its recovery selfcheck changed after) | green |
| the issue's repro, before → after | 3 of 6 red → 6 of 6 green |
| the fix reverted, new assertions run | 25 fail (red-capable) |

Covered: continuous publish → human merge → pre-receipt correction → recovery; OPEN; ten remote
refusal variants; duplicate intake; a crash after recognition but before the receipt; post-receipt
corrections; five concurrent-lookup races; the interrupted push and its convergence.

**Not verified:** any real GitHub API call, and the other 73 selfcheck files. Every remote answer comes
from wf's own `gh` seam against a local bare origin.

## Limits

- The "human merge" is a fixture state, not a real GitHub merge.
- The interrupted push kills the worker from a fixture pre-push hook plus a fake `gh` that dies inside
  `pr edit`. Faithful boundary, not a network failure.
- On this machine the focused set takes 8–12 minutes depending on load, because each command is a real
  process doing ~15–90 git calls.

Round records, evidence and the three independent assessment rounds are in `docs/reviews/190/`.
