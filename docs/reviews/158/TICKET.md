# TICKET — #158 — Integrate existing worktrees with Herdr without migrating repository layout

Class: B

## Intent

Shay, chat (start authority):
> lets work on 158

Shay, chat (communication authority):
> Plannotator Inbox is on: when you finish long work, or need a decision only the person can make, send it with plannotator_inbox send_message and keep going.

## Source

https://github.com/shayshahal/wf/issues/158

Complete issue body, verbatim:

## Decision / observed starting point

Keep the current Git repository layout; integrate Herdr through the existing machine seam before considering a worktree backend replacement. Shay supported this starting point in the system-map discussion.

Repository layout (bare vs normal), checkout directory and workspace/worktree manager are separate choices. Read-only installed-Herdr listing already discovered the wf repo's linked worktrees and JewelryX's `.bare` repository. That proves discovery, not create/remove/setup equivalence. The installed CLI exposes list/create/open and workspace-targeted remove; no mutation was exercised.

## Outcome

A round's existing checkout is easy to discover/open in Herdr without a new repository layout, duplicate worktree, duplicate setup or loss of wf's cleanup/approval obligations. The team can still run kit without Herdr.

## Acceptance

- First make existing worktrees usable through Herdr's discovery/open operations and current opener/session references. Put machine integration in env/adapters/seams, not a Herdr dependency in core or projects.
- Do not migrate bare/normal layout or move active checkouts merely to obtain integration. Directory naming is not a reason to rebuild the round.
- Opening/discovering the round does not rerun project setup, create a second checkout, steal focus or silently replace the current agent/session. Closing a workspace must not be treated as proof of safe reap or delivered work.
- Keep one owner per create/remove operation. Preserve current Worktrunk/Git create/remove behavior for the first slice; do not layer two managers whose hooks run setup/teardown twice.
- If replacing Worktrunk later has demonstrated value, exercise that candidate at the existing createWorktree/removalPlan seam before adoption: project setup once, usable dependencies, teardown while required checkout tools still exist, verified owned release, and recoverable partial failure.
- Headless before-proof/helper checkouts must not require visible Herdr workspaces simply to exist or be cleaned up. Installed remove is workspace-targeted, so prove this capability or retain the existing backend/fallback rather than assuming equivalence.
- Tests cover discovery/open of an existing checkout, repeat open without duplicate setup, close-vs-reap distinction, operation outside Herdr and refusal/partial failure. Lifecycle changes require AGENTS.md's actual entry create→stack→reap cycle, selfchecks and hook restoration. Use isolated fixtures, never unrelated active panes/worktrees.

## Related ownership

#154 owns resource lifetime, cancellation and partial reap regardless of worktree backend; do not duplicate or weaken those requirements. #131 owns authorized project scenario setup/reset; #146 required readiness. Existing core/project and kit/env separation and delivered-round protections remain intact.

## Non-goals / authorization

No new worktree manager, universal harness interface, workspace scheduler, forced team Herdr adoption or mass migration. The discussion authorizes backlog actionables, not a backend switch or live workspace/worktree changes.


## Intake completeness

The retrieved issue is OPEN. It has no comments or attachments in the fetched body. Complete fetched record: `issue-158.json`. No external attachment links require download.

## Scope

Implement only the first integration slice: explicit discovery/open of an existing Git checkout, through the machine entry and existing seams. Keep Worktrunk/Git creation/removal, setup, resource ownership, session provenance and approval protections. Do not implement the issue's conditional future backend replacement.

paths: env/adapters/herdr.ts, env/adapters/herdr.selfcheck.ts, env/wf.ts, env/HERDR.md

Engineering class B: new machine command and existing-workspace handoff contract. The product choice proposed for T1 is explicit background open versus automatic workspace creation after `wf new`.

## Workspace and entry

- Base: `67ca46c86c60f05dae0ed12cbfd528e358eb975c` (main after #194).
- Branch: `feat/158-existing-worktree-herdr`.
- Worktree: `C:/Users/Shay/work/wf-158`.
- This is development of wf itself, not a JewelryX round. The configured project adapter is JewelryX; `wfk notes` printed JewelryX guidance, not a wf project adapter. Do not create a fake JewelryX round, tracker state or app setup for this wf issue.
- Own development checkout allocated with Git, as prior wf maintenance tasks. No `.wf` round state is fabricated. Workflow artifacts and real human gates are recorded under this folder.
- Invoke commands in this checkout with explicit cwd/absolute file paths. Assessment must use a fresh independent context.
- Real JewelryX lifecycle verification, if required by changed lifecycle scope, uses this editing clone's `node env/wf.mjs` entry as AGENTS.md directs; ordinary real rounds continue to use installed `wfk` from JewelryX.
- No unrelated worktrees, panes or user files may be changed.

## Initial measurement

`herdr 0.9.3`. `herdr worktree list --cwd C:/Users/Shay/work/wf-158` exited 0 and returned this exact linked checkout and branch without an `open_workspace_id`. It also identified the existing main checkout workspace. No Herdr workspace was opened or changed. Group-help commands exit 2 and print usage on stderr; those are CLI discovery results, not operational failures. See `evidence/*help.json` and `evidence/worktree-list-before.json`.

Opening, repeated opening, focus preservation, trust refusal, partial effects and close/reap separation are NOT MEASURED. They remain verification work, not inferred from successful listing.
