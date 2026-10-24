# #190 — ready for T2

**Result.** The reported race is reproduced through the real commands and fixed: publish → human
merge → correction before the receipt no longer offers old-round repair, and `wf deliver` recovers the
merged delivery instead of refusing the instruction.

## Now → change

| | before | after |
|---|---|---|
| correction after publish, before receipt | retained, then routed the round to `build` | retained; repair fenced until the published PR is reconciled |
| remote PR already merged at the published head | `wf deliver` refused the unresolved instruction before looking up the PR | receipt recovered at the merged head, instruction kept for a fresh follow-up (#129) |
| remote PR open | ordinary repair | ordinary repair, after one reconciliation |
| gh down / absent / closed / another URL / another head | not distinguished | candidate and instruction retained, repair refused, actionable message |
| where the network runs | — | outside the state lock, revalidated against round, instructions and local subject |

## Evidence

| check | result |
|---|---|
| `node docs/reviews/190/repro.ts` before the fix | 3 of 6 assertions red — routed to build, next offered build, delivery refused |
| same repro after the fix | 6 of 6 green |
| the fix reverted, new assertions run | 25 fail (red-capable) |
| focused selfchecks (10 of 82 files) + tsc + eslint | **all green**, 597 s |
| independent assessment | three rounds; round 1 and 2 findings repaired, round 3 verdict below |
| full suite | **not run** (manual, and this change does not require it) |

Everything ran against disposable repositories with a local bare origin and a **controlled `gh` seam**.
No live GitHub PR was created, merged or mutated. The "human merge" is a fixture state.

## Limits, in plain terms

- No real GitHub interaction was exercised: the query, the merge, and the refusal paths are proven
  against a faithful fake, not the API.
- The interrupted-push case kills the worker with a fixture pre-push hook and a fake `gh` that dies
  inside `pr edit`; it is a faithful boundary, not a real network kill.
- Windows check times vary with machine load (466–716 s for the same set across this round).

## Two rulings that are yours, not mine

1. **Cadence.** Once a PR is confirmed OPEN, a later instruction is repaired without asking the remote
   again (`pr_repair` has no age). The agreement says "OPEN is an observation, not a remote lease: a
   later human merge must be caught at subsequent reconciliation/publication boundaries" — approved as
   written. Each `wf deliver` clears the observation first. Confirm that cadence, or I re-reconcile
   before every repair (slower, one extra network call per instruction).
2. **Receipt head.** When a human merges *after* a scoped repair, the receipt names the commit that
   actually merged (possibly the later HEAD), not the originally published one. The agreement's
   "not a later local HEAD as a substitute identity" was about inferring a merge from local state; this
   records what the remote proved. Confirm that reading.

## Your decision

Publish it (I push the branch and open the PR against `main`, leaving it open for you to merge), or send
it back with what to change.

## T2 ruling — 2026-10-24

Shay, Inbox reply `msg_01M5Q7PZBDG9YQEANBQHPWGQGH`, answered Q1: "Publish it (your recommendation)".
Approved on head `5262ae3` for publication. The two readings above were put to him with that question
and are not contradicted by his answer; if either is wrong, the repair is a follow-up, not a rewrite of
this delivery. Merge remains his.
