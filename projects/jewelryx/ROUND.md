# JewelryX: round notes

What the round skill leaves to the project. Read once per session,
before *Start*.

## Tracker: Jira

- Tickets are issues of the one project `JX` on `raynw.atlassian.net` (cloud id
  `d0d265f2-904c-4b76-8bd7-ecfb592eb92f`): Bugs, Tasks and their Sub-tasks, each with its own key
  (`JX-1112`; "start 1112" means `JX-1112`). Types, statuses, the Monday history and how a comment to
  Einat reads: `docs/agents/jira.md` in the worktree. An old `BJEW-`/`TJEW-` id is found the way it says.
- Use an available authorized Jira connector or Jira's REST API for issues, comments and statuses.
  Download files through Jira's REST API when the connector cannot move them, with
  `curl -u "$JIRA_EMAIL:$JIRA_TOKEN"` (your Atlassian email and an API token from
  id.atlassian.com, in the environment the session started with).
- Fetch the whole issue: `getJiraIssue` with `fields: ["summary", "description", "status", "issuetype",
  "parent", "subtasks", "comment", "attachment", "customfield_10251"]` and `responseContentFormat:
  "markdown"`; each sub-task the same. Every comment, oldest first (`comment.total` more than the
  comments returned: fetch the rest). Download each attachment into the round folder
  (`curl -sL -u … -o <name> https://raynw.atlassian.net/rest/api/3/attachment/content/<id>`) and
  `read` the images. An issue migrated from Monday has no attachments in Jira: its pictures are
  still on its Monday item (`customfield_10251`), fetched with Monday's `all_api_read`, `variables`
  `{"ids": ["<item id>"]}`, then each `public_url` downloaded (it expires within the hour):
  ```
  query($ids: [ID!]) { items(ids: $ids) { id name assets(assets_source: columns) { id name public_url }
    updates(limit: 100) { assets { id name public_url } replies { assets { id name public_url } } } } }
  ```
  If no authorized Monday connector is available for historical pictures, identify the missing
  attachments and ask the person to supply them or enable access. Connector installation and global
  harness configuration changes are not implicit task scope.
- A Task that is one sentence is the "ticket that is a sentence" of *Start*: scope questions first.
- An issue with sub-tasks is not one round (TJEW-670, 2026-09-28: a title, and 11 subitems that are
  11 changes). Fetch every sub-task's thread and attachments too, list them for the user (key, title,
  what it asks in one line, its status), and ask how to group them: a round each, or a few small
  ones of one kind together (texts and buttons to remove). A sub-task that is only a title is a
  sentence: scope questions, or a check, first.
- A round on sub-tasks: `--id <sub-task key>` for each. `TICKET.md`: the parent's title and thread,
  then each sub-task's; `## Intent` is the sub-tasks' words. Its statuses and its note go on its
  sub-tasks, never the parent.
- Statuses, set by the task owner rather than a delegated implementer, by name: `getTransitionsForJiraIssue`, then
  `transitionJiraIssue` with the id of the transition whose `to` is that status. Every type, sub-tasks
  included, has the one workflow:

| when | status |
|---|---|
| `wf new` made the worktree; a check's, when the user says go | *In Progress* |
| `wf deliver` opens the PR (after T2) | Keep *In Progress*; post that the change is in the linked PR awaiting merge |
| Human merged the PR; `wf deliver` reconciled it | *Fixed in Local*, with the tracker note: the last thing a round does before reap. Shay sets the QA statuses himself when he moves `dev` to QA |

- The tracker note is `JIRA.md` in the round folder (`wf deliver` writes it): one `## <id>` section
  per issue. Fill each section's lines in plain Hebrew from `TICKET.md` and what the round changed, with
  no file path, code name or line number. Its `pictures:` line names the `proof/` files the reporter
  sees, the final state only (`pictures: after-1.png after-2.png`), or `pictures: none`; the rest of
  `proof/` stays round evidence (JX-1392, 2026-10-14: every labeled capture went up, superseded ones
  among them). `wf post --preview` prints each comment and its exact files without touching Jira; show
  the user that. Then `wf post` from the worktree posts it, the same way every round: it prints the
  same preview, then for each section not yet ` (posted)` attaches the files its `pictures:` line
  names to the issue, posts the section (without its `##` and `pictures:` lines) as a comment with
  those pictures shown in it, keeps the status while the PR is open, and marks the heading itself.
  After human merge and `wf deliver` reconciliation, run `wf post` again: even already-notified
  sections need *Fixed in Local* readback. Completion is recorded separately from `(posted)`; an
  already-delivered issue needs no new transition. A failed or unknown read stays pending and blocks
  normal reap. Retries reuse earlier comments and attachments and retain successful ticket completions.
  Agents may also post comments and attachments directly through an authorized Jira connector or REST API.
- `wf post` refuses, posting nothing, when a section still has a `<...>` line, has no `pictures:`
  line or names a file not in `proof/` or not named `before-`/`after-<label>`, or when the session
  has no `JIRA_EMAIL` or `JIRA_TOKEN`: tell the user the session started without them, and stop; a
  new session, after they set them, picks the round up with "resume <id>".
- `wf post` (and `wf review`, as T2 opens) also refuses when the ticket got an edited description or
  title, or a comment added or edited by anyone but this round's own post, since the round's first
  step (JX-810, 2026-10-12: the requirement was rewritten mid-round and the round posted "fixed"
  against the old one). It names who, when and which. Show the user the changes, and stop. Once they
  have read them: re-fetch the ticket into `TICKET.md` (and revise the agreement if the requirement
  moved, which can send the round back to T1), then `wf post --ticket-reread` records it. It refuses
  while `TICKET.md` is older than the last change.

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

- `wf seed [--reset]` puts the round's database back to the seeded fixtures.
