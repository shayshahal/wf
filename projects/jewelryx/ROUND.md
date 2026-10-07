# JewelryX: round notes

What the round skill (`{{wf}}/skills/round/SKILL.md`) leaves to the project. Read once per session,
before *Start*.

## Tracker: Jira

- Tickets are issues of the one project `JX` on `raynw.atlassian.net` (cloud id
  `d0d265f2-904c-4b76-8bd7-ecfb592eb92f`): Bugs, Tasks and their Sub-tasks, each with its own key
  (`JX-1112`; "start 1112" means `JX-1112`). Types, statuses, the Monday history and how a comment to
  Einat reads: `docs/agents/jira.md` in the worktree. An old `BJEW-`/`TJEW-` id is found the way it says.
- The tools: Atlassian's MCP (under pi, `mcp__atlassian__*` called from a `codemode` script) for
  issues, comments and statuses; Jira's REST API for files, which the MCP cannot move, with
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
- A Task that is one sentence is the "ticket that is a sentence" of *Start*: scope questions first.
- An issue with sub-tasks is not one round (TJEW-670, 2026-09-28: a title, and 11 subitems that are
  11 changes). Fetch every sub-task's thread and attachments too, list them for the user (key, title,
  what it asks in one line, its status), and ask how to group them: a round each, or a few small
  ones of one kind together (texts and buttons to remove). A sub-task that is only a title is a
  sentence: scope questions, or a check, first.
- A round on sub-tasks: `--id <sub-task key>` for each. `TICKET.md`: the parent's title and thread,
  then each sub-task's; `## Intent` is the sub-tasks' words. Its statuses and its note go on its
  sub-tasks, never the parent.
- Statuses, set by you (never an agent), by name: `getTransitionsForJiraIssue`, then
  `transitionJiraIssue` with the id of the transition whose `to` is that status. Every type, sub-tasks
  included, has the one workflow:

| when | status |
|---|---|
| `wf new` made the worktree; a check's, when the user says go | *In Progress* |
| `wf deliver` merged the PR (after T2) | *Fixed in Local*, with the tracker note: the last thing a round does before reap. Shay sets the QA statuses himself when he moves `dev` to QA |

- The tracker note is `JIRA.md` in the round folder (`wf deliver` writes it): one `## <id>` section
  per issue. Fill each section's lines in plain Hebrew from `TICKET.md` and what the round changed, with
  no file path, code name or line number, and show the user the exact text. Then `wf post` from the
  worktree posts it, the same way every round: for each section not yet ` (posted)`, it attaches the
  round's `proof/before-<n>.png` and `proof/after-<n>.png` to the issue, posts the section (without
  its `##` line) as a comment with those pictures shown in it, sets *Fixed in Local*, and marks the
  heading itself. Run again, it skips what is already done (a comment with the PR's url, a picture
  already attached under the PR's number). Never post a note or a picture by hand (JX-268,
  2026-10-07: posted without its pictures, the user told to attach them, and the reap after it
  deleted them).
- `wf post` refuses, posting nothing, when a section still has a `<...>` line, or when the session
  has no `JIRA_EMAIL` or `JIRA_TOKEN`: tell the user the session started without them, and stop; a
  new session, after they set them, picks the round up with "resume <id>".

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
