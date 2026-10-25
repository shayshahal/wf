# #191 — fresh independent assessment, round 1

Verdict: repair
head: a1fc5295130c18846f4464307dfcd6707edfb3fd
base: 0740a69
agreement-sha: sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033
assessed-at: 2026-10-24T16:11:43Z

**Result:** the principal OPEN-notification → human-merge → tracker-completion gap is closed, but this head is not ready for a clean handoff. Repair the exact-comment-identity hole and legacy unbound routing; update the affected regression fixture without removing its identity assertions. The older-consumer cleanup guarantee also needs an explicit scope/rollout ruling, not an unqualified claim that version 6 fences every old consumer.

I did not implement this change. I read the full ASSESS-BRIEF, USER-REQUEST, TICKET and raw issue/comments, agreement and exact attributed T1 ruling; inspected `git diff 0740a69..HEAD` and current command/state/project owners. I read relevant #190 agreement, ruling, assessment/repair records and T2 summary, including its disclosed cadence/head decisions. The agreement hash above was independently recomputed with `agreementSha(process.cwd(), 'B', 'docs/reviews/191')`. Shay's recorded ruling approves that agreement's implementation, not publication or merge.

Read-only for production/tests. My only retained file is this report. Probes used disposable repositories and inert fetch/removal seams. No live tracker/GitHub calls, publication, hooks/global configuration, project setup/serve/database, or lifecycle cleanup of this worktree. Report is for the parent, not the person's Inbox.

## Intent / spec

| Requirement | Judgment |
|---|---|
| Separate notification and confirmed tracker completion | Implemented: `(posted)` remains notification; a per-section acknowledgement is independently bound to delivery URL/head/product and section hash. |
| Previously notified sections complete after confirmed merge | Implemented in the separate pending-completion loop; no clearing posted flags or blanket repost. |
| Read actual status before transition and after mutation; unknown is incomplete | Implemented. Already-desired status needs no transition. A lost response is recovered on retry, not treated as failure proof or success proof. |
| Partial success survives; next/reap retain remaining recovery work | Implemented for normal current-runtime paths; lifecycle and pure subset tests exercise it. Exact notification identity still has R1; old-runtime target cleanup has R4. |
| Preserve legacy notes and truthful actionable recovery | Legacy notes with a receipt work; missing/unbound delivery evidence remains incomplete, but routing regresses into an unproductive retry instruction (R2). |
| Preserve #148 selection, deduplication and identity guards | Selection logic is preserved. Changed-delivery/product/correction/question guards are checked before acknowledgement. Deduplication still mistakes other PRs for this one (R1). |
| Stay within scope | No second delivery engine, new tracker platform, scheduler, automatic merge, or #192/#193/#159 implementation. State version and documentation changes serve this task. |

The explicit T1 choice that an acknowledged round does **not** continuously monitor later external status changes is implemented and is not a finding. Likewise, this assessment does not reopen #190's approved OPEN-observation cadence or substitute local HEAD for a remotely established delivery.

## Behavior findings

### R1 — medium: another PR's comment suppresses this notification, yet the new completion receipt can authorize cleanup

**Locations:** `projects/jewelryx/post.ts:256–275,292–308`; related own-comment predicate `projects/jewelryx/ticket-changes.ts:38–41`. The new note/candidate equality check at `post.ts:248–249` does not protect the remote-comment identity check.

`already` still means `c.body.includes('/pull/' + pr)`. For delivery `https://github.com/o/r/pull/191`, either a comment for `/pull/1910` or a comment for `https://github.com/other/repo/pull/191` satisfies it. The command skips both the comment and selected uploads, marks this note posted, then acknowledges tracker completion. The comment does not identify this delivery.

**Measured:** a targeted probe called the actual exported `runPost` against two disposable git repos, each with a real HEAD/product-bound merged receipt, an unposted `X-1` note pointing to the correct `/o/r/pull/191`, and selected `after-1.png`. The controlled tracker returned one **old** comment (before the round baseline) for the unrelated URL, no attachments, and actual status `Fixed in Local`. No transition was needed. Results:

```json
{"prior":"https://github.com/o/r/pull/1910","exitCode":0,"newComments":0,"uploads":0,"posted":true,"completion":true,"gap":null}
{"prior":"https://github.com/other/repo/pull/191","exitCode":0,"newComments":0,"uploads":0,"posted":true,"completion":true,"gap":null}
```

The command printed `already posted, pictures not re-attached` and `confirmed Fixed in Local`. `trackerCompletionGap` returned null. Actual deletion was **not** attempted; `next`/`reap` accepting that completion is source inference from their routing/gate. This is an inherited predicate, **not a newly introduced substring regression**, but it is consequential to this task's complete notification/recovery contract and the brief's explicit exact-PR-URL acceptance. The new durable acknowledgement can bless notification evidence that was never published for this PR. The added wrong-PR lifecycle case changes the *local note*; it does not exercise wrong-PR comments.

**Within-scope repair:** compare complete canonical PR URL identity when recognizing a previous notification, and keep the own-comment exemption consistent. Preserve retry deduplication for this exact PR and exact selected uploads. Add remote-comment cases for the same-number-prefix and another repository, plus the genuine comment-success crash/retry case. Do not solve this by reposting all legacy sections.

### R2 — medium: pending-completion routing hides the established unbound-evidence recovery guidance

**Locations:** `src/round/next.ts:128–130`, `projects/jewelryx/post-completion.ts:33`, `projects/jewelryx/post.ts:283–284`; existing delivery refusal `src/gates/deliver.ts:724–728`.

For a legacy merged round with a posted note but no receipt/bound historical evidence, `mergedGap.kind === 'unbound'` used to produce the recovery/intentional-discard explanation. The new completion route runs before that explanation and says to run post/deliver instead. Post says the receipt is missing and to run deliver. With neither a retained handoff nor merge attempt/receipt, deliver reaches its existing `already merged` refusal; it does not reconstruct the missing authority. Next repeats the same instruction.

**Measured pure probe:** `nextAction` on a merged snapshot with `id: X-1`, posted note with the correct PR URL, no delivery and an explicit unbound gap returned:

```text
post: tracker completion pending: run wf deliver to reconcile the confirmed delivery first. Then `node "C:/wf/wf.mjs" next`
```

It omitted the supplied restore-original-evidence/explicit-discard explanation. The command loop's inability to create authority is **source inspection**, not a live deliver invocation (which can stop servers and was deliberately not run). The existing real-CLI regression at `delivered-round.selfcheck.ts:87–94` asserts this exact legacy recovery guidance; the owner's final focused run has reported that file red (details of the run are below).

**Within-scope repair:** preserve the unbound recovery guidance once notification is complete, without permitting cleanup or inventing a delivery receipt. Continue to reconcile real recoverable handoffs/attempts through the existing delivery owner. Add/retain a routing test distinguishing incomplete tracker work with a usable receipt from missing historical authority. No legacy receipt fabrication and no second delivery engine are needed.

### R4 — high compatibility risk / scope ruling: version 6 does not fence an older runtime reaping a target from a surviving checkout

**Locations:** the new guarantee comments/writes at `projects/jewelryx/post.ts:245–247` and `src/round/state.ts:131–132,470–473`; target reading at `src/worktrees/reap.ts:200`. In base `0740a69`, `src/run.ts` applies `legacyStateGap` to the **caller's** checkout, while `src/worktrees/reap.ts:200` reads the **target** without applying that version gate. The old reader accepts unknown fields such as `post_completion`.

**Measured non-destructively:** archived the actual base runtime with `git archive 0740a69 src projects wf.mjs` into system temp. Created a disposable main checkout (no round state) and git worktree `fix/191` with valid version-6 merged state, a valid delivery/product binding, a posted note, and **no tracker completion acknowledgement**. Called the old actual dispatcher from the surviving main checkout with `WF_FORCE_REAP=0` and an inert `removalPlan` seam that immediately throws a sentinel, before copying paperwork, lifecycle effects, or deletion:

```text
OLD_TARGET_VERSION_GATE: this round's state names wf version 6, not 5 — finish it on that wf, then start a new round
REVIEW_SENTINEL_REMOVAL_PLAN_REACHED
```

The target remained present. This establishes that the old version predicate *would* reject the target, but old normal reap does not invoke it. Actual destructive cleanup is **NOT MEASURED**. Source inspection shows it would proceed under merged state, without the new tracker gate. The first two attempts to prepare this probe failed before invoking product code: Node's buffered archive exceeded its default buffer (`ENOBUFS`), then GNU tar treated an absolute Windows `C:` archive path as remote. Writing the archive directly to disk and extracting with relative paths resolved those harness errors; they are not product failures.

This is **not a new old-runtime regression**, and the current-runtime pending gate works. It is a limit of the compatibility claim that an older runtime cannot consume the notification as permission to reap. Merely adding the new version number cannot retrofit validation into a shipped old target consumer.

**Required disposition, not implemented:** distinguish supported current-runtime safety from older-copy safety in the handoff. Adding target-version validation to the current reap owner is a small forward-safety improvement, but does not repair already shipped old copies. If protection from those copies is part of the promised contract, the parent must take an explicit rollout/compatibility decision back to the person rather than claim the fence is complete, silently weaken the guarantee, or expand this task into a reap/migration redesign. No destructive old-runtime experiment is needed.

## Evidence finding and acceptance audit

### R3 — medium: affected legacy regression fixture still assumes notification alone permits reap

**Locations:** `src/round/delivered-round.selfcheck.ts:37–44,87–94`.

The first two assertions expect `done:` after only writing `(posted)`, without any post-completion acknowledgement or even a delivery URL in the note. Those expectations are intentionally invalid under #191. They should be updated to establish genuine bound completion before testing paperwork-only commits and post-delivery questions, **not** removed and not made to accept any `post:` output. Separately, the final unbound assertion protects real recovery behavior and exposes R2; do not dismiss that one as an obsolete completion expectation.

**Measured owner evidence:** as of the timestamp above, `evidence/focused-final.log` reports `FAIL src/round/delivered-round.selfcheck.ts (75.0s)`. The runner buffers detailed failure output until all children finish. I have not guessed that output or run the file a second time. The classifications of these particular assertions above are from actual source inspection.

### What the available evidence proves

| Evidence | Observed result and limit |
|---|---|
| Baseline focused log | Four selected files, tsc/eslint green at base; not final-head evidence. |
| Original continuous repro, twice red | Real dispatcher/local bare origin/controlled tracker and GitHub; next offers reap and repeated post never completes status. I inspected the retained logs, did not rerun them. |
| `repro-after-second.log` | Original repro green on an intermediate implementation. Helpful mechanism evidence, not a substitute for final-head coverage. |
| Initial failed focused/lifecycle logs | Import-cycle/fixture/expectation failures retained and explained in PROGRESS. I checked the referenced source/fixtures; a later green is not being used to erase them. |
| Receipt-focused log | Current/legacy parsing, invalid-authority preservation and generated acknowledgement subsets pass; focused evidence. |
| Owner's **ongoing** final focused run, snapshot above | 13 selected files of 85 plus tsc/eslint. Passed: tsc, eslint, deliver, both completion files, boundary, state, reap, skill-export, correction-fences, next, post, and **post-lifecycle (425.2s)**. Delivered-round reported red. Delivery-recovery had not reported completion and no aggregate footer existed. This is not a completed or green final run. |
| My targeted probes | Wrong-comment notification suppression; pure unbound routing; inert old-runtime target-reap gate bypass, as quoted above. Not full checks or live integrations. |
| `git diff --check 0740a69..HEAD` | Reports one extra blank line at EOF in `projects/jewelryx/post-completion.ts:39`; cosmetic only. |

I inspected all new lifecycle assertions and their controlled implementations. The **final-head lifecycle file now has measured PASS in the owner's log**, covering: one continuous two-ticket publish/OPEN-notify/same-PR merge/reconcile/complete flow; no early transition; exact selected versus superseded attachment; comment-success process-exit before marking and retry; transition-success process-exit/lost response/unknown readback and retry; repeated post/deliver; already-delivered with no transition; malformed/unknown/unavailable status; missing transition; successful request not applied; legacy posted sections; partial completion; note/product/delivery/correction/question and after-transition races; no network under the state write lock; wrong local-note PR number prefix; and direct current-runtime reap refusal retaining note/proof before completion.

The process-exit cases use controlled `process.exit(137)`, not an OS kill or a real remote outage. Tests compare persisted state and controlled effect records, not live Jira/GitHub. Partial status-readback coverage is good; R1 concerns a different notification identity boundary. Pure receipt tests exercise malformed authority through the real state reader/writer, preserve rejected bytes, and generate all nonempty four-ticket acknowledgement subsets; project tests cover all subsets including empty, ordering, delivery identity, CRLF, and missing/duplicate note sections.

Full suite **NOT RUN**. I did not duplicate the costly focused run. Real Jira/GitHub integration, production publication/merge, real lifecycle setup/reap, and old-runtime destructive removal are **NOT MEASURED**. Those limits are intentional, not substitute evidence.

## Design

The basic ownership is appropriate and minimal:

- Core `post-completion.ts` owns neutral persisted authority and corruption checks; it reuses the existing delivery receipt contract rather than introducing another delivery mechanism.
- Project `post-completion.ts` owns note parsing/hash/identity/pending policy. Extracting it earns its place: post, next and reap need the same policy through the existing index boundary, and importing the effectful command into that index caused the recorded cycle. Deleting this owner would spread project policy into core or recreate the cycle.
- Project `post.ts` owns Jira translation and effect ordering. The existing delivery process lock serializes post/deliver; remote work is outside the state write lock. Acknowledgement rebuilds from current state inside the writer and revalidates state/note/product/corrections. Successful tickets persist before attempting the next ticket.
- R1 is inconsistent identity strength across those boundaries. R2 is a precedence mistake, not a reason for a larger state-machine redesign. R4 is a target-consumer/rollout limitation; a higher version is not itself enforcement.

No blocking abstraction/scope-creep finding. I did not find a reason to introduce a general service/adapter hierarchy or change #190 delivery policy.

## Standards

Read root AGENTS, package/tsconfig/eslint, process standards/review guidance, round independent-assessment guidance, and the applicable coding-standards references (errors; parsing; state; modules/adapters; persistence; workflow/idempotency; resources; testing; TypeScript; imports; comments; observability; lint policy). The repository specifies one assessment pass, not recursive per-rule reviewers; I completed this assessment directly.

The change follows the principal repo constraints: erasable TypeScript and `.ts` imports, no runtime dependencies, no `env/` import from kit/core, project entry boundary preserved, colocated selfchecks for new policy owners, and incident/reason comments. Both new receipt types/operations have documentation. The existing compiler configuration is strict but does not enable every optional safety flag in the external coding standard; it was not changed here, so this assessment does not demand a repository-wide configuration migration.

**S1 — low, non-blocking standards exception:** new expected status/transition/revalidation failures in `projects/jewelryx/post.ts:117–131,238–242,284–304` use ordinary thrown `Error` and promise rejection rather than explicit tagged error values (`coding-standards/references/errors.md`, “Expected failures are values”). They are contained at the owning command's catch (`:323`), so I found no escaping-error or false-success defect from this alone. This follows a legacy shell convention, but the changed behavior does not record an explicit exception rationale. Contain/justify this locally or use a small precise result contract; do not turn this repair into a generic error framework refactor. Existing delivery/string/hash types are reused; no new branded-ID migration is required to fix the observed behavior.

## Remaining objections / parent handoff

- R1 and R2 are addressable within the approved agreement; R3 requires honest final-head regression evidence, not weakened assertions.
- R4 needs explicit disposition of the older-copy guarantee. If the remedy changes the supported compatibility/cleanup contract or requires rollout work beyond this agreement, obtain the person's ruling. Do not silently implement a broader reap redesign.
- Preserve this first-round report. Builder responses and new evidence belong in separate progress/response records. Any repair requires a fresh assessment tied to its product/test head; at most two autonomous repair rounds were approved.
- Finish/diagnose the owner's ongoing focused run before citing its aggregate result. A completed green later would not answer R1/R2/R4 on its own.
- Final human T2 still authorizes publication only. Nothing in this report authorizes publication, merge, production tracker changes, or cleanup of this development worktree.
