# #242 — Plannotator review analysis integration

Issue: https://github.com/shayshahal/wf/issues/242

## Implemented boundary

```diff
  wf review
    prepare proof + pending content/head identity
+   name committed base...HEAD / merge-base explicitly
    native session present?
+     hand off exact base/mode + Plannotator tool/analysis guidance
+   otherwise configured external review UI?
+     Plannotator review --git --base <base> --diff-type merge-base --gate --json
+       shared data dir → existing settings + managed engines
+       CLI decision/message → quoted feedback, NOT approval
+       failed launch / malformed response → error, pending stays pending
+       changed implementation → refuse to bind returned feedback
+   every reopen supersedes an earlier ruling with pending
    person rules on prepared identities → record actual verdict → review --done
```

The generic seam adds only the actual code-review operation and session guidance. The existing
machine adapter family owns the provider protocol. Core does not import env, Plannotator, sem or
CallDiff. T3 presentation still wins over an external launch; `WF_NO_OPEN=1` suppresses it.

Call flow remains opt-in. No user setting was changed, no analysis runtime installed, no dependencies
added, and no review was approved by an agent. The authored call-stack/error-landing views remain.

## Independent review and corrective decision

A fresh read-only reviewer found two P1 defects in the first attempt to import approvals from
Plannotator's archive:

1. Exactly one recent same-worktree record is not evidence of session ownership. Our launch can
   fail to archive while another concurrent session supplies that sole record.
2. Matching base/mode plus equal wf identities before/after does not establish the displayed
   snapshot: A → B → A with a review refresh on B can approve B while binding A.

**Resolution:** delete automatic archive-based approval import, not add a heuristic. The final
adapter reads only its CLI's stdout and returns unbound feedback. Core quotes all external lines
and finishes the appended section with a pending verdict. Neither approval, requested changes,
a sole other-session archive, a stale displayed snapshot nor injected `verdict:`/identity fields
can advance T2 through this operation. The session/person must establish the shown comparison
and give a ruling on the prepared identity. Automatic import requires a future upstream
session-owned submitted-snapshot contract; it is not part of this PR.

The reviewer inspected the earlier version; the corrective simplification was implemented and
verified by the builder, not independently re-reviewed. The retained source research in
`../plannotator-analysis-integration.md` predates implementation; this decision supersedes its
suggestion to reuse the old archive reader for T2.

## Focused checks

Final command:

```sh
node src/selfcheck.ts src/gates/review-ui.selfcheck.ts env/adapters/plannotator-review.selfcheck.ts src/gates/review.selfcheck.ts src/gates/review-format.selfcheck.ts src/gates/review-caption.selfcheck.ts src/plugin/t3code.selfcheck.ts env/adapters/plannotator.selfcheck.ts
```

Result: **9 green (7 selected selfchecks + tsc + eslint)**. This is focused evidence, not a complete
suite result. `git diff --check` passed.

Coverage includes the exact worktree/base/mode/flags; shared data-dir inheritance; untouched
settings; source-located feedback and approval-with-notes; dismissal; failed launch; malformed or
unknown decisions; native precedence; checkpoint scope; changed content and HEAD trees; pending
reopens; `WF_NO_OPEN`; and quoting external verdict/identity-looking lines.

### Red checks investigated

- `src/boundary.selfcheck.ts`: existing failure `bin/wfk.selfcheck.ts: ../env/shim.ts`.
  `git show HEAD:bin/wfk.selfcheck.ts` contains the import, and that file has no diff in this change.
  The other boundary predicates passed. No unrelated repair was made.
- The first new adapter fixture's moved-base probe did not move a ref: fixture main was already
  HEAD. Creating a feature branch before its implementation commit fixed that fixture.
- The first new UI fixture compared Windows path spellings byte-for-byte; normalize with `resolve`.
- Its initial HEAD probe used an empty commit, but wf binds HEAD's tree, not the commit identifier.
  The corrected fixture commits changed product bytes. These were fixture defects, not intermittent
  greens or ignored failures. The archive-based adapter was subsequently removed as described above.

## Real installed-runtime smoke check

Ran the installed **Plannotator 0.28.45** in a disposable Git repository with a TS function change,
using `review <repo> --git --base main --diff-type merge-base --gate --json
--no-git-remote-check`, `PLANNOTATOR_BROWSER=none` and update checks disabled. Used only the
read-only `/api/diff` and `/api/semantic-diff` endpoints. Stopped that exact child process and
removed its disposable repository afterwards. No user review session was closed.

Observed:

- `/api/diff`: `base: main`, `diffType: merge-base`.
- Semantic capability: available, managed `sem 0.8.0`.
- Semantic analysis: `status: ok`, one modified entity `entry` at `entry.ts:1`, one added entity
  `helper` at `entry.ts:2`.
- Call flow: `enabled: false`, `state: disabled`, installable; consent plan named JavaScript/TypeScript
  and a 5 MiB core estimate. No install endpoint was called.

## Limits / remaining human verification

- No human inline-comment submission or approval was simulated. The CLI decision/comment contract
  is covered by faithful subprocess fixtures, not a claimed real human submission.
- Call flow rendering, its install consent and language packs were not exercised: the person's
  setting is disabled. The UI owns that opt-in.
- Native tools that cannot select diff type receive explicit guidance to use the CLI for that
  unsupported flag. Native comparison/snapshot verification remains a session/person obligation.
- A new browser review of this PR can inspect the concrete code and feedback behavior; publishing
  this branch is not main installation or merge. Leave the PR open for the person's review.
