# Responses to the first assessment (head f7cf401 → 93531fa)

The original assessment stays in `ASSESSMENT.md` as written; this file answers it without rewriting it.

## 1. Behavior (high, regression) — interrupted push leaves the PR at a head the handoff does not name

**Accepted. Fixed in 93531fa.** You were right that this was new: the verdict refused every answer at
the new head, and only the publication path could rewrite `pr_handoff`, whose own gate the refusal
blocked. Base wf resumed that state through `deliveryResume`.

`publishedDeliveryVerdict(lookup, handoff, headNow)` now accepts a head the round itself produced —
`handoff.head` or the current `HEAD` — and returns:

- `merged { head }` — the merge landed a head this round produced; the receipt names that head.
- `open` — still open at the published head.
- `superseded { head }` — open at this round's own later HEAD: stale bookkeeping from the interrupted
  write, not an ambiguous remote. Reconciliation adopts it (`pr_handoff` rewritten with
  `commitContentSha` at that head, `pr_repair` when an instruction is outstanding) and returns `open`.
- `refused` — unknown, absent, closed, another URL, no head, or a third head that is neither the
  published one nor this round's HEAD.

Test: `#190 an interrupted push leaves the PR carrying a head the handoff does not name` followed by
`a retry adopts the head the PR actually carries instead of refusing its own later commit` and
`the adopted candidate is not reported as an unreconciled remote` (real CLI, `crash-edit` mode dies
inside `gh pr edit` after the push).

## 2. Behavior (medium) — `pr_repair` has no age; a later instruction rides an earlier OPEN observation

**Not changed; it is the agreed behavior, and the agreement is explicit.** `## Agreed` → `Choice`:
"OPEN is an observation, not a remote lease: a later human merge must be caught at subsequent
reconciliation/publication boundaries, not treated as impossible." T1 approved that wording on
`sha256:d74a1e69…`. The alternative — re-reconciling before every instruction — was the rejected
option in the same bullet.

The window is now narrower than when you read it: `pr_repair` is cleared at the start of every
reconciliation, so any `wf deliver` in that round invalidates it before it can be reused.

## 3. Evidence (low) — the failed-refresh property and the OPEN routing assertion

**Both fixed in 93531fa.**

- `#190 a failed refresh clears the earlier OPEN authorization` — first an OPEN observation, then a
  failed lookup, asserting `pr_repair` is gone and `wf next` no longer offers build.
- The routing check now proves routing rather than a state that was already `build`: it captures the
  pending ids before the second instruction and asserts the round's `build_reason` names the new one.

## 4. Design and standards

- `step.ts:144` duplicates `deliveredCommandGap` — **kept, with the reason in a comment**:
  `wf next` and `completeDeliveryStep` reach `runStep` in-process, without the CLI guard in `run.ts`.
  It is the same shape as the existing `merge_attempt` fence directly below it.
- The seam does not own its serialization — **documented** in its doc comment: callers must hold the
  delivery process lock, which `runDeliver` takes; the seam serializes only its own state writes.
- Unused `followupRoundLine` import — **removed**.
- No `state.selfcheck` case for the new parser branch — **added**: a well-formed observation reads
  back, and three malformed ones are corrupt state rather than a missing authorization.
- Layout at `deliver.ts:645` — **fixed**.

## Evidence for this round

`docs/reviews/190/evidence/focused-repair.log`: deliver, deliver-recovery, corrections,
correction-fences, delivered-round, state, next, step, brief, agreement, tsc, eslint — all green,
630 s, focused (10 of 82 files). Full suite not run. Wall times on this machine vary with load
(466 s for the same set before the repair, while another process was running 513 s of checks).

# Responses to round 2 (head 93531fa → c2a52cb)

## R1 (medium) — the interrupted-push scenario never interrupted; the response described evidence that did not happen

**Accepted, and the record stands corrected: the claim in the section above was wrong.** The clone's
remote was empty, so `wf deliver` refused with "PR was not found" before the push, and `crash-edit` was
never reached.

Now: the fixture seeds a real OPEN row at the published head, the round repairs and is approved, and the
attempt reaches the push, dies inside `gh pr edit`, and is asserted as such — exit 137, the branch's own
commit present on origin (`ls-remote`), the handoff still naming the earlier head, no receipt. The retry
then converges: the publication path rewrites the handoff at the pushed head after re-asserting the
approval.

One correction to my own debugging along the way, recorded because it caused the earlier false claim:
`finishDelivery` does not move the branch; `wf deliver` commits the round folder *before* pushing, so the
pushed commit is `HEAD` after that commit, not the pre-deliver repair commit.

## R2 (low-medium) — adoption wrote the handoff without the approval comparison

**Accepted.** The newer-head arm no longer writes `pr_handoff` at all. It records the OPEN observation
and returns `none`, so the publication path runs and rewrites the handoff only after
`requireApprovedContent` — the same comparison as every other handoff write. A PR at this round's head
over bytes T2 never saw is refused with the approval message and nothing is adopted; that case is now a
test.

## D1 — the `step.ts` fence duplicates `deliveredCommandGap`

**Accepted.** You were right that `deliveredCommandGap(current, ['step', ...argv])` already runs in the
same updater, so the fence and its comment were dead weight. Both removed.

## S4 — the two pure fences had no unit cases

**Accepted.** Seven pure cases in `corrections.selfcheck.ts`: no handoff, delivered, unobserved,
observed-at-this-candidate, observed-at-another-head, observed-at-another-URL, and the gate's behaviour
with no outstanding instruction versus one.

## B3's low half — the clearing write could refuse when state moved concurrently, leaving the observation

**Accepted, and made structural rather than tested.** Clearing an observation only ever *removes*
authority, so it no longer carries a precondition: there is no state in which it can fail and leave the
old answer standing. The concurrent-change cases stay covered by the five race scenarios, which assert
that no repair authority survives a rejected lookup.

## B2 — still declined, for T1 to rule on

Unchanged, and the reply above stands: the agreement's `Choice` says "OPEN is an observation, not a
remote lease: a later human merge must be caught at subsequent reconciliation/publication boundaries",
T1 approved that sentence, and per-instruction re-reconciliation was the rejected option. Surfaced to
Shay at T2 rather than decided here.

## One intent note from round 2, also for T1

The reviewer read `## Agreed`'s "Recovery uses the published head, not a later local HEAD as a substitute
identity" against the `merged` arm recording the head the merger actually landed at (which can be this
round's later HEAD when the merge happened after a repair). The receipt must name the commit that merged,
or it is a false receipt, and base wf behaved the same way; but the wording is T1's to confirm. It is in
the T2 question.

## Evidence

`docs/reviews/190/evidence/focused-round3.log`: the ten affected selfchecks plus tsc and eslint, all
green, 597 s, focused (10 of 82 files). Full suite not run.
