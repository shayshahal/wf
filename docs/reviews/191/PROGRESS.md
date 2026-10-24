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
