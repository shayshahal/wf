---
name: land
description: >-
  Lands the current branch in the wf repo by opening a pull request against
  origin/main. Invoke only when the user has explicitly requested landing via
  Land Changes or equivalent language; not for review, preparation, passing
  checks, or skill installation.
disable-model-invocation: true
metadata:
  delta-action: land
---

# Land the current branch into `origin/main` through a PR

The agent is running because the user explicitly requested landing. Do not ask
whether they want a PR; carry out the workflow below. Stop only for genuine
blockers, and report them as not landed.

## Scope

- This skill applies to the `wf` repository only (the checkout whose `AGENTS.md`
  says a push to `main` is live). Do not use it for unrelated repositories.
- Landing means the requested changes are merged into `origin/main` through a
  pull request, and verified there. Preparing commits or starting checks is not
  completion. Never push to `main` directly: the PR is the review gate
  (2026-10-08: landing pushed straight to `main`; Shay: "needs PR").
- `wf` has no CI and no staging: a merge to `main` goes live on the next `wf`
  command (AGENTS.md). There are no required remote checks to wait for; the
  required verification is the local selfcheck, which must pass on the exact
  tree being landed.

## Workflow

1. Establish the change state with read-only commands. Refuse to land with an
   explanation when there is nothing to land (clean tree, no commits ahead of
   `origin/main`). Include untracked files in the change only when they are
   part of the requested change; never sweep in unrelated work. When the change
   sits on `main`, cut a branch for it (`kit/<what>`); never commit a landing
   onto a pushed `main` just to PR it back.
2. Run the required verification on the exact tree being landed:
   `node src/selfcheck.ts` (AGENTS.md: "before every push: `node
   `node src/selfcheck.ts`, all green"), which includes `tsc` and `eslint`. Every
   selfcheck must be green. A red check blocks the landing: report what is
   red and stop. Do not open the PR with failing checks and do not assume they
   will pass.
3. Make sure the repo's own push guardrail is active: when `git config --get
   core.hooksPath` is unset, set it with `git config core.hooksPath .githooks`
   (README Install step 1; `.githooks/pre-push` runs `src/selfcheck.ts` on
   push and refuses a push whose selfchecks are red).
4. Sync with the destination: `git fetch origin`, then integrate `origin/main`
   into the landing branch (rebase) so the PR is mergeable and never overwrites
   work landed since the branch was cut.
5. Push the branch and open the pull request from the non-interactive terminal
   (no editors, interactive rebases, or prompts; `gh pr create` with a title
   naming the change and a body saying what it does plus the selfcheck result).
   Report the PR URL. Do not merge it: Shay merges. Confirm the PR's head is the
   verified tree.
6. Report the outcome: the PR URL and the selfcheck result. If a genuine
   blocker prevented landing (red checks, unresolvable state, PR creation
   rejected), report that the changes have NOT landed and explain the blocker.

## Conflicts

The user's standing preference is automatic resolution: resolve a conflict with
`origin/main` automatically when the intended result is clear, then re-run the
full selfcheck before opening the PR. Whenever intent is ambiguous, checks fail
after
resolution, or unrelated work would be affected, do not guess: stop, describe
the conflict, and wait for the user's decision.

## After landing

A merge goes live for Shay at once, but the team only receives it with a new
`version` in `.claude-plugin/plugin.json` (README Updates). After the PR is
merged, report whether that version bump is still owed; do not bump it as part
of landing unless the user asks.
