# #191 — fresh independent assessment, round 2 (repair verification)

verdict: clean
head: 19de3951ee0113900beb2779906b2c4794c85fba
product/test head: 6f42099 (the only later source delta is a comment in `src/round/state.ts`; the rest is docs, evidence and the skill's `done:` row)
base: 0740a69
agreement-sha: sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033
assessed-at: 2026-10-24T17:15:54Z

**Result:** the round-1 findings R1, R2, R3 and S1 are repaired and independently re-measured; R4 is covered by Shay's recorded ruling and the code/documents state its limit without an unqualified fence claim. I found no remaining product, test, design or standards defect. One low, non-blocking evidence-record objection (E1) is recorded below: the builder's contention explanation reaches a defensible conclusion but overstates two details in `PROGRESS.md`. That objection does not change the measured behavior or the coverage claim, and it is not a condition of this verdict.

I did not build this change. I read this worktree's AGENTS.md, the round/review guidance, USER-REQUEST, TICKET, AGREEMENT, AGREEMENT-REVIEW, ASSESSMENT, REVIEW-RESPONSES, PROGRESS and the evidence logs; inspected `git diff 0740a69..HEAD` and the current owners. I independently recomputed the agreement hash with `agreementSha(process.cwd(), 'B', 'docs/reviews/191')` and got `e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033`, matching both records in AGREEMENT-REVIEW.md. The T1 approval and the R4 ruling are the exact attributed replies as recorded there (Inbox `msg_01M5Q946DN1TX3PERKD57VN8KC` and `msg_01M5QB505GS0HQ7D8YB3RHT8G7`); I did not treat either as publication approval. Read-only for product/tests; my only retained file is this report. My probes used disposable repositories and controlled fetch seams; no live Jira/GitHub, publication, merge, project setup/serve/database, hook/global configuration, or cleanup of this worktree.

## Intent / spec

| Requirement | Judgment |
|---|---|
| Keep OPEN notification truthful; never delivered while OPEN | Satisfied: `projects/jewelryx/post.ts:254-282` posts/attaches only; completion is a separate loop at `:283-315`, entered only with a merged delivery. |
| Reconcile previously notified sections after confirmed merge | Satisfied: `pendingCompletion` (`projects/jewelryx/post-completion.ts:26`) selects both unposted and acknowledged-missing sections, not just `!posted`. |
| `next` must not treat `(posted)` as completion or offer reap early | Satisfied: `src/round/next.ts:127-133`; my pure probe produced three distinct recovery routes and `done:` only with a matching receipt. |
| Read actual status; recognize already-delivered; unknown stays incomplete | Satisfied: `post.ts:117-121,294-315` reads status, skips a transition when already `Fixed in Local`, reads back after a transition, and throws on unknown/malformed readback. My probe measured crash-before-ack, lost response, unknown status, unknown readback and transition race. |
| Preserve `(posted)` compatibility, #148 selection, dedup, delivery/approval/correction fences | Satisfied: `sectionsOf`/`selectedPictures` are unchanged; comment dedup now uses the exact URL predicate; `validate()` (`post.ts:239-246`) rechecks state/note, product gap, merge attempt, corrections, held state and questions before each effect/acknowledgement. |
| Project owns tracker names/transitions; core owns neutral routing | Satisfied: `trackerCompletionGap` lives in `projects/jewelryx/post-completion.ts:29-40` and reaches core only through `projects/jewelryx/index.ts:22` → `src/project.ts`; core `next.ts:131` and `reap.ts:207` consume it without naming Jira statuses. |
| Minimal durable state; idempotent retries; no second engine/job scheduler | Satisfied: one bound `post_completion` receipt (`src/round/post-completion.ts`), written only after readback; no new engine, no blanket repost, no automatic merge. |
| Stay in scope | Satisfied: no #192/#193/#159 work, no destructive old-runtime experiment, no migration/interlock; the only post-6f42099 source delta is the R4 comment. |

## Findings disposition

### R1 (medium) — exact remote notification identity: repaired and measured

**Locations:** `projects/jewelryx/post-completion.ts:22,24` (`prUrlOf`/`hasPrUrl`), `projects/jewelryx/ticket-changes.ts:32-37` (`isOwnPost`), `projects/jewelryx/post.ts:159` (change exemption), `:262` (duplicate suppression), `:253,296` (candidate/delivery URL gate).

`isOwnPost` now requires the section's first line plus an exact complete GitHub PR URL; `already` uses that predicate, so a number-only `/pull/191` substring no longer qualifies. I called the real `runPost` against disposable git repositories with a valid merged receipt, a posted/unposted note and a controlled tracker. Each prior comment below was created before the round baseline, returned by the real issue GET, and had the section's first line as its first line where indicated:

```text
prefix-1910      prior https://github.com/o/r/pull/1910          {"code":0,"comments":2,"attachments":1,"transitions":1,"completed":"X-1","posted":true}
other-repository prior https://github.com/other/repo/pull/191    {"code":0,"comments":2,"attachments":1,"transitions":1,"completed":"X-1","posted":true}
human-quote      prior "Human question about this PR: <exact 191>" {"code":0,"comments":2,"attachments":1,"transitions":1,"completed":"X-1","posted":true}
```

In every case the command posted the actual comment (comments 2 = prior + new), uploaded the selected `191-after-1.png`, marked the note, transitioned the ticket and wrote the completion receipt. A genuine own post (first line + exact URL, with the attachment already present) produced `comments:1, attachments:1, transitions:1, completed:X-1` — no duplicate. The comment-success crash case exited `137` with `comments:1, attachments:1, transitions:0, completed:null, posted:false`; the retry produced `comments:1, attachments:1, transitions:1, completed:X-1, posted:true`. The three R1 cases are therefore closed against the current head, not merely the builder's fixture.

Residual edge, not a finding: `isOwnPost` derives the URL from the section's first URL (`prUrlOf(sectionText)`), and `prNumberOf` names attachments from the first `/pull/<n>` in the section. A note that mentions an unrelated PR before its own `PR:` line could still mis-name an attachment or make a human comment that copies the first line and that unrelated URL look like the round's own. The normal note has one PR URL, the candidate check requires the delivery URL somewhere in the section, and this is inherited #148 naming behavior; it is not the R1 number-prefix/foreign-repository hole and is not a new regression.

### R2 (medium) — legacy unbound routing: repaired and measured

**Location:** `src/round/next.ts:127-133` (ordering: unposted → recoverable candidate → merged gap → missing receipt → completion → done); `projects/jewelryx/post-completion.ts:29-40`.

My pure `nextAction` probe on a merged snapshot produced:

```text
usable receipt + unfinished status:
post: tracker completion pending for X-1; run wf post. Then `node "C:/wf/wf.mjs" next`

recoverable published candidate + unbound gap:
deliver: reconcile the retained published candidate before tracker completion — `node "C:/wf/wf.mjs" deliver`

missing/unbound historical authority:
wait user: the delivered round has no delivery receipt or bound T2 approval; restore its original bound evidence, or use WF_FORCE_REAP=1 only to intentionally discard the worktree and local branch

legacy posted note, no delivery and no merged gap:
wait user: confirmed delivery receipt missing; restore original delivery evidence before tracker completion, or use WF_FORCE_REAP=1 only to intentionally discard unfinished work
```

The three post-merge recovery routes are distinct, actionable and none starts with `done:`. `done:` appears only for the matching receipt/section hash. This closes the round-1 R2 measurement (which had returned the delivery/post loop message and omitted the restore/discard guidance). The actual-CLI legacy assertion at `src/round/delivered-round.selfcheck.ts:101-102` is retained and passes.

I also ran the real current-runtime `wf reap fix/191` in a disposable repository whose state had a valid merged delivery, a posted note identifying that PR, and no completion acknowledgement (`WF_FORCE_REAP` unset). It exited 2 and printed: `wf reap: tracker completion pending for X-1; run wf post; nothing removed. WF_FORCE_REAP=1 intentionally discards unfinished tracker work`; the note and proof were still present. The gate is at `src/worktrees/reap.ts:207-212`.

### R3 (medium) — delivered-round fixture completion and coverage: repaired and measured

**Locations:** `src/round/delivered-round.selfcheck.ts:37-45` and `:46-48`; legacy assertion `:101-102`.

The fixture now writes a note that identifies the receipt's exact PR (`PR: https://github.com/o/r/pull/1`) and runs the real dispatcher's `run(['post'])` with a controlled status readback returning `Fixed in Local`. It asserts `completed.status === 0 && readState(dir)?.post_completion?.delivery.head === head` before committing the paperwork-only change, then asserts `next` starts with `done:`. It does not accept arbitrary `post:` output; the completion receipt and the `done` route are the evidence. The identity assertions after that (reopening commands, changed/staged/untracked product, direct reap, forced discard, pre-receipt authority) are retained unchanged, including the legacy restore/discard assertion. I ran the file at this head: `PASS src/round/delivered-round.selfcheck.ts (49.3s)` in a 6-check selection (tsc/eslint/next/project post-completion/ticket-changes all green, 49.3 s).

### R4 (high compatibility risk) — older-copy cleanup: ruled; current wording is honest

**Ruling:** AGREEMENT-REVIEW.md records Inbox `msg_01M5QB505GS0HQ7D8YB3RHT8G7`, question `q-9de1a887`, answer as written: "Updated-runtime guarantee; require using it for cleanup (your recommendation)". The scoped interpretation is exactly what the task states: cleanup safety on the runtime that wrote state 6, cleanup required to use it, older-copy limit documented, no migration/interlock/reap redesign.

**Current wording:** `src/round/state.ts:131-135` says version 6 "separates notification from post-merge completion", that caller-bound commands of an older wf refuse it via `legacyStateGap`, but "a shipped older reap that reads *another* checkout's target does not consult that target version (#191 R4, measured non-destructively): cleanup therefore requires the wf that wrote 6, as the guarantee Shay ruled for rather than an unqualified old-copy fence." `skills/round/SKILL.md:65` says: "Clean up with the wf that wrote this round's state: an older copy does not check a target round's version when it reaps from another checkout, so it can delete unfinished tracker work."

Both statements are accurate. They state what the version actually fences (caller-bound commands) and what it does not (a shipped old reap reading another checkout's target), and they replace the earlier too-strong comment. I found no current code or document that claims the old-copy path is fenced. The historical sentence in PROGRESS's implementation section ("old runtimes must not silently consume the new completion contract") is a policy statement, and the later R4 section explicitly corrects the limit; I do not treat it as a live overclaim. One omission, not an overclaim: the SKILL row names the destructive reap but does not say that an older copy's caller-bound commands also refuse version 6, which in practice strands the round on the updated runtime; `state.ts:131-135` states that, so the two records together are complete. The ruling is recorded verbatim with its scope, and no stronger guarantee is claimed.

### S1 (low) — contained legacy error convention: addressed

**Locations:** `projects/jewelryx/post.ts:192-194` (rationale), `:117-121` (`trackerStatus` throws), `:123-129` (`deliveredTransition` returns `null`), `:294-315` (completion failures throw), contained by `:326-327`.

The rationale says the legacy `jira`/`ticketRefusal` rejection convention stays local to the project command shell, `runPost` translates it to an explicit incomplete CLI outcome, and pure completion policy never throws. That is a scoped, documented exception rather than a silent relaxation. The pure project policy (`sectionsOf`, `sameDelivery`, `sectionSha`, `prUrlOf`, `hasPrUrl`, `pendingCompletion`, `trackerCompletionGap`) returns values and does not throw for valid inputs; the core `postCompletionGap` returns a string/null. Non-blocking, resolved as a standards response.

## Evidence audit and E1

The aggregate focused log is honest about its own shape: `evidence/focused-repaired-final.log:1` says "focused (14 of 85 files); full suite not run"; lines 2-15 are 14 PASS (12 test files plus tsc and eslint); lines 16-17 are the two reds; line 39 is "2 of 16 selfchecks red ... 764.0s". The isolated reruns at the same product/test head are `evidence/lifecycle-repaired-alone.log` (PASS 508.2 s, includes tsc/eslint) and `evidence/deliver-recovery-repaired-alone.log` (PASS 557.6 s). The builder states there is no single all-green aggregate; that is true, and the coverage claim is therefore "each selected file has a green measurement at 6f42099, two of them only in isolated reruns", not "one green aggregate". Full suite NOT RUN is disclosed. That is an honest coverage claim.

**E1 — low, non-blocking evidence-record objection.** The contention explanation is defensible in conclusion but overstates two details in `PROGRESS.md`:

- It says "both reds produced *empty* child output". The log's post-lifecycle red is a named assertion, `FAIL race-after-transition: stale lookup cannot mutate status or acknowledge another subject` (`focused-repaired-final.log:19-20`), not empty output; only that check's *detail* (the controlled post child's stdout/stderr) is empty. The deliver-recovery red contains a real stack trace ending in `Error: git config core.autocrlf false in C:\...\stale-open\work:` (`:29-36`), not empty output. The statement is accurate only for the post-lifecycle child's captured output.
- It says "Neither file's failing path involves the week's code delta: lifecycle's `race-after-transition` clone has both sections already posted, so `todo` is empty and the changed own-comment predicate is never evaluated." The whole `post-lifecycle.selfcheck.ts` is new #191 coverage, and `race-after-transition` exercises the new completion/validation path. The empty detail is consistent with the controlled post child not running (a `spawnSync` failure yields null status and no child output; the check's `transitions === '1,0'` then sees `0,0` and fails), but the record should say that, not that the path is unrelated to the change.

The conclusion — environmental spawn contention rather than a product assertion — is plausible for both reds: deliver-recovery fails in fixture setup at `git config` with empty stderr, post-lifecycle's failing check has no child detail and its state is untouched, and both files pass alone at the same head. I did not instrument the failed spawns, so the cause remains inferred. A later green alone does not explain an intermittent failure (this repo's AGENTS); the record should preserve it as an unexplained intermittent red with the isolated green, rather than present the contention diagnosis as measured. This is a documentation correction, not a product/test defect, and it does not change the coverage claim or this verdict.

I did not rerun the 508 s/557 s lifecycle and deliver-recovery files; I inspected their source and the retained logs. The isolated logs do not embed HEAD; the files have not changed since 6f42099, and the logs were committed after that head. My own focused runs at this head were:

```text
PASS projects/jewelryx/post-completion.selfcheck.ts, ticket-changes, next (38.6s), delivered-round (49.3s), tsc, eslint — 6 green, 49.3s
PASS boundary, state, reap, skill-export, post.selfcheck (52.6s), tsc, eslint — 7 green, 52.6s
```

The R4 documentation delta (`state.ts` comment, `SKILL.md`) is covered by the boundary/state/skill-export/tsc/eslint run, which is green.

## Design and standards

The design remains appropriately small. Core `src/round/post-completion.ts` owns only the persisted neutral receipt and its corruption check; project `projects/jewelryx/post-completion.ts` owns note meaning and pure pending policy; `post.ts` owns Jira status/transition translation and effect ordering under the existing delivery process lock; `next.ts`/`reap.ts` consume the neutral gap through the existing project export. Remote lookups are outside the state write lock, and the acknowledgement is rebuilt and revalidated inside the state writer (`post.ts:309-313`). The new `post_completion` type is documented, the state reader rejects malformed authority without overwriting it, and the state version comment states the real fence. Erasable TypeScript, `.ts` imports, no runtime dependencies, the project boundary and the colocated selfcheck convention are respected. The only standards exception is the documented S1 legacy shell convention above. `git diff --check 0740a69..HEAD` reports trailing whitespace only inside captured evidence logs, no product or test file.

## What is NOT measured / remaining objections

- No live Jira or GitHub call, no production tracker/PR mutation. All tracker behavior here is a controlled `fetch` seam; the git fixtures are local disposable repositories.
- No project setup/serve/database lifecycle (not applicable to wf), no destructive cleanup of this worktree, no old-runtime destructive reap. R4's old-copy limit is taken from the round-1 non-destructive measurement, the recorded ruling and current source; I did not repeat that experiment.
- Full suite NOT RUN. There is no single all-green aggregate for the 14-file selection; two files are green only in isolated reruns at 6f42099, and their reds' cause remains inferred (E1).
- The lifecycle and deliver-recovery full files were not independently rerun by me; my compact probes cover the R1, R2, completion/crash/unknown/race/reap paths, not every multi-ticket/race case in those files. The builder's isolated green logs and source are the evidence for the remaining cases.
- The old runtime's target-reap behavior is documented, not fenced. A stronger older-copy guarantee, migration or reap interlock would be separate authorized work; the ruling did not authorize it.
- E1: correct the two overstatements in PROGRESS before T2 if the record is shown as the contention account. This is a low documentation correction, not a reason for another product/test repair round.

## Verdict

**clean** on head `19de3951ee0113900beb2779906b2c4794c85fba` (product/test `6f42099`) against agreement `sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033`. The round-1 behavior findings are repaired and measured, the fixture/legacy coverage is honest, and the R4 limit is stated within the ruling. E1 is a low evidence-record wording correction, recorded so T2 does not read the contention diagnosis as measured. Nothing in this report authorizes publication, merge, production tracker changes or cleanup of this development worktree; final human T2 authorizes publication only, and merge remains Shay's.
