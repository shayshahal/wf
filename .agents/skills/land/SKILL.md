---
name: land
description: >-
  Lands the current branch in the wf repo by pushing it to origin/main.
  Invoke only when the user has explicitly requested landing via Land Changes
  or equivalent language; not for review, preparation, passing checks, or skill
  installation.
disable-model-invocation: true
metadata:
  delta-action: land
---

# Land the current branch to `origin/main`

The agent is running because the user explicitly requested landing. Do not ask
whether they want to merge; carry out the workflow below. Stop only for genuine
blockers, and report them as not landed.

## Scope

- This skill applies to the `wf` repository only (the checkout whose `AGENTS.md`
  says a push to `main` is live). Do not use it for unrelated repositories.
- Landing means the requested changes are pushed to `origin/main` and verified
  there. Preparing commits or starting checks is not completion.
- `wf` has no CI and no staging: a push to `main` goes live on the next `wf`
  command (AGENTS.md). There are no required remote checks to wait for; the
  required verification is the local selfcheck, which must pass on the exact
  tree being pushed.

## Workflow

1. Establish the change state with read-only commands. Refuse to land with an
   explanation when there is nothing to land (clean tree, no commits ahead of
   `origin/main`). Include untracked files in the change only when they are
   part of the requested change; never sweep in unrelated work.
2. Run the required verification on the exact tree being landed:
   `node src/selfcheck.ts` (AGENTS.md: "before every push: `node
   src/selfcheck.ts`, all green"), which includes `tsc` and `eslint`. All 37
   selfchecks must be green. A red check blocks the landing: report what is
   red and stop. Do not push with failing checks and do not assume they will
   pass.
3. Make sure the repo's own push guardrail is active: when `git config --get
   core.hooksPath` is unset, set it with `git config core.hooksPath .githooks`
   (README Install step 1; `.githooks/pre-push` runs `src/selfcheck.ts` on
   push and refuses a push whose selfchecks are red).
4. Sync with the destination before pushing: `git fetch origin`, then integrate
   `origin/main` into the local branch (rebase) so the push is fast-forward
   and never overwrites work landed since the branch was cut.
5. Push to `origin/main` from the non-interactive terminal (no editors,
   interactive rebases, or prompts). Confirm success by verifying the new
   `origin/main` SHA contains the landed change.
6. Report the outcome: the pushed SHA and the selfcheck result. If a genuine
   blocker prevented landing (red checks, unresolvable state, push rejected),
   report that the changes have NOT landed and explain the blocker.

## Conflicts

The user's standing preference is automatic resolution: resolve a conflict with
`origin/main` automatically when the intended result is clear, then re-run the
full selfcheck before pushing. Whenever intent is ambiguous, checks fail after
resolution, or unrelated work would be affected, do not guess: stop, describe
the conflict, and wait for the user's decision.

## After landing

A push goes live for Shay at once, but the team only receives it with a new
`version` in `.claude-plugin/plugin.json` (README Updates). After verifying the
push, report whether that version bump is still owed; do not bump it as part
of landing unless the user asks.
