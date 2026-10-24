# AGREEMENT — #190 · Reconcile published delivery before correction repair

Proposed Class B agreement. **T1 pending — no production implementation authorized yet.**

## Observed
- The continuous disposable repro publishes through the real dispatcher, records `pr_handoff`, simulates human merge, admits a correction through `wf correct`, then runs `wf next` and delivery. It retains the words but offers old-round build and refuses delivery before remote lookup. Command: `node docs/reviews/190/repro.ts`; measured exit 1 with three behavior assertions failing. Evidence: `evidence/repro-isolated-before.log`.
- `src/round/corrections.ts:152` fences admission routing on delivery/merge attempt, not published handoff. `src/round/next.ts:119-133,212-215` can offer correction build without reconciling that handoff. `src/gates/deliver.ts:658-704` applies T2/correction gates before normal remote lookup.
- Existing delivery owns repository/PR parsing, receipt recovery and completion; correction capture owns stable-source deduplication. Reuse these owners rather than create another delivery engine.
- This is measured controlled-remote behavior, not a demonstrated production incident or live GitHub merge. Intake: `TICKET.md`, `USER-REQUEST.md`, raw issue/comment snapshots.

## Agreed
- **Behavior.** Retain and deduplicate the exact authored instruction immediately, without waiting for the network. A known published candidate fences correction-driven repair until its actual repository, PR identity, expected published head and outcome are reconciled.
- **Choice.** Retain first; reconcile through the existing delivery owner before repair, not by performing network work during correction admission. `wf correct` remains durable local intake; `wf next` directs reconciliation when needed; `wf deliver` can reconcile before its new-publication gates. Reject putting network lookup inside intake/state locking: unavailable GitHub must never prevent retaining an instruction, and locks must not wait for the network.
- **MERGED.** At the retained published head, recover/record delivery and keep the correction for explicit fresh-identity follow-up under #129. Never rebuild or republish the merged old round. Recovery uses the published head, not a later local HEAD as a substitute identity.
- **OPEN.** A confirmed matching open candidate permits ordinary scoped repair, retaining candidate identity and the correction. Existing questions/holds, evidence freshness, independent assessment and human approval still apply. Changed reviewed content requires fresh evidence/approval. OPEN is an observation, not a remote lease: a later human merge must be caught at subsequent reconciliation/publication boundaries, not treated as impossible.
- **Unknown/stale.** Unavailable, absent-for-a-known-candidate, malformed, ambiguous, CLOSED or mismatched remote answers retain the obligation/candidate and refuse repair with an actionable retry/failure. Unknown is not OPEN. Read/query outside the state lock; revalidate round/candidate, instruction snapshot and local subject before applying results. A stale lookup cannot authorize repair. New instructions cannot inherit an unrelated lookup's authority.
- **Recovery.** Keep existing #108/#150 deduplication, process serialization, merge-attempt recovery and receipt completion. A crash after recognition but before receipt must retry from retained identity; after receipt, only unfinished local bookkeeping remains. No duplicate publication, lost instruction or silent disposal.
- **Excluding.** No automatic merge, second delivery engine/scheduler, extra human checkpoint, global hook/configuration change, generic project adapter, active-round mutation, tracker notification (#191), reap retry (#192), host wake (#159), or unrelated backlog work.
- **Verification.** Exercise real command composition against a local bare origin and controlled GitHub seam: continuous publish → merge → pre-receipt correction → recovery; OPEN; remote refusal variants; duplicate intake; crash/retry; post-receipt correction; stale/concurrent lookup. Assert instructions/candidate survive, merged work never offers old-round repair, and publication counts do not grow on recovery.
- **Not asked for.** None. Local intake/agreement/evidence/review documents preserve the required workflow guarantees where the installed JewelryX-only selector cannot represent development of wf.
- **T2 walk.** No app/stack: inspect focused command logs, recovery assertions, implementation diff and fresh independent assessment. Final human approval is required before publication. Leave PR merge to Shay.

## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | Continuous human-merge race | delivery/correction/routing selfchecks | Publish with real dispatcher and local bare origin; retain correction; reconcile expected published head; assert delivery/fresh follow-up, one PR, no old-round build |
| 2 | Confirmed OPEN | same | Matching candidate allows ordinary correction repair, without reusing stale approval |
| 3 | Remote unavailable/malformed/ambiguous/mismatched/CLOSED/absent | same | Instruction and candidate survive; no repair or remote mutation; actionable refusal |
| 4 | Duplicate and retry boundaries | same | Same source identity deduplicates; interrupted recognition recovers; receipt completion and post-receipt correction preserve fresh follow-up |
| 5 | Concurrent/stale lookup | same plus state/step fences as required | Change instructions/candidate/subject during lookup; stale observation cannot release repair |
| 6 | Focused repo checks | affected `*.selfcheck.ts` | `node src/selfcheck.ts <affected relative.selfcheck.ts paths>` includes selected tests, tsc and eslint; report actual selection |
| 7 | Scope and final publication approval | agreement, diff, assessment, logs | manual: Shay judges the agreed recovery behavior and later approves exact final implementation for publication; merge remains human-owned |

## Decisions
Pending. Starting the task is not agreement approval. No response or silence is approval.
