# JewelryX: round notes

What the round skill (`{{wf}}/skills/round/SKILL.md`) leaves to the project. Read once per session,
before *Start*.

## Tracker: Monday

- Tickets live on two boards: Bugs (`BJEW-`) and Tasks (`TJEW-`), both reachable by numeric id.
  Board ids, status labels and how a comment to Einat reads: `docs/agents/monday.md` in the worktree.
- Fetch the whole item: every update and reply, oldest first, and every asset, both those attached
  to updates **and those in the item's file columns** (`monday_get_assets` → `public_url` →
  download into the round folder → `read` the image).
- A TJEW item that is one sentence is the "ticket that is a sentence" of *Start*: scope questions first.
- Statuses, set by you (never an agent):

| when | status |
|---|---|
| `wf new` made the worktree | *In Progress* |
| `wf deliver` printed the PR | *Fixed in Local* (the Bugs board has no *In Review*, Shay 2026-09-23) |
| merged | stays *Fixed in Local*: Shay sets the QA statuses himself when he moves `dev` to QA |

- The tracker note is `MONDAY.md` in the round folder (`wf deliver` writes it). Post it as a comment,
  its English lines in plain Hebrew.

## People

- **Einat**: product. Her rules are Intent; a question only she can answer makes the round class C.
  `wf ask --to einat`.
- **Saar**: QA. `wf ask --to saar`.

## Branches

- Rounds branch off `dev` and their PRs target `dev`. `dev` is checked out in the repo's root.
- Merging to `dev` and deploying: Shay only.

## T2

- Before `wf review`, run `wf show` from the worktree. It returns at once, leaving a browser window
  on the round's stack, logged in, on the plan's `open:` page.

## This machine

- `wf stacks up|down` (the permanent dev and QA stacks at `dev.*.jewelryx.localhost` and
  `qa.jewelryx.localhost`): Shay only. `wf stacks status` is read-only.
- `wf seed [--reset]` puts the round's database back to the seeded fixtures.
