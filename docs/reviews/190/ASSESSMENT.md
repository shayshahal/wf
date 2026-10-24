# #190 — final assessment
Verdict: findings
head: f7cf401

Reviewed `git diff 08f43f5..f7cf401` (8 files, +367/−19) against `AGREEMENT.md`,
`AGREEMENT-REVIEW.md` (T1 approved `sha256:d74a1e69…`), `TICKET.md` and root `AGENTS.md`, read-only.
I did not build this change and did not take the builder's account as evidence.

**What I ran (focused, not the full suite — 82 files exist, I ran 8):**

| ran | result |
|---|---|
| `env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts src/gates/deliver-recovery.selfcheck.ts` (the brief's command) | PASS — recovery 513.4 s, plus tsc and eslint, 3 green |
| same runner over `corrections`, `next`, `step`, `delivered-round`, `state`, `correction-fences`, `deliver` selfchecks | PASS — all 7 green, tsc + eslint included, 124.8 s |
| `npx tsc --noEmit --noUnusedLocals` (to find dead additions; not part of the runner) | 12 pre-existing unused-import hits, one of them this commit's |
| four throwaway probes in `%TEMP%\a190` calling `publishedRepairGap` / `publishedCorrectionGate` / `nextAction` directly, `readState` parsing, and `reconcilePublishedDelivery` with wf's own `gh` seam plugged against a local git repo | results quoted below |

Not verified by me: any real GitHub PR, `wf new`/`serve`/hook install, and the other 74 selfcheck files.
No product code, test or agreement file was modified. Full suite not run.

---

## Intent

The change does what #190 and the agreement asked, and nothing unrelated. Intake stays local
(`captureCorrection` gained no I/O: `corrections.ts:167` only adds `!publishedRepairGap(current)` to an
existing pure predicate; my probe confirmed admission with a `gh` that throws). Published recovery now
runs before the new-publication gates (`deliver.ts:691`), which is the agreed ordering. MERGED recovers
at the published head, never the local HEAD (`deliver.ts:645-650`); refusals retain candidate,
instructions and round (probe below). No second delivery engine, no scheduler, no approval bypass, no
`env/`, hook or project change. `ticket notification (#191)`, `reap retry (#192)`, `host wake (#159)` are
untouched.

Two scope observations, neither an objection:

- **I1 (Intent, deliberate, wider than the word "repair").** `disposeCorrection` is fenced too, not only
  the build route (`corrections.ts:194-195`). A correction cannot even be marked `blocked` or `addressed`
  while a published handoff is unreconciled. That is defensible — `disposeCorrection` can *resume the
  round to `pr`* when the last correction clears, which would be a route around the fence — but it means
  an unrelated instruction on such a round cannot be disposed of while `gh` is down. The agreement's
  "refuse repair with an actionable retry/failure" is satisfied by the message; the cost is a wider
  block than the sentence implies.
- **I2 (Intent, as agreed).** `wf deliver` can now finish a merge on a round with open questions or a
  hold, because the merge recovery precedes `openQuestionGate` (`deliver.ts:691` vs `:702`). I checked
  that `wf step merged` has no question gate (`step.ts` has none), so this does not strand the round. It
  is the agreed "a human merge cannot be undone by a local route change".

## Behavior and evidence

The reported gap is closed. Before, on a cloned publish + merge + pre-receipt correction, `wf next`
printed `work build` and `wf deliver` refused `unresolved corrections` before any lookup
(`evidence/repro-isolated-before.log`, which I re-read, not re-ran). Now the retained instruction keeps
`step: pr`, `wf next` says `deliver: reconcile the published PR…`, and `wf deliver` recovers at the
published head. I checked the mechanism by hand rather than trusting the log:

- the fence is fact-based, so it also protects a version-4 round written by the previous runtime
  (`publishedRepairGap` never reads `wf_version`) — probe: handoff + one pending correction + no
  observation → gate text; matching observation → `null`; observation at another head or another PR
  URL → gate text; delivery recorded → `null`;
- `nextAction` with a matching observation returns `work build`, at a mismatched head returns
  `deliver: reconcile…`;
- with `pr_repair` set and `gh` down or answering garbage, `reconcilePublishedDelivery` returns
  `refused`, leaves `delivery` unset and **clears `pr_repair`**, so the earlier OPEN answer stops
  authorizing repair;
- a malformed `pr_repair` in state is refused as corrupt (non-object, bad url, short head, missing head,
  array), `null` and a valid record round-trip.

**B1 (Behavior — regression, high). A pushed repair that fails or is interrupted before the handoff
write permanently blocks the round; the retry the refusal prints can never succeed.**

`publishedDeliveryVerdict` (deliver.ts:295-306) refuses any answer that is not the *recorded* handoff
head:

```ts
return lookup.headRefOid === handoff.head
    ? { kind: 'open' }
    : { kind: 'refused', why: `published PR ${handoff.url} is open at ${lookup.headRefOid ?? 'no commit'}, not the published head ${handoff.head}` };
```

and `runLockedDelivery` returns before the publication path on a refusal:

```ts
const published = await reconcilePublishedDelivery(toplevel);
if (published.kind === 'refused') { console.error(`wf deliver: ${published.why}`); process.exitCode = 2; return; }
```

The only writer of `pr_handoff` is `finishDelivery`'s open path (`deliver.ts:554`), which is reached only
after the push (`deliver.ts:846`) and the PR create/edit (`:874`) and a fresh lookup (`:894`) — i.e. 75
lines and one network call after the branch has already moved. If anything between `:846` and `:921`
fails or the process dies, the remote PR is OPEN (or later MERGED) at the new head while `pr_handoff`
still names the old one.

That is exactly the state #190's own flow creates: publish → correction → OPEN confirmed → repair →
`wf deliver` pushes the repair → `gh pr edit` fails. Retry then answers *"is open at f5b3cdc4…, not the
published head 7d3e704d… fix the remote and retry wf deliver"*, and no wf command can produce a
different answer. My probe reproduced it directly (temp repo, handoff at H0, branch at H1):

```
handoff head      : 7d3e704d136c9521dbfeacfc429b330195f2bd57
local/pushed head : f5b3cdc41d1d6881040e042a053bc8ce8968459d
OPEN at pushed head  -> {"kind":"refused","why":"published PR …/108 is open at f5b3cdc4…, not the published head 7d3e704d…"}
MERGED at pushed head-> {"kind":"refused","why":"published PR …/108 merged f5b3cdc4…, not the published head 7d3e704d…"}
OPEN at handoff head -> {"kind":"open"}
after: delivery= undefined pr_repair= null step= build
```

The three exits I can find are all outside the workflow: hand-editing `.wf/state.json`, force-pushing the
remote branch back to `pr_handoff.head` (only while unmerged, and it discards the pushed repair from the
branch), or `WF_FORCE_REAP=1 wf reap` (which throws the round away). Meanwhile the fence keeps advising
"run wf deliver, then wf next".

Base wf recovered this state: `deliveryResume` is unchanged by this commit, and base reached it
directly (`OPEN → { do: 'resume' }`), re-read the PR against the local HEAD (`:894`) and recorded the
handoff at the moved head. So this is a regression introduced by putting the reconcile in front of the
publish path, not a pre-existing dead end — unlike the `CLOSED`/absent cases, which the agreement
explicitly requires to refuse.

The pre-push failure modes do not have this problem (nothing moved), and the refusal paths that matter
for #190 (gh down, wrong repo, ambiguity) are correct. The trigger is narrow but ordinary: a network
failure or a kill between a successful push and the handoff write. Suggested direction for whoever
resolves it (not implemented, not mine to settle): only refuse a moved head when repair is actually being
authorized (outstanding corrections), or record the pushed head before the PR roundtrip. The selfcheck
set does not cover "re-publish after OPEN repair, then fail after the push".

**B2 (Behavior — as implemented but in tension with the agreement, medium). A stale OPEN observation
authorizes repair for instructions that arrived later, with no timestamp or generation.**

`publishedRepairGap` matches only `url` + `head` (`corrections.ts:96-101`), and nothing expires
`pr_repair` except a successful reconciliation or a receipt write. Probe: handoff + observation at the
published head + a *new* pending correction → gate `null`, and `nextAction` returns `work build`. The new
selfcheck codifies this deliberately — `#190 a correction after confirmed OPEN routes to ordinary build
without another lookup` — while the agreement's stale bullet says "A stale lookup cannot authorize
repair. New instructions cannot inherit an unrelated lookup's authority." This is the one place I would
not settle myself: it can be read as the allowed "OPEN is an observation, not a remote lease", or as the
forbidden inherited authority. The cost if it is wrong is bounded (repair work in a round that merged
meanwhile; the merge is still caught at the next `wf deliver`, which B1 aside does recover at the
published head). **Unresolved objection for the assessor/T1**, not a silent decision I will make.

**B3 (Evidence — low). The code's own safety claim is untested.** The comment at `deliver.ts:617`
("A failed refresh must not leave an earlier OPEN answer authorizing repair") has no scenario: the
refusal matrix in `deliver-recovery.selfcheck.ts` starts from a fixture where `pr_repair` was never set,
so its `after.pr_repair == null` assertion is trivially true. I verified the behaviour by probe (it
works). Related, low: if the *clearing* write itself refuses because the state changed concurrently
(`deliver.ts:618-624`), the old observation survives and still authorizes repair.

**B4 (Evidence — low). One new assertion proves less than its name.**
`#190 a correction after confirmed OPEN routes to ordinary build without another lookup` asserts
`later.code === 0 && readState(f).step === 'build'` — but the preceding reconciliation already put the
round at `step: 'build'`, and `captureCorrection` returns `recorded` whether or not it routes. The
assertion therefore passes with the fence either way. The honest check would assert the printed line
(`wf next carries the current instruction…`) or that `since`/`stepHistory` moved.

Everything else I checked is sound: duplicate intake keeps exact bytes; the crash case is a real crash
(a fixture pre-push hook kills its own delivery process at the branch delete, after the merge was
recognised and before the receipt); recovery makes no create/edit; post-receipt corrections stay a fresh
follow-up; `a changed reviewed subject still needs fresh approval` refuses at exit 2 with no PR edit.

## Design

The seam is the smallest correct one, and it reuses the owners the agreement named:

- `prLookup` / `PrLookup` (#108) and `finishDelivery` (#108) are reused, not reimplemented; the correction
  identity and disposition path (#150) is untouched except for the fence.
- `publishedDeliveryVerdict` is a ~14-line pure decision table. It is *not* expressible with the existing
  `deliveryResume`: for a retained candidate `none` must refuse (never "create a PR") and `OPEN` must
  require head equality, both the opposite of `deliveryResume`. Justified.
- `pr_repair: { url, head } | null` is earned: its absence is the fence, its presence is the only thing
  that releases repair, and writing the head means a republish invalidates it. No field was added "for
  later".
- **State version 5 is justified and correctly shaped.** The fence is fact-based, so version 4 is still
  readable (needed: rounds written by the previous runtime are the pre-existing broken ones) and old
  readers fail closed on 5, per the #110 convention. `writeState` bumps only when corrections,
  `merge_attempt` or `pr_repair` is present (`state.ts:464`), so nothing else changes version. The cost
  is the usual protocol-cut cost: any `wf step` now marks a round version 5 (`step.ts:192`), so a
  teammate on an older copy must update before continuing a round this build stepped.
- **No network under a lock.** `seams.gh` is called with no `writeState` in scope; the receipt, the
  rejection write and the `pr_repair` writes each take the state lock only for their own write, and
  intake is not blocked by `wf-deliver.lock` (existing `correction-fences` scenario still green).
- Revalidation is done where it matters: state bytes are compared again *inside* each `writeState`
  callback (`deliver.ts:667`, `:575`), not only after the lookup, and the local subject (HEAD, branch,
  index tree, approval-scoped worktree, remote urls) is compared before the branch delete and the
  receipt. I could not construct a merge/receipt/branch-delete landing on a stale claim other than B3's
  narrow clearing window.

Two small design defects:

- **D1 (Design — low). The fence in `step.ts:144-145` is redundant.** `deliveredCommandGap` is called a
  few lines later with the same command and carries the identical rule
  (`delivered-round.ts:32`, same `held`/`merged`+delivery exemptions). One rule in two places is a
  maintenance hazard; it is harmless only because they agree today. `next.ts:120` is *not* redundant (it
  is what the agent is told) and `delivered-round.ts:32` is not redundant (it covers
  `brief`/`check`/`agree`/`review`).
- **D2 (Design — low).** `reconcilePublishedDelivery` is exported and documented as "independently
  callable", but it does not take the delivery process lock; it is only safe under `runDeliver`'s lock.
  Two independent callers could race a merged finish against an open write. Worth one sentence in the
  doc comment if it is meant as a seam (the issue did ask for one).

`wf deliver` now issues two `pr list` calls in the ordinary still-open case (reconcile, then the
pre-push `deliveryResume`). Harmless duplication of a read, noted for completeness.

## Standards

Compliant on the points AGENTS.md fixes: erased-only TypeScript, `.ts` import specifiers,
`src/gates|round/` placement, one command module with its selfcheck beside it, no runtime dependency, no
project or `env/` reference in core, comments that say *why* with the incident and issue number, and
expected failures returned as values (`{ kind: 'refused', why }`, `PublishedReconciliationRefused`),
with the one `catch` that converts unexpected errors into an actionable refusal keeping the message.

Findings, all minor:

- **S1 (Standards).** `deliver.ts:29` adds `import { followupRoundLine } from '../round/delivered-round.ts';`
  and never uses it. Neither gate catches it — `tsconfig.json` has no `noUnusedLocals` and
  `eslint.config.js` runs only lint-kit's error-handling set — so it needs a human eye. (`tsc
  --noUnusedLocals` also flags pre-existing unused imports; this one is the only one added by this
  commit.)
- **S2 (Standards).** The new durable field's parser (`state.ts:215-217`) has no case in
  `state.selfcheck.ts`, although the neighbouring `build_reason` case there exists precisely to prove
  "malformed recovery metadata is refused without mutation". I confirmed by probe that the parser does
  refuse non-objects, bad urls, short/missing heads and arrays — so this is missing coverage, not a bug.
- **S3 (Standards).** `deliver.ts:645` carries a broken layout into the commit:
  `if (verdict.kind === 'merged') {\t\t\tconst { id, folder } = roundOf(state, toplevel);`
- **S4 (Standards).** The two new pure fences in `corrections.ts` have no unit cases in
  `corrections.selfcheck.ts`; they are exercised only through the CLI/e2e scenarios in
  `deliver-recovery.selfcheck.ts`. The "pure functions checked there" convention is bent, not broken.

The `#190` test restructure itself reads honestly: one real publish cloned per scenario, the remote
matrix driven through wf's own `gh` seam, and three real CLI scenarios left in place. It does not fake a
crash, does not seed a receipt it claims to have recovered (`mergedAt` seeds only the remote), and
asserts absence of republication rather than trusting stdout.

---

### Summary

The reported #190 path is fixed and the merged/open/unknown matrix behaves as the agreement asks, with
state, instructions and candidate preserved on every refusal. It is not clean: **B1** is a new
unrecoverable state in the flow this change creates (a pushed repair whose handoff write did not land),
reached by any failure or kill between `deliver.ts:846` and `:921`, and no wf command can leave it.
**B2** needs a ruling rather than a code change — whether a later instruction may ride an older OPEN
observation, which the new test asserts and the agreement's stale clause reads against. S1–S4 are small
and cheap.

---

## 2026-10-24 — round 2 (93531fa)
Verdict: findings
head: 93531fa

A fresh reviewer again, for the repair `f7cf401 → 93531fa`. I read `ASSESS-BRIEF.md`, round 1's section
above, `REVIEW-RESPONSES.md`, `AGREEMENT.md`, `AGREEMENT-REVIEW.md` (T1 approved
`sha256:d74a1e69…`), `TICKET.md` and root `AGENTS.md`, then `git diff f7cf401..93531fa` (4 files,
+94/−24) and `git diff 08f43f5..93531fa` (9 files, +437/−19), and ran the checks and probes below.
Read-only: no product code, test or agreement file was modified; no `wf new`/`serve`/hook/global
configuration; nothing pushed.

**What I ran (focused, not the full suite — 82 files exist; I ran 7 through the runner):**

| ran | result |
|---|---|
| `env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts src/gates/deliver-recovery.selfcheck.ts` (the brief's command) | PASS — 701.1 s, tsc + eslint green |
| same runner over `state`, `corrections`, `correction-fences`, `next`, `step`, `delivered-round` selfchecks | PASS — 8 green in 175.8 s, tsc + eslint included |
| `npx tsc --noEmit --noUnusedLocals` (not part of the runner) | 10 hits, all pre-existing; the import round 1 flagged (`followupRoundLine`) is gone and this change adds no new one. `lastField` (deliver.ts:26) was unused at base too — mentioned, not charged to this commit |
| six throwaway probes in `%TEMP%` (fixtures under `%TEMP%\a190-probe-*`, drivers `%TEMP%\a190-r2\probe*.ts`) driving `publishedDeliveryVerdict`, `reconcilePublishedDelivery` and the real CLI `deliver`/`next` over temporary repos with a local bare origin and wf's own `gh` seam plugged | results quoted in R1/R2 and below |

Not verified by me: any real GitHub PR, the other 75 selfcheck files, or a real kill between the push and
the handoff write. Full suite not run.

### Round 1's findings, re-judged

| # | round-1 finding | status | why |
|---|---|---|---|
| B1 | a pushed repair whose handoff write never landed was refused forever | **answered** | `publishedDeliveryVerdict` now takes `headNow` and accepts `handoff.head` or the round's own HEAD (deliver.ts:301-310); `superseded` adopts `pr_handoff` at the head the PR carries (deliver.ts:661-668). Probe: handoff at H0, PR open at H1 = HEAD, pending correction → reconcile `{kind:'open'}`, handoff adopted at H1, `pr_repair` at H1, `step: build`; through the real CLI `wf deliver` prints `published PR is OPEN at the expected head; corrections retained…` and exits 0 instead of refusing. Converges. Its *evidence* is not what the response claims — see R1 |
| B2 | `pr_repair` has no age; a later instruction rides an earlier OPEN observation | **answered-but-different** | unchanged by choice; the builder's reading of the agreement is honest and I think the better reading — but it is a cadence judgement and T1's to rule on, below |
| B3 | the "failed refresh must not leave an earlier OPEN answer" property was untested | **answered** | a real scenario now starts from a written observation and asserts `pr_repair` is gone and `wf next` no longer offers build (new block in `deliver-recovery.selfcheck.ts`); independently confirmed by probe (gh failed → `refused`, `pr_repair` null). The *related, low* half — the clearing write refusing because state changed concurrently leaves the old observation standing (deliver.ts:625-631) — is unchanged and still untested; not claimed fixed |
| B4 | the "routes to ordinary build" assertion passed with the fence either way | **answered** | it now asserts the round's `build_reason` names the newly captured id, and only the routing branch writes that. That proves routing |
| D1 | the `step.ts` fence duplicates `deliveredCommandGap` | **not answered** | kept with a comment whose justification does not hold — see R3 |
| D2 | the seam is exported as independently callable but does not take the lock | **answered** | doc comment added (deliver.ts:614-617), and it matches what the code does |
| S1 | unused `followupRoundLine` import | **answered** | removed; `tsc --noUnusedLocals` confirms no new dead import |
| S2 | no `state.selfcheck` case for the new parser branch | **answered** | one well-formed read-back and three corrupt cases (bad url, short head, missing head) added; the `state` selfcheck is green |
| S3 | broken layout at `deliver.ts:645` | **answered** | reformatted in the same diff |
| S4 | the two pure fences have no unit cases in `corrections.selfcheck.ts` | **not answered** | `corrections.selfcheck.ts` is untouched by either commit; the fences are still exercised only through the CLI/e2e scenarios |

Observations I1/I2 from round 1 (disposition fenced too; merge recovery precedes the question gate) are
unchanged by the repair and stand as they were.

### Intent

The repair does what round 1 asked and nothing else: `publishedDeliveryVerdict` gains one input and one
outcome, `reconcilePublishedDelivery` gains one write, `step.ts` gains a comment, the rest is tests. No
new command, no second engine, no scheduler, no approval bypass, no `env/`, hook or project change.

Two intent notes, one needing T1, neither urgent:

- **The agreement's MERGED sentence, read literally, is now exceeded — and I think rightly.**
  `AGREEMENT.md` says "Recovery uses the published head, not a later local HEAD as a substitute
  identity." `reconcilePublishedDelivery` now passes `verdict.head` to `finishDelivery`
  (deliver.ts:651-656), so a merge the remote *proves* landed at this round's later HEAD records the
  receipt at that head (probe: handoff `2dcaabfb`, remote MERGED at HEAD `b65ea41d` → `delivery.head`
  `b65ea41d`, `step: merged`, note written). The head is the remote's, not a substitute, and base wf did
  the same: `deliveryResume` finishes a MERGED PR only when its head equals HEAD. Recording the
  published head there would be a false receipt. So the intent (never infer delivery identity locally)
  holds and the sentence's wording is what changed meaning. **T1 should say whether that is what the
  approved wording meant**; if not, the sentence needs revising rather than the code.
- Adoption is not a new trust that "this round produced" a commit — see Behavior.

### Behavior and evidence

The four attacks the round asked for:

- **A third party's commit cannot pass as this round's HEAD.** Passing requires
  `lookup.headRefOid === headNow`, i.e. the PR's head *is* the commit this worktree has checked out; a
  head that is neither the published one nor HEAD is refused with both heads named (deliver.ts:306-307).
  Probe: handoff H0, local HEAD H1, PR open at `f…f` → `{"kind":"refused","why":"…is at ffff…, which is
  neither the published head 058a25… nor this round's HEAD 6866f4…"}`. `prLookup` still restricts state
  to OPEN/MERGED/CLOSED before the verdict, so the `superseded` arm can only ever be an OPEN row.
- **Force-push and local reset split cleanly.** Someone else force-pushing the branch while the local
  HEAD stands still: refused (the third-head case). The round's *own* worktree fetched or reset onto
  that commit: it passes — but then HEAD *is* that commit, and the publish path applies the same
  equality test (`fresh.headRefOid !== headNow` → refuse, deliver.ts:925) and records HEAD as the
  delivery identity anyway, so adoption grants nothing the ordinary publish does not. The predicate
  proves position, not ancestry: it does not require `handoff.head` to be an ancestor of the PR's head,
  so a rewritten history whose tip equals HEAD is accepted. I could not make that harmful — the receipt,
  `contentSha` and the approval gates bind to what the worktree holds — but it is the one property a
  stricter check *could* add. (R2 is the place where the approval is not re-asserted.)
- **Adopting the later head is safe when the merge already happened, and when it has not.** If it
  happened, `merged` is decided *before* `superseded` and the delivery is finished at the merged head;
  adoption never touches a merged candidate (probe above, plus the pure rows `merged at this round's own
  later HEAD → merged`, `open at this round's own later HEAD → superseded`). If it has not happened,
  `superseded` only relaxes the *reconciliation*: `runLockedDelivery` then runs the ordinary path, where
  the question gate, the correction gates, `requireApprovedContent` at four boundaries, the fresh lookup
  at :907 and the HEAD equality check at :925 still apply, and the PR is edited rather than created
  (`resume` from `deliveryResume`). Probe: after adoption with a pending correction, `wf deliver` stops
  at `OPEN at the expected head; corrections retained` — no push, no merge, one PR.
- **The adoption write is under revalidation and orphans nothing.** The write is
  `writeState(toplevel, (current) => { revalidate(current); return adopted; })` (deliver.ts:664-668);
  `revalidate` compares the whole state bytes to the snapshot taken after the `pr_repair` clearing write,
  and the local subject (HEAD, branch, index tree, worktree, remote urls) to the values captured before
  the lookup, so a HEAD or instruction move during the lookup refuses instead of adopting. `delivery`
  cannot be orphaned: `reconcilePublishedDelivery` returns `none` when a receipt exists, so the adopt arm
  is unreachable with one, and `note` is not in the patch. `pr_handoff.contentSha` is recomputed at the
  adopted head (and is read by nothing — only `url`/`head` decide anything).

**R1 (Behavior/evidence — medium). The scenario that claims to prove the interrupted push never
interrupts anything, and the response describes evidence that did not happen.**

`REVIEW-RESPONSES.md` says the new test is "real CLI, `crash-edit` mode dies inside `gh pr edit` after the
push". It does not. The clone the scenario runs in has an empty remote (`clonePublished()` does
`setRemote(clone, empty())`), so `wf deliver`'s reconciliation answers `none` and refuses *before* the
push. Throwaway probe reproducing the scenario's staged state (handoff at the published head, a later
local commit, an empty remote, mode `crash-edit`):

```
A1 gh calls: ["pr list"]            <- no create, no edit, no push
A1 output:    wf deliver: published PR https://github.com/o/r/pull/108 was not found for this branch, so
              neither a merge nor an open candidate can be confirmed; retain candidate and instructions…
A1 handoff still the published head: true
A1 remote heads after the attempt: <dev only, no fix/108>
declared exit 2
```

So `interrupted.code !== 0` is satisfied by a "PR was not found" refusal that has nothing to do with an
interruption, and the `crash-edit` branch added in this same commit is dead code in the scenario named
after it. What the scenario *does* prove is real and worth keeping: the retry adopts the head the remote
carries and `wf next` stops offering reconciliation (a fabricated row via `setRemote`, which is a
legitimate controlled seam). The fix therefore has coverage; the *interruption* does not. Concretely the
scenario needs the clone's remote seeded with the existing OPEN row at the published head, so deliver
reaches the push, with `crash-edit` still exiting 137 from inside `gh pr edit`.

**R2 (Design/Behavior — low-medium). Adoption records a published handoff without the approval
comparison every other handoff write performs, so `wf next` can announce an unapproved PR as awaiting
merge.**

`finishDelivery`'s open path is reached only after `requireApprovedContent('the PR handoff')`; `adopted`
(deliver.ts:661-663) writes `pr_handoff` directly and compares nothing. Probe: round approved at H0, an
unapproved commit H1 pushed out of band, remote OPEN at H1 →

```
reconcile -> {"kind":"open"}    state pr_handoff.head = 95b6343f (H1), step: pr
wf next   -> wait user: PR https://github.com/o/r/pull/108 remains open for human merge; after it merges…
wf deliver-> wf deliver: the working tree changed after T2 approved it (REVIEW.md tree d2660c5a…, this
             tree d8b1c76b…) — the approval no longer covers it
```

`next` and `deliver` now disagree: the PR is declared ready for a human merge while the bytes were never
approved. If the person merges on that line, the next `wf deliver` takes the `merged` branch and
`finishDelivery` records the receipt with no approval check, so the round is recorded as delivered under
an approval that never covered it. Before this commit the same state was refused by the fence and `next`
said `deliver: reconcile…`; this is new.

Reachability is narrow — it needs an existing handoff plus a commit *pushed* after the approval — and any
head `wf deliver` itself pushed is necessarily approval-bound, because the push is guarded by
`requireApprovedContent('the push hook')` at :866. Which is also why closing this costs the repair
nothing: comparing the HEAD bytes at `verdict.head` (`headContentSha` against the review's `head-sha`)
before adopting would refuse the probe state and still converge for the interrupted push (that head
passed the same check when it was pushed). Suggested direction, not implemented, not mine to settle.

**Still stranded, and correctly so.** A PR at a head that is neither the published one nor this round's
HEAD is still a dead end inside wf (probe: identical refusal on retry, handoff unchanged; no wf command
moves it — only a reset, a force-push of the branch, a hand edit of `.wf/state.json`, or
`WF_FORCE_REAP=1 wf reap`). It is now *not reachable from wf's own flow*: after the push, deliver commits
nothing (the round-folder commit is before the push, :855), so an interrupted push leaves HEAD at the
pushed head — exactly what `superseded` accepts. Probe D reaches the third-head state only by committing
*again* after the push. The agreement requires a mismatched remote to refuse, so I do not charge this as
a defect; I note that the operator remedy is outside wf and could be named in the refusal text if T1
wants one.

### Design

The seam is still the smallest correct one. The new input is one local commit id, the new outcome one
variant, and the adoption goes through the existing `unmergedAttemptPatch` route rather than a second
state writer. Two notes:

- **R3 (Design — low). The `step.ts` fence is still redundant, and the comment added for it is wrong.**
  The comment (step.ts:144-145) says the rule is restated "because `wf next` and `completeDeliveryStep`
  reach `runStep` in-process, without passing the CLI's own guard". The premise is true and irrelevant:
  `runStep` calls `deliveredCommandGap(current, ['step', ...argv])` itself eleven lines later
  (step.ts:155), in the same `writeState` callback, with the identical `held` / `merged`+delivery
  exemptions — so the in-process callers do get the rule from the owner that already holds it, and the
  earlier fence changes no outcome. It is harmless today only because the two agree. Either delete it or
  correct the reason; a comment that records a false justification is worse than the duplication.
- The ordering the repair preserved is right: `merge_attempt` recovery before reconciliation,
  reconciliation before the new-publication gates, and the merged decision before adoption, so no path
  both finishes a merge and adopts a head.

### Standards

Compliant on what `AGENTS.md` fixes: erased-only TypeScript, `.ts` import specifiers, `src/gates|round/`
placement, no runtime dependency, no project or `env/` name in core, expected failures as values, no
network under the state lock (the new `git rev-parse` and `commitContentSha` are local; `seams.gh` is
still called with no state lock held), and one command module with its selfcheck beside it. The new
comments cite the issue and the review, as the style asks.

- **S4 stands**: the two pure fences in `corrections.ts` still have no unit cases in
  `corrections.selfcheck.ts`, so a future edit to `publishedRepairGap` is caught only by a 700-second
  file. The `state.selfcheck` precedent added in this commit shows the cheap shape.
- `deliver.ts:661`'s `adopted` ternary is a long line but consistent with the file; no style finding.

### Summary

The round-1 regression is genuinely fixed: the interrupted-push state converges, a third head is still
refused, the merged decision still wins over adoption, the adoption write is inside revalidation, and
nothing is orphaned. What is not clean: **R1** — the test that names the interrupted push satisfies its
assertion with an unrelated "PR was not found" refusal, so the crash path it claims is untested and the
response's account of it is inaccurate; **R2** — adoption writes the published handoff without the
approval comparison, and `wf next` then offers an unapproved PR for human merge; **R3** — the `step.ts`
fence is still redundant and now carries an incorrect justification; **S4** remains open.

Two things are T1's rather than mine, and I am not settling them:

1. **B2 (`pr_repair` age).** I read the builder's answer as honest. The agreement's OPEN clause says
   "OPEN is an observation, not a remote lease: a later human merge must be caught at subsequent
   reconciliation/publication boundaries" — that sentence only has work to do if repair may proceed
   between boundaries, and "cannot inherit an *unrelated* lookup's authority" most naturally means
   another candidate, round or subject, which `publishedRepairGap` already excludes by url+head. So I do
   not call the behaviour a defect. Whether an instruction that arrives *after* an observation should
   still pay for a fresh lookup is a cadence decision for the person who owns the fence, not a reading of
   the text I can settle. The builder's added mitigation ("cleared at the start of every reconciliation")
   is accurate but does not change the rule.
2. **The MERGED sentence** ("not a later local HEAD as a substitute identity") versus a receipt recorded
   at a later head the remote proved. I judge the code's reading right; T1 should confirm that is what the
   approved wording meant, or the wording should be revised.


---

## 2026-10-24 — round 3 (c2a52cb)
Verdict: findings
head: c2a52cb

A fresh reviewer for the repair `93531fa → c2a52cb`. I read the brief, both sections above,
`REVIEW-RESPONSES.md` (rounds 1 and 2), `AGREEMENT.md`, `AGREEMENT-REVIEW.md` (T1 approved
`sha256:d74a1e69…`), `TICKET.md` and root `AGENTS.md`, then `git diff 93531fa..c2a52cb` (4 files,
+73/−33) and `git diff 08f43f5..c2a52cb` (9 files, +477/−19). Read-only for product code, tests and the
agreement; throwaway probes only under the system temp folder; no `wf new`/`serve`/hook/global
configuration; nothing pushed.

| ran | result |
|---|---|
| `env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts` over `deliver-recovery`, `corrections`, `step`, `next`, `delivered-round`, `state`, `correction-fences` | PASS — 9 green including tsc and eslint, 787.7 s (focused, 7 of 82 files) |
| `npx tsc --noEmit --noUnusedLocals` (not part of the runner) | 13 hits: 12 pre-existing, one introduced here (`repairedHead`) |
| throwaway probes in `C:\tmp\a190-r3`: the *flow* (interrupt → new instruction → forced reconcile → repair commit → retry) run against this head and against `93531fa` extracted with `git archive`, then the reached state's own commands | differential quoted in R4 |

Not verified by me: any real GitHub PR, the other 75 selfcheck files, `wf new`/`serve`/hooks. Full suite
not run.

### Round 2's findings

| # | status | why |
|---|---|---|
| R1 | **answered** | The fixture seeds a real OPEN row at the published head, so the attempt reaches the push and dies inside `gh pr edit` (`crash-edit` → `process.exit(137)`, selfcheck:116). The check is a five-part conjunction — exit 137, the pushed commit present in `ls-remote`, the pushed head ≠ the published one, `pr_handoff` still naming the earlier head, no receipt — so a "PR was not found" refusal can no longer satisfy it, and the file is green in my run. The builder's correction of its own earlier claim (deliver commits the round folder before pushing, so the pushed commit is `HEAD`) is accurate. |
| R2 | **answered**, and the answer introduced R4 | The newer-head arm no longer writes `pr_handoff` (deliver.ts:658-668): it records the observation and returns `none`, so the publication path re-asserts the approval. The new case proves it — reconcile returns `none` with the handoff unchanged, and `wf deliver` on that state exits 2 on the approval with 0 PR edits. But dropping adoption entirely re-opens a state round 2's code handled; see R4. |
| D1 | **answered** | The `step.ts` fence and its wrong comment are gone and nothing lost the gate: `deliveredCommandGap(current, ['step', ...argv])` runs in the same updater at step.ts:151 with the identical `held` / `merged`+receipt exemptions; `completeDeliveryStep` is `runStep(['merged'])` with a receipt present (exempt by that rule); `wf next`'s in-process effect is `runStep` too (next.ts:389), and `nextAction` returns the reconcile line before it. |
| S4 | **answered** | Seven pure cases: no handoff, delivered, unobserved, observed-at-this-candidate, another head, another URL, and the gate with and without an instruction. They assert decisions rather than the functions' shape; the least meaningful is the fence case, which matches two regexes on the same string — the wording, twice. |
| B3 (low half) | **answered** | The clear is now unconditional (deliver.ts:626) and the reasoning holds: `writeState` applies `{ pr_repair: null }` as a patch to the state it reads under the lock, so a concurrent writer's other fields survive and the only possible loss is a concurrently written *observation*, which fails closed (one more lookup) and can never leave a stale answer standing. Two reconciles cannot race anyway — both hold the delivery lock. |
| B2, MERGED wording | **declined / for T1 — honest** | Both are restated with the agreement sentence quoted, neither is settled in code, and both read as questions for the person rather than silent decisions. I could not check the T2 question itself (it is not written yet), so "surfaced to Shay" is on the record, not verified by me. |

### Intent

The repair does what round 2 asked and nothing else: one arm of `reconcilePublishedDelivery` changed, the
clear made unconditional, the `step.ts` fence deleted, the rest tests. No new command, state field,
export, dependency, `env/` or hook change. One intent note, not an objection: the new comment's premise
("the publication path … rewrites the handoff") holds only if the next delivery runs at the same head —
that premise is what R4 breaks.

### Behavior and evidence

**R4 (Behavior — medium; regression against `93531fa`). Removing the adoption re-creates a round-1-B1-class
dead end whenever the round commits again after the interrupted push, and `wf next` then names a command
that can never succeed.**

Measured, and the same flow run against `93531fa` for contrast (extracted with `git archive` into temp,
same probe and same fixture):

```
flow: publish H0 → push H1 (the interrupted push) → new instruction → the reconcile `wf next` forces
      (HEAD still H1) → repair commit H2 → deliver
93531fa: reconcile at H1 -> open, handoff ADOPTED at H1; reconcile at H2 -> open;  wf deliver -> exit 0
c2a52cb: reconcile at H1 -> open, handoff still H0, pr_repair H0; reconcile at H2 -> refused
         "PR is at H1, which is neither the published head H0 nor this round's HEAD H2"; wf deliver exit 2 twice
```

The state is reached by wf's own commands, in the order they force: after the crash `wf next` says
`deliver: reconcile…`; that reconcile runs while HEAD is still the pushed head, so it takes the
`superseded` arm, records the observation and returns `open` with the handoff untouched; the round then
repairs (a retained instruction is why it must), and the repair commit makes the PR's head a third head.
In the reached state (`handoff H0, PR at H1, HEAD H2, step pr`):

```
wf next    -> "deliver: T2 approved — run wf deliver (push, open PR, tracker note…)"
wf deliver -> exit 2: "… is at H1, which is neither the published head H0 nor this round's HEAD H2;
                retain candidate and instructions, fix the remote and retry wf deliver"  (identical on retry)
wf step build -> allowed;  wf correct -> retained, then "Run wf deliver"
```

The remedy the refusal prints ("fix the remote") is wrong — the remote is exactly right and the local
branch is behind it. The exits are all outside wf: a hand edit of `.wf/state.json`, a manual push of H2, a
destructive `git reset --hard` back to H1, or `WF_FORCE_REAP=1 wf reap`. The trigger is ordinary and
inside #190's own territory (a published round taking late instructions), and the event that opens it — an
instruction after the crash — is this change's own subject.

Closing R2 does not require removing the adoption. Round 2's reviewer already named the narrower shape:
adopt only a head the approval covers (`headContentSha` at `verdict.head` against REVIEW.md's `head-sha`),
which refuses R2's unapproved bytes and keeps this flow converging — a head `wf deliver` itself pushed is
necessarily approval-bound. Direction, not implemented, not mine to settle.

Evidence gap behind it: the new scenario cannot catch this, because the fake `gh` derives an OPEN PR's
head from the clone's own HEAD (`effectiveHead`, deliver-recovery.selfcheck.ts:79); a PR the branch has
outrun exists only in `stale-open` mode, which the interrupted-push scenario does not use. So the fixture
answers `superseded` for a retry that real GitHub would answer with the older pushed head.

**R5 (Behavior/evidence — low). The superseded arm records and reports the wrong head.** It writes
`pr_repair` at `candidate.head`, the published head (deliver.ts:660-664), although the PR is at
`verdict.head`, and `wf deliver` then prints "published PR is OPEN at the expected head" (deliver.ts:708).
Neither is true of that remote. Same root as R4; the fix there removes this too.

Everything else I attacked holds: `superseded` is one arm of an 11-row pure decision table; a third head
is still refused with both heads named; `merged` still decides before `superseded`; the unconditional
clear can only remove authority; and `waiting ? open : none` is behaviourally equivalent to the old `open`
for the `open` verdict (the early exit at deliver.ts:707 needs an outstanding instruction anyway), so the
only reachable difference is the `superseded` arm — R4.

### Design

The seam is unchanged and still the smallest one; nothing new is exported and no state field is added. The
`superseded` outcome now means "stale bookkeeping, converge on a later delivery at this head", and
`reconcilePublishedDelivery` returns `none` for a state that did have something to reconcile — that
wobble is what hides R4, because `none` reads as "nothing here" while the handoff is still stale. R4's
direction keeps the arm and narrows the condition; that also removes R5.

### Standards

Compliant on what `AGENTS.md` fixes: erased TypeScript, `.ts` specifiers, `src/gates|round/` placement, no
runtime dependency, no project or `env/` name in core, expected failures as values, no network under the
state lock (the new clear is a local write, and `seams.gh` is still called with no state lock held), and
comments that cite the issue and the review.

- **S5 (Standards — low).** `const repairedHead` (deliver-recovery.selfcheck.ts:406) is dead: the
  assertions now use `pushedHead`. Neither project gate catches it (`tsc --noUnusedLocals` does) — the
  same class as round 1's S1, reintroduced by this commit.
- The new `corrections.selfcheck.ts` cases are otherwise honest; S4's fence case is the one place they
  test prose rather than a decision.

### Summary

Round 2's R1, R2, D1, S4 and B3-low are answered on evidence I re-ran, and the builder corrected its own
earlier false claim accurately. Not clean: **R4**, a new regression — removing the adoption makes an
interrupted push followed by another local commit (a late instruction is the ordinary cause) an
unrecoverable state whose only instruction is `wf deliver`, which refuses it forever; **R5**, the same
arm's head bookkeeping and message; **S5**, a dead local. B2 and the MERGED wording remain the person's to
rule on, and leaving them there is honest.
