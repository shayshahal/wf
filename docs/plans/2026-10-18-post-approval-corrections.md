# Working agreement — #150 · Post-approval corrections

Class: B — durable round state and approval/delivery behavior.

**Result for Shay:** say the correction normally. The receiving agent retains the words and their source, brings them into the actual work, and cannot deliver while they remain unresolved. Nobody edits an earlier approval to make a builder listen.

Source: [#150, complete issue and approved audit additions](https://github.com/shayshahal/wf/issues/150). Intake snapshot: `.wf/150/TICKET.md` in this worktree. This is a wf contribution, not a JewelryX application round; its T1 is this document's explicit Plannotator approval. No project setup or installed workflow changes are needed for intake.

## Observed

- `src/round/prompt.ts:50–54,139–141` selects repair instructions only from a review whose latest verdict is `changes-requested`. An approved review intentionally suppresses historical rejected comments (`src/round/prompt.selfcheck.ts:54–55`); removing that filter would resurrect old instructions, not establish a new instruction's source or applicability.
- `wf decide` records local decisions but leaves an approved round at `pr` (`src/round/ask.ts:149–160`). `nextAction` returns `deliver` at `pr` before examining revisions (`src/round/next.ts:117`). A transient `build_reason` is cleared at later steps; it is not a correction's durable lifecycle (`src/round/step.ts:178–184`).
- Reproduced through this checkout's real `wf.mjs` in a disposable Git repository: approved review plus appended correction → `next` says deliver; `decide` with another correction → still deliver/step `pr`; manual `step build` emits no reason warning; actual `brief build` omits the approved-review correction. REVIEW.md stayed byte-identical. Repro: `C:/Users/Shay/AppData/Local/Temp/wf-150-repro.mjs`; output beside it in `wf-150-repro.log`.
- `src/gates/deliver.ts:211–220,668–675` appends a system push-hook failure with `verdict: changes-requested` to REVIEW.md. This conflates system recovery with a person's verdict.
- Existing approval compares both worktree and committed content. That protection must remain (`src/gates/content-identity.ts`, `src/gates/review-format.ts`, `src/gates/deliver.ts:574–585,738–753`). `.wf/state.json` is deliberately outside the reviewed content identity: a pending instruction therefore needs its own delivery guard.
- Inbox transports replies to known open questions; it does not distinguish instructions from discussion or read every later message. Review feedback lacks stable author/event identity. No current wf component watches all linked ticket/PR/review surfaces (`src/round/inbox.ts:20–26,38–68`, `env/adapters/plannotator-inbox.ts:234–275`, `src/seams.ts:24–33`). #159 owns wake/launch/delivery of events when the coordinator is absent.
- Focused baseline: `node src/selfcheck.ts src/round/prompt.selfcheck.ts src/round/ask.selfcheck.ts src/round/inbox.selfcheck.ts src/gates/review.selfcheck.ts` — six checks green including tsc/eslint, 7.3s. This is not a complete-suite result and does not test a fix.

## Agreed

- **Behavior.** Add one round-owned correction operation, exposed as `wf correct` for agents and directly usable by delivery. Admission records the instruction verbatim, original author, stable source/message reference, relaying agent when available, intended scope and the reason it applies. A source message/event is admitted once; exact redelivery returns its existing record, conflicting reuse of an identity refuses without overwriting it. A later unrelated message cannot replace an instruction by timestamp.
- **Intake.** The active receiving agent admits a clear instruction from Shay using the feedback it actually received/read in chat, a linked review, Inbox, ticket or PR. Shay does not repeat it in a special command. Ordinary conversation, approval notes and another reviewer's suggestions are not new assignments. The agent owns that contextual distinction, as it already owns engineering judgment; wf records explicit facts rather than classifying prose. Provenance is the receiving agent's attribution, not a new authentication claim. Ambiguity asks only for the missing decision, retaining the original words. Do not claim automatic support for an unexercised source or dead-worker transport; #159 consumes the same durable operation when those events are delivered.
- **Durability and visibility.** Use existing locked `.wf/state.json`, not another mandatory correction document. Keep pending, addressed, durably blocked and explicitly superseded outcomes distinct, with the explanation/evidence reference or replacement identity. Dispatch, reading a brief and acknowledging transport never mean addressed. Applicable corrections and their provenance reach the actual build brief, assessment context and `status --inspect`, surviving a new process/session. Historical outcomes stay inspectable; explicitly superseded instructions are not current work. A blocked instruction still prevents delivery.
- **Route.** A pending post-approval correction returns unfinished work to build with the real instruction, subject to existing questions, hold, agreement/T1 and delivered-round protections. It cannot be lost when a dispatch reason is cleared. A bare `wf step build` with no recorded reason warns that the brief carries no new assignment; it does not invent one. An explicit correction within the agreed behavior does not itself renew T1. Changed agreed behavior follows the existing revision/T1 path.
- **Approval.** Preserve historical REVIEW.md exactly on correction admission and system recovery; never manufacture a person's verdict. Outstanding corrections block review completion and delivery retries, including the last merge boundary, even before code changes. Addressing an instruction does not grant approval. Changed reviewed bytes still require current verification, independent assessment and fresh T2 through existing bindings. If a transient delivery interruption is resolved and the approved subject is unchanged, retain the original approval rather than ask for another vote solely for the interruption.
- **Delivery origin.** Replace the existing push-hook verdict rewrite with a system-origin correction carrying its actual failure. Expose the same operation for #149's scoped merge-conflict recovery, without implementing its project regeneration procedure or general delivery automation here. A network failure alone is not a product repair or a human verdict.
- **Merge race.** Establish an explicit final merge-attempt boundary against current approval and correction state before the remote request. An instruction arriving during an attempted/uncertain merge remains durable and visibly awaiting reconciliation; do not claim the merge was prevented. Reconcile actual remote status before choosing repair in this round versus a fresh follow-up. A confirmed merge retains its delivery receipt and #129 identity; later product correction cannot reopen it or borrow its approval. Unknown remote outcome remains pending, not guessed. No state lock is held across a human wait or a network request.
- **Choice.** Store a small explicit correction lifecycle alongside existing round facts; let the receiving agent admit intent and judge evidence. Rejected: scrape every comment/interpret intent inside wf, rewrite approval verdicts, or treat whichever message is newest as the task. Those alternatives lose provenance, revive stale scope or rebuild the semantic policy engine deliberately removed on 18 October. Command spelling and helper placement are implementation choices, not another review gate.
- **Excluding.** No scheduler, polling watcher, automatic worker launcher, machine/harness setting changes or competing coordinator (#159). No new universal feedback platform, runtime dependency, mandatory per-repair proof grammar, mandatory new artifact, blanket generated-file approval exemption or automatic unrelated repair. #149 keeps full conflict regeneration and whole-delivery continuation; #131/#139 keep scenario tooling/replay. Do not close those issues with this change. End-to-end automatic continuation across every named external source remains incomplete until #159 supplies and exercises the real transport/launcher; report the sources actually exercised here.
- **Verification.** Real command-path regressions must demonstrate human- and system-origin corrections reaching actual briefs without verdict edits; persistence, deduplication, explicit supersession and genuine blocking; safe approval and merge-race outcomes; and delivered-round follow-up protection. Retain existing state concurrency, content identity and interrupted-delivery tests. Run focused checks during implementation, then the full selfcheck suite before any push. Use isolated repositories/local remotes and controlled existing seams, not live rounds, panes or production merges.
- **Not asked for.** none — durable corrections, provenance, inspection, deduplication, approval/race safety and the reasonless-build warning all come from #150 and its approved additions. The merge-attempt boundary is the mechanism needed to make its race behavior honest, not a new job system.
- **T2 walk.** none — CLI/state behavior, demonstrated with a short command transcript and the changed diff, no application page.

The important change is not another review status. A correction has its own identity and remains work until explicitly disposed of:

```diff
  .wf/state.json
    decisions[]                    existing rulings remain readable
    build_reason                   current dispatch explanation only
+   corrections[]                  authored instruction + source identity + intended scope
+     pending                      survives dispatch and fresh sessions
+     addressed                    explanation/evidence; not an approval
+     blocked                      concrete blocker/owner; still prevents delivery
+     superseded                   explicit replacement; history retained
+   merge attempt, when needed     approved head + correction boundary; reconcile uncertainty
  REVIEW.md                        append-only human review history, not a system-failure channel
```

```diff
  supported feedback → receiving agent admits intent
+   round correction operation → locked state + current obligations
~   next → build → actual brief → work/evidence → assessment → T2
+   delivery guard reads fresh unresolved corrections at mutation boundaries
  content/HEAD binding still refuses changed approved subjects
~   system push-hook refusal → correction, not a rewritten human verdict
```

## Verification

| # | Case | Check |
|---|---|---|
| 1 | Exact reported approved-review/user correction | Disposable repo: approval → admitted instruction → next → actual brief → implementation → assessment/T2; historical REVIEW.md bytes unchanged |
| 2 | Delivery-origin repair | Controlled push hook refuses; source/author remain system; next/actual brief carries failure; no synthetic human verdict |
| 3 | Fresh context and ordering | Exit/restart CLI processes over the same state; duplicate and reordered source deliveries; conflicting identity; explicit supersession; unrelated newer comment cannot erase pending work |
| 4 | Intent and authority | Receiving-agent intake examples distinguish explicit instruction, discussion and third-party suggestion; tested core admission does not claim NLP or source authentication; hold/questions/T1 remain effective |
| 5 | Completion and blocking | Dispatch/transport do not resolve; addressed has an explanation, blocked has an owner/reason, superseded names a valid replacement; inspection and assessment show applicable work |
| 6 | Approval and races | Pending instruction refuses direct review completion/direct deliver/retry; changed subject needs fresh T2; unchanged transient interruption can retain approval; instruction before versus during merge boundary; unknown and confirmed remote results |
| 7 | Delivered round | No mutation of a delivered implementation; late correction retained with fresh-follow-up recovery instead of reopening the old approval |
| 8 | Existing mechanical safety | Focused state/next/brief/step/prompt/inspection/review/delivery/content-identity/interruption checks; complete `node src/selfcheck.ts` before push |

## Decisions

T1 approved by Shay through Plannotator pn-c0d164 on 2026-10-18, binding material SHA `5a7ebad89f85680b506423cabd64fb69f772b0b4edd17343e4e36e042842447d`. No implementation had been changed before approval.

## Implementation notes

- Added owner: `src/round/corrections.ts` with its adjacent selfcheck. Existing `ask.ts`/`decide` keep questions/rulings, `review-format.ts` keeps human verdicts, and `build_reason` stays a projection rather than acquiring a second hidden meaning. Removing the correction owner would spread lifecycle, provenance, deduplication and delivery applicability policy across those callers.
- Extend current entry/brief/inspection/delivery owners surgically. Do not introduce a general event bus, callback registry, universal transport interface or parallel command router.
- Evidence paths above are local investigation records, not committed runtime requirements. Intake and all tests use this clean contribution worktree based on published main `383623f`; local #180 work remains separate.

### Implementation and verification handoff

- New correction/merge-attempt authority is written as state version 4 immediately; valid legacy 2/3 rounds are readable. A real installed v3 entry was exercised against a disposable v4 round: it refused before dispatch and left the state unchanged (`wf-150-old-entry-proof.log` in the local temp folder).
- A concrete blocked correction has an explicit `--unblock` path back to pending work. This retains the original words/source and prior dispositions; unblocking, dispatch and reading the resumed brief do not claim application. Identical disposition retries leave state bytes unchanged.
- Delivery reuses the existing identity-proven process lock in git's private directory. Concurrent retries cannot reconcile another live request's OPEN PR prematurely; instruction admission still uses the independent state lock and stays available. No state lock spans the remote request.
- Controlled command-path cases cover capture → actual brief → committed correction → assessment → refusal of old T2 → fresh bound T2. Real local push-hook failure and local network failure exercise system recovery without verdict rewrites. Remote merge responses are controlled through the existing `gh` seam, including instructions before/during merge, unknown outcome and confirmed merge.
- Exercised intake is the receiving-agent correction command with controlled human/system provenance; no live ticket, PR, Inbox or idle-worker watcher is claimed. Meaning belongs to the receiving agent: a clear directive beside an approval is actionable, while non-directive approval notes and suggestions alone are not assignments. Automatic event transport/launch remains #159; conflict regeneration remains #149.
- The first independent assessment found the confirmed-receipt → final-step crash boundary could loop on a late instruction. Local-only completion now runs before new-merge gates. Both during-merge and after-receipt admission regressions failed against the prior implementation and passed with the repair, preserving receipt, approval, note and pending instruction; a forbidden remote adapter proves recovery cannot issue another merge (`wf-150-receipt-red.log` / `wf-150-receipt-green.log` in the local temp folder).
- The final assessment and complete-suite result accompany T2. The source worktree is `C:/Users/Shay/work/wf-150-corrections`; test logs are local evidence, not runtime dependencies.

## T1 binding

Approval binds Observed + Agreed at material SHA `5a7ebad89f85680b506423cabd64fb69f772b0b4edd17343e4e36e042842447d`. Verification and implementation notes can evolve without changing the agreed direction.
