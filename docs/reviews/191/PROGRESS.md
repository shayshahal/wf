# #191 progress and resume point

## Workspace / exact runtime limitation

T3-bound isolated wf development worktree: `C:/Users/Shay/.t3/worktrees/wf/fix-191-post-merge-tracker-completion`, base/unchanged product head `0740a69`. No product implementation yet.

`src/project.ts` statically exports `../projects/jewelryx/index.ts`: that project names JewelryX repository, `dev`, product round folders, setup commands, servers and database. Installed `wf notes`/`wf new` therefore cannot represent development OF wf without unrelated project selection/lifecycle work. As explicitly directed by Shay, did not execute installed notes/new or setup/serve/db, change selection/hooks, or manufacture a `.wf` round in this checkout. Local intake/T1/evidence/assessment/T2 records preserve the same guarantees as #190. No approval guard bypass. Unrelated main-checkout untracked humanlayer document untouched.

## Intake and prerequisites

- Read this checkout's AGENTS.md; round/start/review, design-session, show-me, Plannotator, diagnosing-bugs, coding-standards and write-discoverable-code guidance; relevant standards references and process formats. No CONTEXT.md/ADRs found at root.
- GitHub issue fetched with `gh issue view 191 --repo shayshahal/wf --json title,body,comments,author,url,updatedAt`; full raw `evidence/issue.json`. Independent paginated comments REST fetch: `evidence/comments.json`, `[]`. No attachments present in body/comments. Complete body in TICKET.md; exact thread instructions and relayed authorizing exchange in USER-REQUEST.md.
- Read #190 agreement/ruling/progress/T2 summary and current receipt/candidate reconciliation, identity, correction and cleanup owners. Retain state version 5 semantics; no second delivery engine.
- Node v26.10.0, git, gh present. No configured setup script or runtime npm deps. Ran local `npm ci` solely for dev checks: 83 packages, zero audit vulnerabilities, no package file changes (`evidence/npm-ci.log`).

## Repro and diagnostic evidence

`node docs/reviews/191/repro.ts` uses the existing delivery-recovery fixture prefix adapted into a local repro (builder `build-repro.py` retained). Real dispatcher executes deliver/post/next against a disposable git repository and local bare origin; persistent controlled GitHub and fetch tracker responses span all commands. No live remote mutation. Fixture processes strip GIT/T3/PI session context as in established isolation patterns; no production workspace check disabled.

- Initial generator failed on Python's Windows cp1255 default, before a product command ran; retained harness-only failure `evidence/harness-encoding-failure.log`. Generator now explicitly uses UTF-8.
- `evidence/repro-before.log`: exit 1. One publish OPEN, one comment, zero early transitions; controlled human merge of the SAME PR/head; actual delivery reconciliation records confirmed receipt; actual next offers reap; repeated actual post leaves tracker In Progress. Exactly two symptom assertions red; deduplication remains green.
- Repeated without product changes: `evidence/repro-before-repeat.log`, same two failures. Disposable repositories removed in finally, no destruction test attempted against live work.

Hypotheses announced after measurement:
1. Posted filtering removes ticket from status work. Source confirmed in post.ts todo loop.
2. Routing conflates notification with all completion. Source confirmed in next.ts merged branch.
3. Transition-only retry cannot recognize already-delivered state. Source confirms lack of status read, but runtime crash/already-delivered case remains to measure during authorized implementation.

## Baseline focused verification

`env -u PI_SESSION_ID -u PI_SESSION_FILE node src/selfcheck.ts projects/jewelryx/post.selfcheck.ts src/round/next.selfcheck.ts src/round/state.selfcheck.ts src/round/delivered-round.selfcheck.ts`

`evidence/baseline-focused.log`: all four selected files + tsc + eslint PASS, 46.7 s. Focused 4/82, NOT complete suite. PI metadata isolation follows diagnosed #190 fixture behavior; no runner or production source change. This is baseline evidence only, never final-head evidence.

## Current authority and next executable action

Proposed Class B agreement in AGREEMENT.md. Existing `agreementSha` computes agreed material identity:
`sha256:e4fb68c948679f82b3a44e8ce293a4bbba0b2df9e8b060c2728aa4a79beb6033`.

Await actual T1 approval of the attached material; starting authorization is not T1. No production implementation authorized yet. May continue independent baseline/test-design inspection while waiting, not change production behavior. After T1: record exact attributed verdict against hash, implement scoped recovery, final-head focused verification and fresh independent assessment. Final human approval required before publication; merge remains Shay's.

T1 Inbox request: `msg_01M5Q92TKK8BJ39Z9SF1M3ZWQV`, question `q-ba78775e`, with exact agreement and repro/progress attachments. Await actual response; no polling or inference from silence.

## T1 received
Shay approved the attached agreement via Inbox reply `msg_01M5Q946DN1TX3PERKD57VN8KC`, Q1: "Approve the attached agreement (your recommendation)". Recorded against `sha256:e4fb68c9…` in AGREEMENT-REVIEW.md. Production implementation now authorized within that scope; publication still requires T2.

## Implementation and isolated diagnostics (before independent assessment)

Implemented separate bound post-completion receipt, project-owned status readback/retry, offline pending routing and normal reap refusal. New state version 6 preserves reading 2–5; old runtimes must not silently consume the new completion contract. The post command shares delivery's existing process lock, not the state write lock; network hooks assert no state lock is held. Status acknowledgement checks the exact state/note/product subject again inside its atomic state update.

Meaningful owners: core `post-completion.ts` only defines/parses neutral persisted authority; project `post-completion.ts` owns note/section meaning and pure pending policy consumed by post/index/core routing. Existing project index is the only project entry core imports. Extraction earned by next/reap/post consumers and avoids importing the effectful project command into the static project entry. No general tracker adapter/job engine added.

Failures preserved and diagnosed before reruns:
- `focused-first.log` / `repro-after-first.log`: adding a static index export from effectful post.ts created an import cycle via ask/next/step (`people` TDZ). Moved pure project completion/note parsing behind the project export, leaving effectful post lazy. Also fixed TS's empty match-array `never` inference with a predicate.
- `focused-second.log`: existing merged post fixture had no real product commit and put its log outside excluded round paperwork. New identity guard correctly refused it. Fixture now binds actual HEAD/product and stores controlled log under the round folder; production guard was not weakened.
- `lifecycle-first.log`: post + continuous lifecycle file with tsc/eslint. Every lifecycle/crash/unknown/partial/identity/cleanup assertion passed except the combined repeat-deliver assertion: fixture expected exit 0, while existing deliver.ts:722–729 explicitly returns exit 2 with “already merged” after completion. Fixed test to assert that established response, receipt-byte preservation and no remote duplication. This is a test expectation repair, not a delivery behavior change.
- `receipt-focused.log`: new core/project receipt/pending property checks and state + tsc/eslint all pass. Generated subsets exercise receipt roundtrips and independently pending ticket sets; malformed authority stays byte-for-byte intact.

`repro-after-second.log` is the original continuous repro green against implementation at that point; final-head evidence is still owed after all product/test edits. No complete suite run.

## Independent assessment R1 and repair round 1

Fresh T3-owned child task `node:delegated-task:command%3Amcp%3A1bdaec5d-0cda-4ab9-9481-dfbfa624931f%3Adelegate-task%3Awf-191-assessment-r1-a1fc529-pi`, provider `pi_pipersonal`, model `openai/gpt-6.1-sol`, option `thinking=high`; no parent history supplied. Initial requested Codex provider was project-disabled (no task started), so used discovered enabled provider. Full original report in ASSESSMENT.md, verdict repair on a1fc529. No production/test edits by reviewer.

Accepted R1 exact remote notification identity, R2 unbound legacy routing, R3 fixture/coverage repairs. Implemented within agreement; detailed disposition in REVIEW-RESPONSES.md. R4 older-copy safety is a consequential compatibility limit: asked Shay explicitly via Inbox `msg_01M5QB4PMYHZ0HAEM4N02P5FPZ`, `q-9de1a887`, and corrected the too-strong source comment. Await actual ruling before final compatibility claim/handoff. No broader reap retry/migration design silently implemented.

Original final run at a1fc529 completed: lifecycle and delivery-recovery PASS, three delivered-round failures (not a green aggregate). Repairs isolated with diagnostics before another full selection; two affected fixture expectations and one real routing precedence error explained. Repair focused next/delivered-round + project receipt/ticket-changes + tsc/eslint now green (`r1-repairs-focused2.log`), not a substitute for final-head coverage.

## Repaired head 6f42099 — focused evidence and one contention artifact

`evidence/focused-repaired-final.log`: 14 selected files/85 plus tsc/eslint at 6f42099. Twelve PASS (tsc, eslint, deliver, boundary, both completion files, ticket-changes, state, reap, skill-export, correction-fences, next, post, delivered-round). Two red: post-lifecycle 764.0s and deliver-recovery 762.2s.

What the log actually shows: lifecycle printed `FAIL race-after-transition: stale lookup cannot mutate status or acknowledge another subject` with an empty *detail* — that detail is the spawned command's stdout+stderr, so the child produced no output; deliver-recovery printed a real `git config core.autocrlf false` stack trace from `makeRepo`, whose captured stderr was empty. Both finished at ~762–764 s of a 16-child parallel run.

That both are child-spawn failures is an inference, not an instrumented measurement: the evidence is the empty captured streams, the freshly created temp repo whose `git init` had already succeeded, and both files passing alone at the same head afterwards. R2's review objected to my earlier wording here (E1) and it was right. The repair delta is also not exonerated by that inference and does not need to be: `race-after-transition` is itself new #191 coverage, but the changed own-comment predicate is not on its path, because that clone's sections are already marked posted, so `todo` is empty before the predicate is ever evaluated. The honest statement is: cause inferred as contention, behavior green when measured alone, and one red case that the delta does not touch.

Isolated re-measurement at the same head, one file per run: `evidence/lifecycle-repaired-alone.log` PASS 508.2s (includes the three new wrong-comment continuous cases), `evidence/deliver-recovery-repaired-alone.log` PASS 557.6s (includes #190 recovery). Combined selection is therefore covered by 14 green in one run plus two green reruns; a single all-green aggregate log does NOT exist. Full suite NOT RUN; real Jira/GitHub, production publication and real reap remain unmeasured.

## T1 ruling on the older-copy limit (R4)

Inbox reply `msg_01M5QB505GS0HQ7D8YB3RHT8G7` to my question `q-9de1a887`, as written: "Updated-runtime guarantee; require using it for cleanup (your recommendation)". Recorded verbatim in AGREEMENT-REVIEW.md with the scope it fixes. Documentation/comment-only commit `d5fb6f0`: state version 6's comment now states exactly what the version fences and what it cannot, and the portable skill's `done:` row requires cleanup with the wf that wrote the round's state. No behavior, test or reap-path change; nothing destructive was measured or attempted for old copies.

R4 documentation delta validated with the cheapest checks its files touch: `evidence/r4-doc-delta-focused.log` PASS boundary, state, skill-export, tsc, eslint in 19.3 s. Not a rerun of the full focused selection; the product/test head for R2 assessment stays 6f42099, with 6e5069c adding only comments, the skill's `done:` row and review records.

## R2 assessment delegation attempts (recorded, no product change)

1. `pi_pipersonal` / `openai/gpt-6.1-sol` (the R1 model): task failed during the run with "The ChatGPT user has reached their Subscription Sharing usage limit"; it wrote no report. `git status` stayed clean and no ASSESSMENT-R2.md was created.
2. `claudeAgent` / `claude-opus-5-5`: rejected before starting — "Provider instance claudeAgent is disabled for project …".
3. `pi` / `anthropic/claude-opus-5-5`: rejected — same, disabled for this project.
4. `opencode` / `opencode-go/gemini-4-argon`: rejected — same, disabled for this project.
5. Launch accepted: `pi_pipersonal` / `opencode-go/deepseek-v4.1-flash`, `thinking=max`, fresh child context with no parent history.

Disclosure: business 5 runs the same model family as this builder. Per this repo's AGENTS.md the independent-context requirement is about a fresh context that did not build the change; harness/model choice is an execution convenience, not the independence. If its report is thin or it cannot measure, the fallback is to rerun on a stronger model once the ChatGPT quota resets rather than accept a weaker verdict.

## R2 assessment landed: clean, with E1 corrected

`docs/reviews/191/ASSESSMENT-R2.md`, verdict clean at head `19de395` (product/test `6f42099`), agreement sha independently recomputed and matching. The reviewer re-measured R1 itself (prefix `1910`, foreign repository, human quote each posted and completed; genuine own post and post-crash retry did not duplicate), the three R2 routes, the crash/unknown/race completion cases, R3's delivered-round fixture (PASS 49.3 s), and the R4/S1 wording.

Its one objection, E1 (low, non-blocking), was to this file's contention wording. Accepted and corrected above: the lifecycle line carried an empty detail rather than being empty output, deliver-recovery's failure was a real `git config` stack trace, and the contention cause is inferred rather than instrumented. The reviewer's assessment of the coverage claim stands: no all-green aggregate log exists and the full suite was not run.

Nothing here authorizes publication; T2 does, and it is still owed.

## Publication (T2)

Shay answered the Inbox question `q-cf6155b4` (`msg_01M5RXGQ734QYN94W0AMJQM8ZN`): "Publish: push the branch and open the PR against main (your recommendation)". Branch `fix/191-post-merge-tracker-completion` pushed to origin and PR opened against `main`: https://github.com/shayshahal/wf/pull/196. No merge, no tag, no tracker mutation. Checks reported before publishing: focused runs as recorded above (12 green in one run; post-lifecycle and deliver-recovery green alone at the same head), full suite not run, no live Jira/GitHub, destructive old-runtime reap not attempted.
