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
- An item with subitems is not one round (TJEW-670, 2026-09-28: a title, and 11 subitems that are
  11 changes). Fetch every subitem's thread and assets too, list them for the user (position, title,
  what it asks in one line, its status), and ask how to group them: a round each, or a few small
  ones of one kind together (texts and buttons to remove). A subitem that is only a title is a
  sentence: scope questions, or a check, first.
- A round on subitems: `--id <item id>.<n>` for each, `n` its position on the item from the top
  (`TJEW-670.2`). `TICKET.md`: the item's title and thread, then each subitem's; `## Intent` is the
  subitems' words. Its statuses and its note go on its subitems, never the item.
- Statuses, set by you (never an agent):

| when | status | a subitem's status |
|---|---|---|
| `wf new` made the worktree; a check's, when the user says go | *In Progress* | *Working on it* |
| `wf deliver` merged the PR (after T2) | *Fixed in Local*, with the tracker note: the last thing a round does before reap. Shay sets the QA statuses himself when he moves `dev` to QA | *Waiting for review*, with the note |

- The tracker note is `MONDAY.md` in the round folder (`wf deliver` writes it): one `## <id>` section
  per item. Fill each section's lines in plain Hebrew from `TICKET.md` and what the round changed, with
  no file path, code name or line number, show the user the exact text, and post each section on its
  own item without its `##` line.
- The round's pictures go with the note: `proof/before-<n>.png` and `proof/after-<n>.png` in the round
  folder (research took the befores, validate the afters; they are gitignored, and gone after reap).
  The connector cannot attach a file to an update, only to a file column (BJEW-532). Read the item's
  board's file columns (`columns(types: [file])`): Bugs and its subitems have `Files`, Tasks and its
  subitems none (2026-09-28). With one: upload each picture to that column of each item the note went
  on (`monday_get_asset_upload_url`, `curl -i -X PUT` the file, `monday_finalize_asset_upload` with the
  ETag), read the column back to see the reporter's own files are still there (not yet seen in a round: if
  they are gone, stop and tell the user), and add a line to the
  note before posting: `תמונות לפני/אחרי מצורפות לפריט, בעמודת הקבצים.` Without one: after posting,
  tell the user which files to drag onto the update, with their full paths.

## People

- **Einat**: product. Her rules are Intent; a question only she can answer makes the round class C.
  `wf ask --to einat`.
- **Saar**: QA. `wf ask --to saar`.

## Branches

- Rounds branch off `dev` and their PRs target `dev`. `dev` is checked out in the repo's root.
- Merging to `dev` and deploying: Shay only.

## T2

- Before `wf review`, run `wf show` from the worktree. It returns in seconds, leaving a browser window
  on the round's stack, logged in, on the plan's `open:` page.

## This machine

- `wf stacks up|down` (the permanent dev and QA stacks at `dev.*.jewelryx.localhost` and
  `qa.jewelryx.localhost`): Shay only. `wf stacks status` is read-only.
- `wf seed [--reset]` puts the round's database back to the seeded fixtures.
